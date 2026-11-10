"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { ehPadrao, montarMenu, moverCard, ordemDe, passoCard, passoFaixa, type CardDoMenu, type FaixaMontada, type OrdemMenu } from "./menu-motor";

export type { CardDoMenu, OrdemMenu };

// O MENU PRINCIPAL em faixas por assunto, com "Organizar" (10/11/2026 — pedido
// dela para TODOS os portais). O portal entrega os cards (com a faixa em que
// nascem) e desenha cada card do jeito dele (`desenhar`); esta peça faz as
// faixas, o arrastar e soltar, as setas (no celular não há arrastar) e o
// "Restaurar padrão". A regra está em menu-motor.ts.
//
// Onde a ordem fica: na CONTA da pessoa (Supabase Auth, user_metadata, chave
// CHAVE_MENU) — vale em qualquer computador e não pede tabela nem SQL. É
// preferência de tela, não acesso: quem vê qual card continua decidido pelo
// portal (o card que a pessoa não pode ver nem chega aqui).
//
// Estilo inline de propósito: em alguns portais a home não carrega Tailwind.

/** A chave do user_metadata onde a ordem do menu é guardada. */
export const CHAVE_MENU = "menu_cards";

/** Grava a ordem (null = volta ao padrão) na conta de quem está logado. */
export async function salvarMenuNaConta(
  supabase: { auth: { updateUser: (a: { data: Record<string, unknown> }) => Promise<{ error: { message: string } | null }> } },
  ordem: OrdemMenu | null,
): Promise<void> {
  const { error } = await supabase.auth.updateUser({ data: { [CHAVE_MENU]: ordem } });
  if (error) throw new Error(error.message);
}

const BTN: CSSProperties = {
  font: "inherit", fontSize: 13, padding: "5px 12px", borderRadius: 8, cursor: "pointer",
  border: "1px solid var(--line, #cbd5e1)", background: "var(--card, #fff)", color: "var(--ink, #334155)",
  width: "auto", margin: 0,
};
const BTN_P: CSSProperties = { ...BTN, background: "var(--brand, #1e3a5f)", borderColor: "var(--brand, #1e3a5f)", color: "#fff" };
const SETA: CSSProperties = { ...BTN, padding: "2px 8px", fontSize: 12, lineHeight: 1.2 };

export function MenuCards<T extends CardDoMenu>({
  cards, faixas, salvo, desenhar, aoSalvar, grade, titulo, ocultarTituloDe = [],
}: {
  cards: T[];
  /** A ordem padrão das faixas ("Financeiro", "Contabilidade", "Fiscal"…). */
  faixas: string[];
  /** A ordem guardada da pessoa (user_metadata[CHAVE_MENU]); qualquer formato. */
  salvo?: unknown;
  /** Desenha um card — o visual de sempre de cada portal. */
  desenhar: (card: T) => ReactNode;
  /** Grava a ordem (null = padrão). Normalmente salvarMenuNaConta(supabase, …). Sem ele, não há "Organizar". */
  aoSalvar?: (ordem: OrdemMenu | null) => Promise<void>;
  /** Estilo da grade de cards de cada faixa (o padrão é uma grade que se ajusta à largura). */
  grade?: CSSProperties;
  /** Algo à esquerda do botão "Organizar" (um título, por exemplo). */
  titulo?: ReactNode;
  /** Faixas que aparecem sem o título (ex.: a de destaque no topo). */
  ocultarTituloDe?: string[];
}) {
  const [guardado, setGuardado] = useState<unknown>(salvo);
  const [edicao, setEdicao] = useState<FaixaMontada<T>[] | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState("");

  const montado = useMemo(() => montarMenu(cards, faixas, guardado), [cards, faixas, guardado]);
  const vista = edicao ?? montado;
  const gradeFinal: CSSProperties = grade ?? { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 };

  const abrir = () => { setErro(""); setEdicao(montarMenu(cards, faixas, guardado, true)); };
  const gravar = async (ordem: OrdemMenu | null) => {
    if (!aoSalvar) return;
    setGravando(true); setErro("");
    try { await aoSalvar(ordem); setGuardado(ordem); setEdicao(null); }
    catch (e) { setErro(`Não consegui guardar a ordem: ${(e as Error).message}`); }
    finally { setGravando(false); }
  };
  const concluir = () => edicao && gravar(ehPadrao(cards, faixas, edicao) ? null : ordemDe(edicao.filter((x) => x.cards.length)));

  const soltar = (faixa: string, antesDe: string | null) => {
    if (edicao && arrastando) setEdicao(moverCard(edicao, arrastando, faixa, antesDe));
    setArrastando(null); setSobre(null);
  };

  return (
    <div>
      {(titulo || aoSalvar) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>{titulo}</div>
          {aoSalvar && !edicao && (
            <button type="button" style={BTN} onClick={abrir} title="Arraste os cards, troque de faixa e mude a ordem — vale para a sua conta, em qualquer computador">⇅ Organizar</button>
          )}
          {edicao && (
            <>
              <button type="button" style={BTN} disabled={gravando} onClick={() => setEdicao(null)}>Cancelar</button>
              <button type="button" style={BTN} disabled={gravando} onClick={() => gravar(null)} title="Volta à ordem do portal">Restaurar padrão</button>
              <button type="button" style={BTN_P} disabled={gravando} onClick={concluir}>{gravando ? "Guardando…" : "Concluir"}</button>
            </>
          )}
        </div>
      )}
      {edicao && (
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--muted, #64748b)" }}>
          Arraste um card para outro lugar ou outra faixa — ou use as setas e o seletor de faixa em cada card. As setas ▲▼ ao lado do nome mudam a ordem das faixas.
        </p>
      )}
      {erro && <p style={{ margin: "0 0 12px", fontSize: 13, color: "#b91c1c" }}>{erro}</p>}

      {vista.map((f, fi) => (
        <section key={f.faixa} style={{ marginBottom: 24 }}
          onDragOver={edicao ? (e) => e.preventDefault() : undefined}
          onDrop={edicao ? (e) => { e.preventDefault(); soltar(f.faixa, null); } : undefined}>
          {(!ocultarTituloDe.includes(f.faixa) || edicao) && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 10px" }}>
              <h2 style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted, #64748b)" }}>{f.faixa}</h2>
              <div style={{ flex: 1, height: 1, background: "var(--line, #e2e8f0)" }} />
              {edicao && (
                <span style={{ display: "flex", gap: 4 }}>
                  <button type="button" style={SETA} disabled={fi === 0} onClick={() => setEdicao(passoFaixa(edicao, f.faixa, -1))} aria-label={`Subir a faixa ${f.faixa}`}>▲</button>
                  <button type="button" style={SETA} disabled={fi === vista.length - 1} onClick={() => setEdicao(passoFaixa(edicao, f.faixa, 1))} aria-label={`Descer a faixa ${f.faixa}`}>▼</button>
                </span>
              )}
            </div>
          )}
          <div style={gradeFinal}>
            {f.cards.map((c, ci) => !edicao ? <div key={c.id} style={{ height: "100%" }}>{desenhar(c)}</div> : (
              <div key={c.id} draggable
                onDragStart={(e) => { setArrastando(c.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", c.id); }}
                onDragEnd={() => { setArrastando(null); setSobre(null); }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setSobre(c.id); }}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); soltar(f.faixa, c.id); }}
                style={{
                  position: "relative", cursor: "grab", borderRadius: 12,
                  // A mesma altura na linha também no modo Organizar: o card estica e os controles ficam no pé.
                  display: "flex", flexDirection: "column", height: "100%",
                  outline: `2px dashed ${sobre === c.id && arrastando !== c.id ? "var(--brand, #1e3a5f)" : "var(--line, #cbd5e1)"}`,
                  outlineOffset: 3, opacity: arrastando === c.id ? 0.4 : 1,
                }}>
                <div style={{ pointerEvents: "none", userSelect: "none", flex: 1 }}>{desenhar(c)}</div>
                <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 6 }}>
                  <button type="button" style={SETA} disabled={ci === 0} onClick={() => setEdicao(passoCard(edicao, c.id, -1))} aria-label="Para trás">◀</button>
                  <button type="button" style={SETA} disabled={ci === f.cards.length - 1} onClick={() => setEdicao(passoCard(edicao, c.id, 1))} aria-label="Para a frente">▶</button>
                  <select value={f.faixa} onChange={(e) => setEdicao(moverCard(edicao, c.id, e.target.value, null))}
                    style={{ ...SETA, flex: 1, minWidth: 0 }} aria-label="Faixa do card">
                    {vista.map((x) => <option key={x.faixa} value={x.faixa}>{x.faixa}</option>)}
                  </select>
                </div>
              </div>
            ))}
            {edicao && f.cards.length === 0 && (
              <div style={{ border: "2px dashed var(--line, #cbd5e1)", borderRadius: 12, padding: 20, fontSize: 13, color: "var(--muted, #64748b)", textAlign: "center" }}>
                Solte um card aqui
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
