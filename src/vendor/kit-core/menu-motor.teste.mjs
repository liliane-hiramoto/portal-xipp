// O menu principal em faixas com a ordem de cada pessoa (menu-motor.ts).
import { lerOrdem, montarMenu, ordemDe, ehPadrao, moverCard, passoCard, passoFaixa } from "./menu-motor.ts";

export default function ({ ok, eq }) {
  const cards = [
    { id: "fc", faixa: "Financeiro" }, { id: "cp", faixa: "Financeiro" },
    { id: "trib", faixa: "Fiscal" }, { id: "cnpj", faixa: "Fiscal" },
    { id: "admin", faixa: "Configurações" },
  ];
  const faixas = ["Financeiro", "Contabilidade", "Fiscal", "Configurações"];
  const ids = (m) => m.map((f) => `${f.faixa}:${f.cards.map((c) => c.id).join(",")}`).join(" | ");

  eq("sem ordem salva: a do portal, sem faixa vazia", ids(montarMenu(cards, faixas, null)),
    "Financeiro:fc,cp | Fiscal:trib,cnpj | Configurações:admin");
  eq("no modo Organizar, a faixa vazia aparece (para ter onde soltar)", montarMenu(cards, faixas, null, true).map((f) => f.faixa), faixas);

  const salvo = { v: 1, faixas: ["Fiscal", "Financeiro"], cards: { Fiscal: ["cnpj", "trib", "fc"], Financeiro: ["cp"] } };
  eq("a ordem salva manda: faixas, cards e card que trocou de faixa", ids(montarMenu(cards, faixas, salvo)),
    "Fiscal:cnpj,trib,fc | Financeiro:cp | Configurações:admin");

  const novo = [...cards, { id: "rituais", faixa: "Financeiro" }];
  eq("card novo entra na faixa dele, no fim — não some", ids(montarMenu(novo, faixas, salvo)),
    "Fiscal:cnpj,trib,fc | Financeiro:cp,rituais | Configurações:admin");
  eq("card que a pessoa perdeu o acesso sai, sem quebrar o resto", ids(montarMenu(cards.filter((c) => c.id !== "trib"), faixas, salvo)),
    "Fiscal:cnpj,fc | Financeiro:cp | Configurações:admin");
  eq("faixa salva que não existe mais: o card volta à dele", ids(montarMenu(cards, faixas, { v: 1, faixas: ["Antiga"], cards: { Antiga: ["fc"] } })),
    "Financeiro:fc,cp | Fiscal:trib,cnpj | Configurações:admin");
  eq("id repetido na ordem salva não duplica o card (vale a 1ª faixa da ordem)", ids(montarMenu(cards, faixas, { v: 1, faixas: ["Fiscal"], cards: { Fiscal: ["fc", "fc"], Financeiro: ["fc"] } })),
    "Fiscal:fc,trib,cnpj | Financeiro:cp | Configurações:admin");
  for (const lixo of [null, "x", 1, [], { v: 2 }, { v: 1, faixas: "a", cards: {} }]) {
    ok(`formato errado (${JSON.stringify(lixo)}) vira a ordem padrão`, ids(montarMenu(cards, faixas, lixo)) === ids(montarMenu(cards, faixas, null)));
  }
  eq("lerOrdem limpa o que não é texto", lerOrdem({ v: 1, faixas: ["A", 3], cards: { A: ["x", null] } }), { v: 1, faixas: ["A"], cards: { A: ["x"] } });

  const m = montarMenu(cards, faixas, null, true);
  eq("arrastar para outra faixa, antes de um card", ids(moverCard(m, "admin", "Financeiro", "cp").filter((f) => f.cards.length)),
    "Financeiro:fc,admin,cp | Fiscal:trib,cnpj");
  eq("soltar numa faixa vazia", ids(moverCard(m, "cp", "Contabilidade", null).filter((f) => f.cards.length)),
    "Financeiro:fc | Contabilidade:cp | Fiscal:trib,cnpj | Configurações:admin");
  eq("soltar em cima de si mesmo não muda nada", ids(moverCard(m, "fc", "Financeiro", "fc")), ids(m));
  eq("mover não mexe no que recebeu", ids(m), "Financeiro:fc,cp | Contabilidade: | Fiscal:trib,cnpj | Configurações:admin");
  eq("seta: um passo para a frente", ids(passoCard(m, "fc", 1)).split(" | ")[0], "Financeiro:cp,fc");
  eq("seta: no começo não anda para trás", ids(passoCard(m, "fc", -1)), ids(m));
  eq("faixa sobe", passoFaixa(m, "Fiscal", -1).map((f) => f.faixa), ["Financeiro", "Fiscal", "Contabilidade", "Configurações"]);
  eq("a primeira faixa não sobe", passoFaixa(m, "Financeiro", -1).map((f) => f.faixa), faixas);

  ok("sem mexer, é o padrão (nada a guardar)", ehPadrao(cards, faixas, m));
  ok("mexeu, deixa de ser o padrão", !ehPadrao(cards, faixas, passoCard(m, "fc", 1)));
  const guardada = ordemDe(moverCard(m, "admin", "Fiscal", null).filter((f) => f.cards.length));
  eq("o que se guarda volta igual", ids(montarMenu(cards, faixas, guardada)), "Financeiro:fc,cp | Fiscal:trib,cnpj,admin");
}
