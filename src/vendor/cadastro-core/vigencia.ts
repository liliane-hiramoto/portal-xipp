// TRIBUTAÇÃO POR PERÍODO — o regime e as alíquotas da empresa têm DATA.
//
// Veio do Portal Inexx (src/lib/tributacao.ts), o mais testado dos portais. O
// problema que ele resolve: com o regime num campo só, trocar o regime (sair do
// Simples, por exemplo) reescrevia o imposto de TODOS os meses anteriores,
// porque a DRE recalcula o histórico a cada abertura. O ano fechado mudava
// sozinho. Aqui a mudança tem data: Simples ATÉ dezembro, Presumido A PARTIR de
// janeiro.
//
// Genérica nas ALÍQUOTAS: cada portal guarda as suas (a Inexx das/iss/pis/
// cofins; o RQ presunção, irpj, csll…) — o que não é `inicio`, `fim` ou
// `regime` é alíquota, e é isso que o período novo herda do anterior.
//
// Os meses são "AAAA-MM". O `fim` é DERIVADO, nunca digitado (ver
// `normalizarVigencias`).

// Sem índice de propósito: o tipo de cada portal (uma `interface` com as SUAS
// alíquotas, como o VigenciaAliquotas da Inexx) entra sem conversão.
export interface Vigencia {
  inicio: string;
  fim?: string | null;
  regime?: string;
}

/**
 * Início do período que cobre "tudo o que veio antes". A empresa existe desde
 * antes do sistema, e o primeiro período não pode ter buraco: mês descoberto
 * apura imposto ZERO calado, que é pior do que herdar a alíquota antiga. A tela
 * mostra este período como "até <mês>", sem a data.
 */
export const DESDE_SEMPRE = "1900-01";

export const ehMes = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

/** "2026-01" → "2025-12". */
export function mesAnterior(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}

/** Só as alíquotas (o que o período novo herda). */
export function aliquotasDe(v: object | null | undefined): Record<string, unknown> {
  const { inicio: _i, fim: _f, regime: _r, ...resto } = (v ?? {}) as Record<string, unknown>;
  void _i; void _f; void _r;
  return resto;
}

/**
 * Ordena os períodos e fecha cada um no mês anterior ao início do seguinte.
 *
 * Com dois campos de data a informar, a primeira coisa que aparece é o buraco
 * (um período fechado em março e o seguinte começando em maio) ou a
 * sobreposição — e os dois somem em silêncio dentro do cálculo. O último
 * período fica aberto (`fim: null`). Mesmo início duas vezes = a última ganha.
 */
export function normalizarVigencias<V extends Vigencia>(vs: V[]): V[] {
  const porInicio = new Map<string, V>();
  for (const v of vs) if (ehMes(v.inicio) || v.inicio === DESDE_SEMPRE) porInicio.set(v.inicio, v);
  const ordenadas = [...porInicio.values()].sort((a, b) => a.inicio.localeCompare(b.inicio));
  return ordenadas.map((v, i) => {
    const proxima = ordenadas[i + 1];
    return { ...v, fim: proxima ? mesAnterior(proxima.inicio) : null };
  });
}

/** O período que vale no mês ("AAAA-MM" ou uma data "AAAA-MM-DD"). Sem período cobrindo, null. */
export function vigenteEm<V extends Vigencia>(vs: V[], mes: string): V | null {
  const m = mes.slice(0, 7);
  return normalizarVigencias(vs).filter((v) => v.inicio <= m && (!v.fim || m <= v.fim)).at(-1) ?? null;
}

/**
 * Monta os períodos depois de trocar o regime a partir de `inicio`.
 *
 * Sem período nenhum cadastrado, cria DOIS: o histórico (com o regime e as
 * alíquotas de hoje — `atual` —, cobrindo tudo o que veio antes) e o novo. É
 * isso que impede a troca de reescrever o passado.
 *
 * O período novo NASCE com as alíquotas do período que ele sucede: trocar de
 * regime quase sempre muda os percentuais, mas herdar e deixar corrigir é
 * melhor do que zerar (mês com alíquota zero apura imposto zero, calado).
 */
export function planejarMudancaRegime<V extends Vigencia>(
  vs: V[],
  novoRegime: string,
  inicio: string,
  atual: { regime?: string | null } & object = {},
): V[] {
  if (!ehMes(inicio)) throw new Error("Informe o mês de início no formato AAAA-MM.");
  const atuais = normalizarVigencias(vs);
  const anterior = [...atuais].reverse().find((v) => v.inicio <= mesAnterior(inicio));
  const heranca = aliquotasDe(anterior ?? atual);
  const base = (atuais.length
    ? atuais
    : [{ ...aliquotasDe(atual), inicio: DESDE_SEMPRE, ...(atual.regime ? { regime: atual.regime } : {}) }]) as V[];
  const novos = base.some((v) => v.inicio === inicio)
    ? base.map((v) => (v.inicio === inicio ? { ...v, regime: novoRegime } : v))
    : [...base, { ...heranca, inicio, regime: novoRegime } as unknown as V];
  return normalizarVigencias(novos);
}

/**
 * O QUE A TROCA REALMENTE FAZ, antes de fazer (quem chama decide se pede
 * confirmação). Escolher o regime que a empresa JÁ tem só partia a linha do
 * tempo em duas, com o mesmo regime dos dois lados — mas partir COM o mesmo
 * regime é legítimo quando muda a alíquota (o Simples sobe de faixa).
 *  • `sem-efeito`      — já existe um período começando NESSE mês com ESSE regime;
 *  • `so-novo-periodo` — o regime do mês já é esse: só abre fronteira de alíquotas;
 *  • `regime-novo`     — muda o regime de verdade.
 */
export type EfeitoTroca = "regime-novo" | "so-novo-periodo" | "sem-efeito";

export function efeitoTroca(vs: Vigencia[], novoRegime: string, inicio: string, regimeAtual?: string | null): { efeito: EfeitoTroca; regimeAtual?: string } {
  const atuais = normalizarVigencias(vs);
  const noMes = vigenteEm(atuais, inicio);
  const reg = (noMes?.regime || regimeAtual || "").trim() || undefined;
  if (reg !== novoRegime) return { efeito: "regime-novo", regimeAtual: reg };
  return { efeito: atuais.some((v) => v.inicio === inicio) ? "sem-efeito" : "so-novo-periodo", regimeAtual: reg };
}

/** Troca o regime DE UM PERÍODO que já existe (sem mexer nas datas). */
export function definirRegime<V extends Vigencia>(vs: V[], inicio: string, regime: string): V[] {
  return normalizarVigencias(normalizarVigencias(vs).map((v) => (v.inicio === inicio ? { ...v, regime: regime || undefined } : v)));
}

/** Muda as alíquotas de um período (o regime e as datas ficam). */
export function definirAliquotas<V extends Vigencia>(vs: V[], inicio: string, aliquotas: object): V[] {
  return normalizarVigencias(normalizarVigencias(vs).map((v) => (v.inicio === inicio ? { ...v, ...aliquotasDe(aliquotas) } : v)));
}

/** Muda a data de INÍCIO de um período (o fim se refaz sozinho): "o Presumido começou em agosto, não em setembro". */
export function moverVigencia<V extends Vigencia>(vs: V[], de: string, para: string): V[] {
  if (!ehMes(para) && para !== DESDE_SEMPRE) throw new Error("Informe o mês no formato AAAA-MM.");
  return normalizarVigencias(normalizarVigencias(vs).map((v) => (v.inicio === de ? { ...v, inicio: para } : v)));
}

/** Remove um período (e refaz os fechamentos). O único não sai — é a base. */
export function removerVigencia<V extends Vigencia>(vs: V[], inicio: string): V[] {
  const atuais = normalizarVigencias(vs);
  if (atuais.length <= 1) return atuais;
  return normalizarVigencias(atuais.filter((v) => v.inicio !== inicio));
}

const MES_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "2026-03" → "mar/26". */
export function mesCurto(mes: string): string {
  const [a, m] = mes.split("-");
  return `${MES_ABBR[Number(m) - 1] ?? m}/${a.slice(2)}`;
}

/** Rótulo do período ("sempre", "até dez/25", "jan/26 → mar/26", "desde abr/26"). */
export function rotuloPeriodo(v: Pick<Vigencia, "inicio" | "fim">): string {
  const desdeSempre = v.inicio === DESDE_SEMPRE;
  if (desdeSempre && !v.fim) return "sempre";
  if (desdeSempre) return `até ${mesCurto(v.fim!)}`;
  if (!v.fim) return `desde ${mesCurto(v.inicio)}`;
  return `${mesCurto(v.inicio)} → ${mesCurto(v.fim)}`;
}

/**
 * Períodos guardados com DATAS (`inicio`/`fim` "AAAA-MM-DD" ou nulos, como na
 * tabela core.empresa_tributacao do RQ) → os meses daqui. Início nulo = desde
 * sempre. O fim gravado é ignorado: ele se deriva do início do seguinte.
 */
export function deDatas<T extends { inicio?: string | null; fim?: string | null }>(linhas: T[]): (Omit<T, "inicio" | "fim"> & Vigencia)[] {
  return normalizarVigencias(linhas.map((l) => ({ ...l, inicio: l.inicio ? l.inicio.slice(0, 7) : DESDE_SEMPRE }) as Omit<T, "inicio" | "fim"> & Vigencia));
}

/** O caminho de volta: o mês vira o 1º dia (início) e o último dia (fim) do mês. */
export function paraDatas<V extends Vigencia>(vs: V[]): (Omit<V, "inicio" | "fim"> & { inicio: string | null; fim: string | null })[] {
  const ultimoDia = (mes: string) => {
    const [a, m] = mes.split("-").map(Number);
    return `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
  };
  return normalizarVigencias(vs).map((v) => ({
    ...v,
    inicio: v.inicio === DESDE_SEMPRE ? null : `${v.inicio}-01`,
    fim: v.fim ? ultimoDia(v.fim) : null,
  }));
}
