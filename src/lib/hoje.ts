/**
 * "Hoje" no fuso de São Paulo — a fonte única de data do dia.
 *
 * ⚠️ `new Date().toISOString().slice(0, 10)` é hoje em **UTC**: das 21h à
 * meia-noite ele já devolve AMANHÃ. Foi assim que, no Portal Flórida, a hora
 * lançada à noite caía no dia seguinte e as telas trocavam de mês no último dia
 * (18/09/2026). Fixar em `America/Sao_Paulo` — e não no fuso da máquina —
 * porque o servidor da Vercel roda em UTC (lá "local" não é o horário de
 * ninguém) e porque assim navegador e servidor respondem a mesma coisa.
 *
 * `scripts/conferir-hoje.mjs` (no CI) barra a volta do `toISOString()` de hoje.
 */
export const TZ_GRUPO = "America/Sao_Paulo";

/** "YYYY-MM-DD" de hoje em São Paulo. `agora` existe para o teste. */
export const hojeYmd = (agora: Date = new Date()): string =>
  agora.toLocaleDateString("en-CA", { timeZone: TZ_GRUPO });

/** "YYYY-MM" do mês corrente em São Paulo. */
export const mesAtual = (agora: Date = new Date()): string => hojeYmd(agora).slice(0, 7);

/** Soma `n` dias (pode ser negativo) a uma data de CALENDÁRIO "YYYY-MM-DD". Conta toda em UTC. */
export const somaDiasYmd = (ymd: string, n: number): string => {
  const [a, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
};
