// Rituais de Gestão (pendências) da Flórida — a tela (componente de SERVIDOR,
// sem JS no navegador: os formulários chamam a server action do portal, e
// "Editar"/"Nova pendência" são links que abrem o formulário na própria página).
// Estilo EMBUTIDO de propósito, como o CronogramaFlorida: o mesmo arquivo roda
// em portais com CSS diferentes, e classe de nome comum já colidiu.
//
// ⚠️ Arquivo IGUAL nos portais Affix, Inexx, RQ e WR. Ajuste num, copie para os outros.

import type { CSSProperties } from "react";
import Link from "next/link";
import type { Pendencia, PendenciasFlorida as Dados, ResultadoPend, SituacaoPend } from "./pendencias-florida";

const COR: Record<SituacaoPend, { bg: string; fg: string }> = {
  NAO_INICIADA: { bg: "#f1f5f9", fg: "#475569" },
  EM_ANDAMENTO: { bg: "#e0f2fe", fg: "#075985" },
  AGUARDANDO: { bg: "#fef3c7", fg: "#92400e" },
  CONCLUIDA: { bg: "#d1fae5", fg: "#065f46" },
  CANCELADA: { bg: "#e2e8f0", fg: "#64748b" },
};
const dataBR = (ymd: string | null | undefined) => (ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}` : "");

const s = {
  pagina: { maxWidth: 1200, margin: "0 auto", padding: "16px 18px 60px", fontSize: 14, color: "#0f172a" } as CSSProperties,
  caixa: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16, marginBottom: 16 } as CSSProperties,
  th: { textAlign: "left", fontSize: 12, fontWeight: 600, color: "#64748b", padding: "6px 8px", whiteSpace: "nowrap", borderBottom: "1px solid #e2e8f0" } as CSSProperties,
  td: { padding: "8px", borderBottom: "1px solid #f1f5f9", verticalAlign: "top" } as CSSProperties,
  aviso: { background: "#fffbeb", border: "1px solid #fde68a", color: "#78350f", borderRadius: 10, padding: "12px 14px", marginBottom: 16 } as CSSProperties,
  ok: { background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46", borderRadius: 10, padding: "10px 14px", marginBottom: 16 } as CSSProperties,
  campo: { border: "1px solid #cbd5e1", borderRadius: 6, padding: "4px 6px", fontSize: 13, background: "#fff", color: "#0f172a", width: "auto", margin: 0 } as CSSProperties,
  botao: { border: "1px solid #cbd5e1", borderRadius: 6, padding: "4px 10px", fontSize: 12, background: "#f8fafc", color: "#0f172a", cursor: "pointer" } as CSSProperties,
  primario: { border: "1px solid #1e293b", borderRadius: 6, padding: "6px 14px", fontSize: 13, background: "#1e293b", color: "#fff", cursor: "pointer" } as CSSProperties,
  link: { fontSize: 13, color: "#2563eb", textDecoration: "none" } as CSSProperties,
  rotulo: { display: "block", fontSize: 12, color: "#64748b", marginBottom: 2 } as CSSProperties,
  kpi: { flex: "1 1 160px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 14px" } as CSSProperties,
};

type Acao = (fd: FormData) => Promise<void>;
type Ctx = { acao: Acao; rota: string; todas: boolean; bola: { CLIENTE: string; FLORIDA: string } };

// "Com quem está": o NOME do cliente ou Flórida (pedido dela, 09/11/2026: "com
// quem está → WR (cliente) ou Flórida"). Era "Com vocês" / "Com a Flórida".
const nomeCurto = (nome: string) => nome.replace(/^Portal\s+/i, "").trim() || nome;
const bolaDe = (d: Dados) => ({ CLIENTE: `${nomeCurto(d.portal.nome)} (cliente)`, FLORIDA: "Flórida" });

/** Os cards também filtram (09/11/2026, "quando clicar no card, mostrar o que está selecionado"). */
export type FiltroPend = "abertas" | "atrasadas" | "cliente" | "florida" | "concluidas";

/** Monta o link da própria página, guardando o "mostrar concluídas". */
const url = (c: Ctx, extra?: string) => {
  const q = [c.todas ? "todas=1" : "", extra ?? ""].filter(Boolean).join("&");
  return q ? `${c.rota}?${q}` : c.rota;
};

function Etiqueta({ p }: { p: Pendencia }) {
  const c = COR[p.situacao] ?? COR.EM_ANDAMENTO;
  return <span style={{ background: c.bg, color: c.fg, borderRadius: 6, padding: "2px 8px", fontSize: 12, whiteSpace: "nowrap" }}>{p.situacaoLabel}</span>;
}

/** O formulário de criar (p ausente) ou editar (p presente) uma pendência. */
function Formulario({ p, d, c }: { p?: Pendencia; d: Dados; c: Ctx }) {
  const usuarios = d.usuarios ?? [];
  const marcados = new Set(p?.responsaveisPortal ?? []);
  return (
    <form action={c.acao} style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
      <input type="hidden" name="tipo" value="salvar" />
      <input type="hidden" name="acaoId" value={p?.id ?? ""} />
      <input type="hidden" name="todas" value={c.todas ? "1" : ""} />
      <label style={{ gridColumn: "1 / -1" }}>
        <span style={s.rotulo}>Tema (o ponto discutido)</span>
        <input name="tema" list="pend-temas" defaultValue={p?.tema ?? ""} maxLength={200} style={{ ...s.campo, width: "100%" }} />
        <datalist id="pend-temas">{(d.temas ?? []).map((t) => <option key={t} value={t} />)}</datalist>
      </label>
      <label style={{ gridColumn: "1 / -1" }}>
        <span style={s.rotulo}>Ação *</span>
        <textarea name="acao" required rows={2} maxLength={4000} defaultValue={p?.acao ?? ""} style={{ ...s.campo, width: "100%" }} />
      </label>
      <label style={{ gridColumn: "1 / -1" }}>
        <span style={s.rotulo}>Contexto</span>
        <textarea name="contexto" rows={2} maxLength={4000} defaultValue={p?.contexto ?? ""} style={{ ...s.campo, width: "100%" }} />
      </label>
      <label>
        <span style={s.rotulo}>Identificada em</span>
        <input type="date" name="identificadaEm" defaultValue={p?.identificadaEm ?? d.hoje} style={s.campo} />
      </label>
      <label>
        <span style={s.rotulo}>Prazo</span>
        <input type="date" name="prazo" defaultValue={p?.prazo ?? ""} style={s.campo} />
      </label>
      <label>
        <span style={s.rotulo}>Com quem está</span>
        <select name="bolaCom" defaultValue={p?.bolaCom ?? ""} style={s.campo}>
          <option value="">—</option>
          <option value="CLIENTE">{c.bola.CLIENTE}</option>
          <option value="FLORIDA">{c.bola.FLORIDA}</option>
        </select>
      </label>
      <fieldset style={{ gridColumn: "1 / -1", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", margin: 0 }}>
        <legend style={{ fontSize: 12, color: "#64748b", padding: "0 4px" }}>Responsáveis (marque um ou mais)</legend>
        {usuarios.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
            {usuarios.map((u) => (
              <label key={u.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, whiteSpace: "nowrap" }}>
                <input type="checkbox" name="responsaveis" value={u.id} defaultChecked={marcados.has(u.id)} style={{ width: "auto", margin: 0 }} />
                {u.nome}
              </label>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#92400e" }}>
            A lista de usuários deste portal ainda não chegou à Flórida: abra o Cronograma uma vez e volte aqui.
          </div>
        )}
        {!!p?.responsaveisFixos?.length && (
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
            Também responsáveis (definidos pela Flórida): {p.responsaveisFixos.join(", ")}
          </div>
        )}
      </fieldset>
      <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, alignItems: "center" }}>
        <button type="submit" style={s.primario}>{p ? "Salvar alterações" : "Criar pendência"}</button>
        <a href={url(c)} style={s.link}>Cancelar</a>
      </div>
    </form>
  );
}

function Linha({ p, d, c, editando }: { p: Pendencia; d: Dados; c: Ctx; editando: boolean }) {
  const manter = <input type="hidden" name="todas" value={c.todas ? "1" : ""} />;
  if (editando) {
    return (
      <tr>
        <td colSpan={7} style={{ ...s.td, background: "#f8fafc" }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Editar pendência</div>
          <Formulario p={p} d={d} c={c} />
        </td>
      </tr>
    );
  }
  return (
    <tr style={{ background: p.atrasada ? "#fef2f2" : undefined }}>
      <td style={s.td}>
        <div style={{ fontWeight: 500, whiteSpace: "pre-line" }}>{p.acao}</div>
        {p.contexto && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2, whiteSpace: "pre-line" }}>{p.contexto}</div>}
        <details style={{ marginTop: 6 }}>
          <summary style={{ fontSize: 12, color: "#475569", cursor: "pointer" }}>
            Anotações ({p.historico.length})
          </summary>
          <div style={{ marginTop: 6 }}>
            {p.historico.map((h, i) => (
              <div key={i} style={{ fontSize: 12, padding: "3px 0", borderBottom: "1px dashed #e2e8f0", color: h.tipo === "STATUS" ? "#64748b" : "#0f172a" }}>
                <span style={{ color: "#64748b" }}>{dataBR(h.data)}{h.autor ? ` · ${h.autor}` : ""}:</span> {h.texto}
              </div>
            ))}
            <form action={c.acao} style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <input type="hidden" name="tipo" value="anotar" />
              {manter}
              <input type="hidden" name="acaoId" value={p.id} />
              <input name="texto" required maxLength={4000} placeholder="Escreva uma anotação…" style={{ ...s.campo, flex: 1, width: "100%" }} />
              <button type="submit" style={s.botao}>Anotar</button>
            </form>
          </div>
        </details>
      </td>
      <td style={s.td}>{p.responsaveis.join(", ") || "—"}</td>
      <td style={{ ...s.td, whiteSpace: "nowrap", color: "#64748b" }}>{dataBR(p.identificadaEm) || "—"}</td>
      <td style={{ ...s.td, whiteSpace: "nowrap" }}>
        {dataBR(p.prazo) || p.prazoTexto || "—"}
        {p.atrasada && <div style={{ fontSize: 11, color: "#991b1b" }}>atrasada</div>}
      </td>
      <td style={{ ...s.td, whiteSpace: "nowrap" }}>{p.bolaCom ? c.bola[p.bolaCom] : "—"}</td>
      <td style={s.td}>
        <Etiqueta p={p} />
        <form action={c.acao} style={{ display: "flex", gap: 4, marginTop: 6 }}>
          <input type="hidden" name="tipo" value="situacao" />
          {manter}
          <input type="hidden" name="acaoId" value={p.id} />
          <select name="situacao" defaultValue={p.situacao} style={s.campo} aria-label="Nova situação">
            {d.situacoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
          </select>
          <button type="submit" style={s.botao}>Mudar</button>
        </form>
      </td>
      <td style={{ ...s.td, whiteSpace: "nowrap" }}>
        <a href={url(c, `editar=${p.id}`)} style={s.link}>Editar</a>
      </td>
    </tr>
  );
}

export default function PendenciasFlorida({ r, acao, rota, todas, msg, erro, editar, nova, filtro }: {
  r: ResultadoPend; acao: Acao; rota: string; todas: boolean; msg?: string; erro?: string;
  /** O card clicado (?filtro=); sem ele, tudo. */
  filtro?: string;
  /** id da pendência com o formulário aberto (?editar=), ou a nova (?nova=1). */
  editar?: number; nova?: boolean;
}) {
  const voltar = <Link href="/" style={{ ...s.link, display: "inline-block", marginBottom: 12 }}>◄ Menu principal</Link>;
  if (!r.ok) {
    return (
      <div style={s.pagina}>
        {voltar}
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 12px" }}>Rituais de Gestão</h1>
        <div style={s.aviso}>{r.erro}</div>
      </div>
    );
  }
  const d = r.dados;
  const c: Ctx = { acao, rota, todas, bola: bolaDe(d) };
  const aberta = (p: Pendencia) => p.situacao !== "CONCLUIDA" && p.situacao !== "CANCELADA";
  const abertas = d.pendencias.filter(aberta);
  const kpis: { k: FiltroPend; rotulo: string; cor: string; filtra: (p: Pendencia) => boolean }[] = [
    { k: "abertas", rotulo: "Abertas", cor: "#0f172a", filtra: aberta },
    { k: "atrasadas", rotulo: "Atrasadas", cor: "#991b1b", filtra: (p) => aberta(p) && p.atrasada },
    { k: "cliente", rotulo: `Com ${c.bola.CLIENTE.replace(" (cliente)", "")}`, cor: "#92400e", filtra: (p) => aberta(p) && p.bolaCom === "CLIENTE" },
    { k: "florida", rotulo: "Com a Flórida", cor: "#075985", filtra: (p) => aberta(p) && p.bolaCom === "FLORIDA" },
    // 09/11/2026, pedido dela: "criar novo card como concluída". A página traz
    // sempre as concluídas (os números contam todas); sem card, a lista mostra
    // só as abertas — ou todas, com "Mostrar também as concluídas".
    { k: "concluidas", rotulo: "Concluídas", cor: "#065f46", filtra: (p) => p.situacao === "CONCLUIDA" },
  ];
  const sel = kpis.find((k) => k.k === filtro);
  const base = todas ? d.pendencias : abertas;
  const mostradas = sel ? d.pendencias.filter(sel.filtra) : base;
  const temas = new Map<string, Pendencia[]>();
  for (const p of mostradas) {
    const t = p.tema || "Sem tema";
    temas.set(t, [...(temas.get(t) ?? []), p]);
  }
  return (
    <div style={s.pagina}>
      {voltar}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Rituais de Gestão</h1>
          <div style={{ fontSize: 13, color: "#64748b" }}>
            As pendências combinadas com a Flórida nos Checkpoints. Aqui vocês acompanham, criam, editam e anotam.
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <a href={todas ? rota : `${rota}?todas=1`} style={s.link}>
            {todas ? "Mostrar só as abertas" : "Mostrar também as concluídas"}
          </a>
          {!nova && <a href={url(c, "nova=1")} style={{ ...s.primario, textDecoration: "none" }}>+ Nova pendência</a>}
        </div>
      </div>
      {msg && <div style={s.ok}>{msg}</div>}
      {erro && <div style={s.aviso}>{erro}</div>}
      {nova && (
        <div style={{ ...s.caixa, borderColor: "#93c5fd" }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Nova pendência</div>
          <Formulario d={d} c={c} />
        </div>
      )}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        {kpis.map((k) => {
          const ativo = sel?.k === k.k;
          // Clicar de novo no card escolhido volta a mostrar tudo.
          const href = url(c, ativo ? undefined : `filtro=${k.k}`);
          return (
            <a key={k.k} href={href} aria-pressed={ativo} title={ativo ? "Clique para mostrar tudo" : "Clique para ver só estas"}
              style={{ ...s.kpi, textDecoration: "none", color: "inherit", cursor: "pointer",
                border: ativo ? "2px solid #2563eb" : s.kpi.border, background: ativo ? "#eff6ff" : "#fff" }}>
              <div style={{ fontSize: 12, color: ativo ? "#1e40af" : "#64748b", fontWeight: ativo ? 600 : 400 }}>{k.rotulo}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: k.cor }}>{d.pendencias.filter(k.filtra).length}</div>
            </a>
          );
        })}
      </div>
      {sel && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginBottom: 12, color: "#334155" }}>
          <span>Mostrando {mostradas.length} de {d.pendencias.length}:</span>
          <span style={{ background: "#dbeafe", color: "#1e40af", borderRadius: 999, padding: "2px 10px" }}>
            {sel.rotulo} <a href={url(c)} style={{ color: "#1e40af", textDecoration: "none", marginLeft: 4 }} title="Mostrar tudo">✕</a>
          </span>
        </div>
      )}
      {!mostradas.length && <div style={s.caixa}>Nenhuma pendência {sel ? "neste card" : todas ? "" : "aberta "}por aqui.</div>}
      {[...temas].map(([tema, lista]) => (
        <div key={tema} style={s.caixa}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>{tema} <span style={{ color: "#94a3b8", fontWeight: 400 }}>· {lista.length}</span></div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={s.th}>Ação</th>
                  <th style={s.th}>Responsável</th>
                  <th style={s.th}>Identificada</th>
                  <th style={s.th}>Prazo</th>
                  <th style={s.th}>Com quem está</th>
                  <th style={s.th}>Situação</th>
                  <th style={s.th}></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => <Linha key={p.id} p={p} d={d} c={c} editando={editar === p.id} />)}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
