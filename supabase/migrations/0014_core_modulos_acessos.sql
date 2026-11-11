-- ============================================================================
-- 0014 — CATÁLOGO DE CARDS E ACESSOS NO BANCO, ETAPAS 1 e 2 (11/11/2026)
--
-- Pedido dela: os portais com a MESMA estrutura de cards e acessos (a do RQ;
-- piloto na Inexx; já no Flórida, no 3Clicks, na Affix e no Benevix). Aqui a lista de
-- cards mora só no código (`MODULOS`, src/lib/modulos.ts) e trocar o nome de um
-- card pede PR. Nos portais fiscais as duas primeiras etapas vêm JUNTAS (um SQL
-- só) — nada muda na tela, só a origem do que ela mostra:
--
--   Etapa 1 · core.modulos — os cards do menu, com a semente de hoje (6);
--             core.acessos — cópia de public.user_modules, mantida igual por
--             um GATILHO enquanto as duas convivem.
--   Etapa 2 · as views public.modulos e public.acessos (o PostgREST só
--             enxerga o public): a home e o proxy passam a ler por elas, com a
--             lista do código e o user_modules de reserva.
--
-- ⚠️ A régua de admin é a da 0013 (decisão dela, 10/11/2026: admin do portal ≠
-- admin de módulo): core.eh_admin_portal() chama public.eh_admin_portal() — a
-- super-admin pelo e-mail ou a linha user_modules(modulo='portal',
-- papel='admin'). A "★" (admin_modulo) é DERIVADA do papel admin num módulo de
-- verdade, não decidida à parte. A linha 'portal' é copiada (é um acesso, não
-- um card).
-- ⚠️ Toda tabela/view nova no public nasce aberta para anon e authenticated
-- (default privileges do Supabase): o `revoke all` inclui o authenticated.
--
-- Idempotente. Supabase › SQL Editor › New query › colar tudo › Run.
-- (Rode DEPOIS da 0013.) O código pode ir antes: sem as views, a tela segue igual.
-- ============================================================================

begin;

create schema if not exists core;
grant usage on schema core to authenticated, service_role;

-- A régua de admin do portal, a MESMA da 0013 e do ehAdmin() do código.
create or replace function core.eh_admin_portal()
returns boolean language sql stable security definer set search_path = public, core as $$
  select public.eh_admin_portal();
$$;
revoke all on function core.eh_admin_portal() from public, anon;
grant execute on function core.eh_admin_portal() to authenticated, service_role;

-- Admin DAQUELE módulo (papel admin nele) — lê os acessos do módulo.
create or replace function core.admin_do_modulo(m text)
returns boolean language sql stable security definer set search_path = public, core as $$
  select m <> 'portal' and exists (select 1 from public.user_modules
                                    where user_id = auth.uid() and modulo = m and papel = 'admin');
$$;
revoke all on function core.admin_do_modulo(text) from public, anon;
grant execute on function core.admin_do_modulo(text) to authenticated, service_role;

-- ---------- Etapa 1: os cards ----------
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

-- ---------- Etapa 1: os acessos (cópia) ----------
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

-- O espelho: conceder, trocar e tirar em user_modules chega em core.acessos.
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
-- (Só enquanto user_modules é tabela: depois da Etapa 5 não há o que espelhar.)
do $um$
begin
  if (select relkind from pg_class where oid = 'public.user_modules'::regclass) = 'r' then
    drop trigger if exists trg_espelhar_user_modules on public.user_modules;
    create trigger trg_espelhar_user_modules
      after insert or update or delete on public.user_modules
      for each row execute function core.espelhar_user_modules();
  end if;
end $um$;

-- RLS: todo login lê os cards; só admin do portal altera. Cada um vê os SEUS
-- acessos; o admin do portal vê todos, e o de módulo, os do módulo dele.
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

-- ---------- Etapa 2: a porta pela API (só leitura, sem furar a RLS) ----------
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

-- Conferência (rodar colada — uma consulta só). Esperado: 6 · true · 1 · true · false
select (select count(*) from core.modulos) as cards_de_6,
       (select count(*) from core.acessos) = (select count(*) from public.user_modules) as acessos_iguais,
       (select count(*) from pg_trigger where tgname = 'trg_espelhar_user_modules') as gatilho_de_1,
       (select bool_and(coalesce(reloptions::text, '') like '%security_invoker=true%')
          from pg_class where oid in ('public.modulos'::regclass, 'public.acessos'::regclass)) as sem_furar_rls,
       has_table_privilege('authenticated', 'public.modulos', 'UPDATE') as view_gravavel;
