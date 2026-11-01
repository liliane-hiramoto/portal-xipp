#!/usr/bin/env bash
# ============================================================================
# Prova a 0004 (viewer só LÊ o estado do Financeiro) num Postgres
# DESCARTÁVEL — nada aqui toca o Supabase de produção. Imita o pedaço do
# Supabase de que as políticas dependem e aplica as migrações REAIS.
#
#   bash supabase/testes/viewer.sh
# ============================================================================
set -uo pipefail
cd "$(dirname "$0")/../.."
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PORT=${PORT:-55437}
DIR=$(mktemp -d /tmp/viewer.XXXXXX)
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
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
grant usage on schema auth, public to authenticated, anon;
grant execute on all functions in schema auth to authenticated, anon;
alter default privileges in schema public grant all on tables to anon, authenticated;
SQL
for f in supabase/migrations/0001_*.sql supabase/migrations/0002_*.sql; do
  Q -f "$f" >/dev/null 2>"$DIR/err" || { echo "✗ aplicar $f"; cat "$DIR/err"; exit 1; }
done

U=00000000-0000-0000-0000-00000000000
Q <<SQL >/dev/null || { echo "✗ cenário"; exit 1; }
insert into auth.users (id, email) values
  ('${U}1', 'viewer@exemplo.com'), ('${U}2', 'editor@exemplo.com'), ('${U}3', 'admin@exemplo.com');
insert into public.user_modules values
  ('${U}1', 'financeiro', 'viewer'), ('${U}2', 'financeiro', 'editor'),
  ('${U}3', 'financeiro', 'viewer'), ('${U}3', 'cadastros', 'admin');
insert into public.module_state (modulo, key, value) values ('financeiro', 'cpcr', '1');
SQL
como() { echo "set role authenticated; set request.jwt.claims = '{\"sub\":\"$1\"}';"; }
grava() { Q -tAc "$(como $1) with u as (update public.module_state set value = '2' where modulo = 'financeiro' returning 1) select count(*) from u;" 2>/dev/null | tail -1; }
insere() { Q -tAc "$(como $1) insert into public.module_state (modulo, key, value) values ('financeiro', 'k$1', '1');" >/dev/null 2>&1 && echo sim || echo nao; }
le() { Q -tAc "$(como $1) select count(*) from public.module_state where modulo = 'financeiro' and key = 'cpcr';" | tail -1; }
FALHAS=0
confere() { if [ "$2" = "$3" ]; then echo "✓ $1: $2"; else echo "✗ $1: esperado $3, veio $2"; FALHAS=$((FALHAS+1)); fi; }

confere "ANTES (0001): viewer GRAVA o estado" "$(grava ${U}1)" 1
for i in 1 2; do
  Q -f supabase/migrations/0004_viewer_so_le.sql >/dev/null 2>"$DIR/err" || { echo "✗ aplicar 0004 ($i)"; cat "$DIR/err"; exit 1; }
done
confere "viewer NÃO grava"            "$(grava ${U}1)" 0
confere "viewer NÃO insere chave"     "$(insere ${U}1)" nao
confere "viewer continua LENDO"       "$(le ${U}1)" 1
confere "editor grava"                "$(grava ${U}2)" 1
confere "admin (de outro módulo) grava" "$(grava ${U}3)" 1
echo
[ "$FALHAS" = 0 ] && echo "✅ viewer só lê OK" || { echo "❌ $FALHAS falha(s)"; exit 1; }
