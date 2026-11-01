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

**Sem barril (`index.ts`) de propósito:** a tela é do navegador e as rotas são
do servidor; um índice só levaria código de servidor para o `.js` público.
Importe pelo arquivo: `@/vendor/acesso-core/telas`.

**Fica no portal:** a marca (logo, cor, rodapé), as rotas públicas próprias
(`/coleta`, `/vaga`…), quem entra em qual módulo e o admin de usuários.

**Regra de ouro: mudança entra LÁ primeiro**; aqui é só espelho. Para atualizar:

```
git clone --depth 1 https://github.com/liliane-hiramoto/acesso-core /tmp/acesso-core
rm -rf src/vendor/acesso-core && cp -r /tmp/acesso-core/src src/vendor/acesso-core
node --experimental-strip-types src/vendor/acesso-core/testar.mjs
```

O `testar.mjs` (no CI de cada portal) confere a impressão digital de cada
arquivo contra o `MANIFESTO.json` — o espelho editado à mão é recusado.
