// As etapas de pagamento (etapas.ts): cadastro, geração do mês e as travas.
import {
  pagamentoPadrao, validarPagamento, diasUteisAntes, etapasDaLinha, conferirValor,
  aplicarEtapa, situacaoPelasEtapas, etapaDaVez, alertasDaLinha, docsFaltando,
} from "./etapas.ts";
import { linhasDoMes, feriadosDe, visaoDoMes, textoDaMudanca } from "./mes.ts";
import { validarAcao } from "./contrato.ts";

let falhas = 0;
const t = (nome, obtido, esperado) => {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`  ${ok ? "✓" : "✗"} ${nome}${ok ? "" : ` → ${JSON.stringify(obtido)} ≠ ${JSON.stringify(esperado)}`}`);
};
const fer = feriadosDe([2026]);

console.log("── cadastro ──");
const iss = pagamentoPadrao("TRIBUTO", "ISS");
t("tributo exige guia + apuração", iss.docs_exigidos, ["GUIA", "APURACAO"]);
t("cartão exige fatura", pagamentoPadrao("RECORRENTE", "CARTAO").docs_exigidos, ["FATURA"]);
t("luz exige boleto", pagamentoPadrao("RECORRENTE", "LUZ").docs_exigidos, ["BOLETO"]);
t("padrão é válido", validarPagamento(iss), null);
t("sem fluxo (null) é válido", validarPagamento(null), null);
t("tributo inventado", validarPagamento({ ...iss, item: "IPTU" }), "item inválido para tributo");
t("ISS como recorrente não", validarPagamento({ ...iss, categoria: "RECORRENTE" }), "item inválido para recorrente");
t("sem documento", validarPagamento({ ...iss, docs_exigidos: [] }), "informe ao menos um documento exigido");
t("etapa fora de ordem", validarPagamento({ ...iss, etapas: [iss.etapas[1], iss.etapas[0], iss.etapas[2], iss.etapas[3]] }), "as etapas são RECEBER, CONFERIR, PAGAR, CAIXA, nessa ordem");
t("responsável sem e-mail", validarPagamento({ ...iss, etapas: iss.etapas.map((e) => e.chave === "PAGAR" ? { ...e, responsavel_email: "Pri" } : e) }), "responsável de Pagar (remessa e retorno) deve ser um e-mail ou vazio");
t("caixa sem responsável", validarPagamento({ ...iss, etapas: iss.etapas.map((e) => e.chave === "CAIXA" ? { ...e, responsavel_email: "a@b.com" } : e) }), "a conferência de caixa é automática: sem responsável");
t("conferir antes de receber, não", validarPagamento({ ...iss, etapas: iss.etapas.map((e) => e.chave === "CONFERIR" ? { ...e, du_antes: 5 } : e) }), "o prazo de uma etapa não pode vir antes do da etapa anterior");

console.log("── prazos das etapas ──");
t("0 dias = o próprio dia", diasUteisAntes("2026-11-20", 0, fer), "2026-11-20");
t("1 dia útil antes da segunda = sexta", diasUteisAntes("2026-11-30", 1, fer), "2026-11-27");
t("pula o 20/11 (Consciência Negra, nacional)", diasUteisAntes("2026-11-23", 1, fer), "2026-11-19");
t("pula Finados (02/11)", diasUteisAntes("2026-11-03", 1, fer), "2026-10-30");
const resp = { RECEBER: "rec@x.com", CONFERIR: "conf@x.com", PAGAR: "pag@x.com", CAIXA: null };
const def = { ...iss, etapas: iss.etapas.map((e) => ({ ...e, responsavel_email: resp[e.chave] })) };
const et = etapasDaLinha(def, "2026-11-20", fer);
t("cada etapa com o seu responsável", et.map((e) => e.responsavel_email), ["rec@x.com", "conf@x.com", "pag@x.com", null]);
t("cada etapa com a sua data (3, 2, 1, 0 DU antes)", et.map((e) => e.data_prevista), ["2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"]);
t("receber copia os documentos exigidos", et[0].docs_exigidos, ["GUIA", "APURACAO"]);
t("conferir leva a tolerância de R$ 1,00", et[1].tolerancia, 1);

console.log("── gerar o mês ──");
const atv = { id: 9, empresa_cnpj: "12345678000190", ordem: 1, atividade: "ISS", descricao: null, area: "Fiscal",
  tipo: "PAGAMENTO", prazo_regra: "DIA_FIXO", prazo_n: null, prazo_dia: 20, prazo_dia_semana: null, ajuste: "ANTECIPA",
  sabado_util: false, mes_referencia: "SEGUINTE", meses: null, responsavel_email: null, depende_de: null, modelo_id: null,
  pagamento: def, ativo: true };
const [linha] = linhasDoMes([atv], "2026-10");
t("a linha do mês leva as etapas", linha.etapas?.map((e) => e.chave), ["RECEBER", "CONFERIR", "PAGAR", "CAIXA"]);
t("atividade comum não ganha etapas", "etapas" in linhasDoMes([{ ...atv, tipo: "ATIVIDADE", pagamento: null }], "2026-10")[0], false);
t("pagamento sem fluxo não ganha etapas", "etapas" in linhasDoMes([{ ...atv, pagamento: null }], "2026-10")[0], false);

const vis = visaoDoMes({ competencia: "2026-10", hoje: "2026-11-10", ocorrencias: [{ ...linha, id: 1, situacao: "PENDENTE", data_entrega: null, hora_inicio: null, hora_fim: null, atualizado_em: "" }], comentarios: [], empresas: new Map(), pessoas: new Map() });
t("a tela recebe as etapas", vis.itens[0].etapas?.length, 4);
t("histórico da etapa", textoDaMudanca({ tipo: "etapa", chave: "CONFERIR", situacao: "DIVERGENTE", obs: null }), "Etapa Conferir valor: DIVERGENTE");

console.log("── conferir valor ──");
t("R$ 1,00 de diferença confere", conferirValor(101, 100), { confere: true, diferenca: 1 });
t("R$ 1,01 não confere", conferirValor(101.01, 100), { confere: false, diferenca: 1.01 });
t("a menor também conta", conferirValor(98.5, 100), { confere: false, diferenca: -1.5 });
t("centavo flutuante não engana", conferirValor(0.1 + 0.2, 0.3, 0), { confere: true, diferenca: 0 });
t("documentos faltando", docsFaltando(["GUIA", "APURACAO"], ["GUIA"]), ["APURACAO"]);

console.log("── as travas ──");
const hoje = "2026-11-18";
let r = aplicarEtapa(et, { chave: "CONFERIR", situacao: "FEITA" }, "a@x.com", hoje);
t("não confere antes de receber", r.ok ? "passou" : r.erro, "feche antes: Receber documentos");
r = aplicarEtapa(et, { chave: "RECEBER", situacao: "FEITA", docs_recebidos: ["GUIA"] }, "a@x.com", hoje);
t("receber sem a apuração não fecha", r.ok ? "passou" : r.erro, "faltam documentos: Apuração");
r = aplicarEtapa(et, { chave: "RECEBER", situacao: "FEITA", docs_recebidos: ["GUIA", "APURACAO"] }, "rec@x.com", hoje);
t("receber com os dois fecha", [r.ok, r.etapas?.[0].situacao, r.etapas?.[0].feita_em, r.etapas?.[0].feita_por], [true, "FEITA", hoje, "rec@x.com"]);
t("a linha fica parcial", r.situacao, "PARCIAL");
let e1 = r.etapas;
t("a da vez é conferir", etapaDaVez(e1)?.chave, "CONFERIR");
r = aplicarEtapa(e1, { chave: "CONFERIR", situacao: "FEITA" }, "conf@x.com", hoje);
t("conferir sem valores não fecha", r.ok ? "passou" : r.erro, "informe o valor do documento e o previsto");
r = aplicarEtapa(e1, { chave: "CONFERIR", situacao: "FEITA", valor_documento: 1250, valor_previsto: 1200 }, "conf@x.com", hoje);
t("diferença acima de R$ 1,00 vira DIVERGENTE", [r.ok, r.etapas?.[1].situacao, r.divergente], [true, "DIVERGENTE", true]);
t("o agente avisa a divergência", alertasDaLinha(r.etapas, hoje).map((a) => a.tipo + ":" + a.chave), ["DIVERGENTE:CONFERIR"]);
r = aplicarEtapa(r.etapas, { chave: "PAGAR", situacao: "FEITA", retorno_em: hoje }, "pag@x.com", hoje);
t("não paga o divergente", r.ok ? "passou" : r.erro, "feche antes: Conferir valor");
r = aplicarEtapa(e1, { chave: "CONFERIR", situacao: "FEITA", valor_documento: 1250, valor_previsto: 1200, obs: "multa de atraso, aprovada" }, "conf@x.com", hoje);
t("com a observação, a diferença é aceita", [r.etapas?.[1].situacao, r.divergente], ["FEITA", false]);
let e2 = r.etapas;
r = aplicarEtapa(e2, { chave: "PAGAR", situacao: "FEITA", remessa_em: hoje }, "pag@x.com", hoje);
t("pagar sem o retorno não fecha", r.ok ? "passou" : r.erro, "o pagamento fecha com o retorno do banco (ou uma observação dizendo por quê)");
r = aplicarEtapa(e2, { chave: "CAIXA", situacao: "FEITA" }, "x@x.com", hoje);
t("caixa antes do pagamento, não", r.ok ? "passou" : r.erro, "a conferência de caixa vem depois do pagamento");
r = aplicarEtapa(e2, { chave: "PAGAR", situacao: "FEITA", remessa_em: hoje, retorno_em: "2026-11-19" }, "pag@x.com", "2026-11-19");
t("com o retorno, a linha é ENTREGUE (o caixa não segura)", [r.ok, r.situacao], [true, "ENTREGUE"]);
let e3 = r.etapas;
r = aplicarEtapa(e3, { chave: "CONFERIR", situacao: "PENDENTE" }, "conf@x.com", hoje);
t("reabrir conferir reabre o pagamento", [r.etapas?.[1].situacao, r.etapas?.[2].situacao, r.situacao], ["PENDENTE", "PENDENTE", "PARCIAL"]);
t("tudo não se aplica = NAO_SE_APLICA", situacaoPelasEtapas(et.map((e) => ({ ...e, situacao: "NAO_SE_APLICA" }))), "NAO_SE_APLICA");

console.log("── o agente ──");
t("receber vencido = ATRASADA, com o responsável dele", alertasDaLinha(et, "2026-11-18"), [{ chave: "RECEBER", responsavel_email: "rec@x.com", tipo: "ATRASADA", data_prevista: "2026-11-17" }]);
t("no dia = VENCE_HOJE", alertasDaLinha(et, "2026-11-17").map((a) => a.tipo), ["VENCE_HOJE"]);
t("antes do prazo, nada", alertasDaLinha(et, "2026-11-16"), []);

console.log("── contrato ──");
const autor = { email: "tati@florida.com.br", nome: "Tati", origem: "florida" };
t("ação de etapa boa", validarAcao({ tipo: "etapa", id: 3, chave: "CONFERIR", situacao: "FEITA", valor_documento: 10, valor_previsto: 10, autor }), null);
t("etapa inventada", validarAcao({ tipo: "etapa", id: 3, chave: "APROVAR", situacao: "FEITA", autor }), "etapa inválida");
t("valor negativo", validarAcao({ tipo: "etapa", id: 3, chave: "CONFERIR", situacao: "FEITA", valor_documento: -1, autor }), "valor deve ser um número ≥ 0");
t("retorno com data ruim", validarAcao({ tipo: "etapa", id: 3, chave: "PAGAR", situacao: "FEITA", retorno_em: "19/11", autor }), "datas de remessa/retorno devem ser AAAA-MM-DD");
t("salvar atividade com fluxo inválido", validarAcao({ tipo: "salvar_atividade", atividade: { ...atv, pagamento: { ...def, docs_exigidos: [] } }, autor }), "informe ao menos um documento exigido");
t("fluxo em atividade que não é pagamento", validarAcao({ tipo: "salvar_atividade", atividade: { ...atv, tipo: "OBRIGACAO" }, autor }), "etapas de pagamento só em atividade do tipo PAGAMENTO");
t("salvar atividade com fluxo bom", validarAcao({ tipo: "salvar_atividade", atividade: atv, autor }), null);

if (falhas) { console.log(`\n✗ ${falhas} falha(s)`); process.exit(1); }
