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
