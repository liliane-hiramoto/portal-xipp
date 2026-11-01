# Portal fiscal novo a partir do modelo

Este repositório (`portal-fiscal-modelo`) é o **canônico** dos portais fiscais
enxutos. Um portal novo é uma **cópia** dele com a identidade trocada; melhoria
feita no modelo vai a cada portal por PR (o `MODELO.md` de cada portal diz de
qual versão do modelo ele veio).

Cada cliente tem: **2 repositórios** (`portal-<sigla>` e
`<sigla>-tributos-web`), **2 projetos na Vercel** (os mesmos nomes) e **1
projeto no Supabase** (`portal-<sigla>`, região São Paulo).

## 1. O que muda de um portal para outro

| o quê | onde |
|---|---|
| nome, empresa, grupo, logo, ícone | `src/config/portal.ts` |
| cores da marca (6 linhas) | `src/app/(portal)/globals.css`, bloco `:root` |
| logo branco e ícone da aba | `public/logo-branco.svg` e `public/favicon.svg` |
| cor da marca sem `#` (pinta Y570 e Consulta CNPJ) e endereço da instância do Tributos | `brandHex` e `tributosApp` em `src/config/portal.ts` |
| nome do projeto | `package.json` (`name`) |

As **empresas** não vão no código: o admin inclui cada uma em **Cadastros**
(botão **Receita** preenche pelo CNPJ). O Tributos e o Y570 só aceitam empresa
cadastrada ali.

## 2. Passo a passo

### GitHub (a usuária cria; o Claude faz o resto)
A integração do Claude **não cria repositório**. A usuária cria, vazios e
privados: `portal-<sigla>` e `<sigla>-tributos-web`. O Claude copia o modelo
para o primeiro e a instância do Tributos para o segundo, troca a identidade e
sobe na `main`.

**Instância do Tributos** = cópia do canônico `tributos-web` com:

| arquivo da instância | o quê |
|---|---|
| `next.config.ts` | `basePath = "/tributos"` |
| `src/app/globals.css` | `--brand` / `--brand-soft` com as cores do portal |
| `src/components/Sidebar.tsx`, `src/app/login/page.tsx`, `src/app/layout.tsx`, `package.json` | nome "`<Sigla>` · Tributos"; sem o bloco "Ferramentas" (CNPJ e Y570 são cards do Portal) |
| `src/app/page.tsx` | acesso pelo `user_modules` do portal (módulo `tributos`; `editor`/`admin` gravam; super-admin passa) |
| `src/lib/empresas.ts` | ler `razao_social` (cadastro deste modelo) |
| `supabase/migrations/` | vazio: as tabelas `trib_*` nascem no SETUP do portal |

### Supabase (a usuária faz, guiada)
1. supabase.com › **New project** › nome `portal-<sigla>`, região **South
   America (São Paulo)**. Guardar a senha do banco.
2. **SQL Editor › New query**: colar o `supabase/SETUP-COMPLETO.sql` INTEIRO e
   **Run** (o Claude cola no chat). A última tabela é `true · 2 · 2`.
3. **Authentication › Sign In / Providers**: desligar *Allow new users to sign up*.
4. **Authentication › URL Configuration**: *Site URL* = endereço do portal na
   Vercel; *Redirect URLs* = `https://<portal>.vercel.app/**`.
5. **Authentication › Users › Add user**: o login do super-admin (o e-mail de
   `SUPER_ADMIN` em `src/lib/papel.ts`), com *Auto Confirm User*.
6. **Project Settings › API**: *Project URL*, *anon key* e *service_role key*
   vão para a Vercel.

### Vercel (a usuária faz, guiada)
1. **Primeiro a instância do Tributos**: Add New › Project › importar
   `<sigla>-tributos-web`. Variáveis: `NEXT_PUBLIC_SUPABASE_URL` e
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` (as do portal: mesmo banco, mesmo login) e,
   se quiser a caixa de perguntas do Fiscal, `ANTHROPIC_API_KEY`. O endereço
   que a Vercel der vai para o `tributosApp` (PR do Claude).
2. **Depois o portal**: importar `portal-<sigla>`. Variáveis do
   `.env.example`: Supabase (3) e, quando houver contrato, Serpro (2).
3. Y570 (`/y570`) e Consulta CNPJ (`/cnpj`) não precisam de projeto: são os
   apps compartilhados `y570-app` e `cnpj-base-web`.

### Primeiro acesso
1. Entrar com o super-admin › **Cadastros** › incluir as empresas pelo CNPJ.
2. **Admin de usuários** › criar cada pessoa com o papel em cada módulo
   (Tributos, Consulta CNPJ, Y570, Consulta CPF — Somente leitura, Editor ou
   Admin). A senha provisória aparece uma vez.
