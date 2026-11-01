"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { listaDeGrupos, buscarCategorias, semAcento, type GrupoOpcoes } from "./categorias";
import {
  opcoesPorColuna, criarPassa, temFiltro, estadoVazio, marcados, alternar, quantosNaColuna,
  SEM, LIGADO, type Coluna, type Estado, type Opcoes,
} from "./filtro-motor";

// O FILTRO NO CABEÇALHO — estilo "Balão", o mesmo nos cinco portais (escolha
// da usuária, 20/10/2026). Clica-se no título da coluna e abre um balão com
// busca e caixas de marcar; o número ao lado do título diz quantos valores
// estão marcados. A tabela fica limpa: não há fileira de campos embaixo do
// cabeçalho empurrando as linhas para baixo.
//
// O balão é desenhado num PORTAL (no <body>, posição fixa): dentro de tabela
// com rolagem lateral ele seria cortado.

const MAX_VISIVEIS = 400; // coluna com milhares de valores: refine pela busca

/**
 * O balão, sem motor: recebe as opções e devolve os marcados. Para a tela que
 * já tem o seu próprio cálculo de opções; quem declara colunas usa o
 * `filtrosNoCabecalho`, logo abaixo.
 */
export function BalaoFiltro({
  titulo, opcoes, marcados: sel, onChange, rotuloDe, grupos, extras, rotuloSem, alinhar = "esquerda", assunto,
}: {
  /** Ver `Balao`. */
  assunto?: string;
  /** O que aparece no cabeçalho. */
  titulo: ReactNode;
  /** Os valores que existem no recorte (já em cascata, na ordem certa). */
  opcoes: string[];
  marcados: string[];
  onChange: (v: string[]) => void;
  rotuloDe?: (v: string) => string;
  /** Agrupa as opções pela Estrutura FC (coluna de categoria). */
  grupos?: GrupoOpcoes[];
  /** Com `grupos`: valores que não são categoria, no topo, com o seu rótulo. */
  extras?: Record<string, string>;
  /** Com texto, oferece a opção "(sem …)" — as linhas sem o campo. */
  rotuloSem?: string;
  alinhar?: "esquerda" | "direita";
}) {
  const [busca, setBusca] = useState("");
  const nome = (v: string) => (v === SEM ? rotuloSem ?? "(vazio)" : extras?.[v] ?? (rotuloDe ? rotuloDe(v) : v));

  // As linhas do balão: um cabeçalho de grupo ou uma opção marcável.
  const linhas = useMemo(() => {
    type L = { grupo: string } | { v: string; rotulo: string; recuo: boolean };
    const out: L[] = [];
    const p = semAcento(busca.trim());
    if (rotuloSem && (!p || semAcento(rotuloSem).includes(p))) out.push({ v: SEM, rotulo: rotuloSem, recuo: false });
    if (grupos) {
      const fora = Object.keys(extras ?? {}).filter((v) => opcoes.includes(v));
      for (const v of fora) {
        if (!p || semAcento(extras![v]!).includes(p)) out.push({ v, rotulo: extras![v]!, recuo: false });
      }
      for (const it of buscarCategorias(listaDeGrupos(grupos, { apenas: opcoes, excluir: fora }), busca)) {
        out.push(it.tipo === "grupo" ? { grupo: it.rotulo } : { v: it.id, rotulo: it.nome, recuo: true });
      }
    } else {
      for (const v of opcoes) {
        const r = rotuloDe ? rotuloDe(v) : v;
        if (!p || semAcento(r).includes(p)) out.push({ v, rotulo: r, recuo: false });
      }
    }
    return out;
  }, [opcoes, busca, grupos, extras, rotuloDe, rotuloSem]);
  const escolhiveis = linhas.flatMap((l) => ("v" in l ? [l.v] : []));
  const mostradas = linhas.slice(0, MAX_VISIVEIS);

  return (
    <Balao titulo={titulo} n={sel.length} alinhar={alinhar} assunto={assunto} dica={sel.length ? sel.map(nome).join(", ") : undefined}>
      <input
        autoFocus
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="buscar…"
        className="mb-1.5 w-full rounded-md border border-[var(--line,#e2e8f0)] bg-[var(--paper,#fff)] px-2 py-1 text-[12px] font-normal text-[var(--ink,#0f172a)] outline-none focus:border-[var(--brand-2,var(--brand,#0f172a))]"
      />
      <div className="mb-1 flex items-center justify-between text-[11px] font-normal">
        <button type="button" onClick={() => onChange([...new Set([...sel, ...escolhiveis])])}
          className="text-[var(--brand-2,var(--brand,#0f172a))] hover:underline">
          marcar {busca ? "os achados" : "todos"}
        </button>
        <button type="button" onClick={() => onChange([])} disabled={!sel.length}
          className="text-[var(--ink-3,#94a3b8)] hover:underline disabled:opacity-40">
          limpar
        </button>
      </div>
      <div className="max-h-64 overflow-auto">
        {!mostradas.length && <div className="px-1 py-2 text-[11px] font-normal italic text-[var(--ink-3,#94a3b8)]">nenhum valor</div>}
        {mostradas.map((l, i) =>
          "grupo" in l ? (
            <div key={`g-${i}`} className="truncate px-1 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-3,#94a3b8)]">{l.grupo}</div>
          ) : (
            <label key={`o-${l.v}`} className={`flex cursor-pointer items-center gap-1.5 rounded py-0.5 pr-1 text-[12px] font-normal normal-case tracking-normal text-[var(--ink,#0f172a)] hover:bg-[var(--bg-2,#f8fafc)] ${l.recuo ? "pl-3" : "pl-1"} ${l.v === SEM ? "italic" : ""}`}>
              <input type="checkbox" checked={sel.includes(l.v)} onChange={() => onChange(alternar(sel, l.v))} />
              <span className="truncate" title={l.rotulo}>{l.rotulo}</span>
            </label>
          ),
        )}
      </div>
      {linhas.length > mostradas.length && (
        <div className="pt-1 text-[10px] font-normal text-[var(--ink-3,#94a3b8)]">
          mostrando {mostradas.length} de {linhas.length}. Refine a busca.
        </div>
      )}
    </Balao>
  );
}

/**
 * O título que abre o balão, e o balão. Fica no `<th>`; o número ao lado do
 * título é quantos filtros a coluna tem ligados.
 */
export function Balao({ titulo, n, alinhar = "esquerda", dica, assunto, children }: {
  titulo: ReactNode;
  /**
   * O que o balão filtra, quando não é o que o título diz — a coluna que
   * hospeda o filtro de outra pergunta (a Situação que filtra o "papel").
   */
  assunto?: string;
  n: number;
  alinhar?: "esquerda" | "direita";
  dica?: string;
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const LARGURA = 260;

  function posicionar() {
    const r = botao.current?.getBoundingClientRect();
    if (!r) return;
    const desejado = alinhar === "direita" ? r.right - LARGURA : r.left;
    setPos({ left: Math.max(8, Math.min(desejado, window.innerWidth - LARGURA - 8)), top: r.bottom + 4 });
  }

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      const t = e.target as Node;
      if (caixa.current?.contains(t) || botao.current?.contains(t)) return;
      setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { setAberto(false); botao.current?.focus(); } };
    const rolou = (e: Event) => { if (!caixa.current?.contains(e.target as Node)) posicionar(); };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    window.addEventListener("scroll", rolou, true);
    window.addEventListener("resize", posicionar);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("scroll", rolou, true);
      window.removeEventListener("resize", posicionar);
    };
    // `posicionar` só lê refs e a prop `alinhar`: não precisa entrar aqui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  return (
    <>
      <button
        ref={botao}
        type="button"
        onClick={() => { if (!aberto) posicionar(); setAberto(!aberto); }}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        title={dica ? `Filtrando: ${dica}` : "Filtrar esta coluna"}
        className={`inline-flex cursor-pointer items-center gap-1 [text-transform:inherit] hover:text-[var(--ink,#0f172a)] ${n ? "text-[var(--brand,#0f172a)]" : ""} ${alinhar === "direita" ? "flex-row-reverse" : ""}`}
      >
        <span>{titulo}</span>
        <span className="flex items-center gap-1">
          <span className="text-[9px] opacity-70">▾</span>
          {n > 0 && (
            <span className="rounded-md border border-[var(--aba-risco,var(--brand-2,#2563eb))] bg-[var(--aba-contador,#e0e7ff)] px-1 text-[10px] font-bold leading-[14px] text-[var(--brand,#0f172a)]">{n}</span>
          )}
        </span>
      </button>
      {aberto && pos && createPortal(
        <div
          ref={caixa}
          role="dialog"
          style={{ position: "fixed", left: pos.left, top: pos.top, width: LARGURA, zIndex: 60 }}
          className="rounded-xl border border-[var(--line,#e2e8f0)] bg-[var(--paper,#fff)] p-2 text-left shadow-xl"
        >
          {assunto && (
            <div className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-3,#94a3b8)]">filtrar por {assunto}</div>
          )}
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}

/** O balão de texto ("contém…") e o de liga/desliga. */
function BalaoSimples<T>({ c, valor, onChange, titulo, alinhar, assunto }: {
  c: Coluna<T>; valor: string; onChange: (v: string) => void; titulo: ReactNode; alinhar?: "esquerda" | "direita"; assunto?: string;
}) {
  const n = quantosNaColuna(c, valor);
  return (
    <Balao titulo={titulo} n={n} alinhar={alinhar} assunto={assunto} dica={n ? (c.tipo === "booleano" ? `só ${c.rotulo.toLowerCase()}` : `contém “${valor}”`) : undefined}>
      {c.tipo === "booleano" ? (
        <label className="flex cursor-pointer items-center gap-1.5 px-1 py-0.5 text-[12px] font-normal normal-case tracking-normal text-[var(--ink,#0f172a)]">
          <input type="checkbox" checked={valor === LIGADO} onChange={(e) => onChange(e.target.checked ? LIGADO : "")} />
          só {c.rotulo.toLowerCase()}
        </label>
      ) : (
        <>
          <input
            autoFocus
            value={valor}
            onChange={(e) => onChange(e.target.value)}
            placeholder="contém…"
            title="Casa por trecho, sem acento"
            className="w-full rounded-md border border-[var(--line,#e2e8f0)] bg-[var(--paper,#fff)] px-2 py-1 text-[12px] font-normal normal-case tracking-normal text-[var(--ink,#0f172a)] outline-none focus:border-[var(--brand-2,var(--brand,#0f172a))]"
          />
          {valor && (
            <button type="button" onClick={() => onChange("")} className="mt-1 text-[11px] font-normal normal-case text-[var(--ink-3,#94a3b8)] hover:underline">limpar</button>
          )}
        </>
      )}
    </Balao>
  );
}

/**
 * Os filtros de uma tabela, para pendurar nos títulos:
 *
 *   const F = filtrosNoCabecalho({ linhas, colunas, est, onEst });
 *   <th className={TH}>{F("categoria")}</th>
 *   <th className={`${TH} text-right`}>{F("valor", { alinhar: "direita" })}</th>
 *
 * `linhas` são as linhas ANTES destes filtros — é delas que saem as opções.
 * Devolve uma FUNÇÃO (não um componente): chamada dentro do render, não
 * remonta nada. Coluna sem filtro declarado volta só com o título.
 */
export function filtrosNoCabecalho<T>({ linhas, colunas, est, onEst, opcoes }: {
  linhas: T[];
  /** `null` é aceito (a lista posicional antiga); é ignorado. */
  colunas: (Coluna<T> | null)[];
  est: Estado;
  onEst: (e: Estado) => void;
  /** As opções, quando a tela já as calculou (com o predicado dela). */
  opcoes?: Map<string, Opcoes>;
}) {
  const cols = colunas.filter((c): c is Coluna<T> => !!c);
  const ops = opcoes ?? opcoesPorColuna(linhas, cols, est, criarPassa(cols, est));
  return function filtroDaColuna(k: string, o: { titulo?: ReactNode; alinhar?: "esquerda" | "direita" } = {}): ReactNode {
    const c = cols.find((x) => x.k === k);
    if (!c) return o.titulo ?? k;
    const titulo = o.titulo ?? c.rotulo;
    // Título trocado: o balão diz o que filtra de fato.
    const assunto = o.titulo !== undefined && o.titulo !== c.rotulo ? c.rotulo.toLowerCase() : undefined;
    if (c.tipo !== "lista") {
      const v = est[c.k];
      return <BalaoSimples c={c} titulo={titulo} alinhar={o.alinhar} assunto={assunto}
        valor={Array.isArray(v) ? v.join("") : (v ?? "")} onChange={(v) => onEst({ ...est, [c.k]: v })} />;
    }
    const op = ops.get(c.k);
    return (
      <BalaoFiltro
        titulo={titulo}
        alinhar={o.alinhar}
        assunto={assunto}
        opcoes={op?.valores ?? []}
        marcados={marcados(est[c.k])}
        onChange={(v) => onEst({ ...est, [c.k]: v })}
        rotuloDe={c.rotuloDe}
        grupos={c.grupos}
        extras={c.extras}
        rotuloSem={op?.temVazio ? `(sem ${c.rotulo.toLowerCase()})` : undefined}
      />
    );
  };
}

/** O "limpar filtros", que só aparece quando há o que limpar. */
export function LimparFiltros<T>({ colunas, est, onEst, n }: {
  colunas: (Coluna<T> | null)[];
  est: Estado;
  onEst: (e: Estado) => void;
  /** Quantas linhas sobraram — o número que diz se o filtro fez o esperado. */
  n?: number;
}) {
  const cols = colunas.filter((c): c is Coluna<T> => !!c);
  if (!temFiltro(cols, est)) return null;
  return (
    <span className="flex items-center gap-2 text-[11px] text-[var(--ink-3,#94a3b8)]">
      {n !== undefined && <span>{n} linha(s) no filtro</span>}
      <button type="button" onClick={() => onEst(estadoVazio(cols))}
        className="rounded-md border border-[var(--line,#e2e8f0)] px-2 py-0.5 text-[11px] text-[var(--ink-2,#475569)] hover:bg-[var(--bg-2,#f8fafc)]">
        limpar filtros
      </button>
    </span>
  );
}
