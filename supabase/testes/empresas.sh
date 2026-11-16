#!/usr/bin/env bash
# Prova o supabase/SETUP-COMPLETO.sql (todas as migrações juntas) num Postgres
# DESCARTÁVEL, imitando o pedaço do Supabase de que ele depende (auth, storage).
#   bash supabase/testes/setup.sh
# ============================================================================
# Prova a 0017 (cadastro de empresas): só quem tem acesso ao portal lê
# `empresas` e `grupos` — antes, qualquer conta logada —, e as colunas da
# Receita existem. Aplica o SETUP-COMPLETO.sql REAL num Postgres descartável.
#   bash supabase/testes/empresas.sh
# ============================================================================
set -uo pipefail
cd "$(dirname "$0")/../.."
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PORT=${PORT:-55473}
DIR=$(mktemp -d /tmp/setup.XXXXXX)
command -v "$PGBIN/initdb" >/dev/null || { echo "Postgres não encontrado em $PGBIN"; exit 1; }
chown postgres:postgres "$DIR" 2>/dev/null || true
COMO=""; [ "$(id -u)" = "0" ] && COMO="su postgres -c"
run() { if [ -n "$COMO" ]; then su postgres -c "$1"; else eval "$1"; fi; }
run "$PGBIN/initdb -D $DIR/data -U postgres --auth=trust" >/dev/null 2>&1
run "$PGBIN/pg_ctl -D $DIR/data -o '-p $PORT -k /tmp' -l $DIR/log start" >/dev/null 2>&1
sleep 3
trap 'run "$PGBIN/pg_ctl -D $DIR/data stop" >/dev/null 2>&1; rm -rf "$DIR"' EXIT
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
-- storage do Supabase, só o que a 0007 toca (buckets e políticas em objects)
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
grant usage on schema auth, public, storage to authenticated, anon;
grant execute on all functions in schema auth to authenticated, anon;
alter default privileges in schema public grant all on tables to anon, authenticated;
grant all on storage.objects, storage.buckets to authenticated, anon;
SQL
Q -f supabase/SETUP-COMPLETO.sql >/dev/null 2>"$DIR/err" || { echo "✗ SETUP-COMPLETO.sql"; cat "$DIR/err"; exit 1; }
U=00000000-0000-0000-0000-00000000000
Q <<SQL >/dev/null 2>"$DIR/err" || { echo "✗ cenário"; cat "$DIR/err"; exit 1; }
insert into auth.users (id, email) values ('${U}1', 'usuario@exemplo.com'), ('${U}2', 'conta-nova@exemplo.com');
insert into core.acessos (user_id, modulo, papel) values ('${U}1', 'tributos', 'viewer');
insert into public.grupos (nome) values ('G');
insert into public.empresas (cnpj, razao_social) values ('11.659.040/0001-66', 'Teste SA');
SQL
como() { psql -h /tmp -p "$PORT" -U postgres -qtA -c "set request.jwt.claims = '{\"sub\":\"$1\",\"email\":\"$2\",\"role\":\"authenticated\"}'; set role authenticated; $3" 2>&1 | tail -1; }
falhas=0
ok() { if [ "$2" = "$3" ]; then echo "  ✓ $1"; else echo "  ✗ $1 (obtido: $2 · esperado: $3)"; falhas=$((falhas+1)); fi; }
ok "quem tem módulo lê as empresas"       "$(como ${U}1 usuario@exemplo.com 'select count(*) from public.empresas;')" "1"
ok "conta nova sem módulo NÃO lê"          "$(como ${U}2 conta-nova@exemplo.com 'select count(*) from public.empresas;')" "0"
ok "conta nova sem módulo NÃO lê os grupos" "$(como ${U}2 conta-nova@exemplo.com 'select count(*) from public.grupos;')" "0"
ok "a dona lê sem linha de módulo"          "$(como ${U}3 LILIANE.HIRAMOTO@grupoflorida.com.br 'select count(*) from public.empresas;')" "1"
ok "nenhuma regra using(true) sobrou"       "$(Q -tA -c "select count(*) from pg_policies where tablename in ('empresas','grupos') and qual = 'true';")" "0"
ok "as colunas da Receita existem"          "$(Q -tA -c "select count(*) from information_schema.columns where table_name = 'empresas' and column_name in ('cadastro','qsa','receita_atualizado_em');")" "3"
[ "$falhas" = "0" ] && echo "✅ 0017: empresas só com acesso ao portal" || { echo "❌ $falhas falha(s)"; exit 1; }
