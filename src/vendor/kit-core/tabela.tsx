// A TABELA — as classes de cabeçalho e célula, a moldura e a linha "nada aqui".
// Vindo da Headset (`components/ui.tsx`), onde a unificação mediu 5 arquivos
// redefinindo TH/TD e 27 cópias da moldura.
//
// Cores: as variáveis da Headset COM o valor de reserva escrito na classe
// (`var(--ink-3,#94a3b8)`). Na Headset vale a variável; nos portais que não a
// definem vale o cinza do Tailwind — sem configurar nada. Nunca `--accent`: ela
// é cinza no Flórida, laranja no IF Hub, limão no RQ e roxa no 3Clicks.
//
// ⚠️ Classe sempre LITERAL, nunca montada por interpolação: o Tailwind v4 varre
// o código atrás do nome escrito por extenso, e a classe montada não é gerada.
import type { ReactNode } from "react";

/** Cabeçalho de coluna. */
export const TH =
  "whitespace-nowrap px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--ink-3,#94a3b8)]";
const CELULA = "px-3 py-2 text-sm text-[var(--ink-2,#475569)]";
/** Célula. */
export const TD = `whitespace-nowrap ${CELULA}`;
/** Célula que QUEBRA a linha (motivo, observação, nome comprido), na mesma medida do TD. */
export const TD_QUEBRA = `${CELULA} [overflow-wrap:anywhere]`;
/** Célula de NÚMERO: à direita e com `tabular-nums` — as casas decimais uma embaixo da outra. */
export const NUM = `${TD} text-right font-mono tabular-nums`;

/** A tabela DENTRO de outra (o detalhe que abre numa linha): mais apertada de propósito. */
export const TH_DENSO =
  "whitespace-nowrap px-2.5 py-1.5 text-left text-[9.5px] font-bold uppercase tracking-wider text-[var(--ink-3,#94a3b8)]";
export const TD_DENSO = "whitespace-nowrap px-2.5 py-1.5 text-xs text-[var(--ink-2,#475569)]";
export const NUM_DENSO = `${TD_DENSO} text-right font-mono tabular-nums`;

/**
 * A moldura: rola de LADO, com borda e fundo de papel. Nunca `overflow-y`: a
 * tabela que rola por dentro vira janelinha, e o resto só aparece para quem
 * notar a segunda barra de rolagem.
 */
export function Tabela({
  children, largura = "full", className = "",
}: {
  children: ReactNode;
  /** `auto` para a tabela que não deve esticar. */
  largura?: "full" | "auto" | "min";
  className?: string;
}) {
  const w = largura === "auto" ? "w-auto" : largura === "min" ? "min-w-full" : "w-full";
  return (
    <div className={`overflow-x-auto rounded-xl border border-[var(--line,#e2e8f0)] bg-[var(--paper,#fff)] ${className}`}>
      <table className={`${w} text-sm`}>{children}</table>
    </div>
  );
}

/** A linha "nada aqui", ocupando a largura da tabela. */
export function LinhaVazia({ colunas, children = "Nenhum registro." }: { colunas: number; children?: ReactNode }) {
  return (
    <tr>
      <td colSpan={colunas} className="px-3 py-6 text-center text-sm text-[var(--ink-3,#94a3b8)]">{children}</td>
    </tr>
  );
}
