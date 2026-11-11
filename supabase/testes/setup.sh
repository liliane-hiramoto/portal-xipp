#!/usr/bin/env bash
# Prova o supabase/SETUP-COMPLETO.sql (todas as migrações juntas) num Postgres
# DESCARTÁVEL, imitando o pedaço do Supabase de que ele depende (auth, storage).
#   bash supabase/testes/setup.sh
# ============================================================================
set -uo pipefail
cd "$(dirname "$0")/../.."
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PORT=${PORT:-55439}
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
create role service_role nologin; -- o Supabase tem (a 0014 dá permissão a ele)
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
# O SETUP inteiro, duas vezes: tem de rodar de cima a baixo e ser idempotente
# (é o que a usuária cola uma vez em cada portal novo).
for i in 1 2; do
  Q -f supabase/SETUP-COMPLETO.sql >/dev/null 2>"$DIR/err" || { echo "✗ SETUP-COMPLETO.sql ($i)"; cat "$DIR/err"; exit 1; }
done
# user_modules conta como tabela OU view: desde a Etapa 5 do catálogo ela é a
# view de leitura sobre core.acessos.
tab=$(Q -tAc "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','v') and c.relname in ('user_modules','empresas','trib_darfs','trib_cnpj_base','y570_processamentos','cpf_consultas');")
bkt=$(Q -tAc "select count(*) from storage.buckets where id in ('darf-pdfs','docs-fiscais','y570-pdfs') and not public;")
semrls=$(Q -tAc "select count(*) from pg_tables where schemaname = 'public' and not rowsecurity;")
# 0012: perfis de acesso só pelo servidor (RLS sem política nenhuma) e os 2 de exemplo.
perf=$(Q -tAc "select (select count(*) from public.perfis_acesso) || '/' || (select count(*) from public.perfil_acesso_itens) || '/' || (select count(*) from pg_policies where tablename in ('perfis_acesso','perfil_acesso_itens'));")
echo "tabelas: $tab/6 · buckets privados: $bkt/3 · tabelas sem RLS: $semrls · perfis/itens/políticas: $perf"
[ "$tab" = 6 ] && [ "$bkt" = 3 ] && [ "$semrls" = 0 ] && [ "$perf" = "2/6/0" ] && echo "✅ SETUP-COMPLETO.sql: aplica duas vezes, tudo com RLS" || { echo "❌ SETUP-COMPLETO.sql"; exit 1; }
