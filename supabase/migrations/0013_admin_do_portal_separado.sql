-- 0013 — Admin do PORTAL separado do admin de MÓDULO (11/11/2026)
--
-- Decisão dela (10/11/2026, item 9 do comparativo — "Separar"): até aqui,
-- papel 'admin' em QUALQUER módulo valia como admin do portal inteiro — criar
-- contas, dar acesso a tudo, ler e gravar em todos os módulos. Bastava dar
-- "admin" no Tributos (ou aplicar um perfil que tivesse "admin") para promover
-- a pessoa a dona do portal, sem querer.
--
-- Daqui em diante:
--   • admin do PORTAL = o e-mail da super-admin OU uma linha explícita em
--     user_modules com modulo = 'portal' e papel = 'admin' (a tela Acessos
--     liga e desliga; nenhum perfil chega a ela — o CHECK da 0012 não aceita
--     'portal');
--   • papel 'admin' num módulo = admin SÓ daquele módulo (lê e grava nele).
--
-- Ninguém perde nada agora: quem HOJE tem 'admin' em algum módulo era admin
-- do portal, e ganha a linha 'portal' (passo 1). A diferença vale para quem
-- receber 'admin' daqui em diante.
--
-- Rodar ANTES do código (o código passa a ler a linha 'portal'). Idempotente.

BEGIN;

-- ---------- 1. quem já era admin do portal continua sendo ----------
-- (Só enquanto user_modules é tabela: depois da Etapa 5 ela é view, e este
-- passo já foi feito.)
DO $um$
BEGIN
  IF (SELECT relkind FROM pg_class WHERE oid = 'public.user_modules'::regclass) = 'r' THEN
    INSERT INTO public.user_modules (user_id, modulo, papel)
    SELECT DISTINCT user_id, 'portal', 'admin'
      FROM public.user_modules
     WHERE papel = 'admin' AND modulo <> 'portal'
    ON CONFLICT (user_id, modulo) DO NOTHING;
  END IF;
END $um$;

-- ---------- 2. a régua do admin do portal ----------
CREATE OR REPLACE FUNCTION public.eh_admin_portal() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT lower(coalesce(auth.jwt() ->> 'email', '')) = 'liliane.hiramoto@grupoflorida.com.br'
      OR EXISTS (SELECT 1 FROM public.user_modules
                  WHERE user_id = auth.uid() AND modulo = 'portal' AND papel = 'admin');
$$;
REVOKE ALL ON FUNCTION public.eh_admin_portal() FROM public;
GRANT EXECUTE ON FUNCTION public.eh_admin_portal() TO authenticated;

-- ---------- 3. gravar: editor/admin NO módulo, ou admin do portal ----------
CREATE OR REPLACE FUNCTION public.pode_gravar_modulo(m text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_modules
                  WHERE user_id = auth.uid() AND modulo = m AND papel IN ('editor', 'admin'))
      OR public.eh_admin_portal();
$$;

-- ---------- 4. ler cada módulo: o módulo, ou admin do portal ----------
CREATE OR REPLACE FUNCTION public.trib_is_user() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT public.tem_modulo('tributos') OR public.eh_admin_portal();
$$;
CREATE OR REPLACE FUNCTION public.cnpj_is_user() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT public.tem_modulo('cnpj') OR public.eh_admin_portal();
$$;
CREATE OR REPLACE FUNCTION public.y570_is_user() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT public.tem_modulo('y570') OR public.eh_admin_portal();
$$;
CREATE OR REPLACE FUNCTION public.cpf_is_user() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT public.tem_modulo('cpf') OR public.eh_admin_portal();
$$;
-- ⚠️ Este portal ainda não tem o Cronograma e os Rituais. Quando entrarem, a
-- migração deles tem de usar public.eh_admin_portal() nas funções de leitura
-- (fechamento_le, rituais_le) — não "papel admin em qualquer módulo".

COMMIT;

-- Conferência (roda colada). Esperado: funcao = 1 · admins_do_portal ≥ 1 ·
-- admin_de_modulo_sem_portal = 0 (logo depois de aplicar).
SELECT
  (SELECT count(*) FROM pg_proc WHERE proname = 'eh_admin_portal') AS funcao,
  (SELECT count(*) FROM public.user_modules WHERE modulo = 'portal' AND papel = 'admin') AS admins_do_portal,
  (SELECT count(DISTINCT user_id) FROM public.user_modules m
    WHERE papel = 'admin' AND modulo <> 'portal'
      AND NOT EXISTS (SELECT 1 FROM public.user_modules p WHERE p.user_id = m.user_id AND p.modulo = 'portal')) AS admin_de_modulo_sem_portal;
