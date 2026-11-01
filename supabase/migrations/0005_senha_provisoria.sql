-- 0005 — A marca "trocar a senha no 1º acesso" muda de lugar.
--
-- Morava no user_metadata (must_change_password), que o PRÓPRIO usuário grava
-- pela API: quem entrasse com a senha padrão podia apagar a marca e seguir. Agora
-- mora no app_metadata (senha_provisoria), que só a service role grava, e o
-- proxy a cobra em toda rota.
--
-- Esta migração COPIA a marca das contas que ainda não trocaram a senha. Sem
-- ela, essas contas deixariam de ser cobradas quando o código novo entrar.
-- Por isso roda ANTES do merge. Rodar duas vezes não muda nada.

update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"senha_provisoria": true}'::jsonb
 where raw_user_meta_data ->> 'must_change_password' = 'true';

-- Conferência (colada): quem ainda tem de trocar a senha, pelas duas marcas.
--   select email,
--          raw_app_meta_data ->> 'senha_provisoria'      as marca_nova,
--          raw_user_meta_data ->> 'must_change_password' as marca_antiga
--     from auth.users order by email;
