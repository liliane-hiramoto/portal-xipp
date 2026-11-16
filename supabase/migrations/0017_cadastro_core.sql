-- ============================================================================
-- 0017 — Cadastro de empresas: só quem tem acesso ao portal lê, e o Cartão
-- CNPJ e o QSA da Receita (16/11/2026, item 11 do comparativo dos portais —
-- cadastro-core).
--
-- 1. LEITURA FECHADA. A 0002 abriu `empresas` e `grupos` a QUALQUER conta
--    logada (`using (true)`). Estar logado pode ser só criar uma conta: quem
--    protege o dado é a RLS. Agora lê quem tem ALGUM módulo (uma linha em
--    `user_modules`) ou é admin do portal (`eh_admin_portal()`, 0013) — a
--    mesma régua do 3Clicks, da WR e da Affix. O Tributos e o Y570 leem com a
--    sessão de quem tem o módulo deles, então continuam lendo.
-- 2. RECEITA. A tela consulta o CNPJ no navegador e o servidor grava o Cartão
--    CNPJ (`cadastro`) e os sócios (`qsa`), depois de conferir que a resposta é
--    do CNPJ da empresa.
--
-- Idempotente. O código pode ir antes: sem ela, a empresa é salva sem o
-- Cartão CNPJ e a lista sai sem a coluna dos sócios.
-- ============================================================================

create or replace function public.tem_algum_acesso()
returns boolean language sql stable security definer set search_path = public as $$
  select public.eh_admin_portal()
      or exists (select 1 from public.user_modules where user_id = auth.uid());
$$;
revoke all on function public.tem_algum_acesso() from public, anon;
grant execute on function public.tem_algum_acesso() to authenticated;

drop policy if exists grupos_sel   on public.grupos;
drop policy if exists empresas_sel on public.empresas;
create policy grupos_sel   on public.grupos   for select to authenticated using (public.tem_algum_acesso());
create policy empresas_sel on public.empresas for select to authenticated using (public.tem_algum_acesso());

alter table public.empresas add column if not exists cadastro jsonb;
alter table public.empresas add column if not exists qsa jsonb;
alter table public.empresas add column if not exists receita_atualizado_em timestamptz;

-- Conferência — esperado: abertas = 0 · receita = true
select (select count(*) from pg_policies
         where schemaname = 'public' and tablename in ('empresas', 'grupos') and qual = 'true') as abertas,
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'empresas' and column_name = 'qsa') as receita;
