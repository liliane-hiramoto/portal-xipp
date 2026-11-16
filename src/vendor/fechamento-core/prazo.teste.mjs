// Motor do cronograma de fechamento (src/lib/fechamento/prazo.ts, 0156).
//
// O que este teste protege:
//   • as três regras do Affix dão a MESMA data que o motor do Affix daria
//     (Nº dia útil, n úteis após o dia 15, última sexta) — é ele que fica canônico;
//   • dia fixo ANTECIPA ou POSTERGA quando cai sem expediente, e o feriado conta;
//   • DU_ANTES é relativo à virada da COMPETÊNCIA (D-1 = último útil do próprio mês);
//   • dezembro é cobrado em JANEIRO do ano seguinte;
//   • o status é derivado: vence hoje, atrasado, entregue com atraso.
//
//   TZ=America/Sao_Paulo node --experimental-strip-types supabase/testes/fechamento-prazo.mjs

import {
  dataPrevista, datasPrevistas, valeNaCompetencia, statusDe, descreverPrazo,
} from "./prazo.ts";

let falhas = 0;
const t = (nome, obtido, esperado) => {
  const ok = Object.is(obtido, esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "  ✓" : "  ✗"} ${nome.padEnd(62)} ${obtido}${ok ? "" : ` (esperado ${esperado})`}`);
};

// Feriados nacionais que caem no recorte do teste (out/2026 a jan/2027).
const F = new Set(["2026-09-07", "2026-10-12", "2026-11-02", "2026-11-15", "2026-11-20", "2026-12-25", "2027-01-01"]);
const C = "2026-09"; // competência setembro → prazos contados em OUTUBRO

console.log(`── Prazos, fuso ${process.env.TZ ?? "(do sistema)"} ──`);
// Outubro/2026: 01 é quinta, 12 (segunda) é feriado.
t("5º dia útil de out (o fechamento D+5)", dataPrevista(C, { regra: "DU", n: 5 }, F), "2026-10-07");
t("5º dia útil com sábado útil (salário)", dataPrevista(C, { regra: "DU", n: 5, sabadoUtil: true }, F), "2026-10-06");
t("DU_ANTES 3 = D-3 da virada de setembro", dataPrevista(C, { regra: "DU_ANTES", n: 3 }, F), "2026-09-28");
t("DU_ANTES 1 = último útil da competência", dataPrevista(C, { regra: "DU_ANTES", n: 1 }, F), "2026-09-30");
t("último dia útil de out (31 é sábado)", dataPrevista(C, { regra: "ULTIMO_DU" }, F), "2026-10-30");
t("último dia útil do MESMO mês (pró-labore)", dataPrevista(C, { regra: "ULTIMO_DU", mesReferencia: "MESMO" }, F), "2026-09-30");
t("dia 10 cai no sábado → antecipa para sexta", dataPrevista(C, { regra: "DIA_FIXO", dia: 10 }, F), "2026-10-09");
t("dia 10 posterga → pula o feriado de 12/10", dataPrevista(C, { regra: "DIA_FIXO", dia: 10, ajuste: "POSTERGA" }, F), "2026-10-13");
t("dia 10 sem ajuste fica no sábado", dataPrevista(C, { regra: "DIA_FIXO", dia: 10, ajuste: "NENHUM" }, F), "2026-10-10");
t("dia 31 em novembro vira 30", dataPrevista("2026-10", { regra: "DIA_FIXO", dia: 31 }, F), "2026-11-30");
t("dia 20 de nov (feriado, sexta) antecipa", dataPrevista("2026-10", { regra: "DIA_FIXO", dia: 20 }, F), "2026-11-19");
t("Affix: 2º dia útil após o dia 15", dataPrevista(C, { regra: "DU_APOS_DIA", n: 2, dia: 15 }, F), "2026-10-19");
t("Affix: última sexta do mês", dataPrevista(C, { regra: "ULTIMA_SEMANA", diaSemana: 5 }, F), "2026-10-30");
t("última sexta de dez é Natal → antecipa para quinta", dataPrevista("2026-11", { regra: "ULTIMA_SEMANA", diaSemana: 5 }, F), "2026-12-24");

console.log("── Rotina (0223): várias datas no mês de TRABALHO ──");
// Competência out/2026 → trabalho em NOVEMBRO (02, 15 e 20 são feriados).
const sext = datasPrevistas("2026-10", { regra: "SEMANAL", diaSemana: 5 }, F).join(",");
t("semanal toda sexta de nov (20/11 feriado → 19/11)", sext, "2026-11-06,2026-11-13,2026-11-19,2026-11-27");
const diaria = datasPrevistas("2026-10", { regra: "DIARIA" }, F);
t("diária: todo dia útil de nov (19)", diaria.length, 19);
t("diária começa em 03/11 (02 é Finados)", diaria[0], "2026-11-03");
t("diária não tem sábado, domingo nem feriado", diaria.some((d) => ["2026-11-02", "2026-11-07", "2026-11-20"].includes(d)), false);
t("quinzenal: dia 15 (domingo) antecipa e último útil", datasPrevistas("2026-10", { regra: "QUINZENAL", dia: 15 }, F).join(","), "2026-11-13,2026-11-30");
t("semanal de dez: Natal antecipa para 24/12", datasPrevistas("2026-11", { regra: "SEMANAL", diaSemana: 5 }, F).join(","), "2026-12-04,2026-12-11,2026-12-18,2026-12-24");
t("dezembro→janeiro: sexta 01/01 feriado posterga (não cai em dez)", datasPrevistas("2026-12", { regra: "SEMANAL", diaSemana: 5 }, F)[0], "2027-01-04");
t("fechamento continua com UMA data", datasPrevistas("2026-10", { regra: "DU", n: 5 }, F).join(","), "2026-11-09");
t("dataPrevista da rotina = a primeira", dataPrevista("2026-10", { regra: "SEMANAL", diaSemana: 5 }, F), "2026-11-06");
t("descrição da rotina semanal", descreverPrazo({ regra: "SEMANAL", diaSemana: 5 }), "rotina: toda sexta");
t("dezembro é cobrado em janeiro (1º útil, 01/01 feriado)", dataPrevista("2026-12", { regra: "DU", n: 1 }, F), "2027-01-04");
t("mês sem n dias úteis devolve o último", dataPrevista(C, { regra: "DU", n: 40 }, F), "2026-10-30");

console.log("── Periodicidade ──");
t("sem meses = todo mês", valeNaCompetencia(null, "2026-05"), true);
t("trimestral (3,6,9,12) vale em setembro", valeNaCompetencia([3, 6, 9, 12], "2026-09"), true);
t("trimestral não vale em outubro", valeNaCompetencia([3, 6, 9, 12], "2026-10"), false);

console.log("── Status ──");
const o = (situacao, data_entrega = null) => ({ situacao, data_prevista: "2026-10-07", data_entrega });
t("pendente antes do prazo", statusDe(o("PENDENTE"), "2026-10-06"), "A_VENCER");
t("pendente no dia", statusDe(o("PENDENTE"), "2026-10-07"), "VENCE_HOJE");
t("pendente depois do prazo", statusDe(o("PENDENTE"), "2026-10-08"), "ATRASADO");
t("entregue no dia", statusDe(o("ENTREGUE", "2026-10-07"), "2026-10-20"), "NO_PRAZO");
t("entregue depois", statusDe(o("ENTREGUE", "2026-10-09"), "2026-10-20"), "ENTREGUE_COM_ATRASO");
t("parcial não alerta mesmo vencido", statusDe(o("PARCIAL"), "2026-10-20"), "PARCIAL");
t("não se aplica", statusDe(o("NAO_SE_APLICA"), "2026-10-20"), "NAO_SE_APLICA");

console.log("── Descrição ──");
t("descreve dia fixo", descreverPrazo({ regra: "DIA_FIXO", dia: 5 }), "dia 05, antecipa");
t("descreve DU", descreverPrazo({ regra: "DU", n: 3 }), "3º dia útil");

if (falhas) { console.log(`\n✗ ${falhas} falha(s)`); process.exit(1); }
console.log("\n✓ motor do cronograma de fechamento");
