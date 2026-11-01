-- 0012 — Perfis de acesso (01/11/2026, pedido dela: "seguir com o mesmo modelo
-- do Portal Flórida" na tela de Acessos)
--
-- A tela de Acessos passa a ter as três abas da Flórida — Pessoas (ficha de
-- cada login), Por módulo ("quem enxerga o Tributos?") e Perfis de acesso.
-- Perfil = MOLDE "módulo → papel" aplicado num clique a um usuário (réplica da
-- 0027 da Flórida). A fonte da verdade continua sendo `user_modules`: aplicar
-- um perfil grava as linhas lá e não cria vínculo com o perfil.
--
-- ⚠️ RLS ligada e NENHUMA política: só o servidor lê e grava, com a service
-- role, depois de conferir que quem pede é admin do portal (rota
-- src/app/(portal)/api/acessos/route.ts). Na Flórida a leitura é aberta a
-- qualquer login; aqui não há motivo para o navegador ler os perfis.
--
-- Nasce com dois perfis de exemplo (editáveis na tela). Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS public.perfis_acesso (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome       text NOT NULL UNIQUE,
  descricao  text,
  ordem      int NOT NULL DEFAULT 0,
  ativo      boolean NOT NULL DEFAULT true,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.perfil_acesso_itens (
  perfil_id  bigint NOT NULL REFERENCES public.perfis_acesso(id) ON DELETE CASCADE,
  modulo     text NOT NULL CHECK (modulo IN ('tributos', 'cnpj', 'y570', 'cpf')),
  papel      text NOT NULL CHECK (papel IN ('viewer', 'editor', 'admin')),
  PRIMARY KEY (perfil_id, modulo)
);

ALTER TABLE public.perfis_acesso       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfil_acesso_itens ENABLE ROW LEVEL SECURITY;

INSERT INTO public.perfis_acesso (nome, descricao, ordem) VALUES
  ('Fiscal — editor', 'Quem importa DARF, situação fiscal e PDFs do Y570 e mantém a base de CNPJs.', 1),
  ('Consulta — somente leitura', 'Vê Tributos, Y570 e Consulta CNPJ, sem gravar nada.', 2)
ON CONFLICT (nome) DO NOTHING;

INSERT INTO public.perfil_acesso_itens (perfil_id, modulo, papel)
SELECT p.id, i.modulo, i.papel
  FROM public.perfis_acesso p
  JOIN (VALUES
    ('Fiscal — editor', 'tributos', 'editor'), ('Fiscal — editor', 'y570', 'editor'), ('Fiscal — editor', 'cnpj', 'editor'),
    ('Consulta — somente leitura', 'tributos', 'viewer'), ('Consulta — somente leitura', 'y570', 'viewer'), ('Consulta — somente leitura', 'cnpj', 'viewer')
  ) AS i(perfil, modulo, papel) ON i.perfil = p.nome
ON CONFLICT (perfil_id, modulo) DO NOTHING;

COMMIT;

-- ---------- conferência (roda colada, uma consulta só) ----------
SELECT
  (SELECT count(*) FROM public.perfis_acesso) AS perfis,
  (SELECT count(*) FROM pg_policies WHERE tablename IN ('perfis_acesso', 'perfil_acesso_itens')) AS politicas_de_0,
  (SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('public.perfis_acesso'::regclass, 'public.perfil_acesso_itens'::regclass)) AS rls_ligada;
