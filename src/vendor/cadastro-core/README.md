# cadastro-core — espelho

**Não edite esta pasta num portal.** A mudança nasce no repositório
`liliane-hiramoto/cadastro-core` e é copiada:

    rm -rf src/vendor/cadastro-core && cp -r /caminho/cadastro-core/src src/vendor/cadastro-core

O CI do portal roda `node --experimental-strip-types src/vendor/cadastro-core/testar.mjs`,
que recusa o arquivo diferente do `MANIFESTO.json`.

| arquivo | o quê |
|---|---|
| `documento.ts` | CNPJ (numérico e alfanumérico) e CPF pelo dígito verificador; máscara; raiz; `mesmoDocumento`. Veio da Inexx. |
| `receita.ts` | `consultarReceita` (navegador: BrasilAPI, reserva Minha Receita), `mapearReceita` (Cartão CNPJ + QSA), `respostaDaEmpresa` (quem grava confere), `mesclarCadastro`. Veio da Flórida. |
| `vigencia.ts` | Regime e alíquotas por período (meses): `vigenteEm`, `planejarMudancaRegime`, `efeitoTroca`, mover/remover/definir; `deDatas`/`paraDatas` para tabela com datas. Veio da Inexx, genérico nas alíquotas. |
| `etiquetas.ts` | Papéis própria/cliente/fornecedor; `acharEmpresa` (CNPJ decide; nome só quando aponta uma); `cnpjsRepetidos`. |
| `conta.ts` | Conta bancária; `contaDoExtrato` (a conta do OFX, com ou sem DV, agência colada); `contaQuePaga`; `faltaNaConta`. |
| `cadastro.teste.mjs` | Os testes (rodam no CI de cada portal). |
| `testar.mjs` | Confere o manifesto e roda os testes. |
