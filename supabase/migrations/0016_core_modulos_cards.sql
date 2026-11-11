-- ============================================================================
-- 0016 — CATÁLOGO DE CARDS E ACESSOS NO BANCO, ETAPA 3: editar o card pela tela (11/11/2026)
--
-- A 0015 abriu `public.modulos` só para LEITURA. Agora Admin › Cards do menu
-- troca nome, descrição, ícone, faixa, ordem e "mostrar no menu" de um card — o
-- que antes pedia um PR (foi o caso do "Consulta CNPJ + Simples Nacional").
--
-- Só UPDATE nessas SEIS colunas, por dentro da view (`security_invoker`): quem
-- grava é quem está logado, e a RLS do catálogo (`modulos_esc`: só
-- `core.eh_admin_portal()`) decide. Para os outros o UPDATE volta com zero
-- linhas, sem erro — a rota confere. Chave, endereço, `sem_gate` e `so_admin`
-- NÃO se editam (mexem em quem entra onde); criar e apagar card também não.
--
-- Idempotente. Supabase › SQL Editor › New query › colar tudo › Run.
-- ============================================================================

revoke all on public.modulos from anon, authenticated, public;
grant select on public.modulos to authenticated, service_role;
grant update (label, descricao, emoji, grupo, ordem, oculto) on public.modulos to authenticated;

-- Conferência (rodar colada — uma consulta só). Esperado: true · false · false · false · false
select has_column_privilege('authenticated', 'public.modulos', 'label', 'UPDATE')    as edita_nome,
       has_column_privilege('authenticated', 'public.modulos', 'href', 'UPDATE')     as mexe_no_destino,
       has_column_privilege('authenticated', 'public.modulos', 'so_admin', 'UPDATE') as mexe_em_quem_ve,
       has_table_privilege('anon', 'public.modulos', 'UPDATE')                        as anonimo_edita,
       has_table_privilege('authenticated', 'public.modulos', 'INSERT')               as cria_card;
