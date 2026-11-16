#!/usr/bin/env bash
# ============================================================================
# Prova a 0017 (Rituais de Gestão neste portal) num Postgres DESCARTÁVEL —
# nada aqui toca o Supabase. Aplica todas as migrações na ordem (com os default
# privileges do Supabase ligados, como no core_acessos.sh) e a 0017 de novo
# (idempotência). A régua: lê quem tem o módulo `rituais` ou é admin do PORTAL;
# grava editor/admin do módulo ou o admin do portal; leitura só lê.
#
#   bash supabase/testes/rls_rituais.sh
# ============================================================================
set -uo pipefail
cd "$(dirname "$0")/../.."
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PORT=${PORT:-55459}
DIR=$(mktemp -d /tmp/rls-rituais.XXXXXX)
command -v "$PGBIN/initdb" >/dev/null || { echo "Postgres não encontrado em $PGBIN"; exit 1; }
chown postgres:postgres "$DIR" 2>/dev/null || true
run() { if [ "$(id -u)" = "0" ]; then su postgres -c "$1"; else eval "$1"; fi; }
run "$PGBIN/initdb -D $DIR/data -U postgres --auth=trust" >/dev/null 2>&1
run "$PGBIN/pg_ctl -D $DIR/data -o '-p $PORT -k /tmp' -l $DIR/log start" >/dev/null 2>&1
sleep 3
trap 'run "$PGBIN/pg_ctl -D $DIR/data stop" >/dev/null 2>&1; rm -rf "$DIR"' EXIT
export PGOPTIONS="-c client_min_messages=warning"
Q() { psql -h /tmp -p "$PORT" -U postgres -q -v ON_ERROR_STOP=1 "$@"; }

Q <<'SQL' || { echo "✗ espelho do Supabase"; exit 1; }
create role authenticated nologin; create role anon nologin; create role service_role nologin;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb);
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
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

for f in $(ls supabase/migrations/*.sql | sort) supabase/migrations/0017_rituais_de_gestao.sql; do
  case "$f" in *0006_empresa.sql) continue;; esac
  Q -f "$f" >/dev/null 2>"$DIR/err" || { echo "✗ aplicar $f"; cat "$DIR/err"; exit 1; }
done

U=00000000-0000-0000-0000-00000000000
Q <<SQL >/dev/null || { echo "✗ cenário"; exit 1; }
insert into auth.users (id, email) values
  ('${U}1', 'e@x.com'), ('${U}2', 'v@x.com'), ('${U}3', 'o@x.com'), ('${U}4', 'p@x.com'), ('${U}5', 'a@x.com');
insert into core.acessos (user_id, modulo, papel) values
  ('${U}1', 'rituais', 'editor'), ('${U}2', 'rituais', 'viewer'), ('${U}3', 'tributos', 'admin'),
  ('${U}4', 'portal', 'admin'), ('${U}5', 'rituais', 'admin');
insert into public.rituais_reunioes (id, data) values (1, '2026-11-10');
insert into public.rituais_acoes (id, reuniao_id, acao) values (1, 1, 'Enviar o balancete');
SQL
como() { Q -tAc "set role authenticated; set request.jwt.claims = '{\"sub\":\"$1\",\"email\":\"$2\"}'; $3" 2>/dev/null | tail -1; }
faz() { Q -tAc "set role authenticated; set request.jwt.claims = '{\"sub\":\"$1\",\"email\":\"$2\"}'; $3" >/dev/null 2>&1 && echo passou || echo barrou; }
grava() { if como "$1" "$2" "update public.rituais_acoes set andamento = 'AGUARDANDO' where id = 1 returning 'ok';" | grep -q ok; then echo sim; else echo nao; fi; }
FALHAS=0
confere() { if [ "$2" = "$3" ]; then echo "✓ $1: $2"; else echo "✗ $1: esperado $3, veio $2"; FALHAS=$((FALHAS+1)); fi; }
confere "conferência da migração"            "$(Q -tAc "$(sed -n '/^-- Conferência/,$p' supabase/migrations/0017_rituais_de_gestao.sql | grep -v '^--')" | tail -1)" "6 · 6 · 2 · 1"
confere "o card está na faixa Gestão"        "$(Q -tAc "select grupo from core.modulos where key = 'rituais'")" "Gestão"
confere "editor dos rituais lê"              "$(como ${U}1 e@x.com 'select count(*) from public.rituais_acoes;')" 1
confere "leitura lê"                         "$(como ${U}2 v@x.com 'select count(*) from public.rituais_reunioes;')" 1
confere "admin SÓ do tributos NÃO lê"        "$(como ${U}3 o@x.com 'select count(*) from public.rituais_acoes;')" 0
confere "admin do portal lê sem o módulo"    "$(como ${U}4 p@x.com 'select count(*) from public.rituais_acoes;')" 1
confere "a super-admin lê sem o módulo"      "$(como ${U}9 liliane.hiramoto@grupoflorida.com.br 'select count(*) from public.rituais_acoes;')" 1
confere "leitura NÃO grava"                  "$(grava ${U}2 v@x.com)" nao
confere "admin SÓ do tributos NÃO grava"     "$(grava ${U}3 o@x.com)" nao
confere "editor grava"                       "$(grava ${U}1 e@x.com)" sim
confere "admin do módulo grava"              "$(grava ${U}5 a@x.com)" sim
confere "admin do portal grava"              "$(grava ${U}4 p@x.com)" sim
confere "rituais_grava() da leitura"         "$(como ${U}2 v@x.com 'select public.rituais_grava();')" f
confere "editor anota"                       "$(como ${U}1 e@x.com "insert into public.rituais_acao_historico (acao_id, texto) values (1, 'cobrado') returning 'ok';")" ok
confere "leitura NÃO anota"                  "$(faz ${U}2 v@x.com "insert into public.rituais_acao_historico (acao_id, texto) values (1, 'x')")" barrou
confere "anotação não se altera"             "$(faz ${U}1 e@x.com "update public.rituais_acao_historico set texto = 'mudei'")" barrou
confere "anon não lê"                        "$(Q -tAc "set role anon; select count(*) from public.rituais_acoes" >/dev/null 2>&1 && echo leu || echo barrou)" barrou
confere "admin do portal concede o módulo"   "$(faz ${U}4 p@x.com "select public.conceder_modulo('${U}3', 'rituais', 'viewer')")" passou
confere "perfil aceita o módulo rituais"     "$(Q -tAc "insert into public.perfil_acesso_itens (perfil_id, modulo, papel) select id, 'rituais', 'viewer' from public.perfis_acesso order by id limit 1 returning 'ok'" | tail -1)" ok
echo
[ "$FALHAS" = 0 ] && echo "✅ rituais no portal OK" || { echo "❌ $FALHAS falha(s)"; exit 1; }
