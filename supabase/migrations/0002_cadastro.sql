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
