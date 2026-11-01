-- 0007 — Módulo TRIBUTOS neste portal (30/10/2026, pedido dela — replicado
-- do Portal Flórida, 0204)
--
-- O módulo Tributos (Controle de Tributos Federais: DARFs, Situação Fiscal,
-- certidões, parcelamentos, documentos) é o canônico `tributos-web`. Cada portal
-- tem a SUA instância na Vercel (`<sigla>-tributos-web`, basePath /tributos),
-- servida pelo portal em /tributos (Multi-Zones, rewrite no next.config.ts) e
-- usando ESTE banco. Ver NOVO-PORTAL.md.
--
-- O que esta migração faz:
--   1. trib_is_user()/trib_is_admin() na régua DESTE portal: `user_modules`
--      (tem_modulo / pode_gravar_modulo, 0001 e 0004) + o super-admin. Todas as
--      RLS do módulo passam por essas duas funções, e a tela da instância
--      (src/app/page.tsx de lá) confere o mesmo `user_modules`.
--   2. as tabelas trib_* do canônico (0001, 0003–0006, 0009, 0010 de lá), juntas;
--   3. os buckets `darf-pdfs` e `docs-fiscais`.
--
-- ⚠️ trib_is_admin() = quem pode GRAVAR (importar PDF, limpar, enviar certidão):
-- papel admin ou editor no módulo `tributos`, ou admin do portal (papel admin
-- em algum módulo, como ehAdmin()), ou o super-admin. Leitura (viewer) só lê —
-- "tela que só esconde continua gravando" vale no banco.
-- ⚠️ O card "Tributos" não é linha de tabela aqui: mora em
-- src/components/PortalHub.tsx, e o papel é dado no Admin de usuários.
-- ⚠️ A ferramenta Y570 (menu do Tributos) é app sem login próprio: o proxy do
-- portal só a deixa abrir para quem tem o módulo `tributos`
-- (src/lib/supabase/middleware.ts).
--
-- Pode ser aplicada antes do código. Idempotente.

BEGIN;

-- ---------- 1. quem lê e quem grava ----------
CREATE OR REPLACE FUNCTION public.trib_is_user() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT public.tem_modulo('tributos')
      OR EXISTS (SELECT 1 FROM public.user_modules
                  WHERE user_id = auth.uid() AND papel = 'admin')
      OR lower(auth.jwt() ->> 'email') = 'liliane.hiramoto@grupoflorida.com.br';
$$;

CREATE OR REPLACE FUNCTION public.trib_is_admin() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT public.pode_gravar_modulo('tributos')
      OR lower(auth.jwt() ->> 'email') = 'liliane.hiramoto@grupoflorida.com.br';
$$;

REVOKE ALL ON FUNCTION public.trib_is_user() FROM public;
REVOKE ALL ON FUNCTION public.trib_is_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.trib_is_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.trib_is_admin() TO authenticated;

-- ---------- 2. DARFs ----------
CREATE TABLE IF NOT EXISTS public.trib_darfs (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cnpj             text NOT NULL,
  codigo           text NOT NULL,
  tributo          text,
  periodo_apuracao date,
  vencimento       date,
  recolhimento     date,
  principal        numeric(14,2) NOT NULL DEFAULT 0,
  multa            numeric(14,2) NOT NULL DEFAULT 0,
  juros            numeric(14,2) NOT NULL DEFAULT 0,
  total            numeric(14,2) NOT NULL DEFAULT 0,
  banco            text,
  numero_documento text,
  arquivo          text,
  arquivo_path     text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trib_darfs_cnpj_recolh_idx ON public.trib_darfs (cnpj, recolhimento);
CREATE INDEX IF NOT EXISTS trib_darfs_codigo_idx ON public.trib_darfs (codigo);
-- idempotência do import recorrente (mesmo documento + código + valores)
CREATE UNIQUE INDEX IF NOT EXISTS trib_darfs_uk
  ON public.trib_darfs (numero_documento, codigo, principal, multa, juros, total);

ALTER TABLE public.trib_darfs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trib read darfs" ON public.trib_darfs;
DROP POLICY IF EXISTS "trib admin write darfs" ON public.trib_darfs;
CREATE POLICY "trib read darfs" ON public.trib_darfs FOR SELECT USING (public.trib_is_user());
CREATE POLICY "trib admin write darfs" ON public.trib_darfs
  FOR ALL USING (public.trib_is_admin()) WITH CHECK (public.trib_is_admin());

-- ---------- 4. Situação Fiscal (e-CAC), snapshots ----------
CREATE TABLE IF NOT EXISTS public.trib_fiscal_snapshots (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cnpj              text NOT NULL,
  razao_social      text,
  data_consulta     text,
  arquivo           text,
  total_original    numeric(16,2) NOT NULL DEFAULT 0,
  total_saldo       numeric(16,2) NOT NULL DEFAULT 0,
  total_multa       numeric(16,2) NOT NULL DEFAULT 0,
  total_juros       numeric(16,2) NOT NULL DEFAULT 0,
  total_consolidado numeric(16,2) NOT NULL DEFAULT 0,
  sem_pendencias    boolean NOT NULL DEFAULT false,
  conteudo_hash     text NOT NULL,
  dados             jsonb NOT NULL,
  enviado_em        timestamptz NOT NULL DEFAULT now(),
  enviado_por       uuid
);
CREATE INDEX IF NOT EXISTS trib_fiscal_cnpj_env_idx ON public.trib_fiscal_snapshots (cnpj, enviado_em DESC);

ALTER TABLE public.trib_fiscal_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trib read fiscal" ON public.trib_fiscal_snapshots;
DROP POLICY IF EXISTS "trib admin write fiscal" ON public.trib_fiscal_snapshots;
CREATE POLICY "trib read fiscal" ON public.trib_fiscal_snapshots FOR SELECT USING (public.trib_is_user());
CREATE POLICY "trib admin write fiscal" ON public.trib_fiscal_snapshots
  FOR ALL USING (public.trib_is_admin()) WITH CHECK (public.trib_is_admin());

-- ---------- 5. Certidões (CNDT, CND FGTS), snapshots ----------
CREATE TABLE IF NOT EXISTS public.trib_certidoes_snapshots (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo          text NOT NULL,
  cnpj          text NOT NULL,
  razao_social  text,
  numero        text,
  emissao       text,
  validade      text,
  situacao      text,
  regular       boolean NOT NULL DEFAULT false,
  conteudo_hash text NOT NULL,
  dados         jsonb NOT NULL,
  enviado_em    timestamptz NOT NULL DEFAULT now(),
  enviado_por   uuid
);
CREATE INDEX IF NOT EXISTS trib_cert_key_idx ON public.trib_certidoes_snapshots (cnpj, tipo, enviado_em DESC);

ALTER TABLE public.trib_certidoes_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trib read certidoes" ON public.trib_certidoes_snapshots;
DROP POLICY IF EXISTS "trib admin write certidoes" ON public.trib_certidoes_snapshots;
CREATE POLICY "trib read certidoes" ON public.trib_certidoes_snapshots FOR SELECT USING (public.trib_is_user());
CREATE POLICY "trib admin write certidoes" ON public.trib_certidoes_snapshots
  FOR ALL USING (public.trib_is_admin()) WITH CHECK (public.trib_is_admin());

-- ---------- 6. Duplicidades de DARF: anotações ----------
CREATE TABLE IF NOT EXISTS public.trib_darf_dup_notes (
  grupo_chave     text PRIMARY KEY,
  comentario      text,
  nao_duplicidade boolean NOT NULL DEFAULT false,
  justificativa   text,
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  atualizado_por  uuid
);
ALTER TABLE public.trib_darf_dup_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trib read dup notes" ON public.trib_darf_dup_notes;
DROP POLICY IF EXISTS "trib write dup notes" ON public.trib_darf_dup_notes;
CREATE POLICY "trib read dup notes" ON public.trib_darf_dup_notes FOR SELECT USING (public.trib_is_user());
-- ⚠️ No canônico qualquer usuário do módulo anota; aqui segue a régua da
-- Flórida ("tela que só esconde continua gravando"): só quem grava anota.
CREATE POLICY "trib write dup notes" ON public.trib_darf_dup_notes
  FOR ALL USING (public.trib_is_admin()) WITH CHECK (public.trib_is_admin());

-- ---------- 7. Parcelamentos ----------
CREATE TABLE IF NOT EXISTS public.trib_parcelamentos (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cnpj          text NOT NULL,
  sigla         text NOT NULL,
  numero        text NOT NULL,
  razao_social  text,
  situacao      text,
  dados         jsonb NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cnpj, sigla, numero)
);
ALTER TABLE public.trib_parcelamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trib read parcelamentos" ON public.trib_parcelamentos;
DROP POLICY IF EXISTS "trib admin write parcelamentos" ON public.trib_parcelamentos;
CREATE POLICY "trib read parcelamentos" ON public.trib_parcelamentos FOR SELECT USING (public.trib_is_user());
CREATE POLICY "trib admin write parcelamentos" ON public.trib_parcelamentos
  FOR ALL USING (public.trib_is_admin()) WITH CHECK (public.trib_is_admin());

-- ---------- 8. Documentos (PDFs originais) ----------
CREATE TABLE IF NOT EXISTS public.trib_documentos (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo          text NOT NULL,
  cnpj          text,
  razao_social  text,
  referencia    text,
  arquivo       text NOT NULL,
  path          text NOT NULL UNIQUE,
  tamanho       bigint,
  hash          text NOT NULL UNIQUE,
  enviado_em    timestamptz NOT NULL DEFAULT now(),
  enviado_por   uuid DEFAULT auth.uid()
);
CREATE INDEX IF NOT EXISTS trib_documentos_cnpj_idx ON public.trib_documentos (cnpj, enviado_em DESC);
ALTER TABLE public.trib_documentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trib read documentos" ON public.trib_documentos;
DROP POLICY IF EXISTS "trib admin write documentos" ON public.trib_documentos;
CREATE POLICY "trib read documentos" ON public.trib_documentos FOR SELECT USING (public.trib_is_user());
CREATE POLICY "trib admin write documentos" ON public.trib_documentos
  FOR ALL USING (public.trib_is_admin()) WITH CHECK (public.trib_is_admin());

-- ---------- 9. Storage: PDFs de DARF e documentos fiscais (privados) ----------
INSERT INTO storage.buckets (id, name, public) VALUES ('darf-pdfs', 'darf-pdfs', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('docs-fiscais', 'docs-fiscais', false) ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "trib read darf pdfs" ON storage.objects;
DROP POLICY IF EXISTS "trib write darf pdfs" ON storage.objects;
DROP POLICY IF EXISTS "trib read docs fiscais" ON storage.objects;
DROP POLICY IF EXISTS "trib write docs fiscais" ON storage.objects;
CREATE POLICY "trib read darf pdfs" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'darf-pdfs' AND public.trib_is_user());
CREATE POLICY "trib write darf pdfs" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'darf-pdfs' AND public.trib_is_admin());
CREATE POLICY "trib read docs fiscais" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'docs-fiscais' AND public.trib_is_user());
CREATE POLICY "trib write docs fiscais" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'docs-fiscais' AND public.trib_is_admin());

COMMIT;

-- ---------- conferência (roda colada, uma consulta só) ----------
SELECT
  (SELECT count(*) FROM pg_proc WHERE proname IN ('trib_is_user', 'trib_is_admin')) AS funcoes_de_2,
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN
      ('trib_darfs','trib_fiscal_snapshots','trib_certidoes_snapshots','trib_darf_dup_notes','trib_parcelamentos','trib_documentos')) AS tabelas_de_6,
  (SELECT count(*) FROM storage.buckets WHERE id IN ('darf-pdfs','docs-fiscais')) AS buckets_de_2,
  (SELECT count(*) FROM pg_policies WHERE tablename LIKE 'trib\_%') AS politicas_trib;
