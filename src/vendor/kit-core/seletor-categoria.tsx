"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { listaDeGrupos, buscarCategorias, type GrupoOpcoes, type ItemLista } from "./categorias";

export type OpcaoExtra = { value: string; label: string };

/**
 * O SELETOR DE CATEGORIA — o mesmo nos cinco portais, para classificar e para
 * filtrar. Abre a lista na ordem e no agrupamento da Estrutura FC, com busca
 * em cima ("tecno" estreita a lista sem desmanchar os grupos) e setas/Enter.
 * Vindo da Headset; os grupos chegam no formato comum (`GrupoOpcoes`) e o
 * adaptador de cada portal monta-os a partir do cadastro dele.
 *
 * A lista é desenhada num PORTAL (no <body>, posição fixa): dentro de tabela
 * com rolagem lateral ela seria cortada, e fora do conteúdo o CSS artesanal de
 * um portal não a alcança.
 *
 * `name`/`form` existem para formulário de Server Action: o valor vai num
 * <input type="hidden">.
 */
export function SeletorCategoria({
  grupos, value, onChange, apenas, excluir, destaque, extras = [], vazio = "—",
  rotuloOrfas, abrirAoMontar = false, aoFechar, className = "", title, disabled, name, form,
}: {
  grupos: GrupoOpcoes[];
  value: string;
  onChange: (id: string) => void;
  /** Só estas categorias (o filtro em cascata). Ausente = todas. */
  apenas?: Iterable<string>;
  excluir?: Iterable<string>;
  /** Atalho no topo da lista (ex.: as categorias esperadas naquela tela). */
  destaque?: { rotulo: string; ids: string[] };
  /** Opções fora da estrutura, no topo da lista: "todos", "(sem categoria)", "manter"… */
  extras?: OpcaoExtra[];
  /** O que o botão mostra quando `value` é vazio e nenhum extra tem valor vazio. */
  vazio?: string;
  /** Cabeçalho das categorias do dado que não estão na estrutura. */
  rotuloOrfas?: string;
  /** Já nasce com a lista aberta — o editor que aparece NA linha da tabela. */
  abrirAoMontar?: boolean;
  /** Chamado sempre que a lista fecha (escolhendo ou não): quem abriu o editor na linha o tira dali. */
  aoFechar?: () => void;
  className?: string;
  title?: string;
  disabled?: boolean;
  name?: string;
  form?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [ativo, setAtivo] = useState(0);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number; altura: number } | null>(null);
  const botao = useRef<HTMLButtonElement | null>(null);
  const montou = useRef(false);
  const caixa = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);

  // `apenas`/`excluir` chegam como arrays novos a cada render; a chave em texto
  // evita refazer a lista inteira sem necessidade.
  const chaveApenas = apenas ? [...apenas].join("|") : null;
  // Os extras não são categoria: tirá-los daqui impede que um "__nc__" vindo da
  // cascata apareça de novo como "fora da estrutura".
  const chaveExcluir = [...(excluir ?? []), ...extras.map((x) => x.value)].join("|");
  const chaveDestaque = destaque?.ids.length ? [destaque.rotulo, ...destaque.ids].join("|") : "";
  const lista = useMemo(
    () => listaDeGrupos(grupos, {
      apenas: chaveApenas === null ? undefined : chaveApenas.split("|").filter(Boolean),
      excluir: chaveExcluir.split("|").filter(Boolean),
      destaque: chaveDestaque ? { rotulo: chaveDestaque.split("|")[0]!, ids: chaveDestaque.split("|").slice(1) } : undefined,
      rotuloOrfas,
    }),
    [grupos, chaveApenas, chaveExcluir, chaveDestaque, rotuloOrfas],
  );
  const filtrada = useMemo(() => buscarCategorias(lista, busca), [lista, busca]);
  const extrasVistos = useMemo(() => {
    const p = busca.trim().toLowerCase();
    return p ? extras.filter((x) => x.label.toLowerCase().includes(p)) : extras;
  }, [extras, busca]);
  // O que as setas percorrem: os extras e as categorias, nunca os cabeçalhos.
  const escolhiveis = useMemo(
    () => [...extrasVistos.map((x) => x.value), ...filtrada.flatMap((x) => (x.tipo === "cat" ? [x.id] : []))],
    [extrasVistos, filtrada],
  );

  const nomeAtual = useMemo(() => {
    const ex = extras.find((x) => x.value === value);
    if (ex) return ex.label;
    if (!value) return vazio;
    const c = grupos.flatMap((g) => g.itens).find((x) => x.valor === value);
    // Valor que não existe mais na estrutura: mostra o valor, não um campo
    // vazio — vazio se leria como "sem categoria", e não é.
    return c ? c.nome : `${value} (fora da estrutura)`;
  }, [extras, value, vazio, grupos]);

  function posicionar() {
    const r = botao.current?.getBoundingClientRect();
    if (!r) return;
    const largura = Math.max(r.width, 300);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - largura - 8));
    // Abre para o lado com MAIS espaço e encolhe para caber nele: a lista
    // cortada pela borda da janela esconde justamente o começo (ou o fim) dela.
    const embaixo = window.innerHeight - r.bottom - 8;
    const emCima = r.top - 8;
    const CAMPO = 36; // a altura do campo de busca
    const desce = embaixo >= 320 || embaixo >= emCima;
    const altura = Math.max(120, Math.min(300, (desce ? embaixo : emCima) - CAMPO));
    setPos(desce
      ? { left, top: r.bottom + 2, width: largura, altura }
      : { left, bottom: window.innerHeight - r.top + 2, width: largura, altura });
  }

  function abrir(inicial = "") {
    if (disabled) return;
    posicionar();
    setBusca(inicial);
    // A seta começa no valor atual; quem já abriu digitando começa no primeiro.
    const todos = [...extras.map((x) => x.value), ...lista.flatMap((x) => (x.tipo === "cat" ? [x.id] : []))];
    setAtivo(inicial ? 0 : Math.max(0, todos.indexOf(value)));
    setAberto(true);
  }
  function fechar(devolverFoco = true) {
    setAberto(false);
    if (devolverFoco) botao.current?.focus();
    aoFechar?.();
  }

  function escolher(v: string) {
    if (v !== value) onChange(v);
    fechar();
  }


  useEffect(() => {
    if (!aberto) return;
    campo.current?.focus();
    const fora = (e: MouseEvent) => {
      const t = e.target as Node;
      if (caixa.current?.contains(t) || botao.current?.contains(t)) return;
      fechar(false);
    };
    const rolou = (e: Event) => { if (!caixa.current?.contains(e.target as Node)) posicionar(); };
    document.addEventListener("mousedown", fora);
    window.addEventListener("scroll", rolou, true);
    window.addEventListener("resize", posicionar);
    return () => {
      document.removeEventListener("mousedown", fora);
      window.removeEventListener("scroll", rolou, true);
      window.removeEventListener("resize", posicionar);
    };
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    caixa.current?.querySelector<HTMLElement>(`[data-i="${ativo}"]`)?.scrollIntoView({ block: "nearest" });
  }, [ativo, aberto]);

  function teclas(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setAtivo((i) => Math.min(i + 1, escolhiveis.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAtivo((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const v = escolhiveis[ativo]; if (v !== undefined) escolher(v); }
    else if (e.key === "Escape") { e.preventDefault(); fechar(); }
    else if (e.key === "Tab") fechar(false);
  }

  let i = -1; // índice corrido dos escolhíveis, para casar com `ativo`
  const item = (v: string, rotulo: string, recuo: boolean) => {
    i++;
    const n = i;
    return (
      <div
        key={`o-${n}`}
        data-i={n}
        role="option"
        aria-selected={v === value}
        onMouseEnter={() => setAtivo(n)}
        onMouseDown={(e) => { e.preventDefault(); escolher(v); }}
        className={`cursor-pointer truncate py-1 pr-2 text-[12px] ${recuo ? "pl-5" : "pl-2"} ${n === ativo ? "bg-[var(--bg-2,#f8fafc)]" : ""} ${v === value ? "font-semibold text-[var(--brand,#0f172a)]" : "text-[var(--ink,#0f172a)]"}`}
      >
        {rotulo}
      </div>
    );
  };

  return (
    <>
      {name && <input type="hidden" name={name} form={form} value={value} />}
      <button
        ref={(el) => {
          botao.current = el;
          // `abrirAoMontar`: abre no primeiro desenho do botão — é quando dá para
          // medir onde ele está e posicionar a lista.
          if (el && abrirAoMontar && !montou.current) { montou.current = true; queueMicrotask(() => abrir()); }
        }}
        type="button"
        disabled={disabled}
        title={title ?? nomeAtual}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        onClick={(e) => { e.stopPropagation(); if (aberto) fechar(); else abrir(); }}
        onKeyDown={(e) => {
          if (aberto) return;
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(); }
          // Começar a digitar com o botão em foco já abre buscando.
          else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); abrir(e.key); }
        }}
        className={`inline-flex items-center justify-between gap-1 text-left ${className}`}
      >
        <span className="min-w-0 truncate">{nomeAtual}</span>
        <span aria-hidden className="shrink-0 text-[9px] text-[var(--ink-3,#94a3b8)]">▾</span>
      </button>
      {aberto && pos && createPortal(
        <div
          ref={caixa}
          onClick={(e) => e.stopPropagation()}
          style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, zIndex: 1000 }}
          className="overflow-hidden rounded-lg border border-[var(--line,#e2e8f0)] bg-[var(--paper,#fff)] shadow-lg"
        >
          <input
            ref={campo}
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setAtivo(0); }}
            onKeyDown={teclas}
            placeholder="digite para buscar…"
            className="block w-full border-0 border-b border-[var(--line,#e2e8f0)] bg-white px-2 py-1.5 text-[12px] text-[var(--ink,#0f172a)] outline-none"
          />
          <div role="listbox" style={{ maxHeight: pos.altura }} className="overflow-y-auto py-1">
            {extrasVistos.map((x) => item(x.value, x.label, false))}
            {filtrada.map((x: ItemLista) => x.tipo === "grupo"
              ? <div key={`g-${x.rotulo}`} className="sticky top-0 bg-[var(--paper,#fff)] px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-3,#94a3b8)]">{x.rotulo}</div>
              : item(x.id, x.nome, true))}
            {escolhiveis.length === 0 && <div className="px-2 py-2 text-[12px] text-[var(--ink-3,#94a3b8)]">Nada com “{busca}”.</div>}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
