// Visão consolidada do cronograma de fechamento (fase 2) — todos os clientes.
//
// Puro e SEM imports (o teste supabase/testes/fechamento-consolidado.mjs roda
// em node puro). Quem chama já derivou o `status` de cada item com statusDe()
// de prazo.ts — a regra do status existe num lugar só.
//
// Quatro leituras, todas sobre a MESMA lista de itens:
//   grade        cliente × dia previsto, a célula com o pior status do dia;
//   pontualidade % entregue no prazo por cliente, área ou responsável;
//   carga        horas previstas por responsável × dia (todos os clientes juntos);
//   avisos       o que pede ação hoje: atrasado, vence hoje, vence no próximo útil.

export type StatusC =
  | "NO_PRAZO" | "ENTREGUE_COM_ATRASO" | "PARCIAL" | "NAO_SE_APLICA"
  | "VENCE_HOJE" | "ATRASADO" | "A_VENCER";

export interface ItemC {
  cliente: string;
  area: string;
  responsavel: string;
  data_prevista: string;
  data_entrega: string | null;
  situacao: "PENDENTE" | "ENTREGUE" | "PARCIAL" | "NAO_SE_APLICA";
  horas_previstas: number | null;
  status: StatusC;
}

/** Do mais grave ao menos grave: a célula da grade mostra o primeiro que aparecer. */
export const GRAVIDADE: StatusC[] = [
  "ATRASADO", "VENCE_HOJE", "A_VENCER", "PARCIAL", "ENTREGUE_COM_ATRASO", "NO_PRAZO", "NAO_SE_APLICA",
];

export interface Celula { total: number; abertos: number; pior: StatusC }
export interface LinhaGrade { cliente: string; celulas: Record<string, Celula>; abertos: number; atrasados: number }

/** Grade cliente × dia. Colunas = os dias em que há item, em ordem. */
export function grade(itens: ItemC[]): { dias: string[]; linhas: LinhaGrade[] } {
  const dias = [...new Set(itens.map((i) => i.data_prevista))].sort();
  const porCliente = new Map<string, LinhaGrade>();
  for (const i of itens) {
    let l = porCliente.get(i.cliente);
    if (!l) { l = { cliente: i.cliente, celulas: {}, abertos: 0, atrasados: 0 }; porCliente.set(i.cliente, l); }
    const aberto = i.situacao === "PENDENTE" || i.situacao === "PARCIAL";
    const c = l.celulas[i.data_prevista] ?? { total: 0, abertos: 0, pior: "NAO_SE_APLICA" as StatusC };
    c.total++;
    if (aberto) c.abertos++;
    if (GRAVIDADE.indexOf(i.status) < GRAVIDADE.indexOf(c.pior)) c.pior = i.status;
    l.celulas[i.data_prevista] = c;
    if (aberto) l.abertos++;
    if (i.status === "ATRASADO") l.atrasados++;
  }
  // Quem está atrasado aparece primeiro: é por onde a leitura começa.
  const linhas = [...porCliente.values()].sort((a, b) =>
    b.atrasados - a.atrasados || b.abertos - a.abertos || a.cliente.localeCompare(b.cliente));
  return { dias, linhas };
}

export interface Pontualidade {
  chave: string;
  itens: number;
  entregues: number;
  noPrazo: number;
  comAtraso: number;
  atrasadosAbertos: number;
  /** % das ENTREGUES que saíram no prazo. Null sem entrega — zero diria "tudo atrasou". */
  pct: number | null;
}

/** Pontualidade agrupada pela chave escolhida. "Não se aplica" fica fora da conta. */
export function pontualidade(itens: ItemC[], chave: (i: ItemC) => string): Pontualidade[] {
  const m = new Map<string, Pontualidade>();
  for (const i of itens) {
    if (i.situacao === "NAO_SE_APLICA") continue;
    const k = chave(i);
    const p = m.get(k) ?? { chave: k, itens: 0, entregues: 0, noPrazo: 0, comAtraso: 0, atrasadosAbertos: 0, pct: null };
    p.itens++;
    if (i.situacao === "ENTREGUE") {
      p.entregues++;
      if (i.status === "NO_PRAZO") p.noPrazo++; else p.comAtraso++;
    }
    if (i.status === "ATRASADO") p.atrasadosAbertos++;
    m.set(k, p);
  }
  return [...m.values()]
    .map((p) => ({ ...p, pct: p.entregues ? Math.round((1000 * p.noPrazo) / p.entregues) / 10 : null }))
    .sort((a, b) => b.atrasadosAbertos - a.atrasadosAbertos || (a.pct ?? 101) - (b.pct ?? 101) || a.chave.localeCompare(b.chave));
}

export interface LinhaCarga { responsavel: string; porDia: Record<string, number>; total: number; diasAcima: number }

/**
 * Horas previstas por responsável × dia, somando TODOS os clientes — é aqui que
 * o pico do D+3 aparece. Conta o que ainda está por fazer (pendente/parcial):
 * o que já foi entregue não pesa mais na agenda de ninguém.
 */
export function carga(itens: ItemC[], limiteDia = 8): { dias: string[]; linhas: LinhaCarga[]; semHoras: number } {
  const abertos = itens.filter((i) => i.situacao === "PENDENTE" || i.situacao === "PARCIAL");
  const semHoras = abertos.filter((i) => !i.horas_previstas).length;
  const dias = [...new Set(abertos.filter((i) => i.horas_previstas).map((i) => i.data_prevista))].sort();
  const m = new Map<string, LinhaCarga>();
  for (const i of abertos) {
    const h = Number(i.horas_previstas ?? 0);
    if (!h) continue;
    const l = m.get(i.responsavel) ?? { responsavel: i.responsavel, porDia: {}, total: 0, diasAcima: 0 };
    l.porDia[i.data_prevista] = (l.porDia[i.data_prevista] ?? 0) + h;
    l.total += h;
    m.set(i.responsavel, l);
  }
  const linhas = [...m.values()].map((l) => ({
    ...l, diasAcima: Object.values(l.porDia).filter((h) => h > limiteDia).length,
  })).sort((a, b) => b.diasAcima - a.diasAcima || b.total - a.total || a.responsavel.localeCompare(b.responsavel));
  return { dias, linhas, semHoras };
}

export interface AvisoCliente { cliente: string; atrasados: number; hoje: number; proximo: number }

/**
 * O que pede ação: atrasado, vence hoje e vence no próximo dia útil (o aviso da
 * véspera). Só PENDENTE — parcial é informação, não alarme (regra do Affix).
 * Por CLIENTE e em contagem: o aviso vai para o Teams e não leva nome de pessoa.
 */
export function avisos(itens: ItemC[], hoje: string, proximoUtil: string): { total: number; clientes: AvisoCliente[] } {
  const m = new Map<string, AvisoCliente>();
  for (const i of itens) {
    if (i.situacao !== "PENDENTE") continue;
    const a = m.get(i.cliente) ?? { cliente: i.cliente, atrasados: 0, hoje: 0, proximo: 0 };
    if (i.data_prevista < hoje) a.atrasados++;
    else if (i.data_prevista === hoje) a.hoje++;
    else if (i.data_prevista === proximoUtil) a.proximo++;
    else continue;
    m.set(i.cliente, a);
  }
  const clientes = [...m.values()].sort((a, b) =>
    b.atrasados - a.atrasados || b.hoje - a.hoje || b.proximo - a.proximo || a.cliente.localeCompare(b.cliente));
  return { total: clientes.reduce((s, c) => s + c.atrasados + c.hoje + c.proximo, 0), clientes };
}

/** Cartão adaptativo do Teams com o resumo dos avisos (só contagens, sem pessoa). */
export function cartaoAvisos(r: { total: number; clientes: AvisoCliente[] }, base: string, hojeBR: string, max = 12): Record<string, unknown> {
  const t = r.clientes.reduce((s, c) => ({ a: s.a + c.atrasados, h: s.h + c.hoje, p: s.p + c.proximo }), { a: 0, h: 0, p: 0 });
  const lista = r.clientes.slice(0, max);
  const corpo: Record<string, unknown>[] = [
    { type: "TextBlock", text: `Cronograma de fechamento — ${hojeBR}`, weight: "Bolder", size: "Medium", wrap: true },
    { type: "TextBlock", text: `${t.a} atrasado(s) · ${t.h} vence(m) hoje · ${t.p} vence(m) no próximo dia útil.`, wrap: true, spacing: "None" },
  ];
  if (lista.length) {
    corpo.push({
      type: "FactSet",
      facts: lista.map((c) => ({
        title: c.cliente,
        value: [c.atrasados && `${c.atrasados} atrasado(s)`, c.hoje && `${c.hoje} hoje`, c.proximo && `${c.proximo} amanhã`]
          .filter(Boolean).join(" · "),
      })),
    });
  }
  if (r.clientes.length > lista.length) {
    corpo.push({ type: "TextBlock", text: `E mais ${r.clientes.length - lista.length} cliente(s) na tela.`, wrap: true, isSubtle: true });
  }
  return {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard", version: "1.4", body: corpo,
    actions: [{ type: "Action.OpenUrl", title: "Abrir o cronograma", url: `${base}/fechamento/painel` }],
  };
}
