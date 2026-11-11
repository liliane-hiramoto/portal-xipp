-- ============================================================================
-- 0015 — CATÁLOGO DE CARDS E ACESSOS NO BANCO, ETAPA 5: core.acessos vira o dono único
-- (11/11/2026 — o desenho da 0030 do RQ, da Inexx, da 0020 do 3Clicks e da
-- 0016 da Affix, com as lições de lá)
--
-- Até aqui as duas tabelas conviviam (a 0014 criou core.acessos como cópia de
-- public.user_modules, por gatilho). Agora a verdade é UMA:
--
--   1. Reconcilia as duas (deviam estar iguais; se não, user_modules vence).
--   2. Guarda a tabela velha em `core.user_modules_ate_etapa5` (não apaga).
--   3. No lugar dela, uma VIEW `public.user_modules` sobre `core.acessos`. As
--      funções de RLS (tem_modulo, pode_gravar_modulo, eh_admin_portal,
--      trib_*, cnpj_*, y570_*, cpf_*…) leem `public.user_modules` pelo NOME, a
--      cada chamada — passam a ler core.acessos sem ser reescritas.
--   4. Gravar passa por TRÊS funções, as mesmas em todo portal (a tela única
--      de Acessos do acesso-core chama por `acessosFuncoes`, com a SESSÃO):
--        · conceder_modulo(p_user_id, p_modulo, p_papel)
--        · revogar_modulo(p_user_id, p_modulo)
--        · marcar_admin_portal(p_user_id, p_valor) — a linha 'portal'
--      Todas conferem a régua POR DENTRO: aqui só o admin do PORTAL concede
--      (public.eh_admin_portal(): a super-admin ou a linha 'portal' — decisão
--      dela, admin do portal ≠ admin de módulo), e ninguém muda o próprio admin
--      do portal. conceder/revogar não chegam à 'portal'.
--
-- ⚠️ Depois deste SQL, NÃO rodar de novo a 0001 (cria a tabela user_modules):
-- ela para com erro, sem estragar nada. Portal novo: o SETUP-COMPLETO, na ordem.
-- Idempotente: rodar de novo não refaz os passos 1 e 2 (a tabela já é view).
-- Roda numa transação só (begin … commit): falhou um passo, nada muda.
-- Supabase › SQL Editor › New query › colar tudo › Run. (Rode DEPOIS da 0014.)
-- ============================================================================

-- TUDO OU NADA: se qualquer passo falhar (inclusive recriar uma política), o
-- banco volta exatamente como estava.
begin;

do $$
begin
  -- Só na primeira vez: `public.user_modules` ainda é TABELA.
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relname = 'user_modules' and c.relkind = 'r') then

    -- 0. O QUE ESTÁ PRESO À TABELA pelo identificador interno (e não pelo
    --    nome) seguiria a tabela velha em silêncio depois da troca.
    --    · POLÍTICA de outra tabela (na Inexx foi a fin_contas_pagar_cartao_insere, criada
    --      fora do repositório de lá): é anotada aqui com o texto exato, apagada, e
    --      RECRIADA lá embaixo, depois da view — o mesmo texto, que pelo nome
    --      passa a ler a view nova. Mesma regra, outra fonte.
    --    · VIEW ou função "begin atomic": não dá para recriar no automático com
    --      segurança. Para tudo e diz quem é — nada é mexido.
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

    -- 1. Reconciliar: user_modules vence (era quem valia).
    insert into core.acessos (user_id, modulo, papel, admin_modulo)
    select um.user_id, um.modulo, um.papel, (um.papel = 'admin' and um.modulo <> 'portal')
      from public.user_modules um
    on conflict (user_id, modulo) do update
      set papel = excluded.papel, admin_modulo = excluded.admin_modulo;
    delete from core.acessos a
     where not exists (select 1 from public.user_modules um
                        where um.user_id = a.user_id and um.modulo = a.modulo);

    -- O espelho não tem mais o que espelhar.
    drop trigger if exists trg_espelhar_user_modules on public.user_modules;

    -- 2. Guardar a tabela velha (com as políticas dela) fora do caminho.
    alter table public.user_modules set schema core;
    alter table core.user_modules rename to user_modules_ate_etapa5;
    revoke all on core.user_modules_ate_etapa5 from anon, authenticated, public;
    comment on table core.user_modules_ate_etapa5 is
      'A tabela de acessos até a 0015 (11/11/2026). Só histórico: a verdade é core.acessos.';
  end if;
end $$;

drop function if exists core.espelhar_user_modules();

-- 3. O nome antigo, agora lendo a tabela nova. security_invoker: a RLS de
--    core.acessos vale (cada um vê os seus; o admin do portal vê todos; o de
--    módulo, os do módulo). A tela de Acessos lê pela service role.
create or replace view public.user_modules with (security_invoker = true) as
  select user_id, modulo, papel from core.acessos;
revoke all on public.user_modules from anon, authenticated, public;
grant select on public.user_modules to authenticated, service_role;
grant usage on schema core to service_role;
grant select, insert, update, delete on core.acessos to service_role;
comment on view public.user_modules is
  'Etapa 5: o nome de sempre sobre core.acessos, para as funções de RLS e as telas que leem user_modules. Gravar: conceder_modulo / revogar_modulo / marcar_admin_portal.';

-- 4. Gravar. A régua é conferida AQUI DENTRO: função SECURITY DEFINER que
--    escreve sem conferir é porta aberta.
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

-- Conferência (rodar colada — uma consulta só). Esperado: view · true · 0 · true
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
