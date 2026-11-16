// Etapas de uma atividade de PAGAMENTO (plano aprovado em 13/11/2026 —
// docs/PLANO-PAGAMENTOS-E-NFSE.md no Portal Flórida).
//
// Uma atividade, quatro etapas, cada uma com o SEU responsável e o SEU prazo:
//   RECEBER  — chegaram os documentos exigidos (tributo: guia + apuração)
//   CONFERIR — o valor do documento bate com o previsto (tolerância R$ 1,00)
//   PAGAR    — remessa ao banco e o ARQUIVO RETORNO confirmando o pagamento
//   CAIXA    — a baixa pelo extrato: só a conferência de caixa, pós-pagamento
//
// A definição mora na atividade (`pagamento`, jsonb); o estado de cada mês, na
// ocorrência (`etapas`, jsonb) — com o responsável e a data COPIADOS na hora de
// gerar, como já se faz com o responsável da linha: mudar o cadastro não
// reescreve o mês que já passou.
//
// Puro, sem runtime de fora: roda no navegador, no servidor e no teste.

import { ehUtil, type Situacao } from "./prazo";

export type EtapaChave = "RECEBER" | "CONFERIR" | "PAGAR" | "CAIXA";
export const ETAPAS: readonly EtapaChave[] = ["RECEBER", "CONFERIR", "PAGAR", "CAIXA"];
export const ETAPA_NOME: Record<EtapaChave, string> = {
  RECEBER: "Receber documentos",
  CONFERIR: "Conferir valor",
  PAGAR: "Pagar (remessa e retorno)",
  CAIXA: "Conferência de caixa",
};

export type DocTipo = "GUIA" | "APURACAO" | "BOLETO" | "FATURA" | "OUTRO";
export const DOCS: readonly DocTipo[] = ["GUIA", "APURACAO", "BOLETO", "FATURA", "OUTRO"];
export const DOC_NOME: Record<DocTipo, string> = {
  GUIA: "Guia", APURACAO: "Apuração", BOLETO: "Boleto", FATURA: "Fatura", OUTRO: "Outro",
};

export type CategoriaPagamento = "TRIBUTO" | "RECORRENTE";
export const TRIBUTOS = ["ISS", "PIS", "COFINS", "IRPJ", "CSLL"] as const;
export const RECORRENTES = ["ALUGUEL", "AGUA", "LUZ", "TELEFONE", "INTERNET", "SISTEMAS", "CARTAO", "OUTROS"] as const;
export const ITEM_NOME: Record<string, string> = {
  ISS: "ISS", PIS: "PIS", COFINS: "COFINS", IRPJ: "IRPJ", CSLL: "CSLL",
  ALUGUEL: "Aluguel", AGUA: "Água", LUZ: "Luz", TELEFONE: "Telefone", INTERNET: "Internet",
  SISTEMAS: "Sistemas", CARTAO: "Cartão de crédito", OUTROS: "Outros",
};

/** A tolerância que ela decidiu (13/11/2026): até R$ 1,00 de diferença confere. */
export const TOLERANCIA_PADRAO = 1;

/** Etapa no CADASTRO da atividade. Prazo = dias úteis ANTES da data prevista
 *  da linha (o vencimento); 0 = no próprio dia. CAIXA não tem responsável: é
 *  automática, pelo extrato. */
export interface EtapaDef {
  chave: EtapaChave;
  responsavel_email: string | null;
  du_antes: number;
}

export interface PagamentoDef {
  categoria: CategoriaPagamento;
  /** ISS, PIS… (tributo) ou ALUGUEL, LUZ… (recorrente). */
  item: string;
  docs_exigidos: DocTipo[];
  etapas: EtapaDef[];
  /** Em reais; ausente = TOLERANCIA_PADRAO. */
  tolerancia?: number;
}

export type SituacaoEtapa = "PENDENTE" | "FEITA" | "DIVERGENTE" | "NAO_SE_APLICA";
export const SITUACOES_ETAPA: readonly SituacaoEtapa[] = ["PENDENTE", "FEITA", "DIVERGENTE", "NAO_SE_APLICA"];

/** Etapa NA LINHA DO MÊS: o que foi copiado do cadastro + o que aconteceu. */
export interface EtapaOcorrencia {
  chave: EtapaChave;
  responsavel_email: string | null;
  data_prevista: string;              // AAAA-MM-DD
  situacao: SituacaoEtapa;
  feita_em: string | null;            // AAAA-MM-DD
  feita_por: string | null;           // e-mail
  obs: string | null;
  /** RECEBER: o que se exige (copiado) e o que chegou. */
  docs_exigidos?: DocTipo[];
  docs_recebidos?: DocTipo[];
  /** CONFERIR: o valor do documento e o previsto (CP/FC/cálculo do portal). */
  valor_documento?: number | null;
  valor_previsto?: number | null;
  tolerancia?: number;
  /** PAGAR: quando a remessa foi ao banco e quando o retorno confirmou. */
  remessa_em?: string | null;
  retorno_em?: string | null;
}

// ── Cadastro ──

export function pagamentoPadrao(categoria: CategoriaPagamento, item: string): PagamentoDef {
  const docs: DocTipo[] = categoria === "TRIBUTO" ? ["GUIA", "APURACAO"] : item === "CARTAO" ? ["FATURA"] : ["BOLETO"];
  return {
    categoria, item, docs_exigidos: docs,
    etapas: [
      { chave: "RECEBER", responsavel_email: null, du_antes: 3 },
      { chave: "CONFERIR", responsavel_email: null, du_antes: 2 },
      { chave: "PAGAR", responsavel_email: null, du_antes: 1 },
      { chave: "CAIXA", responsavel_email: null, du_antes: 0 },
    ],
  };
}

const email = (s: unknown) => s === null || (typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));

/** Confere a definição ANTES de gravar. Devolve o erro em português, ou null. */
export function validarPagamento(p: unknown): string | null {
  if (p === null || p === undefined) return null;   // atividade sem fluxo de pagamento
  if (typeof p !== "object") return "pagamento deve ser um objeto";
  const x = p as Record<string, unknown>;
  if (x.categoria !== "TRIBUTO" && x.categoria !== "RECORRENTE") return "categoria deve ser TRIBUTO ou RECORRENTE";
  const lista: readonly string[] = x.categoria === "TRIBUTO" ? TRIBUTOS : RECORRENTES;
  if (!lista.includes(x.item as string)) return `item inválido para ${x.categoria === "TRIBUTO" ? "tributo" : "recorrente"}`;
  if (!Array.isArray(x.docs_exigidos) || !x.docs_exigidos.length) return "informe ao menos um documento exigido";
  if (x.docs_exigidos.some((d) => !DOCS.includes(d as DocTipo))) return "documento exigido inválido";
  if (new Set(x.docs_exigidos).size !== x.docs_exigidos.length) return "documento exigido repetido";
  if (x.tolerancia !== undefined && !(typeof x.tolerancia === "number" && x.tolerancia >= 0 && x.tolerancia <= 1000)) return "tolerância deve ser um valor entre 0 e 1000";
  if (!Array.isArray(x.etapas)) return "etapas deve ser uma lista";
  const chaves = x.etapas.map((e) => (e as EtapaDef)?.chave);
  if (JSON.stringify(chaves) !== JSON.stringify(ETAPAS)) return `as etapas são ${ETAPAS.join(", ")}, nessa ordem`;
  for (const e of x.etapas as EtapaDef[]) {
    if (!email(e.responsavel_email)) return `responsável de ${ETAPA_NOME[e.chave]} deve ser um e-mail ou vazio`;
    if (e.chave === "CAIXA" && e.responsavel_email) return "a conferência de caixa é automática: sem responsável";
    if (!Number.isInteger(e.du_antes) || e.du_antes < 0 || e.du_antes > 20) return `prazo de ${ETAPA_NOME[e.chave]}: de 0 a 20 dias úteis antes`;
  }
  // A ordem dos prazos acompanha a ordem das etapas (receber antes de conferir…).
  const prazos = (x.etapas as EtapaDef[]).filter((e) => e.chave !== "CAIXA").map((e) => e.du_antes);
  if (prazos.some((n, i) => i > 0 && n > prazos[i - 1])) return "o prazo de uma etapa não pode vir antes do da etapa anterior";
  return null;
}

// ── Gerar o mês ──

const DIA = 86_400_000;
const soma = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DIA).toISOString().slice(0, 10);

/** n dias úteis antes de `ymd` (0 = o próprio dia). */
export function diasUteisAntes(ymd: string, n: number, feriados: Set<string>): string {
  let d = ymd, faltam = n;
  while (faltam > 0) { d = soma(d, -1); if (ehUtil(d, feriados)) faltam--; }
  return d;
}

/** As etapas da linha do mês, copiadas do cadastro. */
export function etapasDaLinha(p: PagamentoDef, dataPrevista: string, feriados: Set<string>): EtapaOcorrencia[] {
  return p.etapas.map((e) => ({
    chave: e.chave,
    responsavel_email: e.chave === "CAIXA" ? null : e.responsavel_email,
    data_prevista: diasUteisAntes(dataPrevista, e.du_antes, feriados),
    situacao: "PENDENTE" as SituacaoEtapa,
    feita_em: null, feita_por: null, obs: null,
    ...(e.chave === "RECEBER" ? { docs_exigidos: [...p.docs_exigidos], docs_recebidos: [] } : {}),
    ...(e.chave === "CONFERIR" ? { valor_documento: null, valor_previsto: null, tolerancia: p.tolerancia ?? TOLERANCIA_PADRAO } : {}),
    ...(e.chave === "PAGAR" ? { remessa_em: null, retorno_em: null } : {}),
  }));
}

// ── Regras da tela e do agente (uma conta só, nos dois lados) ──

export const docsFaltando = (exigidos: DocTipo[] = [], recebidos: DocTipo[] = []) => exigidos.filter((d) => !recebidos.includes(d));

const centavos = (v: number) => Math.round(v * 100);

/** Documento × previsto. Diferença em reais, positiva = o documento cobra MAIS. */
export function conferirValor(documento: number, previsto: number, tolerancia = TOLERANCIA_PADRAO): { confere: boolean; diferenca: number } {
  const dif = centavos(documento) - centavos(previsto);
  return { confere: Math.abs(dif) <= centavos(tolerancia), diferenca: dif / 100 };
}

const fechada = (e: EtapaOcorrencia) => e.situacao === "FEITA" || e.situacao === "NAO_SE_APLICA";

/** A primeira etapa ainda aberta (CAIXA não conta: é automática). */
export function etapaDaVez(etapas: EtapaOcorrencia[] | null | undefined): EtapaOcorrencia | null {
  return (etapas ?? []).find((e) => e.chave !== "CAIXA" && !fechada(e)) ?? null;
}

/** A situação da LINHA sai das etapas: entregue quando o pagamento foi
 *  confirmado pelo retorno do banco; a conferência de caixa vem depois e não
 *  segura a entrega. */
export function situacaoPelasEtapas(etapas: EtapaOcorrencia[]): Situacao {
  const sem = etapas.filter((e) => e.chave !== "CAIXA");
  if (!sem.length) return "PENDENTE";
  if (sem.every((e) => e.situacao === "NAO_SE_APLICA")) return "NAO_SE_APLICA";
  if (sem.every(fechada)) return "ENTREGUE";
  return sem.some((e) => e.situacao === "FEITA") ? "PARCIAL" : "PENDENTE";
}

export interface MudancaEtapa {
  chave: EtapaChave;
  situacao: SituacaoEtapa;
  obs?: string | null;
  docs_recebidos?: DocTipo[];
  valor_documento?: number | null;
  valor_previsto?: number | null;
  remessa_em?: string | null;
  retorno_em?: string | null;
}

/**
 * Aplica a mudança de UMA etapa e devolve as etapas novas e a situação da
 * linha — ou o erro em português. As travas:
 *  - uma etapa só fecha com as ANTERIORES fechadas (não se paga o que não se conferiu);
 *  - RECEBER só fecha com todos os documentos exigidos;
 *  - CONFERIR com diferença acima da tolerância vira DIVERGENTE — e só fecha
 *    como FEITA com a observação de quem aceitou a diferença;
 *  - PAGAR só fecha com o retorno do banco (ou observação dizendo por quê);
 *  - reabrir (PENDENTE) uma etapa reabre as seguintes.
 */
export function aplicarEtapa(
  etapas: EtapaOcorrencia[], m: MudancaEtapa, quem: string, hoje: string,
): { ok: true; etapas: EtapaOcorrencia[]; situacao: Situacao; divergente: boolean } | { ok: false; erro: string } {
  const i = etapas.findIndex((e) => e.chave === m.chave);
  if (i < 0) return { ok: false, erro: `a linha não tem a etapa ${m.chave}` };
  if (!SITUACOES_ETAPA.includes(m.situacao)) return { ok: false, erro: "situação da etapa inválida" };
  const obs = m.obs?.trim() || null;
  const atual: EtapaOcorrencia = { ...etapas[i] };
  if (m.docs_recebidos !== undefined) atual.docs_recebidos = [...new Set(m.docs_recebidos)];
  if (m.valor_documento !== undefined) atual.valor_documento = m.valor_documento;
  if (m.valor_previsto !== undefined) atual.valor_previsto = m.valor_previsto;
  if (m.remessa_em !== undefined) atual.remessa_em = m.remessa_em;
  if (m.retorno_em !== undefined) atual.retorno_em = m.retorno_em;
  if (m.obs !== undefined) atual.obs = obs;

  let situacao = m.situacao;
  let divergente = false;
  if (situacao === "FEITA") {
    const antes = etapas.slice(0, i).filter((e) => e.chave !== "CAIXA" && !fechada(e));
    if (m.chave !== "CAIXA" && antes.length) return { ok: false, erro: `feche antes: ${antes.map((e) => ETAPA_NOME[e.chave]).join(", ")}` };
    if (m.chave === "CAIXA" && !fechada(etapas.find((e) => e.chave === "PAGAR") ?? atual)) return { ok: false, erro: "a conferência de caixa vem depois do pagamento" };
    if (m.chave === "RECEBER") {
      const falta = docsFaltando(atual.docs_exigidos, atual.docs_recebidos);
      if (falta.length) return { ok: false, erro: `faltam documentos: ${falta.map((d) => DOC_NOME[d]).join(", ")}` };
    }
    if (m.chave === "CONFERIR") {
      if (atual.valor_documento == null || atual.valor_previsto == null) return { ok: false, erro: "informe o valor do documento e o previsto" };
      const c = conferirValor(atual.valor_documento, atual.valor_previsto, atual.tolerancia ?? TOLERANCIA_PADRAO);
      if (!c.confere && !obs) { situacao = "DIVERGENTE"; divergente = true; }
    }
    if (m.chave === "PAGAR" && !atual.retorno_em && !obs) return { ok: false, erro: "o pagamento fecha com o retorno do banco (ou uma observação dizendo por quê)" };
  }
  atual.situacao = situacao;
  atual.feita_em = situacao === "FEITA" ? hoje : null;
  atual.feita_por = situacao === "FEITA" || situacao === "DIVERGENTE" ? quem : null;

  const novas = etapas.map((e, k) => {
    if (k === i) return atual;
    // Reabrir uma etapa reabre as seguintes (menos as que não se aplicam).
    if (k > i && situacao === "PENDENTE" && e.situacao === "FEITA") return { ...e, situacao: "PENDENTE" as SituacaoEtapa, feita_em: null, feita_por: null };
    return e;
  });
  return { ok: true, etapas: novas, situacao: situacaoPelasEtapas(novas), divergente };
}

export type AlertaEtapa = { chave: EtapaChave; responsavel_email: string | null; tipo: "ATRASADA" | "VENCE_HOJE" | "DIVERGENTE"; data_prevista: string };

/** O que o agente cobra: a etapa da vez vencida ou vencendo, e a conferência divergente. */
export function alertasDaLinha(etapas: EtapaOcorrencia[] | null | undefined, hoje: string): AlertaEtapa[] {
  const out: AlertaEtapa[] = [];
  for (const e of etapas ?? []) {
    if (e.situacao === "DIVERGENTE") out.push({ chave: e.chave, responsavel_email: e.responsavel_email, tipo: "DIVERGENTE", data_prevista: e.data_prevista });
  }
  const vez = etapaDaVez(etapas);
  if (vez && vez.situacao === "PENDENTE") {
    if (vez.data_prevista < hoje) out.push({ chave: vez.chave, responsavel_email: vez.responsavel_email, tipo: "ATRASADA", data_prevista: vez.data_prevista });
    else if (vez.data_prevista === hoje) out.push({ chave: vez.chave, responsavel_email: vez.responsavel_email, tipo: "VENCE_HOJE", data_prevista: vez.data_prevista });
  }
  return out;
}
