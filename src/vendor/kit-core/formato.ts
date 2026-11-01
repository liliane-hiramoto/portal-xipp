// Formatação pt-BR — a conta que os cinco portais faziam igual, num lugar só.
// Puro: roda no navegador, no servidor e no teste.
//
// ⚠️ NÃO está aqui o `parseNumeroBR`: os portais têm duas funções com esse
// nome e contratos diferentes (a Headset devolve null, o RQ devolve NaN).
// Juntar sem cuidado quebraria a conta de quem chama, em silêncio.

const dinheiro = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 1234.5 → "R$ 1.234,50"; vazio ou NaN → "—". */
export function fmtMoney(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "—";
  return dinheiro.format(v);
}

/** Versão compacta para gráfico e rótulo: "R$ 1,2 mil", "R$ 3,4 mi". */
export function fmtMoneyCompact(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "—";
  const a = Math.abs(v);
  const s = v < 0 ? "-" : "";
  if (a >= 1_000_000) return `${s}R$ ${(a / 1_000_000).toFixed(1)} mi`;
  if (a >= 1_000) return `${s}R$ ${(a / 1_000).toFixed(1)} mil`;
  return dinheiro.format(v);
}

export function fmtNum(v: number, casas = 0): string {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(v);
}

/** "2026-01-13" → "13/01/2026". Data de CALENDÁRIO: nunca passa por `new Date`. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d.slice(0, 2)}/${m}/${y}`;
}

/** 0.125 → "12.5%". Divisão por zero (Infinity/NaN) → "—", em vez de "NaN%". */
export function fmtPct(v: number, casas = 1): string {
  if (!isFinite(v)) return "—";
  return `${(v * 100).toFixed(casas)}%`;
}
