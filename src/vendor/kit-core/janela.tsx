"use client";
// A JANELA (modal) e o aviso de carregando / erro / vazio.
//
// A janela é desenhada num PORTAL, no <body>: assim o CSS artesanal de um
// portal (o `.portal-root` da Headset, o `.card` do RQ) não alcança o que está
// dentro dela, e nenhuma tabela com rolagem a corta. Esc e o clique no fundo
// fecham.
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function Janela({
  titulo, sub, onFechar, largura = "md", children, rodape,
}: {
  titulo: string;
  sub?: string;
  onFechar: () => void;
  largura?: "sm" | "md" | "lg" | "xl";
  children: ReactNode;
  /** Os botões do pé (Salvar, Cancelar). */
  rodape?: ReactNode;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onFechar]);
  const w = largura === "sm" ? "max-w-sm" : largura === "lg" ? "max-w-3xl" : largura === "xl" ? "max-w-5xl" : "max-w-xl";
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="dialog" aria-modal="true" aria-label={titulo}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}
      className="fixed inset-0 z-[1000] grid place-items-center bg-black/40 p-4"
    >
      <div className={`flex max-h-[90vh] w-full ${w} flex-col overflow-hidden rounded-2xl bg-[var(--paper,#fff)] shadow-xl`}>
        <div className="flex items-start justify-between gap-3 border-b border-[var(--line,#e2e8f0)] px-5 py-3">
          <div>
            <div className="text-base font-semibold text-[var(--ink,#0f172a)]">{titulo}</div>
            {sub && <div className="mt-0.5 text-xs text-[var(--ink-3,#94a3b8)]">{sub}</div>}
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar"
            className="rounded-md px-2 text-lg leading-none text-[var(--ink-3,#94a3b8)] hover:bg-[var(--bg-2,#f8fafc)]">×</button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {rodape && <div className="flex justify-end gap-2 border-t border-[var(--line,#e2e8f0)] px-5 py-3">{rodape}</div>}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Carregando / erro / vazio — UM aviso por vez, nessa ordem. Devolve null
 * quando há dado: a tela escreve `<EstadoDados …/>` e logo abaixo o conteúdo.
 */
export function EstadoDados({
  carregando, erro, vazio, textoVazio = "Nada para mostrar.", textoCarregando = "Carregando…",
}: {
  carregando?: boolean;
  erro?: string | null;
  vazio?: boolean;
  textoVazio?: ReactNode;
  textoCarregando?: ReactNode;
}) {
  if (carregando) return <div className="rounded-xl border border-[var(--line,#e2e8f0)] bg-[var(--paper,#fff)] px-4 py-6 text-center text-sm text-[var(--ink-3,#94a3b8)]">{textoCarregando}</div>;
  if (erro) return <div className="rounded-xl bg-[var(--neg-bg,#fef2f2)] px-4 py-3 text-sm text-[var(--red,#dc2626)]">{erro}</div>;
  if (vazio) return <div className="rounded-xl border border-dashed border-[var(--line,#e2e8f0)] px-4 py-6 text-center text-sm text-[var(--ink-3,#94a3b8)]">{textoVazio}</div>;
  return null;
}
