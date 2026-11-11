# acesso-core (espelho do golden-source)

Cópia de `liliane-hiramoto/acesso-core` (`src/`): login, "Esqueci minha
senha", troca de senha, link do e-mail, sair e a sessão do Supabase no proxy —
o que os cinco portais fazem igual.

| arquivo | o que é | onde roda |
|---|---|---|
| `telas.tsx` | `<TelaLogin>` (com "Esqueci minha senha") e `<TelaTrocarSenha>` | navegador |
| `rotas.ts` | `linkDoEmail()` para `/auth/callback` e `sair()` para `/logout` | servidor |
| `sessao.ts` | `atualizarSessao()`, `redirecionar()`, `rotaDeAcesso()`, `cobrarTrocaDeSenha()` para o `src/proxy.ts` | servidor (proxy) |
| `senha.ts` | regras puras: senha mínima, senha provisória sorteada, a marca de troca, destino seguro, `avisoDoLogin()` | os dois |
| `vigia.tsx` | `<SaidaPorInatividade regra={…}>`: sai depois de um tempo parado; vai uma vez no layout raiz | navegador |
| `passe.ts` | "Entrar pelo Flórida": assinar e conferir o passe (Ed25519, 60 s, um portal só) e a página que o entrega por POST | servidor |
| `entrada.ts` | `entrarComPasse()` para `POST /auth/florida`: confere o passe com a chave pública do Flórida e abre a sessão da conta de mesmo e-mail (nunca cria conta) | servidor |
| `inatividade.ts` | regras puras da saída: minutos por rota (curto é o padrão), atividade compartilhada entre abas | os dois |
| `acessos.ts` | a regra da tela de Acessos: `listarAcessos(porta)` e `tratarAcao(porta, corpo)` (as travas: ninguém se inativa/exclui/muda o próprio admin do portal, a super-admin protegida, papel por módulo, senha sorteada) e os atalhos da porta (`loginsSupabase`, `acessosUserModules`, `perfisTabelas`) | servidor |
| `acessos-tela.tsx` | `<TelaAcessos meuId>`: Pessoas (lista + ficha), Por módulo e Perfis, falando com a `/api/acessos` do portal | navegador |

**Sem barril (`index.ts`) de propósito:** a tela é do navegador e as rotas são
do servidor; um índice só levaria código de servidor para o `.js` público.
Importe pelo arquivo: `@/vendor/acesso-core/telas`.

**Fica no portal:** a marca (logo, cor, rodapé), as rotas públicas próprias
(`/coleta`, `/vaga`…), quem entra em qual módulo e a PORTA dos acessos
(onde eles moram no banco, que módulos existem, se há perfis) — a tela e as
travas da tela de Acessos vêm daqui.

**Regra de ouro: mudança entra LÁ primeiro**; aqui é só espelho. Para atualizar:

```
git clone --depth 1 https://github.com/liliane-hiramoto/acesso-core /tmp/acesso-core
rm -rf src/vendor/acesso-core && cp -r /tmp/acesso-core/src src/vendor/acesso-core
node --experimental-strip-types src/vendor/acesso-core/testar.mjs
```

O `testar.mjs` (no CI de cada portal) confere a impressão digital de cada
arquivo contra o `MANIFESTO.json` — o espelho editado à mão é recusado.
