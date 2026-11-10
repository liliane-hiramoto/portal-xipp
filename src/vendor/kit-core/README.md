# kit-core (espelho do golden-source)

Cópia de `liliane-hiramoto/kit-core` (`src/`): as peças de TELA que os cinco
portais desenhavam cada um do seu jeito.

| arquivo | o que é |
|---|---|
| `formato.ts` | `fmtMoney`, `fmtMoneyCompact`, `fmtNum`, `fmtDate`, `fmtPct` (puro) |
| `tabela.tsx` | `TH`, `TD`, `TD_QUEBRA`, `NUM` (e os `_DENSO`), `<Tabela>`, `<LinhaVazia>` |
| `kpi.tsx` | `<Kpi titulo valor sub tom dica onClick ativo serif>` e `<Kpis cols>` |
| `janela.tsx` | `<Janela>` (modal, no `<body>`) e `<EstadoDados>` (carregando/erro/vazio) |
| `seletor-categoria.tsx` | `<SeletorCategoria grupos value onChange …>` — busca, setas, grupos da Estrutura FC |
| `categorias.ts` | `GrupoOpcoes`, `listaDeGrupos`, `buscarCategorias` (puro, com teste) |
| `menu-motor.ts` | `montarMenu`, `moverCard`, `passoCard`, `passoFaixa`, `ordemDe`, `lerOrdem` — o menu principal em faixas com a ordem de cada pessoa (puro, com teste) |
| `menu-cards.tsx` | `<MenuCards cards faixas salvo desenhar aoSalvar>` e `salvarMenuNaConta` — faixas por assunto e "⇅ Organizar" (a ordem fica no `user_metadata.menu_cards` da pessoa) |

**Cores:** variáveis da Headset (`--ink`, `--ink-2`, `--ink-3`, `--line`,
`--paper`, `--bg-2`, `--brand`, `--brand-2`, `--red`, `--green`, `--amber`,
`--blue`, `--neg-bg`) com o valor de reserva escrito na classe — funciona sem
configurar nada. **Nunca `--accent`**: cada portal dá a ela uma cor diferente.

**Fica no portal:** campos e botões, a exportação para Excel, a marca, e o
ADAPTADOR que monta os `GrupoOpcoes` a partir do cadastro de categorias dele.

**Adoção aos poucos:** tela existente passa a usar o kit quando for mexida por
outro motivo; o CI de cada portal tem um TETO de cópias à mão, que só desce.

**Regra de ouro: mudança entra LÁ primeiro**; aqui é só espelho. Para atualizar:

```
git clone --depth 1 https://github.com/liliane-hiramoto/kit-core /tmp/kit-core
rm -rf src/vendor/kit-core && cp -r /tmp/kit-core/src src/vendor/kit-core
node --experimental-strip-types src/vendor/kit-core/testar.mjs
```

⚠️ O Tailwind v4 gera as classes que ACHA no código: o `globals.css` de cada
portal tem `@source` apontando para `src/vendor`, para as classes do kit
existirem mesmo se a pasta um dia sair da varredura automática.
