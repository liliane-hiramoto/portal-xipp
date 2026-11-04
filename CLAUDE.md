@AGENTS.md

# CLAUDE.md — Portal Xipp

**Portal Xipp** — cópia do `portal-fiscal-modelo` (ver `MODELO.md`). Tudo
abaixo é a regra do modelo; o que é só deste portal está no fim.

O modelo é o canônico dos portais fiscais enxutos (nasceu em 01/11/2026
do `portal-ca-modelo`, sem o Financeiro, a pedido dela: "os portais novos não
seguem modelo CA — criar com modelo enxuto"). Portal novo = cópia deste
repositório com a identidade trocada: **ler `NOVO-PORTAL.md`**. Melhoria que
serve a todos os portais fiscais nasce AQUI e vai para cada portal por PR (o
`MODELO.md` de cada portal diz de que versão veio). Portais deste modelo:
Benevix, Xipp, CTESK. **Na dúvida, o código vence este arquivo.**

## Como trabalhar com a usuária
- Ela é **não-dev**: explicar em português e guiar clique a clique.
- **Migração nova: colar o SQL INTEIRO no chat**, sempre. Ela aplica no
  Supabase › SQL Editor à mão. Portal novo: o `supabase/SETUP-COMPLETO.sql`
  inteiro, uma vez (gerado por `scripts/montar-setup.mjs`; o CI barra o
  arquivo desatualizado).
- Consulta de conferência roda **colada**, numa consulta só (o SQL Editor mostra
  só a última) e sem `<preencher>`.
- Branch padrão é **`main`**.
- **PR automático (18/10/2026, pedido dela, vale para TODOS os repositórios dela):**
  terminada a mudança, abrir o PR sem perguntar e, com a verificação do GitHub
  verde e sem conflito, **fazer o merge** você mesmo. Se a verificação NÃO
  CHEGA A RODAR (minutos do Actions acabaram), mergear desde que os passos do
  `ci.yml` tenham rodado localmente e passado e um comentário no PR registre
  isso. Exceção: migração que precisa estar no banco ANTES do código —
  avisar, colar o SQL, esperar o "apliquei".

## O que é
Hub com cards por módulo (`src/components/PortalHub.tsx`):

| card | rota | o quê |
|---|---|---|
| Tributos | `/tributos` | instância `<sigla>-tributos-web` do canônico `tributos-web`, servida por rewrite (Multi-Zones) |
| Consulta CNPJ e SN | `/cnpj` | app compartilhado `cnpj-base-web`; base no banco do portal (`/api/cnpj-base`) |
| Y570 · ECF | `/y570` | app compartilhado `y570-app`; histórico e PDFs no banco do portal (`/api/y570-base`) |
| Consulta CPF | `/cpf` | deste app; Serpro v3 (CPF + nascimento), chaves só no servidor. **Card FECHADO, "pendente Serpro"** (01/11/2026, pedido dela) — ⚠️ o que ela quer é o município da pessoa, e a v3 não devolve endereço |
| Cadastros | `/cadastros` | todo logado lê; admin inclui/exclui empresa (Receita preenche) |
| Acessos | `/acessos` | só admin; o modelo da Flórida (01/11/2026): **Pessoas** (lista + ficha do login), **Por módulo** e **Perfis de acesso** (0012). `/admin` redireciona para cá |

**Identidade** = `src/config/portal.ts` + as 6 cores de `:root` em
`src/app/(portal)/globals.css` + `public/`. Nome de empresa escrito à mão em
tela é bug: vai para o `portal.ts`.

## Acesso e segurança
- **Acesso por módulo**: `user_modules` (`modulo`, `papel` = viewer · editor ·
  admin). Admin em qualquer módulo = admin do portal. Super-admin de bootstrap:
  `SUPER_ADMIN` em `src/lib/papel.ts`.
- **O `proxy` protege a TELA, não o DADO.** `/tributos`, `/y570` e `/cnpj` são
  outros apps, sem login próprio: o proxy os tranca pelo módulo
  (`ZONAS_MODULO`, `src/lib/supabase/middleware.ts`). O DADO segue a RLS:
  - Tributos (0007): `trib_is_user()` lê, `trib_is_admin()` grava;
  - CNPJ (0008): `cnpj_is_user()` / `cnpj_is_admin()`;
  - Y570 (0009/0010): `y570_is_user()` / `y570_is_admin()`, e o INSERT (tabela
    e bucket `y570-pdfs`) exige `y570_raiz_cadastrada(raiz)` — só empresa do
    Cadastro. ⚠️ A política de INSERT chama-se `"y570 insert"` (com espaço):
    outra com outro nome valeria JUNTO (políticas somam por OU) e a trava não
    barraria nada — já aconteceu no `portal-ca-modelo`;
  - CPF (0011): `cpf_is_user()` lê, `cpf_is_admin()` consulta (cada consulta é
    COBRADA; a rota confere o papel ANTES de chamar o Serpro). Só INSERT.
  - Perfis de acesso (0012): RLS ligada e NENHUMA política — só a rota
    `/api/acessos` (service role, depois de `exigeAdmin()`) lê e grava.
  Provado em `supabase/testes/tributos.sh` (CI).
- As rotas `/api/cnpj-base`, `/api/y570-base` e `/api/cpf` usam a **sessão de
  quem usa** (nada de service role): quem decide é a RLS. A service role só
  aparece em Acessos (`/api/acessos`) e no Cadastros (`actions.ts`), sempre DEPOIS de
  `ehAdmin()`/`exigeAdmin()`. A tabela `empresas` só tem política de leitura.
- Senha provisória sorteada e cobrada em toda rota (0005); login, troca de
  senha, `/auth/callback` e sessão vêm do `liliane-hiramoto/acesso-core`
  (espelho em `src/vendor/acesso-core/` — não edite).
- Chaves do Serpro só na Vercel (`SERPRO_CONSUMER_KEY/SECRET`), **nunca no
  chat** nem no código.

## Banco
- Migrações em `supabase/migrations/` (não existe 0003: era o cofre do token do
  Conta Azul, que o modelo fiscal não tem). `0006_empresa.sql` é o seed opcional
  de cada portal; as empresas entram pela tela.
- `supabase/SETUP-COMPLETO.sql` = todas, menos a 0006, num arquivo — é o que a
  usuária cola num portal novo. Provado em `supabase/testes/setup.sh` (aplica
  duas vezes; toda tabela com RLS).
- `module_state` (0001/0004) sobrou do modelo Conta Azul e não é usada; fica
  porque a 0004 cria o `pode_gravar_modulo()` que as réguas usam.

## Kit de tela
`liliane-hiramoto/kit-core`, espelho em `src/vendor/kit-core/` — não edite.
Tela nova usa o kit (`<Kpi>`, `<Tabela>`, `<Aba>`/`<TiraAbas>`…).

## Datas, erro e espera
- "Hoje" é `hojeYmd()` de `src/lib/hoje.ts` (São Paulo), nunca
  `new Date().toISOString().slice(0,10)`. `scripts/conferir-hoje.mjs` barra.
- `src/app/(portal)/error.tsx`, `loading.tsx` e `RecuperaDeploySkew`, como nos
  outros portais.
- **Região da Vercel = `gru1`** (`vercel.json`); o Supabase de cada portal tem
  de ser criado em São Paulo (sa-east-1).

## Validação
- **CI** (`.github/workflows/ci.yml`): `tsc`, espelhos (acesso-core, kit-core),
  teste do Serpro, SETUP em dia, `conferir-hoje`, `conferir-senha`, `build`,
  `supabase/testes/*.sh` num Postgres 16 descartável e o lint (só aviso).
- Localmente: `npx tsc --noEmit && npm run build` e `bash supabase/testes/tributos.sh`
  (Postgres 16 em `/usr/lib/postgresql/16/bin`).

## Ambiente (Mac da usuária)
- Node em `~/.local/node`, gh em `~/.local/gh`. **npm bloqueado** na rede dela
  → espelho em `.npmrc` (registry.yarnpkg.com); `npm install` em foreground.

## Xipp — o que é só deste portal
- Identidade: `src/config/portal.ts` ("Portal Xipp"). Marca tirada do site
  xipp.com.br (print da usuária, 04/11/2026): grafite do site #26272e, cinza da barra #505256 e o verde neon dos destaques (escurecido para #03c96a, porque o #03ff83 do site some no fundo branco). Logo branco em
  `public/logo-branco.png`.
- Instância do Tributos: `xipp-tributos-web` (`tributosApp` no `portal.ts`).
- Supabase e Vercel próprios (`portal-xipp`), região São Paulo.
