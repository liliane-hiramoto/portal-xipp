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
