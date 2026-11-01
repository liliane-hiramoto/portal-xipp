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
