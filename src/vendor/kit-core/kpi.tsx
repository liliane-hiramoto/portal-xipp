// O NÚMERO EM DESTAQUE do topo da tela. Vindo da Headset; nos outros portais
// havia ~40 cópias à mão (`Kpi`, `Card`, `Indicador`, `Numero`, `Resumo`),
// cada uma com as suas props.
//
// A tela diz O QUE o número é (`tom`), não a classe de cor: com a cor crua,
// vermelho passa a significar coisas diferentes em telas diferentes.
import type { ReactNode } from "react";

export type TomKpi = "neutro" | "pos" | "neg" | "aviso" | "info";

const COR_TOM: Record<TomKpi, string> = {
  neutro: "text-[var(--ink,#0f172a)]",
  pos: "text-[var(--green,#059669)]",
  neg: "text-[var(--red,#dc2626)]",
  aviso: "text-[var(--amber,#d97706)]",
  info: "text-[var(--blue,#2563eb)]",
};

export function Kpi({
  titulo, valor, sub, tom = "neutro", dica, onClick, ativo = false, serif = false,
}: {
  titulo: string;
  /** Já formatado pela tela (`fmtMoney`, `%`, contagem). */
  valor: string;
  sub?: string;
  tom?: TomKpi;
  /** A ressalva que não cabe no `sub` — vira o `title` do cartão. */
  dica?: string;
  /** O número que ABRE o detalhe: o cartão vira botão de verdade (teclado, foco). */
  onClick?: () => void;
  ativo?: boolean;
  /** O valor na fonte serifada do portal (a Headset usa a Fraunces). */
  serif?: boolean;
}) {
  const corpo = (
    <>
      <div className="text-[11px] uppercase tracking-wider text-[var(--ink-3,#94a3b8)]">{titulo}</div>
      <div className={`mt-1 text-lg font-semibold ${serif ? "font-serif" : ""} ${COR_TOM[tom]}`}>{valor}</div>
      {sub && <div className="mt-0.5 text-[11px] text-[var(--ink-3,#94a3b8)]">{sub}</div>}
    </>
  );
  const base = "rounded-xl border bg-[var(--paper,#fff)] p-4";
  if (!onClick) {
    return <div className={`${base} border-[var(--line,#e2e8f0)]`} title={dica}>{corpo}</div>;
  }
  return (
    <button
      type="button" onClick={onClick} title={dica}
      className={`${base} w-full text-left transition ${
        ativo
          ? "border-[var(--brand,#0f172a)] ring-1 ring-[var(--brand,#0f172a)]"
          : "border-[var(--line,#e2e8f0)] hover:border-[var(--brand-2,var(--brand,#0f172a))] hover:bg-[var(--bg-2,#f8fafc)]"
      }`}
    >
      {corpo}
      <div className="mt-1 text-[10px] text-[var(--brand-2,var(--brand,#0f172a))]">{ativo ? "▾ fechar" : "▸ detalhar"}</div>
    </button>
  );
}

/** A fileira de números do topo. Quatro por linha, quebrando antes. */
export function Kpis({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const grade =
    cols === 2 ? "sm:grid-cols-2"
    : cols === 3 ? "sm:grid-cols-2 lg:grid-cols-3"
    : "sm:grid-cols-2 lg:grid-cols-4";
  return <div className={`grid gap-3 ${grade}`}>{children}</div>;
}
