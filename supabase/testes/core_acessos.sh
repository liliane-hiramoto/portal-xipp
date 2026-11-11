#!/usr/bin/env bash
# ============================================================================
# Prova a 0014 (catálogo de cards e acessos no banco, Etapas 1 e 2) num
# Postgres DESCARTÁVEL — nada aqui toca o Supabase. Aplica o SETUP-COMPLETO
# (todas as migrações, na ordem) e liga os default privileges do Supabase (toda
# tabela/view nova do public nasce aberta para anon e authenticated): sem isso
# o teste passava e a produção não (lição da Inexx).
#
#   bash supabase/testes/core_acessos.sh
# ============================================================================
set -uo pipefail
cd "$(dirname "$0")/../.."
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PORT=${PORT:-55458}
DIR=$(mktemp -d /tmp/core-fiscal.XXXXXX)
command -v "$PGBIN/initdb" >/dev/null || { echo "Postgres não encontrado em $PGBIN"; exit 1; }
chown postgres:postgres "$DIR" 2>/dev/null || true
COMO=""; [ "$(id -u)" = "0" ] && COMO="su postgres -c"
run() { if [ -n "$COMO" ]; then su postgres -c "$1"; else eval "$1"; fi; }
run "$PGBIN/initdb -D $DIR/data -U postgres --auth=trust" >/dev/null 2>&1
run "$PGBIN/pg_ctl -D $DIR/data -o '-p $PORT -k /tmp' -l $DIR/log start" >/dev/null 2>&1
sleep 3
trap 'run "$PGBIN/pg_ctl -D $DIR/data stop" >/dev/null 2>&1; rm -rf "$DIR"' EXIT
export PGOPTIONS="-c client_min_messages=warning"
Q() { psql -h /tmp -p "$PORT" -U postgres -q -v ON_ERROR_STOP=1 "$@"; }

Q <<'SQL' || { echo "✗ espelho do Supabase"; exit 1; }
create role authenticated nologin;
create role anon nologin;
create role service_role nologin;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb);
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
grant usage on schema auth, public, storage to authenticated, anon;
grant execute on all functions in schema auth to authenticated, anon;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to authenticated, anon;
SQL

U=00000000-0000-0000-0000-00000000000
# Antes da 0016: o banco de hoje (todas as migrações até a 0013), com gente.
for f in $(ls supabase/migrations/*.sql | sort); do
  case "$f" in *0006_empresa.sql|*0015_core_acessos_dono_unico.sql|*0014_core_modulos_acessos.sql) continue;; esac
  Q -f "$f" >/dev/null 2>"$DIR/err" || { echo "✗ aplicar $f"; cat "$DIR/err"; exit 1; }
done
Q <<SQL >/dev/null || { echo "✗ cenário"; exit 1; }
insert into auth.users (id, email) values
  ('${U}1', 'liliane.hiramoto@grupoflorida.com.br'), ('${U}2', 'le@exemplo.com'),
  ('${U}3', 'adm-trib@exemplo.com'), ('${U}4', 'portal@exemplo.com');
insert into public.user_modules values
  ('${U}2', 'tributos', 'viewer'), ('${U}2', 'cnpj', 'viewer'),
  ('${U}3', 'tributos', 'admin'),
  ('${U}4', 'portal', 'admin'), ('${U}4', 'y570', 'editor');
SQL
for vez in 1 2; do  # idempotente
  Q -f supabase/migrations/0014_core_modulos_acessos.sql >/dev/null 2>"$DIR/err" || { echo "✗ aplicar 0014 ($vez)"; cat "$DIR/err"; exit 1; }
done

FALHAS=0
confere() { if [ "$2" = "$3" ]; then echo "✓ $1: $2"; else echo "✗ $1: veio $2, esperado $3"; FALHAS=$((FALHAS+1)); fi; }
EMAIL=(x liliane.hiramoto@grupoflorida.com.br le@exemplo.com adm-trib@exemplo.com portal@exemplo.com)
jwt() { echo "set role authenticated; set request.jwt.claims = '{\"sub\":\"${U}$1\",\"email\":\"${EMAIL[$1]}\"}';"; }
conta() { Q -tAc "$1" | tail -1; }
como() { Q -tAc "$(jwt "$1") $2" 2>/dev/null | tail -1; }
faz() { Q -tAc "$(jwt "$1") $2" >/dev/null 2>&1 && echo passou || echo barrou; }

confere "conferência da migração"                       "$(Q -tAc "$(sed -n '/^-- Conferência/,$p' supabase/migrations/0014_core_modulos_acessos.sql | grep -v '^--')" | tail -1)" "6|t|1|t|f"
confere "Cadastros: todo login vê"                      "$(conta "select sem_gate from core.modulos where key='cadastros'")" t
confere "Acessos: só admin do portal"                   "$(conta "select string_agg(key, ',') from core.modulos where so_admin")" admin
confere "Consulta CPF: em breve"                        "$(conta "select status from core.modulos where key='cpf'")" breve
confere "a cópia trouxe os 5 acessos (com a 'portal')"  "$(conta "select count(*) from core.acessos")" 5
confere "a ★ é o papel admin num módulo de verdade"     "$(conta "select string_agg(modulo, ',') from core.acessos where admin_modulo")" tributos

Q -c "insert into public.user_modules values ('${U}2', 'y570', 'editor');" >/dev/null
confere "espelho: concessão nova"                       "$(conta "select papel from core.acessos where user_id='${U}2' and modulo='y570'")" editor
Q -c "update public.user_modules set papel='admin' where user_id='${U}2' and modulo='y570';" >/dev/null
confere "espelho: virar admin do módulo acende a ★"     "$(conta "select admin_modulo from core.acessos where user_id='${U}2' and modulo='y570'")" t
Q -c "delete from public.user_modules where user_id='${U}2' and modulo='y570';" >/dev/null
confere "espelho: acesso tirado"                        "$(conta "select count(*) from core.acessos where user_id='${U}2' and modulo='y570'")" 0

confere "todo login lê os cards (view)"                 "$(como 2 "select count(*) from public.modulos")" 6
confere "cada um vê só os SEUS acessos"                 "$(como 2 "select count(*) from public.acessos")" 2
confere "a super-admin (pelo e-mail) vê todos"          "$(como 1 "select count(*) from public.acessos")" 5
confere "admin do portal (linha 'portal') vê todos"     "$(como 4 "select count(*) from public.acessos")" 5
confere "admin SÓ do tributos vê os do tributos (0013)" "$(como 3 "select count(*) from public.acessos")" 2
confere "anon não lê os cards"                          "$(Q -tAc "set role anon; select count(*) from public.modulos" >/dev/null 2>&1 && echo leu || echo barrou)" barrou
confere "a view não se grava (nem o admin do portal)"   "$(faz 4 "update public.modulos set label='x' where key='tributos'")" barrou
confere "admin SÓ do tributos não altera card"          "$(como 3 "with u as (update core.modulos set label='x' where key='tributos' returning 1) select count(*) from u")" 0
confere "ninguém da tela escreve acesso direto"         "$(faz 1 "insert into core.acessos (user_id, modulo) values ('${U}2', 'y570')")" barrou
confere "views com security_invoker"                    "$(conta "select bool_and(coalesce(reloptions::text,'') like '%security_invoker=true%') from pg_class where oid in ('public.modulos'::regclass,'public.acessos'::regclass)")" t

# ── Etapa 5 (0015): core.acessos vira o dono único ──
# Uma política de OUTRA tabela presa a user_modules pelo identificador: tem de
# sobreviver, agora lendo a view.
Q -c "create policy teste_presa on public.empresas for select to authenticated using (exists (select 1 from public.user_modules um where um.user_id = auth.uid() and um.modulo = 'tributos'));" >/dev/null
Q -c "insert into auth.users (id, email) values ('${U}5', 'novo@exemplo.com');" >/dev/null
EMAIL+=(novo@exemplo.com)
for vez in 1 2; do  # idempotente
  Q -f supabase/migrations/0015_core_acessos_dono_unico.sql >/dev/null 2>"$DIR/err" || { echo "✗ aplicar 0015 ($vez)"; cat "$DIR/err"; exit 1; }
done
confere "0015: user_modules virou view"                 "$(conta "select relkind from pg_class where oid='public.user_modules'::regclass")" v
confere "0015: a tabela velha guardada"                 "$(conta "select count(*) from core.user_modules_ate_etapa5")" 5
confere "0015: conferência da migração"                 "$(Q -tAc "$(sed -n '/^-- Conferência/,$p' supabase/migrations/0015_core_acessos_dono_unico.sql | grep -v '^--')" | tail -1)" "view|t|0|t"
confere "0015: a política presa voltou"                 "$(conta "select count(*) from pg_policies where policyname='teste_presa'")" 1
confere "0015: a linha 'portal' ainda faz admin do portal" "$(como 4 "select public.eh_admin_portal()")" t
confere "0015: admin SÓ do tributos não é admin do portal" "$(como 3 "select public.eh_admin_portal()")" f
confere "0015: viewer do tributos lê e não grava"       "$(como 2 "select public.trib_is_user()::text || public.pode_gravar_modulo('tributos')::text")" truefalse
confere "0015: gravar direto na view barra"             "$(faz 4 "insert into public.user_modules values ('${U}5', 'tributos', 'viewer')")" barrou
confere "0015: admin do portal concede"                 "$(faz 4 "select public.conceder_modulo('${U}5', 'tributos', 'editor')")" passou
confere "0015: …e chega em core.acessos"                "$(conta "select papel from core.acessos where user_id='${U}5' and modulo='tributos'")" editor
confere "0015: …e a régua do banco já vê"               "$(como 5 "select public.pode_gravar_modulo('tributos')")" t
confere "0015: admin de módulo vira ★"                  "$(faz 1 "select public.conceder_modulo('${U}5', 'cnpj', 'admin')")" passou
confere "0015: …e a ★ acende"                           "$(conta "select admin_modulo from core.acessos where user_id='${U}5' and modulo='cnpj'")" t
confere "0015: admin SÓ do tributos NÃO concede"        "$(faz 3 "select public.conceder_modulo('${U}5', 'tributos', 'viewer')")" barrou
confere "0015: viewer NÃO concede"                      "$(faz 2 "select public.conceder_modulo('${U}5', 'y570', 'viewer')")" barrou
confere "0015: admin do portal revoga"                  "$(faz 4 "select public.revogar_modulo('${U}5', 'cnpj')")" passou
confere "0015: admin SÓ do tributos NÃO revoga"         "$(faz 3 "select public.revogar_modulo('${U}5', 'tributos')")" barrou
confere "0015: conceder não chega à 'portal'"           "$(faz 4 "select public.conceder_modulo('${U}5', 'portal', 'admin')")" barrou
confere "0015: revogar também não"                      "$(faz 1 "select public.revogar_modulo('${U}4', 'portal')")" barrou
confere "0015: admin do portal marca outro"             "$(faz 4 "select public.marcar_admin_portal('${U}5', true)")" passou
confere "0015: …que passa a ser admin do portal"        "$(como 5 "select public.eh_admin_portal()")" t
confere "0015: a super-admin desmarca"                  "$(faz 1 "select public.marcar_admin_portal('${U}5', false)")" passou
confere "0015: ninguém muda o próprio"                  "$(faz 4 "select public.marcar_admin_portal('${U}4', false)")" barrou
confere "0015: admin SÓ do tributos não marca"          "$(faz 3 "select public.marcar_admin_portal('${U}5', true)")" barrou
confere "0015: módulo inventado barra"                  "$(faz 4 "select public.conceder_modulo('${U}5', 'inventado', 'viewer')")" barrou
confere "0015: papel inventado barra"                   "$(faz 4 "select public.conceder_modulo('${U}5', 'tributos', 'dono')")" barrou
confere "0015: anon não chama"                          "$(Q -tAc "set role anon; select public.conceder_modulo('${U}5', 'tributos', 'viewer')" >/dev/null 2>&1 && echo passou || echo barrou)" barrou

[ "$FALHAS" = 0 ] && echo "core_acessos: tudo ok" || { echo "core_acessos: $FALHAS falha(s)"; exit 1; }
