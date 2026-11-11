#!/usr/bin/env bash
# ============================================================================
# Prova a 0007 (módulo Tributos), a 0008 (Consulta CNPJ: módulo próprio e base
# no banco), a 0009/0010 (Y570: módulo próprio, histórico, PDFs e só empresa
# cadastrada) e a 0011 (Consulta CPF) num Postgres DESCARTÁVEL — nada aqui toca o Supabase de produção.
# Imita o pedaço do Supabase de que as políticas dependem (auth, storage) e
# aplica as migrações REAIS.
#
#   bash supabase/testes/tributos.sh
#
# O que tem de valer (régua de user_modules + super-admin):
#   - viewer do `tributos` LÊ os DARFs e NÃO grava; editor grava;
#   - quem só tem o `cnpj` NÃO vê DARF; quem só tem o `tributos` NÃO vê a base
#     de CNPJ (é o motivo do módulo próprio);
#   - viewer do `cnpj` lê a base e não grava; editor grava;
#   - admin de OUTRO módulo (admin do portal) lê e grava nos dois;
#   - sem módulo nenhum: não lê nada.
# ============================================================================
set -uo pipefail
cd "$(dirname "$0")/../.."
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PORT=${PORT:-55438}
DIR=$(mktemp -d /tmp/tributos.XXXXXX)
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
for f in supabase/migrations/0001_*.sql supabase/migrations/0002_*.sql supabase/migrations/0004_*.sql; do
  Q -f "$f" >/dev/null 2>"$DIR/err" || { echo "✗ aplicar $f"; cat "$DIR/err"; exit 1; }
done
# As duas migrações, duas vezes cada: têm de ser idempotentes.
for i in 1 2; do
  for f in supabase/migrations/0007_modulo_tributos.sql supabase/migrations/0008_cnpj_base.sql supabase/migrations/0009_modulo_y570.sql supabase/migrations/0010_y570_pdfs_e_cadastro.sql supabase/migrations/0011_consulta_cpf.sql; do
    Q -f "$f" >/dev/null 2>"$DIR/err" || { echo "✗ aplicar $f ($i)"; cat "$DIR/err"; exit 1; }
  done
done

U=00000000-0000-0000-0000-00000000000
C=00000000-0000-0000-0000-000000000010
Q <<SQL >/dev/null || { echo "✗ cenário"; exit 1; }
insert into auth.users (id, email) values
  ('${U}1', 'trib-viewer@exemplo.com'), ('${U}2', 'trib-editor@exemplo.com'),
  ('${U}3', 'cnpj-viewer@exemplo.com'), ('${U}4', 'cnpj-editor@exemplo.com'),
  ('${U}5', 'admin-fin@exemplo.com'),   ('${U}6', 'ninguem@exemplo.com'),
  ('${U}7', 'y570-viewer@exemplo.com'), ('${U}8', 'y570-editor@exemplo.com'),
  ('${U}9', 'cpf-viewer@exemplo.com'),  ('${C}', 'cpf-editor@exemplo.com');
insert into public.user_modules values
  ('${U}1', 'tributos', 'viewer'), ('${U}2', 'tributos', 'editor'),
  ('${U}3', 'cnpj', 'viewer'),     ('${U}4', 'cnpj', 'editor'),
  ('${U}5', 'financeiro', 'admin'),
  ('${U}7', 'y570', 'viewer'),     ('${U}8', 'y570', 'editor'),
  ('${U}9', 'cpf', 'viewer'),      ('${C}', 'cpf', 'editor');
-- Só empresa CADASTRADA entra no Y570 (0010): a raiz 22222222 está, a 33333333 não.
insert into public.empresas (cnpj, razao_social) values ('22.222.222/0001-91', 'Cadastrada SA');
insert into public.cpf_consultas (cpf, nascimento_informado, http_status) values ('12345678909', '1980-01-01', 200);
insert into public.y570_processamentos (raiz, nome, linhas, qtd_linhas) values ('11111111', 'Empresa', '[]', 0);
insert into public.trib_darfs (cnpj, codigo, principal, total, numero_documento)
  values ('11111111000191', '2089', 100, 100, 'DOC1');
insert into public.trib_cnpj_base (cnpj, estado) values ('11111111000191', 'pendente');
SQL
como() { echo "set role authenticated; set request.jwt.claims = '{\"sub\":\"$1\",\"email\":\"$2\"}';"; }
le_darf()  { Q -tAc "$(como $1 $2) select count(*) from public.trib_darfs;" 2>/dev/null | tail -1; }
grava_darf() { Q -tAc "$(como $1 $2) insert into public.trib_darfs (cnpj, codigo, principal, total, numero_documento) values ('11111111000191','2089',1,1,'D$1');" >/dev/null 2>&1 && echo sim || echo nao; }
le_cnpj()  { Q -tAc "$(como $1 $2) select count(*) from public.trib_cnpj_base;" 2>/dev/null | tail -1; }
grava_cnpj() { Q -tAc "$(como $1 $2) insert into public.trib_cnpj_base (cnpj) values ('2222222200019$3');" >/dev/null 2>&1 && echo sim || echo nao; }
le_y570()  { Q -tAc "$(como $1 $2) select count(*) from public.y570_processamentos;" 2>/dev/null | tail -1; }
grava_y570() { Q -tAc "$(como $1 $2) insert into public.y570_processamentos (raiz, nome, linhas, qtd_linhas) values ('$3', 'X', '[]', 0);" >/dev/null 2>&1 && echo sim || echo nao; }
grava_pdf() { Q -tAc "$(como $1 $2) insert into storage.objects (bucket_id, name) values ('y570-pdfs', '$3/1/0.pdf');" >/dev/null 2>&1 && echo sim || echo nao; }
le_cpf()  { Q -tAc "$(como $1 $2) select count(*) from public.cpf_consultas;" 2>/dev/null | tail -1; }
grava_cpf() { Q -tAc "$(como $1 $2) insert into public.cpf_consultas (cpf, nascimento_informado, http_status) values ('11144477735', '1990-02-03', 200);" >/dev/null 2>&1 && echo sim || echo nao; }
FALHAS=0
confere() { if [ "$2" = "$3" ]; then echo "✓ $1: $2"; else echo "✗ $1: esperado $3, veio $2"; FALHAS=$((FALHAS+1)); fi; }

E=x@exemplo.com
confere "viewer do tributos LÊ os DARFs"        "$(le_darf ${U}1 $E)" 1
confere "viewer do tributos NÃO grava DARF"     "$(grava_darf ${U}1 $E)" nao
confere "editor do tributos grava DARF"         "$(grava_darf ${U}2 $E)" sim
confere "tributos NÃO vê a base de CNPJ"        "$(le_cnpj ${U}1 $E)" 0
confere "cnpj NÃO vê DARF"                      "$(le_darf ${U}3 $E)" 0
confere "viewer do cnpj LÊ a base"              "$(le_cnpj ${U}3 $E)" 1
confere "viewer do cnpj NÃO grava"              "$(grava_cnpj ${U}3 $E 1)" nao
confere "editor do cnpj grava"                  "$(grava_cnpj ${U}4 $E 2)" sim
confere "admin de outro módulo LÊ DARF"         "$(le_darf ${U}5 $E)" 2
confere "admin de outro módulo grava DARF"      "$(grava_darf ${U}5 $E)" sim
confere "admin de outro módulo grava na base"   "$(grava_cnpj ${U}5 $E 3)" sim
confere "sem módulo: não lê DARF"               "$(le_darf ${U}6 $E)" 0
confere "sem módulo: não lê a base"             "$(le_cnpj ${U}6 $E)" 0
confere "super-admin pelo e-mail lê DARF"       "$(le_darf ${U}6 liliane.hiramoto@grupoflorida.com.br)" 3
confere "viewer do y570 LÊ o histórico"         "$(le_y570 ${U}7 $E)" 1
confere "viewer do y570 NÃO grava"              "$(grava_y570 ${U}7 $E 22222222)" nao
confere "editor do y570 grava empresa cadastrada" "$(grava_y570 ${U}8 $E 22222222)" sim
confere "editor do y570 NÃO grava empresa fora do cadastro" "$(grava_y570 ${U}8 $E 33333333)" nao
confere "editor do y570 guarda PDF de empresa cadastrada"   "$(grava_pdf ${U}8 $E 22222222)" sim
confere "editor do y570 NÃO guarda PDF de empresa de fora"   "$(grava_pdf ${U}8 $E 33333333)" nao
confere "viewer do y570 NÃO guarda PDF"         "$(grava_pdf ${U}7 $E 22222222)" nao
confere "tributos NÃO vê o Y570"                "$(le_y570 ${U}1 $E)" 0
confere "admin de outro módulo LÊ o Y570"       "$(le_y570 ${U}5 $E)" 2
confere "viewer do cpf LÊ o histórico"          "$(le_cpf ${U}9 $E)" 1
confere "viewer do cpf NÃO consulta (grava)"    "$(grava_cpf ${U}9 $E)" nao
confere "editor do cpf consulta (grava)"        "$(grava_cpf ${C} $E)" sim
confere "y570 NÃO vê o histórico de CPF"        "$(le_cpf ${U}8 $E)" 0
confere "sem módulo: não lê CPF"                "$(le_cpf ${U}6 $E)" 0

# ---- 0013: admin do PORTAL separado do admin de MÓDULO ----
for i in 1 2; do Q -f supabase/migrations/0013_admin_do_portal_separado.sql >/dev/null 2>"$DIR/err" || { echo "✗ aplicar 0013 ($i)"; cat "$DIR/err"; exit 1; }; done
A=00000000-0000-0000-0000-0000000000a1; P=00000000-0000-0000-0000-0000000000a2
Q <<SQL >/dev/null || { echo "✗ cenário 0013"; exit 1; }
insert into auth.users (id, email) values ('$A', 'admin-trib@exemplo.com'), ('$P', 'admin-portal@exemplo.com');
insert into public.user_modules values ('$A', 'tributos', 'admin'), ('$P', 'portal', 'admin');
SQL
confere "0013: quem já era admin (de outro módulo) continua admin do portal" "$(le_darf ${U}5 $E)" "$(le_darf ${U}6 liliane.hiramoto@grupoflorida.com.br)"
confere "0013: admin NOVO do tributos lê e grava DARF"     "$(grava_darf $A $E)" sim
confere "0013: admin do tributos NÃO vê a base de CNPJ"    "$(le_cnpj $A $E)" 0
confere "0013: admin do tributos NÃO grava na base de CNPJ" "$(grava_cnpj $A $E 4)" nao
confere "0013: admin do tributos NÃO vê o Y570"            "$(le_y570 $A $E)" 0
confere "0013: admin do tributos NÃO é admin do portal"    "$(Q -tAc "$(como $A $E) select public.eh_admin_portal();" | tail -1)" f
confere "0013: a linha 'portal' é admin do portal"         "$(Q -tAc "$(como $P $E) select public.eh_admin_portal();" | tail -1)" t
confere "0013: admin do portal lê o Y570"                  "$(le_y570 $P $E)" 2
confere "0013: admin do portal grava na base de CNPJ"      "$(grava_cnpj $P $E 5)" sim
confere "0013: super-admin pelo e-mail é admin do portal"  "$(Q -tAc "$(como ${U}6 liliane.hiramoto@grupoflorida.com.br) select public.eh_admin_portal();" | tail -1)" t
confere "0013: conferência (função · admins · sem linha portal)" "$(Q -tAc "$(sed -n '/^SELECT$/,$p' supabase/migrations/0013_admin_do_portal_separado.sql)" | tail -1)" "1|2|1"
echo
[ "$FALHAS" = 0 ] && echo "✅ Tributos, Consulta CNPJ, Y570 e Consulta CPF: RLS OK" || { echo "❌ $FALHAS falha(s)"; exit 1; }
