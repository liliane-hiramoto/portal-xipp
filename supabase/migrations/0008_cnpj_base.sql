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
