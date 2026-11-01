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
