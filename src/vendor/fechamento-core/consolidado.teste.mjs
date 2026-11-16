// Visão consolidada do cronograma de fechamento (src/lib/fechamento/consolidado.ts)
// e os dois auxiliares novos de prazo.ts (próximo dia útil, rótulo D±n).
//
// O que este teste protege:
//   • a célula da grade mostra o PIOR status do dia, e o cliente atrasado sobe;
//   • pontualidade sem entrega é NULL, não zero; "não se aplica" não conta;
//   • carga soma TODOS os clientes da mesma pessoa e ignora o que já foi entregue;
//   • o aviso conta só PENDENTE (parcial não alarma) e separa atrasado/hoje/amanhã;
//   • o "amanhã" de uma sexta é a segunda (e pula feriado).
//
//   TZ=America/Sao_Paulo node --experimental-strip-types supabase/testes/fechamento-consolidado.mjs

import { grade, pontualidade, carga, avisos, cartaoAvisos } from "./consolidado.ts";
import { proximoDiaUtil, rotuloDia } from "./prazo.ts";

let falhas = 0;
const t = (nome, obtido, esperado) => {
  const ok = Object.is(obtido, esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "  ✓" : "  ✗"} ${nome.padEnd(60)} ${obtido}${ok ? "" : ` (esperado ${esperado})`}`);
};

const F = new Set(["2026-10-12", "2026-11-02"]);
const it = (cliente, data, situacao, status, extra = {}) => ({
  cliente, area: "Fiscal", responsavel: "Ana", data_prevista: data, data_entrega: null,
  situacao, horas_previstas: null, status, ...extra,
});

console.log("── Dias ──");
t("próximo útil de uma sexta é a segunda", proximoDiaUtil("2026-10-09", F), "2026-10-13"); // 12 é feriado
t("próximo útil de uma terça", proximoDiaUtil("2026-10-13", F), "2026-10-14");
t("D+5 de setembro", rotuloDia("2026-10-07", "2026-09", F), "D+5");
t("D-1 = último útil de setembro", rotuloDia("2026-09-30", "2026-09", F), "D-1");
t("sábado leva o número do útil anterior (09/10 = 7º útil)", rotuloDia("2026-10-10", "2026-09", F), "D+7");
t("data longe fica sem rótulo", rotuloDia("2027-01-29", "2026-09", F), null);

console.log("── Grade ──");
const itens = [
  it("Headset", "2026-10-05", "ENTREGUE", "NO_PRAZO"),
  it("Headset", "2026-10-05", "PENDENTE", "ATRASADO"),
  it("Affix", "2026-10-05", "ENTREGUE", "NO_PRAZO"),
  it("Affix", "2026-10-07", "PENDENTE", "A_VENCER"),
  it("RQ", "2026-10-07", "PARCIAL", "PARCIAL"),
  it("RQ", "2026-10-07", "NAO_SE_APLICA", "NAO_SE_APLICA"),
];
const g = grade(itens);
t("colunas = dias com item, em ordem", g.dias.join(","), "2026-10-05,2026-10-07");
t("cliente atrasado vem primeiro", g.linhas[0].cliente, "Headset");
t("célula com entregue + atrasado mostra ATRASADO", g.linhas[0].celulas["2026-10-05"].pior, "ATRASADO");
t("célula conta os abertos", g.linhas[0].celulas["2026-10-05"].abertos, 1);
t("parcial é o pior do dia quando não há pendente", g.linhas.find((l) => l.cliente === "RQ").celulas["2026-10-07"].pior, "PARCIAL");

console.log("── Pontualidade ──");
const pont = [
  it("Affix", "2026-10-05", "ENTREGUE", "NO_PRAZO"),
  it("Affix", "2026-10-05", "ENTREGUE", "NO_PRAZO"),
  it("Affix", "2026-10-06", "ENTREGUE", "ENTREGUE_COM_ATRASO"),
  it("Headset", "2026-10-06", "PENDENTE", "ATRASADO"),
  it("Headset", "2026-10-06", "NAO_SE_APLICA", "NAO_SE_APLICA"),
];
const p = pontualidade(pont, (i) => i.cliente);
const pa = p.find((x) => x.chave === "Affix"), ph = p.find((x) => x.chave === "Headset");
t("Affix: 2 de 3 no prazo = 66,7%", pa.pct, 66.7);
t("Headset sem entrega: pct NULL, não zero", ph.pct, null);
t("não se aplica fica fora da conta", ph.itens, 1);
t("quem tem atrasado aberto vem primeiro", p[0].chave, "Headset");

console.log("── Carga ──");
const cg = carga([
  it("Affix", "2026-10-06", "PENDENTE", "A_VENCER", { horas_previstas: 5 }),
  it("Headset", "2026-10-06", "PENDENTE", "A_VENCER", { horas_previstas: 4 }),
  it("RQ", "2026-10-06", "ENTREGUE", "NO_PRAZO", { horas_previstas: 6 }),
  it("RQ", "2026-10-07", "PENDENTE", "A_VENCER", { horas_previstas: null }),
]);
t("soma dois clientes no mesmo dia (entregue fora)", cg.linhas[0].porDia["2026-10-06"], 9);
t("9h passa do limite de 8h", cg.linhas[0].diasAcima, 1);
t("conta quem está sem hora prevista", cg.semHoras, 1);

console.log("── Avisos ──");
const av = avisos([
  it("Affix", "2026-10-05", "PENDENTE", "ATRASADO"),
  it("Affix", "2026-10-13", "PENDENTE", "VENCE_HOJE"),
  it("Headset", "2026-10-14", "PENDENTE", "A_VENCER"),
  it("Headset", "2026-10-15", "PENDENTE", "A_VENCER"),
  it("RQ", "2026-10-05", "PARCIAL", "PARCIAL"),
], "2026-10-13", "2026-10-14");
t("total: 1 atrasado + 1 hoje + 1 amanhã", av.total, 3);
t("depois de amanhã não entra", av.clientes.find((c) => c.cliente === "Headset").proximo, 1);
t("parcial não alarma", av.clientes.some((c) => c.cliente === "RQ"), false);
const card = JSON.stringify(cartaoAvisos(av, "https://portal-florida.vercel.app", "13/10/2026"));
t("cartão aponta para o painel", card.includes("portal-florida.vercel.app/fechamento/painel"), true);
t("cartão não leva nome de pessoa", card.includes("Ana"), false);

if (falhas) { console.log(`\n✗ ${falhas} falha(s)`); process.exit(1); }
console.log("\n✓ visão consolidada do fechamento");
