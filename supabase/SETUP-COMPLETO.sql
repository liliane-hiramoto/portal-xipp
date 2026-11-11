-- SETUP COMPLETO do portal fiscal — GERADO por scripts/montar-setup.mjs, não edite.
-- Cole tudo no Supabase › SQL Editor do portal novo e clique em Run (uma vez).
-- Junta, na ordem: 0001_portal.sql, 0002_cadastro.sql, 0004_viewer_so_le.sql, 0005_senha_provisoria.sql, 0007_modulo_tributos.sql, 0008_cnpj_base.sql, 0009_modulo_y570.sql, 0010_y570_pdfs_e_cadastro.sql, 0011_consulta_cpf.sql, 0012_perfis_acesso.sql, 0013_admin_do_portal_separado.sql, 0014_core_modulos_acessos.sql, 0015_core_acessos_dono_unico.sql.
-- A última tabela que aparece é a conferência do catálogo de cards e acessos (6 · true · 1 · true · false).

-- ==================== 0001_portal.sql ====================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  criado_em timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles for select to authenticated using (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', new.email))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table if not exists public.user_modules (
  user_id uuid not null references auth.users(id) on delete cascade,
  modulo  text not null,                  -- 'financeiro' | 'tributos' | 'expense'
  papel   text not null default 'editor', -- viewer | editor | admin
  primary key (user_id, modulo)
);
do $um$
begin
  if (select relkind from pg_class where oid = 'public.user_modules'::regclass) = 'r' then
    alter table public.user_modules enable row level security;
    drop policy if exists user_modules_self on public.user_modules;
    create policy user_modules_self on public.user_modules for select to authenticated using (user_id = auth.uid());
  end if;
end $um$;

create or replace function public.tem_modulo(m text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_modules where user_id = auth.uid() and modulo = m);
$$;

create table if not exists public.module_state (
  modulo     text not null,
  key        text not null,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (modulo, key)
);
create or replace function public.module_state_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
drop trigger if exists trg_module_state_touch on public.module_state;
create trigger trg_module_state_touch before insert or update on public.module_state
  for each row execute function public.module_state_touch();

alter table public.module_state enable row level security;
drop policy if exists module_state_select on public.module_state;
drop policy if exists module_state_insert on public.module_state;
drop policy if exists module_state_update on public.module_state;
create policy module_state_select on public.module_state for select to authenticated using (public.tem_modulo(modulo));
create policy module_state_insert on public.module_state for insert to authenticated with check (public.tem_modulo(modulo));
create policy module_state_update on public.module_state for update to authenticated using (public.tem_modulo(modulo)) with check (public.tem_modulo(modulo));

-- ==================== 0002_cadastro.sql ====================
create table if not exists public.grupos (
  id        bigint generated always as identity primary key,
  nome      text not null unique,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.empresas (
  id                bigint generated always as identity primary key,
  grupo_id          bigint references public.grupos(id) on delete set null,
  cnpj              text not null unique,
  apelido           text,
  razao_social      text,
  nome_fantasia     text,
  abertura          date,
  natureza_juridica text,
  cnae              text,
  porte             text,
  situacao          text,
  capital_social    numeric,
  regime            text,            -- Simples | Presumido | Real
  optante_simples   boolean,
  endereco          text,
  email             text,
  telefone          text,
  banco             text,
  conta             text,
  fonte             text,            -- contaazul | ofx | ...
  ativo             boolean not null default true,
  dados             jsonb not null default '{}'::jsonb,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);
create index if not exists idx_empresas_grupo on public.empresas(grupo_id);

create or replace function public.empresas_touch()
returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;
drop trigger if exists trg_empresas_touch on public.empresas;
create trigger trg_empresas_touch before update on public.empresas
  for each row execute function public.empresas_touch();

alter table public.grupos   enable row level security;
alter table public.empresas enable row level security;
drop policy if exists grupos_sel   on public.grupos;
drop policy if exists empresas_sel on public.empresas;
create policy grupos_sel   on public.grupos   for select to authenticated using (true);
create policy empresas_sel on public.empresas for select to authenticated using (true);

-- ==================== 0004_viewer_so_le.sql ====================
create or replace function public.pode_gravar_modulo(m text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_modules
    where user_id = auth.uid()
      and ((modulo = m and papel in ('editor', 'admin')) or papel = 'admin')
  );
$$;

comment on function public.pode_gravar_modulo(text) is
  'Gravar exige papel editor/admin no módulo, ou admin. Ler continua sendo '
  'tem_modulo(m), com qualquer papel (0004).';

drop policy if exists module_state_insert on public.module_state;
create policy module_state_insert on public.module_state
  for insert to authenticated with check (public.pode_gravar_modulo(modulo));

drop policy if exists module_state_update on public.module_state;
create policy module_state_update on public.module_state
  for update to authenticated
  using (public.pode_gravar_modulo(modulo)) with check (public.pode_gravar_modulo(modulo));

select 'politica de gravação' as o_que, policyname as detalhe,
       case when coalesce(qual,'') || coalesce(with_check,'') like '%pode_gravar_modulo%'
            then 'só editor/admin' else 'AINDA ABERTA A VIEWER' end as regra
  from pg_policies
 where schemaname = 'public' and tablename = 'module_state' and cmd in ('INSERT','UPDATE')
union all
select 'viewer do financeiro (passa a só ler)', u.email, m.papel
  from public.user_modules m join auth.users u on u.id = m.user_id
 where m.modulo = 'financeiro' and m.papel = 'viewer'
union all
select 'sem linha no financeiro (perde o acesso, salvo se for admin)', u.email,
       coalesce((select string_agg(x.modulo || ':' || x.papel, ', ')
                   from public.user_modules x where x.user_id = u.id), '(nenhum módulo)')
  from auth.users u
 where not exists (select 1 from public.user_modules m
                    where m.user_id = u.id and m.modulo = 'financeiro')
order by 1, 2;

-- ==================== 0005_senha_provisoria.sql ====================
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"senha_provisoria": true}'::jsonb
 where raw_user_meta_data ->> 'must_change_password' = 'true';

-- ==================== 0007_modulo_tributos.sql ====================
BEGIN;

CREATE OR REPLACE FUNCTION public.trib_is_user() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT public.tem_modulo('tributos')
      OR EXISTS (SELECT 1 FROM public.user_modules
                  WHERE user_id = auth.uid() AND papel = 'admin')
      OR lower(auth.jwt() ->> 'email') = 'liliane.hiramoto@grupoflorida.com.br';
$$;

CREATE OR REPLACE FUNCTION public.trib_is_admin() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT public.pode_gravar_modulo('tributos')
      OR lower(auth.jwt() ->> 'email') = 'liliane.hiramoto@grupoflorida.com.br';
$$;

REVOKE ALL ON FUNCTION public.trib_is_user() FROM public;
REVOKE ALL ON FUNCTION public.trib_is_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.trib_is_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.trib_is_admin() TO authenticated;

CREATE TABLE IF NOT EXISTS public.trib_darfs (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cnpj             text NOT NULL,
  codigo           text NOT NULL,
  tributo          text,
  periodo_apuracao date,
  vencimento       date,
  recolhimento     date,
  principal        numeric(14,2) NOT NULL DEFAULT 0,
  multa            numeric(14,2) NOT NULL DEFAULT 0,
  juros            numeric(14,2) NOT NULL DEFAULT 0,
  total            numeric(14,2) NOT NULL DEFAULT 0,
  banco            text,
  numero_documento text,
  arquivo          text,
  arquivo_path     text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trib_darfs_cnpj_recolh_idx ON public.trib_darfs (cnpj, recolhimento);
CREATE INDEX IF NOT EXISTS trib_darfs_codigo_idx ON public.trib_darfs (codigo);
CREATE UNIQUE INDEX IF NOT EXISTS trib_darfs_uk
  ON public.trib_darfs (numero_documento, codigo, principal, multa, juros, total);

ALTER TABLE public.trib_darfs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trib read darfs" ON public.trib_darfs;
DROP POLICY IF EXISTS "trib admin write darfs" ON public.trib_darfs;
CREATE POLICY "trib read darfs" ON public.trib_darfs FOR SELECT USING (public.trib_is_user());
CREATE POLICY "trib admin write darfs" ON public.trib_darfs
  FOR ALL USING (public.trib_is_admin()) WITH CHECK (public.trib_is_admin());

CREATE TABLE IF NOT EXISTS public.trib_fiscal_snapshots (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cnpj              text NOT NULL,
  razao_social      text,
  data_consulta     text,
  arquivo           text,
  total_original    numeric(16,2) NOT NULL DEFAULT 0,
  total_saldo       numeric(16,2) NOT NULL DEFAULT 0,
  total_multa       numeric(16,2) NOT NULL DEFAULT 0,
  total_juros       numeric(16,2) NOT NULL DEFAULT 0,
  total_consolidado numeric(16,2) NOT NULL DEFAULT 0,
  sem_pendencias    boolean NOT NULL DEFAULT false,
  conteudo_hash     text NOT NULL,
  dados             jsonb NOT NULL,
  enviado_em        timestamptz NOT NULL DEFAULT now(),
  enviado_por       uuid
);
CREATE INDEX IF NOT EXISTS trib_fiscal_cnpj_env_idx ON public.trib_fiscal_snapshots (cnpj, enviado_em DESC);

ALTER TABLE public.trib_fiscal_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trib read fiscal" ON public.trib_fiscal_snapshots;
DROP POLICY IF EXISTS "trib admin write fiscal" ON public.trib_fiscal_snapshots;
CREATE POLICY "trib read fiscal" ON public.trib_fiscal_snapshots FOR SELECT USING (public.trib_is_user());
CREATE POLICY "trib admin write fiscal" ON public.trib_fiscal_snapshots
  FOR ALL USING (public.trib_is_admin()) WITH CHECK (public.trib_is_admin());

CREATE TABLE IF NOT EXISTS public.trib_certidoes_snapshots (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo          text NOT NULL,
  cnpj          text NOT NULL,
  razao_social  text,
  numero        text,
  emissao       text,
  validade      text,
  situacao      text,
  regular       boolean NOT NULL DEFAULT false,
  conteudo_hash text NOT NULL,
  dados         jsonb NOT NULL,
  enviado_em    timestamptz NOT NULL DEFAULT now(),
  enviado_por   uuid
);
CREATE INDEX IF NOT EXISTS trib_cert_key_idx ON public.trib_certidoes_snapshots (cnpj, tipo, enviado_em DESC);

ALTER TABLE public.trib_certidoes_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trib read certidoes" ON public.trib_certidoes_snapshots;
DROP POLICY IF EXISTS "trib admin write certidoes" ON public.trib_certidoes_snapshots;
CREATE POLICY "trib read certidoes" ON public.trib_certidoes_snapshots FOR SELECT USING (public.trib_is_user());
CREATE POLICY "trib admin write certidoes" ON public.trib_certidoes_snapshots
  FOR ALL USING (public.trib_is_admin()) WITH CHECK (public.trib_is_admin());

CREATE TABLE IF NOT EXISTS public.trib_darf_dup_notes (
  grupo_chave     text PRIMARY KEY,
  comentario      text,
  nao_duplicidade boolean NOT NULL DEFAULT false,
  justificativa   text,
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  atualizado_por  uuid
);
ALTER TABLE public.trib_darf_dup_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trib read dup notes" ON public.trib_darf_dup_notes;
DROP POLICY IF EXISTS "trib write dup notes" ON public.trib_darf_dup_notes;
CREATE POLICY "trib read dup notes" ON public.trib_darf_dup_notes FOR SELECT USING (public.trib_is_user());
CREATE POLICY "trib write dup notes" ON public.trib_darf_dup_notes
  FOR ALL USING (public.trib_is_admin()) WITH CHECK (public.trib_is_admin());

CREATE TABLE IF NOT EXISTS public.trib_parcelamentos (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cnpj          text NOT NULL,
  sigla         text NOT NULL,
  numero        text NOT NULL,
  razao_social  text,
  situacao      text,
  dados         jsonb NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cnpj, sigla, numero)
);
ALTER TABLE public.trib_parcelamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trib read parcelamentos" ON public.trib_parcelamentos;
DROP POLICY IF EXISTS "trib admin write parcelamentos" ON public.trib_parcelamentos;
CREATE POLICY "trib read parcelamentos" ON public.trib_parcelamentos FOR SELECT USING (public.trib_is_user());
CREATE POLICY "trib admin write parcelamentos" ON public.trib_parcelamentos
  FOR ALL USING (public.trib_is_admin()) WITH CHECK (public.trib_is_admin());

CREATE TABLE IF NOT EXISTS public.trib_documentos (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo          text NOT NULL,
  cnpj          text,
  razao_social  text,
  referencia    text,
  arquivo       text NOT NULL,
  path          text NOT NULL UNIQUE,
  tamanho       bigint,
  hash          text NOT NULL UNIQUE,
  enviado_em    timestamptz NOT NULL DEFAULT now(),
  enviado_por   uuid DEFAULT auth.uid()
);
CREATE INDEX IF NOT EXISTS trib_documentos_cnpj_idx ON public.trib_documentos (cnpj, enviado_em DESC);
ALTER TABLE public.trib_documentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trib read documentos" ON public.trib_documentos;
DROP POLICY IF EXISTS "trib admin write documentos" ON public.trib_documentos;
CREATE POLICY "trib read documentos" ON public.trib_documentos FOR SELECT USING (public.trib_is_user());
CREATE POLICY "trib admin write documentos" ON public.trib_documentos
  FOR ALL USING (public.trib_is_admin()) WITH CHECK (public.trib_is_admin());

INSERT INTO storage.buckets (id, name, public) VALUES ('darf-pdfs', 'darf-pdfs', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('docs-fiscais', 'docs-fiscais', false) ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "trib read darf pdfs" ON storage.objects;
DROP POLICY IF EXISTS "trib write darf pdfs" ON storage.objects;
DROP POLICY IF EXISTS "trib read docs fiscais" ON storage.objects;
DROP POLICY IF EXISTS "trib write docs fiscais" ON storage.objects;
CREATE POLICY "trib read darf pdfs" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'darf-pdfs' AND public.trib_is_user());
CREATE POLICY "trib write darf pdfs" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'darf-pdfs' AND public.trib_is_admin());
CREATE POLICY "trib read docs fiscais" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'docs-fiscais' AND public.trib_is_user());
CREATE POLICY "trib write docs fiscais" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'docs-fiscais' AND public.trib_is_admin());

COMMIT;

SELECT
  (SELECT count(*) FROM pg_proc WHERE proname IN ('trib_is_user', 'trib_is_admin')) AS funcoes_de_2,
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN
      ('trib_darfs','trib_fiscal_snapshots','trib_certidoes_snapshots','trib_darf_dup_notes','trib_parcelamentos','trib_documentos')) AS tabelas_de_6,
  (SELECT count(*) FROM storage.buckets WHERE id IN ('darf-pdfs','docs-fiscais')) AS buckets_de_2,
  (SELECT count(*) FROM pg_policies WHERE tablename LIKE 'trib\_%') AS politicas_trib;

-- ==================== 0008_cnpj_base.sql ====================
BEGIN;

CREATE OR REPLACE FUNCTION public.cnpj_is_user() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT public.tem_modulo('cnpj')
      OR EXISTS (SELECT 1 FROM public.user_modules
                  WHERE user_id = auth.uid() AND papel = 'admin')
      OR lower(auth.jwt() ->> 'email') = 'liliane.hiramoto@grupoflorida.com.br';
$$;

CREATE OR REPLACE FUNCTION public.cnpj_is_admin() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT public.pode_gravar_modulo('cnpj')
      OR lower(auth.jwt() ->> 'email') = 'liliane.hiramoto@grupoflorida.com.br';
$$;

REVOKE ALL ON FUNCTION public.cnpj_is_user() FROM public;
REVOKE ALL ON FUNCTION public.cnpj_is_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.cnpj_is_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cnpj_is_admin() TO authenticated;

CREATE TABLE IF NOT EXISTS public.trib_cnpj_base (
  cnpj           text PRIMARY KEY CHECK (cnpj ~ '^[0-9]{14}$'),
  estado         text NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente', 'ok', 'erro')),
  erro           text,
  registro       jsonb,
  razao_social   text,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid DEFAULT auth.uid()
);
CREATE INDEX IF NOT EXISTS trib_cnpj_base_atualizado_idx ON public.trib_cnpj_base (atualizado_em DESC);

ALTER TABLE public.trib_cnpj_base ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cnpj read base" ON public.trib_cnpj_base;
DROP POLICY IF EXISTS "cnpj write base" ON public.trib_cnpj_base;
CREATE POLICY "cnpj read base" ON public.trib_cnpj_base FOR SELECT TO authenticated USING (public.cnpj_is_user());
CREATE POLICY "cnpj write base" ON public.trib_cnpj_base
  FOR ALL TO authenticated USING (public.cnpj_is_admin()) WITH CHECK (public.cnpj_is_admin());

COMMIT;

SELECT
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'trib_cnpj_base') AS tabela_existe,
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.trib_cnpj_base'::regclass) AS rls_ligada,
  (SELECT count(*) FROM pg_policies WHERE tablename = 'trib_cnpj_base' AND policyname LIKE 'cnpj %') AS politicas_de_2,
  (SELECT count(*) FROM pg_proc WHERE proname IN ('cnpj_is_user', 'cnpj_is_admin')) AS funcoes_de_2,
  (SELECT count(*) FROM public.trib_cnpj_base) AS cnpjs_na_base;

-- ==================== 0009_modulo_y570.sql ====================
BEGIN;

CREATE OR REPLACE FUNCTION public.y570_is_user() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT public.tem_modulo('y570')
      OR EXISTS (SELECT 1 FROM public.user_modules
                  WHERE user_id = auth.uid() AND papel = 'admin')
      OR lower(auth.jwt() ->> 'email') = 'liliane.hiramoto@grupoflorida.com.br';
$$;

CREATE OR REPLACE FUNCTION public.y570_is_admin() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT public.pode_gravar_modulo('y570')
      OR lower(auth.jwt() ->> 'email') = 'liliane.hiramoto@grupoflorida.com.br';
$$;

REVOKE ALL ON FUNCTION public.y570_is_user() FROM public;
REVOKE ALL ON FUNCTION public.y570_is_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.y570_is_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.y570_is_admin() TO authenticated;

CREATE TABLE IF NOT EXISTS public.y570_processamentos (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  raiz           text NOT NULL CHECK (raiz ~ '^[0-9]{8}$'),
  nome           text NOT NULL,
  arquivos       text[] NOT NULL DEFAULT '{}',
  linhas         jsonb NOT NULL,
  qtd_linhas     int NOT NULL,
  rendimento     numeric(16,2) NOT NULL DEFAULT 0,
  tributo        numeric(16,2) NOT NULL DEFAULT 0,
  processado_em  timestamptz NOT NULL DEFAULT now(),
  processado_por uuid DEFAULT auth.uid()
);
CREATE INDEX IF NOT EXISTS y570_processamentos_raiz_idx ON public.y570_processamentos (raiz, processado_em DESC);

ALTER TABLE public.y570_processamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "y570 read" ON public.y570_processamentos;
DROP POLICY IF EXISTS "y570 insert" ON public.y570_processamentos;
DROP POLICY IF EXISTS "y570 delete" ON public.y570_processamentos;
CREATE POLICY "y570 read" ON public.y570_processamentos FOR SELECT TO authenticated USING (public.y570_is_user());
CREATE POLICY "y570 insert" ON public.y570_processamentos FOR INSERT TO authenticated WITH CHECK (public.y570_is_admin());
CREATE POLICY "y570 delete" ON public.y570_processamentos FOR DELETE TO authenticated USING (public.y570_is_admin());

COMMIT;

SELECT
  (SELECT count(*) FROM pg_proc WHERE proname IN ('y570_is_user', 'y570_is_admin')) AS funcoes_de_2,
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.y570_processamentos'::regclass) AS rls_ligada,
  (SELECT count(*) FROM pg_policies WHERE tablename = 'y570_processamentos') AS politicas_de_3,
  (SELECT count(*) FROM public.y570_processamentos) AS processamentos;

-- ==================== 0010_y570_pdfs_e_cadastro.sql ====================
begin;

create or replace function public.y570_raiz_cadastrada(p_raiz text) returns boolean
  language sql stable security definer set search_path = public as $$
  select p_raiz ~ '^[0-9]{8}$' and exists (
    select 1 from public.empresas
     where left(regexp_replace(coalesce(cnpj, ''), '\D', '', 'g'), 8) = p_raiz
       and length(regexp_replace(coalesce(cnpj, ''), '\D', '', 'g')) = 14);
$$;

create or replace function public.y570_empresas_cadastradas()
  returns table (raiz text, nome text)
  language sql stable security definer set search_path = public as $$
  select distinct on (1) left(regexp_replace(cnpj, '\D', '', 'g'), 8), coalesce(nullif(razao_social, ''), nullif(nome_fantasia, ''), apelido)
    from public.empresas
   where length(regexp_replace(coalesce(cnpj, ''), '\D', '', 'g')) = 14
     and public.y570_is_user()
   order by 1, 2;
$$;
revoke all on function public.y570_empresas_cadastradas() from public;
grant execute on function public.y570_empresas_cadastradas() to authenticated;

drop policy if exists y570_insert on public.y570_processamentos;
drop policy if exists "y570 insert" on public.y570_processamentos;
create policy "y570 insert" on public.y570_processamentos for insert to authenticated
  with check (public.y570_is_admin() and public.y570_raiz_cadastrada(raiz));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('y570-pdfs', 'y570-pdfs', false, 4194304, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists y570_pdfs_read on storage.objects;
drop policy if exists y570_pdfs_insert on storage.objects;
drop policy if exists y570_pdfs_delete on storage.objects;
create policy y570_pdfs_read on storage.objects for select to authenticated
  using (bucket_id = 'y570-pdfs' and public.y570_is_user());
create policy y570_pdfs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'y570-pdfs' and public.y570_is_admin()
              and public.y570_raiz_cadastrada(split_part(name, '/', 1)));
create policy y570_pdfs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'y570-pdfs' and public.y570_is_admin());

commit;

select
  (select count(*) from storage.buckets where id = 'y570-pdfs' and not public) as bucket_privado,
  (select count(*) from pg_policies where schemaname = 'storage' and policyname like 'y570_pdfs%') as politicas_pdf_de_3,
  (select count(*) from pg_policies where tablename = 'y570_processamentos'
     and policyname = 'y570 insert' and with_check like '%y570_raiz_cadastrada%') as insert_confere_cadastro,
  (select count(distinct left(regexp_replace(cnpj, '\D', '', 'g'), 8)) from public.empresas
     where length(regexp_replace(coalesce(cnpj, ''), '\D', '', 'g')) = 14) as raizes_cadastradas;

-- ==================== 0011_consulta_cpf.sql ====================
BEGIN;

CREATE OR REPLACE FUNCTION public.cpf_is_user() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT public.tem_modulo('cpf')
      OR EXISTS (SELECT 1 FROM public.user_modules
                  WHERE user_id = auth.uid() AND papel = 'admin')
      OR lower(auth.jwt() ->> 'email') = 'liliane.hiramoto@grupoflorida.com.br';
$$;

CREATE OR REPLACE FUNCTION public.cpf_is_admin() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT public.pode_gravar_modulo('cpf')
      OR lower(auth.jwt() ->> 'email') = 'liliane.hiramoto@grupoflorida.com.br';
$$;

REVOKE ALL ON FUNCTION public.cpf_is_user() FROM public;
REVOKE ALL ON FUNCTION public.cpf_is_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.cpf_is_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cpf_is_admin() TO authenticated;

CREATE TABLE IF NOT EXISTS public.cpf_consultas (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cpf                text NOT NULL CHECK (cpf ~ '^[0-9]{11}$'),
  nascimento_informado date NOT NULL,
  http_status        int NOT NULL,
  nome               text,
  nome_social        text,
  nascimento         date,
  situacao_codigo    text,
  situacao_descricao text,
  data_inscricao     date,
  data_atualizacao   date,
  resposta           jsonb,
  consultado_em      timestamptz NOT NULL DEFAULT now(),
  consultado_por     uuid DEFAULT auth.uid()
);
CREATE INDEX IF NOT EXISTS cpf_consultas_cpf_idx ON public.cpf_consultas (cpf, consultado_em DESC);

ALTER TABLE public.cpf_consultas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cpf_read ON public.cpf_consultas;
DROP POLICY IF EXISTS cpf_insert ON public.cpf_consultas;
CREATE POLICY cpf_read ON public.cpf_consultas FOR SELECT TO authenticated USING (public.cpf_is_user());
CREATE POLICY cpf_insert ON public.cpf_consultas FOR INSERT TO authenticated WITH CHECK (public.cpf_is_admin());

COMMIT;

SELECT
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.cpf_consultas'::regclass) AS rls_ligada,
  (SELECT count(*) FROM pg_policies WHERE tablename = 'cpf_consultas') AS politicas_de_2,
  (SELECT count(*) FROM pg_proc WHERE proname IN ('cpf_is_user', 'cpf_is_admin')) AS funcoes_de_2;

-- ==================== 0012_perfis_acesso.sql ====================
BEGIN;

CREATE TABLE IF NOT EXISTS public.perfis_acesso (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome       text NOT NULL UNIQUE,
  descricao  text,
  ordem      int NOT NULL DEFAULT 0,
  ativo      boolean NOT NULL DEFAULT true,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.perfil_acesso_itens (
  perfil_id  bigint NOT NULL REFERENCES public.perfis_acesso(id) ON DELETE CASCADE,
  modulo     text NOT NULL CHECK (modulo IN ('tributos', 'cnpj', 'y570', 'cpf')),
  papel      text NOT NULL CHECK (papel IN ('viewer', 'editor', 'admin')),
  PRIMARY KEY (perfil_id, modulo)
);

ALTER TABLE public.perfis_acesso       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfil_acesso_itens ENABLE ROW LEVEL SECURITY;

INSERT INTO public.perfis_acesso (nome, descricao, ordem) VALUES
  ('Fiscal — editor', 'Quem importa DARF, situação fiscal e PDFs do Y570 e mantém a base de CNPJs.', 1),
  ('Consulta — somente leitura', 'Vê Tributos, Y570 e Consulta CNPJ, sem gravar nada.', 2)
ON CONFLICT (nome) DO NOTHING;

INSERT INTO public.perfil_acesso_itens (perfil_id, modulo, papel)
SELECT p.id, i.modulo, i.papel
  FROM public.perfis_acesso p
  JOIN (VALUES
    ('Fiscal — editor', 'tributos', 'editor'), ('Fiscal — editor', 'y570', 'editor'), ('Fiscal — editor', 'cnpj', 'editor'),
    ('Consulta — somente leitura', 'tributos', 'viewer'), ('Consulta — somente leitura', 'y570', 'viewer'), ('Consulta — somente leitura', 'cnpj', 'viewer')
  ) AS i(perfil, modulo, papel) ON i.perfil = p.nome
ON CONFLICT (perfil_id, modulo) DO NOTHING;

COMMIT;

SELECT
  (SELECT count(*) FROM public.perfis_acesso) AS perfis,
  (SELECT count(*) FROM pg_policies WHERE tablename IN ('perfis_acesso', 'perfil_acesso_itens')) AS politicas_de_0,
  (SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('public.perfis_acesso'::regclass, 'public.perfil_acesso_itens'::regclass)) AS rls_ligada;

-- ==================== 0013_admin_do_portal_separado.sql ====================
BEGIN;

DO $um$
BEGIN
  IF (SELECT relkind FROM pg_class WHERE oid = 'public.user_modules'::regclass) = 'r' THEN
    INSERT INTO public.user_modules (user_id, modulo, papel)
    SELECT DISTINCT user_id, 'portal', 'admin'
      FROM public.user_modules
     WHERE papel = 'admin' AND modulo <> 'portal'
    ON CONFLICT (user_id, modulo) DO NOTHING;
  END IF;
END $um$;

CREATE OR REPLACE FUNCTION public.eh_admin_portal() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT lower(coalesce(auth.jwt() ->> 'email', '')) = 'liliane.hiramoto@grupoflorida.com.br'
      OR EXISTS (SELECT 1 FROM public.user_modules
                  WHERE user_id = auth.uid() AND modulo = 'portal' AND papel = 'admin');
$$;
REVOKE ALL ON FUNCTION public.eh_admin_portal() FROM public;
GRANT EXECUTE ON FUNCTION public.eh_admin_portal() TO authenticated;

CREATE OR REPLACE FUNCTION public.pode_gravar_modulo(m text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_modules
                  WHERE user_id = auth.uid() AND modulo = m AND papel IN ('editor', 'admin'))
      OR public.eh_admin_portal();
$$;

CREATE OR REPLACE FUNCTION public.trib_is_user() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT public.tem_modulo('tributos') OR public.eh_admin_portal();
$$;
CREATE OR REPLACE FUNCTION public.cnpj_is_user() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT public.tem_modulo('cnpj') OR public.eh_admin_portal();
$$;
CREATE OR REPLACE FUNCTION public.y570_is_user() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT public.tem_modulo('y570') OR public.eh_admin_portal();
$$;
CREATE OR REPLACE FUNCTION public.cpf_is_user() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT public.tem_modulo('cpf') OR public.eh_admin_portal();
$$;

COMMIT;

SELECT
  (SELECT count(*) FROM pg_proc WHERE proname = 'eh_admin_portal') AS funcao,
  (SELECT count(*) FROM public.user_modules WHERE modulo = 'portal' AND papel = 'admin') AS admins_do_portal,
  (SELECT count(DISTINCT user_id) FROM public.user_modules m
    WHERE papel = 'admin' AND modulo <> 'portal'
      AND NOT EXISTS (SELECT 1 FROM public.user_modules p WHERE p.user_id = m.user_id AND p.modulo = 'portal')) AS admin_de_modulo_sem_portal;

-- ==================== 0014_core_modulos_acessos.sql ====================
begin;

create schema if not exists core;
grant usage on schema core to authenticated, service_role;

create or replace function core.eh_admin_portal()
returns boolean language sql stable security definer set search_path = public, core as $$
  select public.eh_admin_portal();
$$;
revoke all on function core.eh_admin_portal() from public, anon;
grant execute on function core.eh_admin_portal() to authenticated, service_role;

create or replace function core.admin_do_modulo(m text)
returns boolean language sql stable security definer set search_path = public, core as $$
  select m <> 'portal' and exists (select 1 from public.user_modules
                                    where user_id = auth.uid() and modulo = m and papel = 'admin');
$$;
revoke all on function core.admin_do_modulo(text) from public, anon;
grant execute on function core.admin_do_modulo(text) to authenticated, service_role;

create table if not exists core.modulos (
  key        text primary key,                    -- = user_modules.modulo
  label      text not null,
  descricao  text not null default '',
  emoji      text not null default '',
  href       text,                                -- destino (interno ou URL)
  grupo      text not null default 'Configurações'
             check (grupo in ('Fiscal', 'Configurações')),
  status     text not null default 'ativo'
             check (status in ('ativo', 'externo', 'migracao', 'breve')),
  atalho_de  text,                                -- card que é atalho de outro módulo
  externo    boolean not null default false,
  oculto     boolean not null default false,      -- fora do Menu Principal
  sem_gate   boolean not null default false,      -- todo login vê (Cadastros)
  so_admin   boolean not null default false,      -- só admin do portal vê (Acessos)
  ordem      int     not null default 100,        -- ordem DENTRO do grupo
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

insert into core.modulos (key, label, descricao, emoji, href, grupo, status, sem_gate, so_admin, ordem) values
  ('tributos', 'Tributos', 'Tributos federais: DARFs pagos e em atraso, Situação Fiscal do e-CAC, certidões e parcelamentos.', '⚖️', '/tributos', 'Fiscal', 'ativo', false, false, 10),
  ('cnpj', 'Consulta CNPJ + Simples Nacional', 'Base cadastral pela Receita: cartão CNPJ, sócios, Simples Nacional, SIMEI e regime regular do IBS/CBS. Importa lista e exporta Excel.', '🏢', '/cnpj?brand=26272e', 'Fiscal', 'ativo', false, false, 20),
  ('y570', 'Y570 · ECF', 'Lê os PDFs de Fontes Pagadoras do e-CAC e gera o registro Y570 da ECF em Excel, com histórico por empresa.', '📄', '/y570?brand=26272e', 'Fiscal', 'ativo', false, false, 30),
  ('cpf', 'Consulta CPF', 'Situação cadastral do CPF na Receita (Serpro): nome, nome social, nascimento e situação. Consulta por CPF + data de nascimento.', '🪪', '/cpf', 'Fiscal', 'breve', false, false, 40),
  ('cadastros', 'Cadastros', 'Empresas do Grupo Xipp. Só empresa cadastrada aqui entra no Tributos e no Y570.', '🏢', '/cadastros', 'Configurações', 'ativo', true, false, 10),
  ('admin', 'Acessos', 'Quem entra no portal e o papel em cada módulo: pessoas, visão por módulo e perfis de acesso.', '🔐', '/acessos', 'Configurações', 'ativo', false, true, 20)
on conflict (key) do nothing;

create table if not exists core.acessos (
  user_id      uuid not null references auth.users(id) on delete cascade,
  modulo       text not null,                      -- inclui a linha 'portal'
  papel        text not null default 'viewer'
               check (papel in ('viewer', 'editor', 'admin')),
  admin_modulo boolean not null default false,     -- = papel admin num módulo de verdade
  criado_em    timestamptz not null default now(),
  criado_por   uuid,
  primary key (user_id, modulo)
);
create index if not exists acessos_modulo_idx on core.acessos (modulo);

insert into core.acessos (user_id, modulo, papel, admin_modulo)
select user_id, modulo, papel, (papel = 'admin' and modulo <> 'portal')
  from public.user_modules
on conflict (user_id, modulo) do update
  set papel = excluded.papel, admin_modulo = excluded.admin_modulo;

create or replace function core.espelhar_user_modules()
returns trigger language plpgsql security definer set search_path = public, core as $$
begin
  if tg_op = 'DELETE' then
    delete from core.acessos where user_id = old.user_id and modulo = old.modulo;
    return old;
  end if;
  if tg_op = 'UPDATE' and (old.user_id, old.modulo) is distinct from (new.user_id, new.modulo) then
    delete from core.acessos where user_id = old.user_id and modulo = old.modulo;
  end if;
  insert into core.acessos (user_id, modulo, papel, admin_modulo)
  values (new.user_id, new.modulo, new.papel, (new.papel = 'admin' and new.modulo <> 'portal'))
  on conflict (user_id, modulo) do update
    set papel = excluded.papel, admin_modulo = excluded.admin_modulo;
  return new;
end $$;
revoke all on function core.espelhar_user_modules() from public, anon, authenticated;
do $um$
begin
  if (select relkind from pg_class where oid = 'public.user_modules'::regclass) = 'r' then
    drop trigger if exists trg_espelhar_user_modules on public.user_modules;
    create trigger trg_espelhar_user_modules
      after insert or update or delete on public.user_modules
      for each row execute function core.espelhar_user_modules();
  end if;
end $um$;

alter table core.modulos enable row level security;
revoke all on core.modulos from anon, authenticated, public;
grant select, update on core.modulos to authenticated;
grant all on core.modulos to service_role;
drop policy if exists modulos_sel on core.modulos;
create policy modulos_sel on core.modulos for select to authenticated using (true);
drop policy if exists modulos_esc on core.modulos;
create policy modulos_esc on core.modulos for update to authenticated
  using (core.eh_admin_portal()) with check (core.eh_admin_portal());

alter table core.acessos enable row level security;
revoke all on core.acessos from anon, authenticated, public;
grant select on core.acessos to authenticated;
grant all on core.acessos to service_role;
drop policy if exists acessos_self on core.acessos;
create policy acessos_self on core.acessos for select to authenticated using (user_id = auth.uid());
drop policy if exists acessos_admin on core.acessos;
create policy acessos_admin on core.acessos for select to authenticated
  using (core.eh_admin_portal() or core.admin_do_modulo(modulo));

create or replace view public.modulos with (security_invoker = true) as
  select key, label, descricao, emoji, href, grupo, status, atalho_de,
         externo, oculto, sem_gate, so_admin, ordem, ativo
  from core.modulos;
create or replace view public.acessos with (security_invoker = true) as
  select user_id, modulo, papel, admin_modulo
  from core.acessos;
revoke all on public.modulos, public.acessos from anon, authenticated, public;
grant select on public.modulos, public.acessos to authenticated, service_role;

commit;

select (select count(*) from core.modulos) as cards_de_6,
       (select count(*) from core.acessos) = (select count(*) from public.user_modules) as acessos_iguais,
       (select count(*) from pg_trigger where tgname = 'trg_espelhar_user_modules') as gatilho_de_1,
       (select bool_and(coalesce(reloptions::text, '') like '%security_invoker=true%')
          from pg_class where oid in ('public.modulos'::regclass, 'public.acessos'::regclass)) as sem_furar_rls,
       has_table_privilege('authenticated', 'public.modulos', 'UPDATE') as view_gravavel;

-- ==================== 0015_core_acessos_dono_unico.sql ====================
begin;

do $$
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relname = 'user_modules' and c.relkind = 'r') then

    declare presos text;
    begin
      select string_agg(distinct coalesce(
               (select 'view ' || ev.ev_class::regclass::text from pg_rewrite ev where ev.oid = d.objid and d.classid = 'pg_rewrite'::regclass),
               (select 'função ' || pr.oid::regprocedure::text from pg_proc pr where pr.oid = d.objid and d.classid = 'pg_proc'::regclass)
             ), ', ')
        into presos
        from pg_depend d
       where d.refobjid = 'public.user_modules'::regclass
         and d.classid in ('pg_rewrite'::regclass, 'pg_proc'::regclass);
      if presos is not null then
        raise exception 'Etapa 5 parada, nada foi mexido: ainda há objetos presos a public.user_modules (%). Mande esta mensagem para o Claude.', presos;
      end if;
    end;

    create temp table _politicas_presas as
      select pp.schemaname, pp.tablename, pp.policyname, pp.permissive, pp.roles, pp.cmd, pp.qual, pp.with_check
        from pg_policy p
        join pg_class c on c.oid = p.polrelid
        join pg_namespace n on n.oid = c.relnamespace
        join pg_policies pp on pp.schemaname = n.nspname and pp.tablename = c.relname and pp.policyname = p.polname
       where p.polrelid <> 'public.user_modules'::regclass
         and exists (select 1 from pg_depend d
                      where d.classid = 'pg_policy'::regclass and d.objid = p.oid
                        and d.refobjid = 'public.user_modules'::regclass);
    declare r record;
    begin
      for r in select * from _politicas_presas loop
        execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
      end loop;
    end;

    insert into core.acessos (user_id, modulo, papel, admin_modulo)
    select um.user_id, um.modulo, um.papel, (um.papel = 'admin' and um.modulo <> 'portal')
      from public.user_modules um
    on conflict (user_id, modulo) do update
      set papel = excluded.papel, admin_modulo = excluded.admin_modulo;
    delete from core.acessos a
     where not exists (select 1 from public.user_modules um
                        where um.user_id = a.user_id and um.modulo = a.modulo);

    drop trigger if exists trg_espelhar_user_modules on public.user_modules;

    alter table public.user_modules set schema core;
    alter table core.user_modules rename to user_modules_ate_etapa5;
    revoke all on core.user_modules_ate_etapa5 from anon, authenticated, public;
    comment on table core.user_modules_ate_etapa5 is
      'A tabela de acessos até a 0015 (11/11/2026). Só histórico: a verdade é core.acessos.';
  end if;
end $$;

drop function if exists core.espelhar_user_modules();

create or replace view public.user_modules with (security_invoker = true) as
  select user_id, modulo, papel from core.acessos;
revoke all on public.user_modules from anon, authenticated, public;
grant select on public.user_modules to authenticated, service_role;
grant usage on schema core to service_role;
grant select, insert, update, delete on core.acessos to service_role;
comment on view public.user_modules is
  'Etapa 5: o nome de sempre sobre core.acessos, para as funções de RLS e as telas que leem user_modules. Gravar: conceder_modulo / revogar_modulo / marcar_admin_portal.';

create or replace function public.conceder_modulo(p_user_id uuid, p_modulo text, p_papel text)
returns void language plpgsql security definer set search_path = public, core as $$
begin
  if not public.eh_admin_portal() then
    raise exception 'Só o admin do portal concede acesso.' using errcode = '42501';
  end if;
  if p_modulo = 'portal' then
    raise exception 'O admin do portal se liga em marcar_admin_portal.' using errcode = '22023';
  end if;
  if p_papel not in ('viewer', 'editor', 'admin') then
    raise exception 'Papel desconhecido: %.', p_papel using errcode = '22023';
  end if;
  if not exists (select 1 from core.modulos where key = p_modulo) then
    raise exception 'Módulo desconhecido: %.', p_modulo using errcode = '22023';
  end if;
  insert into core.acessos (user_id, modulo, papel, admin_modulo, criado_por)
  values (p_user_id, p_modulo, p_papel, p_papel = 'admin', auth.uid())
  on conflict (user_id, modulo) do update
    set papel = excluded.papel, admin_modulo = excluded.admin_modulo;
end $$;

create or replace function public.revogar_modulo(p_user_id uuid, p_modulo text)
returns void language plpgsql security definer set search_path = public, core as $$
begin
  if not public.eh_admin_portal() then
    raise exception 'Só o admin do portal revoga acesso.' using errcode = '42501';
  end if;
  if p_modulo = 'portal' then
    raise exception 'O admin do portal se desliga em marcar_admin_portal.' using errcode = '22023';
  end if;
  delete from core.acessos where user_id = p_user_id and modulo = p_modulo;
end $$;

create or replace function public.marcar_admin_portal(p_user_id uuid, p_valor boolean)
returns void language plpgsql security definer set search_path = public, core as $$
begin
  if not public.eh_admin_portal() then
    raise exception 'Só o admin do portal muda o admin do portal.' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Ninguém muda o próprio admin do portal.' using errcode = '42501';
  end if;
  if p_valor then
    insert into core.acessos (user_id, modulo, papel, admin_modulo, criado_por)
    values (p_user_id, 'portal', 'admin', false, auth.uid())
    on conflict (user_id, modulo) do update set papel = 'admin', admin_modulo = false;
  else
    delete from core.acessos where user_id = p_user_id and modulo = 'portal';
  end if;
end $$;

do $$
declare r record;
begin
  if to_regclass('pg_temp._politicas_presas') is null then return; end if;  -- 2ª rodada: nada a recriar
  for r in select * from _politicas_presas loop
    execute format('create policy %I on %I.%I as %s for %s to %s%s%s',
      r.policyname, r.schemaname, r.tablename, r.permissive, r.cmd,
      (select string_agg(case when x = 'public' then 'public' else quote_ident(x) end, ', ') from unnest(r.roles) x),
      case when r.qual is not null then ' using (' || r.qual || ')' else '' end,
      case when r.with_check is not null then ' with check (' || r.with_check || ')' else '' end);
    raise notice 'Política recriada sobre a view nova: % em %.%', r.policyname, r.schemaname, r.tablename;
  end loop;
  drop table _politicas_presas;
end $$;

revoke all on function public.conceder_modulo(uuid, text, text), public.revogar_modulo(uuid, text),
  public.marcar_admin_portal(uuid, boolean) from public, anon;
grant execute on function public.conceder_modulo(uuid, text, text), public.revogar_modulo(uuid, text),
  public.marcar_admin_portal(uuid, boolean) to authenticated;

commit;

select (select case relkind when 'v' then 'view' else 'TABELA' end from pg_class
         where oid = 'public.user_modules'::regclass) as user_modules_agora,
       not exists (select 1 from core.user_modules_ate_etapa5 v
                    where not exists (select 1 from core.acessos a
                                       where a.user_id = v.user_id and a.modulo = v.modulo
                                         and a.papel = v.papel)) as nada_se_perdeu,
       (select count(*) from pg_trigger where tgname = 'trg_espelhar_user_modules') as espelho,
       (select bool_and(has_function_privilege('authenticated', f, 'EXECUTE'))
          from unnest(array['public.conceder_modulo(uuid,text,text)', 'public.revogar_modulo(uuid,text)',
                            'public.marcar_admin_portal(uuid,boolean)']) f) as funcoes_ligadas;
