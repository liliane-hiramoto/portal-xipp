// O mês do cronograma (mes.ts): gerar as linhas e a visão da tela.
import { feriadosNacionais, linhasDoMes, visaoDoMes, textoDaMudanca } from "./mes.ts";

let falhas = 0;
const t = (nome, obtido, esperado) => {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`  ${ok ? "✓" : "✗"} ${nome}${ok ? "" : ` → ${JSON.stringify(obtido)} ≠ ${JSON.stringify(esperado)}`}`);
};
const CNPJ = "12345678000190";
const base = { empresa_cnpj: CNPJ, ordem: 1, descricao: null, area: "Fiscal", tipo: "OBRIGACAO", prazo_n: null, prazo_dia: null,
  prazo_dia_semana: null, ajuste: "ANTECIPA", sabado_util: false, mes_referencia: "SEGUINTE", meses: null,
  responsavel_email: "tati@x.com", depende_de: null, modelo_id: null, ativo: true };

console.log("── feriados ──");
t("Páscoa 2026: Sexta-feira Santa 03/04", feriadosNacionais(2026).find((f) => f.nome === "Sexta-feira Santa").data, "2026-04-03");
t("13 datas", feriadosNacionais(2026).length, 13);

console.log("── linhasDoMes ──");
const ativ = [
  { ...base, id: 1, atividade: "DCTFWeb", prazo_regra: "DU", prazo_n: 5 },
  { ...base, id: 2, atividade: "Baixar extratos", prazo_regra: "DIARIA" },
  { ...base, id: 3, atividade: "Inativa", prazo_regra: "DU", prazo_n: 1, ativo: false },
  { ...base, id: 4, atividade: "Trimestral", prazo_regra: "DU", prazo_n: 1, meses: [3, 6, 9, 12] },
];
const l = linhasDoMes(ativ, "2026-10");
t("fechamento = uma linha (5º útil de novembro, depois de Finados)", l.filter((x) => x.atividade_id === 1).map((x) => x.data_prevista), ["2026-11-09"]);
t("rotina diária = um por dia útil de novembro (19)", l.filter((x) => x.atividade_id === 2).length, 19);
t("diária marcada como DIARIA", l.find((x) => x.atividade_id === 2).periodicidade, "DIARIA");
t("inativa fica fora", l.some((x) => x.atividade_id === 3), false);
t("trimestral fora em outubro", l.some((x) => x.atividade_id === 4), false);
t("trimestral entra em setembro", linhasDoMes(ativ, "2026-09").some((x) => x.atividade_id === 4), true);
t("leva o responsável", l[0].responsavel_email, "tati@x.com");

console.log("── visaoDoMes ──");
const oc = (o) => ({ atividade_id: 1, empresa_cnpj: CNPJ, ordem: 1, atividade: "X", area: "Fiscal", tipo: "OBRIGACAO",
  periodicidade: "MENSAL", responsavel_email: "TATI@x.com", depende_de: null, situacao: "PENDENTE", data_entrega: null,
  hora_inicio: null, hora_fim: null, atualizado_em: "x", ...o });
const v = visaoDoMes({
  competencia: "2026-10", hoje: "2026-11-09",
  ocorrencias: [
    oc({ id: 1, competencia: "2026-10", data_prevista: "2026-11-09" }),
    oc({ id: 2, competencia: "2026-10", data_prevista: "2026-11-06", situacao: "ENTREGUE", data_entrega: "2026-11-05" }),
    oc({ id: 3, competencia: "2026-10", data_prevista: "2026-11-03" }),
    oc({ id: 4, competencia: "2026-09", data_prevista: "2026-10-07" }),                                  // atrasado de antes
    oc({ id: 5, competencia: "2026-09", data_prevista: "2026-10-07", situacao: "ENTREGUE", data_entrega: "2026-10-07" }),
  ],
  comentarios: [
    { id: 2, ocorrencia_id: 1, tipo: "COMENTARIO", texto: "segundo", autor_email: "a@x", autor_nome: null, origem: "portal", criado_em: "2026-11-09T12:00:00Z" },
    { id: 1, ocorrencia_id: 1, tipo: "STATUS", texto: "primeiro", autor_email: null, autor_nome: "Pri", origem: "florida", criado_em: "2026-11-08T12:00:00Z" },
  ],
  empresas: new Map([[CNPJ, "IZII"]]), pessoas: new Map([["tati@x.com", "Tatiana"]]),
});
t("itens só da competência, por data", v.itens.map((i) => i.id), [3, 2, 1]);
t("atrasado de antes vem à parte; o entregue não", v.atrasadosAnteriores.map((i) => i.id), [4]);
t("resumo", v.resumo, { total: 3, entregues: 1, noPrazo: 1, atrasados: 1, venceHoje: 1 });
t("nome da empresa pelo CNPJ", v.itens[0].empresa, "IZII");
t("nome do responsável pelo e-mail, sem diferenciar maiúscula", v.itens[0].responsavel, "Tatiana");
t("comentários em ordem de tempo", v.itens[2].comentarios.map((c) => c.texto), ["primeiro", "segundo"]);
t("rótulo D+5", v.itens[2].rotulo, "D+5");

console.log("── textoDaMudanca ──");
t("situação com data", textoDaMudanca({ tipo: "situacao", situacao: "ENTREGUE", data_entrega: "2026-11-09" }), "Situação: Entregue em 09/11/2026");
t("pendente sem data", textoDaMudanca({ tipo: "situacao", situacao: "PENDENTE", data_entrega: null }), "Situação: Pendente");
t("responsável tirado", textoDaMudanca({ tipo: "responsavel", nome: null }), "Responsável: (ninguém)");

if (falhas) { console.log(`\n✗ ${falhas} falha(s)`); process.exit(1); }
console.log("\n✓ mês ok");
