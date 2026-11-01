// Teste do filtro por coluna e do tom da aba — vai junto no espelho.
import {
  criarPassa, filtrar, opcoesPorColuna, estadoVazio, temFiltro, ordemDaLista, alternar,
  quantosNaColuna, marcados, TODOS, SEM, LIGADO,
} from "./filtro-motor.ts";
import { classesDaAba } from "./abas-tom.ts";

const COLS = [
  { k: "empresa", rotulo: "Empresa", tipo: "lista", de: (x) => x.empresa },
  { k: "cat", rotulo: "Categoria", tipo: "lista", de: (x) => x.cat },
  { k: "tipo", rotulo: "Tipo", tipo: "lista", de: (x) => x.tipo },
  { k: "desc", rotulo: "Descrição", tipo: "texto", de: (x) => x.desc },
  { k: "nf", rotulo: "Com NF", tipo: "booleano", de: (x) => (x.nf ? "1" : "") },
];
const L = [
  { empresa: "AW", cat: "Aluguel", tipo: "saida", desc: "IMOBILIARIA CENTRO", nf: true },
  { empresa: "AW", cat: "Softwares", tipo: "saida", desc: "Serviços de nuvem", nf: false },
  { empresa: "AW", tipo: "entrada", desc: "RECEBIMENTO CLIENTE", nf: false },
  { empresa: "BRASIL", cat: "Aluguel", tipo: "saida", desc: "SALA COMERCIAL", nf: true },
  { empresa: "BRASIL", cat: "Impostos", tipo: "saida", desc: "DARF", nf: false },
];
const est = (o = {}) => ({ ...estadoVazio(COLS), ...o });
const n = (e) => filtrar(L, COLS, e).length;

export default function testeFiltro(t) {
  // 1. A garantia central, por força bruta: toda opção oferecida, somada ao
  // que já está escolhido, devolve pelo menos uma linha.
  const partidas = [
    est(), est({ empresa: ["AW"] }), est({ tipo: ["saida"] }), est({ cat: ["Aluguel", "Impostos"] }),
    est({ empresa: ["BRASIL"], tipo: ["saida"] }), est({ desc: "sala" }), est({ nf: LIGADO }),
  ];
  const vazias = [];
  for (const p of partidas) {
    for (const [k, { valores, temVazio }] of opcoesPorColuna(L, COLS, p)) {
      for (const v of [...valores, ...(temVazio ? [SEM] : [])]) {
        if (!n({ ...p, [k]: [v] })) vazias.push(`${JSON.stringify(p)} + ${k}=${v}`);
      }
    }
  }
  t.eq("nenhuma opção oferecida leva a zero linhas", vazias, []);

  // 2. A cascata ignora o filtro da PRÓPRIA coluna.
  t.eq("a coluna escolhida continua oferecendo as outras opções",
    opcoesPorColuna(L, COLS, est({ empresa: ["AW"] })).get("empresa").valores, ["AW", "BRASIL"]);
  t.eq("as OUTRAS colunas afunilam",
    opcoesPorColuna(L, COLS, est({ empresa: ["BRASIL"] })).get("cat").valores, ["Aluguel", "Impostos"]);

  // 3. Vários valores na mesma coluna = OU; colunas diferentes = E.
  t.eq("dois valores na coluna somam", n(est({ cat: ["Aluguel", "Impostos"] })), 3);
  t.eq("colunas diferentes estreitam", n(est({ cat: ["Aluguel", "Impostos"], empresa: ["AW"] })), 1);
  t.eq("lista vazia = sem filtro", n(est({ cat: [] })), 5);

  // 4. O marcado volta para a lista mesmo sem linha que case.
  t.ok("o marcado que sumiu da cascata continua na lista",
    opcoesPorColuna(L, COLS, est({ empresa: ["AW"], cat: ["Impostos"] })).get("cat").valores.includes("Impostos"));

  // 5. "(sem)" é opção, e anda junto com valores.
  t.eq("SEM acha as linhas sem o campo", n(est({ cat: [SEM] })), 1);
  t.eq("SEM + valor", n(est({ cat: [SEM, "Impostos"] })), 2);
  t.ok("temVazio só quando há linha sem o campo",
    opcoesPorColuna(L, COLS, est()).get("cat").temVazio && !opcoesPorColuna(L, COLS, est({ tipo: ["saida"] })).get("cat").temVazio);

  // 6. Texto por trecho e sem acento; booleano.
  t.eq("texto sem acento e por trecho", n(est({ desc: "servico" })), 1);
  t.eq("booleano ligado", n(est({ nf: LIGADO })), 2);

  // 7. O estado antigo da Headset (um valor só, em texto) continua valendo.
  t.eq("valor único em texto (legado)", n(est({ cat: "Aluguel" })), 2);
  t.eq("TODOS em texto (legado) = sem filtro", n(est({ cat: TODOS })), 5);
  t.eq("SEM em texto (legado)", n(est({ cat: SEM })), 1);

  // 8. Utilitários.
  t.eq("alternar marca e desmarca", [alternar(["a"], "b"), alternar(["a", "b"], "a")], [["a", "b"], ["b"]]);
  t.eq("marcados do legado", [marcados(TODOS), marcados("x"), marcados(["x", "y"])], [[], ["x"], ["x", "y"]]);
  t.eq("quantos na coluna", [quantosNaColuna(COLS[1], ["a", "b"]), quantosNaColuna(COLS[3], "  "), quantosNaColuna(COLS[4], LIGADO)], [2, 0, 1]);
  t.ok("temFiltro", !temFiltro(COLS, est()) && temFiltro(COLS, est({ desc: "x" })));
  t.eq("ordemDaLista: referência primeiro, resto em ordem alfabética",
    ["z", "b", "a", "y"].sort(ordemDaLista(["b", "a"])), ["b", "a", "y", "z"]);
  const casaExato = [{ k: "v", rotulo: "Valor", tipo: "lista", de: (x) => x.v, casa: (x, f) => String(x.v).startsWith(f) }];
  t.eq("`casa` próprio na lista", filtrar([{ v: 120 }, { v: 200 }], casaExato, { v: ["1"] }).length, 1);
  t.ok("predicado com skip", criarPassa(COLS, est({ empresa: ["AW"] }))(L[3], "empresa"));

  // 9. A aba: uma classe por propriedade.
  const a = classesDaAba({ ativa: true, tom: "padrao", filha: false });
  t.ok("aba aberta tem o risco embaixo", a.fundo.includes("inset_0_-3px_0"));
  t.eq("apagada muda o PESO junto com a cor", classesDaAba({ ativa: false, tom: "apagada", filha: false }).peso, "font-normal");
  t.ok("destaque fechada usa a cor da marca", classesDaAba({ ativa: false, tom: "destaque", filha: false }).cor.includes("--brand"));
  t.eq("filha é menor", classesDaAba({ ativa: false, tom: "padrao", filha: true }).tamanho, "text-[12px]");
  t.ok("nenhuma classe sem reserva de cor", Object.values(a).every((c) => !/var\(--[a-z0-9-]+\)/.test(c)));
}
