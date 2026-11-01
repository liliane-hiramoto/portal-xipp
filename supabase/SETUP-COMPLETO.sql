-- SETUP COMPLETO do portal fiscal — GERADO por scripts/montar-setup.mjs, não edite.
-- Cole tudo no Supabase › SQL Editor do portal novo e clique em Run (uma vez).
-- Junta, na ordem: 0001_portal.sql, 0002_cadastro.sql, 0004_viewer_so_le.sql, 0005_senha_provisoria.sql, 0007_modulo_tributos.sql, 0008_cnpj_base.sql, 0009_modulo_y570.sql, 0010_y570_pdfs_e_cadastro.sql, 0011_consulta_cpf.sql.
-- A última tabela que aparece é a conferência do Consulta CPF (true · 2 · 2).

-- ==================== 0001_portal.sql ====================
-- Portal (modelo Conta Azul) — base multi-módulo (hub) no Supabase dedicado.
-- Cada área do portal = um "módulo": 'financeiro', 'tributos', 'expense'.
--
-- Estrutura (tudo em public):
--   profiles       — 1 linha por usuário (auto-criada no signup)
--   user_modules   — quem acessa qual módulo e com qual papel (viewer/editor/admin)
--   module_state   — estado/edições de cada módulo (modulo,key → jsonb), RLS por módulo
--
-- Idempotente: rodar no Supabase → SQL Editor → New query → colar tudo → Run.

-- ---------- perfis ----------
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

-- ---------- acesso por módulo ----------
create table if not exists public.user_modules (
  user_id uuid not null references auth.users(id) on delete cascade,
  modulo  text not null,                  -- 'financeiro' | 'tributos' | 'expense'
  papel   text not null default 'editor', -- viewer | editor | admin
  primary key (user_id, modulo)
);
alter table public.user_modules enable row level security;
drop policy if exists user_modules_self on public.user_modules;
create policy user_modules_self on public.user_modules for select to authenticated using (user_id = auth.uid());

create or replace function public.tem_modulo(m text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_modules where user_id = auth.uid() and modulo = m);
$$;

-- ---------- estado dos módulos (edições compartilhadas) ----------
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
-- Cadastro Central de Grupo/Empresa do Portal.
-- Base ÚNICA consumida por todos os módulos (Financeiro, Tributos, Expense).
-- Relacional Grupo -> Empresa. Leitura: qualquer autenticado. Escrita: só via
-- server actions com service_role (gate de admin no app).
--
-- Idempotente: rodar no Supabase → SQL Editor → New query → colar tudo → Run.

-- ---------- grupo econômico ----------
create table if not exists public.grupos (
  id        bigint generated always as identity primary key,
  nome      text not null unique,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ---------- empresa (1 linha por CNPJ) ----------
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

-- ---------- RLS ----------
alter table public.grupos   enable row level security;
alter table public.empresas enable row level security;
drop policy if exists grupos_sel   on public.grupos;
drop policy if exists empresas_sel on public.empresas;
create policy grupos_sel   on public.grupos   for select to authenticated using (true);
create policy empresas_sel on public.empresas for select to authenticated using (true);

-- =====================================================================
-- SEED — grupo + empresa DESTE portal. O modelo não traz empresa nenhuma:
-- cada portal preenche em supabase/migrations/0006_empresa.sql (ver
-- NOVO-PORTAL.md), para este arquivo continuar igual em todos.
-- =====================================================================

-- ==================== 0004_viewer_so_le.sql ====================
-- ============================================================================
-- 0004 — Quem é "viewer" só LÊ o estado do Financeiro.
--
-- O app grava as edições (reclassificação, Estrutura FC, pendências, de-para…)
-- em module_state DIRETO do navegador (src/lib/store.ts). As políticas de
-- gravação da 0001 pediam só tem_modulo(m) — ter o módulo, com qualquer papel.
-- A tela esconde os botões de quem é viewer, mas o navegador fala com o
-- Supabase direto, e o viewer gravava pela API o que a tela não deixava.
--
-- Mesma régua das rotas de /api (exigeEditor, src/lib/papel.ts): papel editor
-- ou admin no módulo, ou admin (papel admin em qualquer módulo, como ehAdmin).
-- A LEITURA não muda.
--
-- Idempotente.
-- ============================================================================

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

-- CONFERÊNCIA (uma consulta só — o SQL Editor mostra apenas a última).
-- Esperado: as 2 políticas "só editor/admin" e a lista de quem é viewer (essas
-- pessoas continuam lendo e deixam de gravar). Quem NÃO tem linha nenhuma no
-- financeiro aparece também: a partir deste PR essa pessoa não entra mais no
-- Financeiro (antes valia como editor).
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
-- 0005 — A marca "trocar a senha no 1º acesso" muda de lugar.
--
-- Morava no user_metadata (must_change_password), que o PRÓPRIO usuário grava
-- pela API: quem entrasse com a senha padrão podia apagar a marca e seguir. Agora
-- mora no app_metadata (senha_provisoria), que só a service role grava, e o
-- proxy a cobra em toda rota.
--
-- Esta migração COPIA a marca das contas que ainda não trocaram a senha. Sem
-- ela, essas contas deixariam de ser cobradas quando o código novo entrar.
-- Por isso roda ANTES do merge. Rodar duas vezes não muda nada.

update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"senha_provisoria": true}'::jsonb
 where raw_user_meta_data ->> 'must_change_password' = 'true';

-- Conferência (colada): quem ainda tem de trocar a senha, pelas duas marcas.
--   select email,
--          raw_app_meta_data ->> 'senha_provisoria'      as marca_nova,
--          raw_user_meta_data ->> 'must_change_password' as marca_antiga
--     from auth.users order by email;

-- ==================== 0007_modulo_tributos.sql ====================
-- 0007 — Módulo TRIBUTOS neste portal (30/10/2026, pedido dela — replicado
-- do Portal Flórida, 0204)
--
-- O módulo Tributos (Controle de Tributos Federais: DARFs, Situação Fiscal,
-- certidões, parcelamentos, documentos) é o canônico `tributos-web`. Cada portal
-- tem a SUA instância na Vercel (`<sigla>-tributos-web`, basePath /tributos),
-- servida pelo portal em /tributos (Multi-Zones, rewrite no next.config.ts) e
-- usando ESTE banco. Ver NOVO-PORTAL.md.
--
-- O que esta migração faz:
--   1. trib_is_user()/trib_is_admin() na régua DESTE portal: `user_modules`
--      (tem_modulo / pode_gravar_modulo, 0001 e 0004) + o super-admin. Todas as
--      RLS do módulo passam por essas duas funções, e a tela da instância
--      (src/app/page.tsx de lá) confere o mesmo `user_modules`.
--   2. as tabelas trib_* do canônico (0001, 0003–0006, 0009, 0010 de lá), juntas;
--   3. os buckets `darf-pdfs` e `docs-fiscais`.
--
-- ⚠️ trib_is_admin() = quem pode GRAVAR (importar PDF, limpar, enviar certidão):
-- papel admin ou editor no módulo `tributos`, ou admin do portal (papel admin
-- em algum módulo, como ehAdmin()), ou o super-admin. Leitura (viewer) só lê —
-- "tela que só esconde continua gravando" vale no banco.
-- ⚠️ O card "Tributos" não é linha de tabela aqui: mora em
-- src/components/PortalHub.tsx, e o papel é dado no Admin de usuários.
-- ⚠️ A ferramenta Y570 (menu do Tributos) é app sem login próprio: o proxy do
-- portal só a deixa abrir para quem tem o módulo `tributos`
-- (src/lib/supabase/middleware.ts).
--
-- Pode ser aplicada antes do código. Idempotente.

BEGIN;

-- ---------- 1. quem lê e quem grava ----------
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

-- ---------- 2. DARFs ----------
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
-- idempotência do import recorrente (mesmo documento + código + valores)
CREATE UNIQUE INDEX IF NOT EXISTS trib_darfs_uk
  ON public.trib_darfs (numero_documento, codigo, principal, multa, juros, total);

ALTER TABLE public.trib_darfs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trib read darfs" ON public.trib_darfs;
DROP POLICY IF EXISTS "trib admin write darfs" ON public.trib_darfs;
CREATE POLICY "trib read darfs" ON public.trib_darfs FOR SELECT USING (public.trib_is_user());
CREATE POLICY "trib admin write darfs" ON public.trib_darfs
  FOR ALL USING (public.trib_is_admin()) WITH CHECK (public.trib_is_admin());

-- ---------- 4. Situação Fiscal (e-CAC), snapshots ----------
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

-- ---------- 5. Certidões (CNDT, CND FGTS), snapshots ----------
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

-- ---------- 6. Duplicidades de DARF: anotações ----------
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
-- ⚠️ No canônico qualquer usuário do módulo anota; aqui segue a régua da
-- Flórida ("tela que só esconde continua gravando"): só quem grava anota.
CREATE POLICY "trib write dup notes" ON public.trib_darf_dup_notes
  FOR ALL USING (public.trib_is_admin()) WITH CHECK (public.trib_is_admin());

-- ---------- 7. Parcelamentos ----------
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

-- ---------- 8. Documentos (PDFs originais) ----------
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

-- ---------- 9. Storage: PDFs de DARF e documentos fiscais (privados) ----------
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

-- ---------- conferência (roda colada, uma consulta só) ----------
SELECT
  (SELECT count(*) FROM pg_proc WHERE proname IN ('trib_is_user', 'trib_is_admin')) AS funcoes_de_2,
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN
      ('trib_darfs','trib_fiscal_snapshots','trib_certidoes_snapshots','trib_darf_dup_notes','trib_parcelamentos','trib_documentos')) AS tabelas_de_6,
  (SELECT count(*) FROM storage.buckets WHERE id IN ('darf-pdfs','docs-fiscais')) AS buckets_de_2,
  (SELECT count(*) FROM pg_policies WHERE tablename LIKE 'trib\_%') AS politicas_trib;

-- ==================== 0008_cnpj_base.sql ====================
-- 0008 — Consulta CNPJ e SN: módulo próprio e base no banco deste portal
-- (30/10/2026, pedido dela — replicado do Portal Flórida, 0207/0208)
--
-- A ferramenta canônica `cnpj-base-web` (servida em /cnpj pelo rewrite do
-- next.config.ts) guardava a lista de CNPJs só no navegador: trocou de
-- computador ou limpou o histórico, a base sumia. Decisão dela: cada portal
-- guarda a SUA base no SEU banco. A ferramenta chama `/api/cnpj-base` no mesmo
-- endereço do portal (src/app/(portal)/api/cnpj-base/route.ts), com o login de
-- quem está usando, e esta tabela segue a régua do módulo `cnpj`:
--   ler    = cnpj_is_user()  (qualquer papel no módulo `cnpj`, admin do portal
--                             ou o super-admin);
--   gravar = cnpj_is_admin() (papel admin/editor no `cnpj`, admin do portal
--                             ou o super-admin). Leitura (viewer) só lê.
--
-- `cnpj` é módulo PRÓPRIO, fora do Tributos: base cadastral é dado público da
-- Receita (cartão CNPJ, sócios, Simples, SIMEI, IBS/CBS); o Tributos guarda
-- dado fiscal sigiloso. O card e o papel são dados no Admin de usuários.
--
-- Uma linha por CNPJ. `registro` é o resultado da consulta (o "cartão CNPJ"
-- achatado da ferramenta); nulo enquanto o CNPJ está pendente de consulta.
-- "Limpar base" na ferramenta apaga a base do PORTAL, para todos.
--
-- Pode ser aplicada antes ou depois do código: sem a tabela, a rota responde
-- "indisponível" e a ferramenta continua salvando no navegador. Idempotente.

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

-- ---------- conferência (roda colada, uma consulta só) ----------
SELECT
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'trib_cnpj_base') AS tabela_existe,
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.trib_cnpj_base'::regclass) AS rls_ligada,
  (SELECT count(*) FROM pg_policies WHERE tablename = 'trib_cnpj_base' AND policyname LIKE 'cnpj %') AS politicas_de_2,
  (SELECT count(*) FROM pg_proc WHERE proname IN ('cnpj_is_user', 'cnpj_is_admin')) AS funcoes_de_2,
  (SELECT count(*) FROM public.trib_cnpj_base) AS cnpjs_na_base;

-- ==================== 0009_modulo_y570.sql ====================
-- 0009 — Y570 vira módulo próprio, com histórico no banco deste portal
-- (30/10/2026, pedido dela — replicado do Portal Flórida, 0212)
--
-- A ferramenta Y570 (y570-fonte-pagadora, servida em /y570) lê os PDFs de
-- Fontes Pagadoras do e-CAC e gera o registro Y570 da ECF em Excel. Estava no
-- menu do Tributos (módulo `tributos`) e não guardava nada. Pedido dela: card
-- próprio (como a Consulta CNPJ e SN, 0008) e o resultado salvo no banco de
-- cada portal.
--
-- A ferramenta chama `/api/y570-base` no MESMO endereço do portal
-- (src/app/(portal)/api/y570-base/route.ts), com o login de quem usa. Grava UMA
-- linha por empresa (CNPJ raiz) por processamento, com as linhas lidas (fonte
-- pagadora, código, rendimento, retido) — os PDFs não são guardados. Pelo
-- histórico, a ferramenta gera o Excel de novo a partir dessas linhas.
--
-- Régua do módulo `y570` em user_modules (como o Tributos, 0007):
--   ler    = y570_is_user()  (qualquer papel, admin do portal ou o super-admin);
--   gravar = y570_is_admin() (papel admin/editor, admin do portal ou o super-admin).
-- ⚠️ É dado fiscal (IR retido na fonte). Sem UPDATE pela tela; apagar, só
-- admin/editor. O card e o papel são dados no Admin de usuários; o proxy
-- tranca /y570 pelo módulo `y570` (quem tinha só o Tributos perde o Y570 até
-- ganhar o módulo novo — é o objetivo).
--
-- Pode ser aplicada antes ou depois do código. Idempotente.

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

-- ---------- conferência (roda colada, uma consulta só) ----------
SELECT
  (SELECT count(*) FROM pg_proc WHERE proname IN ('y570_is_user', 'y570_is_admin')) AS funcoes_de_2,
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.y570_processamentos'::regclass) AS rls_ligada,
  (SELECT count(*) FROM pg_policies WHERE tablename = 'y570_processamentos') AS politicas_de_3,
  (SELECT count(*) FROM public.y570_processamentos) AS processamentos;

-- ==================== 0010_y570_pdfs_e_cadastro.sql ====================
-- 0010 — Y570: guarda os PDFs e só aceita empresa cadastrada (30/10/2026, pedido dela)
--
-- Roda DEPOIS do 0009_modulo_y570.sql. Quatro pedidos sobre o card Y570:
--   1. "Guardar o pdf do y570 no portal" → bucket PRIVADO `y570-pdfs`, um
--      arquivo por PDF importado, em `<raiz>/<id do processamento>/<n>.pdf`
--      (n = posição em `arquivos`). Baixa-se pelo histórico da ferramenta.
--   2. "Excluir doc importado (empresa errada)" → DELETE no bucket também, para
--      os PDFs saírem junto com o processamento.
--   3. "Só empresas cadastradas no portal; não permitir subir PDF de outras" →
--      `y570_raiz_cadastrada(raiz)` entra na política de INSERT da tabela E do
--      bucket. A ferramenta avisa antes, mas quem barra é o banco.
--   4. "Uma aba por empresa" → `y570_empresas_cadastradas()` dá o nome de cada
--      raiz cadastrada.
--
-- "Cadastrada" = CNPJ em `public.empresas` (Cadastros › Empresas), pela RAIZ (8
-- primeiros dígitos): matriz e filiais juntas, como a ferramenta agrupa.
-- Mesmo desenho da 0213 do Portal Flórida.
--
-- ⚠️ O código pode entrar antes deste SQL: sem as funções, a rota não filtra e
-- avisa que os PDFs não foram guardados.

begin;

create or replace function public.y570_raiz_cadastrada(p_raiz text) returns boolean
  language sql stable security definer set search_path = public as $$
  select p_raiz ~ '^[0-9]{8}$' and exists (
    select 1 from public.empresas
     where left(regexp_replace(coalesce(cnpj, ''), '\D', '', 'g'), 8) = p_raiz
       and length(regexp_replace(coalesce(cnpj, ''), '\D', '', 'g')) = 14);
$$;

-- Lista para a ferramenta: só quem tem o módulo enxerga (devolve vazio aos demais).
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

-- Tabela: gravar exige papel E empresa cadastrada.
-- ⚠️ O nome é o da 0009 ("y570 insert", com espaço). Política com outro nome
-- ficaria valendo JUNTO com a antiga (políticas se somam por OU), e a trava do
-- cadastro não barraria nada — o y570_insert da primeira versão deste arquivo
-- caía nisso, e o teste (supabase/testes/tributos.sh) pegou.
drop policy if exists y570_insert on public.y570_processamentos;
drop policy if exists "y570 insert" on public.y570_processamentos;
create policy "y570 insert" on public.y570_processamentos for insert to authenticated
  with check (public.y570_is_admin() and public.y570_raiz_cadastrada(raiz));

-- Bucket privado dos PDFs (até 4 MB cada, só PDF).
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

-- ---------- conferência (roda colada, uma consulta só) ----------
select
  (select count(*) from storage.buckets where id = 'y570-pdfs' and not public) as bucket_privado,
  (select count(*) from pg_policies where schemaname = 'storage' and policyname like 'y570_pdfs%') as politicas_pdf_de_3,
  (select count(*) from pg_policies where tablename = 'y570_processamentos'
     and policyname = 'y570 insert' and with_check like '%y570_raiz_cadastrada%') as insert_confere_cadastro,
  (select count(distinct left(regexp_replace(cnpj, '\D', '', 'g'), 8)) from public.empresas
     where length(regexp_replace(coalesce(cnpj, ''), '\D', '', 'g')) = 14) as raizes_cadastradas;

-- ==================== 0011_consulta_cpf.sql ====================
-- 0011 — Consulta CPF (Serpro), card próprio (réplica da 0211 do Portal Flórida)
--
-- A consulta é CPF + DATA DE NASCIMENTO (Consulta CPF v3 do Serpro) e devolve
-- nome, nome social, nascimento, situação cadastral e datas de inscrição e
-- atualização. NÃO devolve endereço — nenhum serviço do Serpro entrega o
-- endereço da pessoa física.
--
-- Quem chama o Serpro é o SERVIDOR (src/app/(portal)/api/cpf/route.ts), com as
-- chaves do contrato nas variáveis da Vercel — nunca o navegador. Cada consulta
-- é COBRADA (respostas 200, 206 e 404), por isso consultar exige papel
-- editor/admin no módulo `cpf`; viewer só vê o histórico.
--
-- Régua do módulo `cpf` em user_modules (como o Y570, 0009):
--   ler    = cpf_is_user()  (qualquer papel, admin do portal ou o super-admin);
--   gravar = cpf_is_admin() (papel editor/admin, admin do portal ou o super-admin).
-- ⚠️ Dado pessoal (LGPD). Só INSERT: o histórico não se edita nem se apaga.
--
-- Pode ser aplicada antes ou depois do código. Idempotente.

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

-- ---------- conferência (roda colada, uma consulta só) ----------
SELECT
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.cpf_consultas'::regclass) AS rls_ligada,
  (SELECT count(*) FROM pg_policies WHERE tablename = 'cpf_consultas') AS politicas_de_2,
  (SELECT count(*) FROM pg_proc WHERE proname IN ('cpf_is_user', 'cpf_is_admin')) AS funcoes_de_2;
