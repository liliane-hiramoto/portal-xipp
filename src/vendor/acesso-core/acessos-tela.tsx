"use client";
// A tela de Acessos — a MESMA em todo portal (item 9, passo 2, 11/11/2026):
//   • Pessoas:    lista à esquerda, FICHA do login à direita (só os módulos que
//                 a pessoa TEM), com as ações do login e o "Admin do portal";
//   • Por módulo: a pergunta inversa — "quem enxerga o Tributos?";
//   • Perfis:     moldes "módulo → papel" aplicados num clique (se o portal tem).
// Para o ADMIN DE MÓDULO (`escopo`), a mesma tela recortada: só os módulos
// dele, sem login, senha, admin do portal nem perfis.
// Nasceu da tela dos portais fiscais (que copiou a do Flórida).
//
// Fala com UMA rota do portal (padrão `/api/acessos`), que confere o admin do
// portal e chama `listarAcessos`/`tratarAcao` (./acessos). Estilo inline pelo
// mesmo motivo do `telas.tsx`: classe de fora não chega igual em todo portal.
//
// No portal (página do servidor, depois de conferir o admin):
//   <TelaAcessos meuId={user.id} />
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import type { DadosAcessos, Perfil, Pessoa } from "./acessos";

type Acao = (payload: Record<string, unknown>, ok?: string) => Promise<Record<string, unknown> | null>;
type Aba = "pessoas" | "modulos" | "perfis";

const ROTULO: Record<string, string> = { viewer: "Somente leitura", editor: "Editor", admin: "Admin" };
const rotulo = (p: string) => ROTULO[p] ?? p;

// ---- estilo ----------------------------------------------------------------
// Todo botão e todo rótulo diz a sua margem, largura, peso e cor: o CSS do
// portal pega elemento solto (a Affix tem `button{width:100%;margin-top:16px}`
// e `label{display:block;font-weight:600;color:…}`), e `style` só ganha no que
// ele declara.
const BT: CSSProperties = { margin: 0, width: "auto", fontWeight: 400, fontSize: 14, borderRadius: 0, padding: 0, border: 0, background: "none", color: "inherit", cursor: "pointer", fontFamily: "inherit", lineHeight: "normal" };
const LB: CSSProperties = { display: "block", margin: 0, fontWeight: 400, fontSize: "inherit", color: "inherit" };
const C = { borda: "#e2e8f0", texto: "#0f172a", cinza: "#64748b", claro: "#94a3b8", fundo: "#fff", violeta: "#6d28d9" };
const S = {
  raiz: { display: "flex", flexDirection: "column", gap: 20, fontSize: 14, color: C.texto } as CSSProperties,
  topo: { display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 } as CSSProperties,
  titulo: { fontSize: 24, fontWeight: 600, margin: 0, color: "#1e293b" } as CSSProperties,
  abas: { display: "flex", gap: 4, flexWrap: "wrap" } as CSSProperties,
  aba: (ativa: boolean): CSSProperties => ({ ...BT, border: 0, borderRadius: 6, padding: "6px 12px", fontSize: 14, cursor: "pointer", background: ativa ? "#0f172a" : "transparent", color: ativa ? "#fff" : "#475569" }),
  aviso: (ok: boolean): CSSProperties => ({ borderRadius: 8, padding: "8px 14px", fontSize: 14, border: `1px solid ${ok ? "#a7f3d0" : "#fecaca"}`, background: ok ? "#ecfdf5" : "#fef2f2", color: ok ? "#047857" : "#b91c1c" }),
  amarelo: { borderRadius: 12, padding: "10px 14px", border: "1px solid #fde68a", background: "#fffbeb", color: "#92400e" } as CSSProperties,
  grade: { display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" } as CSSProperties,
  cartao: { background: C.fundo, border: `1px solid ${C.borda}`, borderRadius: 12 } as CSSProperties,
  lbl: LB,
  campo: { display: "block", width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 8, padding: "6px 10px", fontSize: 14, color: C.texto, background: "#fff", outline: "none", margin: 0 } as CSSProperties,
  sel: { border: "1px solid #cbd5e1", borderRadius: 6, padding: "4px 6px", fontSize: 12, background: "#fff", color: C.texto, width: "auto", margin: 0 } as CSSProperties,
  botao: { ...BT, border: 0, borderRadius: 8, padding: "7px 14px", fontSize: 14, fontWeight: 600, background: "#0f172a", color: "#fff", cursor: "pointer", width: "auto" } as CSSProperties,
  botaoP: { ...BT, border: "1px solid #cbd5e1", borderRadius: 6, padding: "4px 10px", fontSize: 12, background: "#fff", color: "#334155", cursor: "pointer", width: "auto" } as CSSProperties,
  link: (cor = "#334155"): CSSProperties => ({ ...BT, background: "none", border: 0, padding: 0, fontSize: 12, color: cor, cursor: "pointer", textDecoration: "underline", width: "auto" }),
  rotulo: { display: "block", margin: 0, fontWeight: 400, fontSize: 12, color: C.cinza, marginBottom: 2 } as CSSProperties,
  selo: (fundo: string, cor: string): CSSProperties => ({ borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 500, background: fundo, color: cor }),
  secao: { fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", color: C.claro } as CSSProperties,
  linha: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: "8px 12px", borderTop: "1px solid #f1f5f9" } as CSSProperties,
  pequeno: { fontSize: 12, color: C.cinza } as CSSProperties,
};

/** A tela inteira. `api` = a rota do portal; `meuId` = quem está logado. */
export function TelaAcessos({ meuId, api = "/api/acessos", titulo = "Acessos" }: { meuId: string; api?: string; titulo?: string }) {
  const [aba, setAba] = useState<Aba>("pessoas");
  const [pessoa, setPessoa] = useState<string | null>(null);
  const [d, setD] = useState<DadosAcessos | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  const buscar = useCallback(async (): Promise<{ dados?: DadosAcessos; erro?: string }> => {
    const r = await fetch(api, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { dados: j as DadosAcessos } : { erro: String(j.error || j.erro || "Falha ao carregar.") };
  }, [api]);
  const aplicar = useCallback((r: { dados?: DadosAcessos; erro?: string }) => {
    if (r.erro) setMsg({ ok: false, t: r.erro });
    else if (r.dados) setD(r.dados);
  }, []);
  const carregar = useCallback(async () => aplicar(await buscar()), [buscar, aplicar]);

  // ?aba= e ?pessoa= no endereço (link da aba "Por módulo", favorito). O
  // setState fica no callback, não no corpo do efeito.
  useEffect(() => {
    let vivo = true;
    const q = new URLSearchParams(window.location.search);
    buscar().then((r) => {
      if (!vivo) return;
      const a = q.get("aba");
      if (a === "modulos" || a === "perfis") setAba(a);
      if (q.get("pessoa")) setPessoa(q.get("pessoa"));
      aplicar(r);
    });
    return () => { vivo = false; };
  }, [buscar, aplicar]);

  const irPara = (a: Aba, p: string | null = null) => {
    setAba(a);
    setPessoa(p);
    const q = new URLSearchParams();
    if (a !== "pessoas") q.set("aba", a);
    if (p) q.set("pessoa", p);
    window.history.replaceState(null, "", `${window.location.pathname}${q.toString() ? `?${q}` : ""}`);
  };

  const acao: Acao = useCallback(async (payload, ok) => {
    const r = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) { setMsg({ ok: false, t: "Erro: " + String(j.error || j.erro || r.statusText) }); return null; }
    setMsg(j.aviso ? { ok: false, t: String(j.aviso) } : ok ? { ok: true, t: ok } : null);
    await carregar();
    return j;
  }, [api, carregar]);

  const temPerfis = d ? d.perfis !== undefined : false;
  return (
    <div style={S.raiz}>
      <div style={S.topo}>
        <h1 style={S.titulo}>{titulo}</h1>
        <nav style={S.abas}>
          <button type="button" style={S.aba(aba === "pessoas")} onClick={() => irPara("pessoas")}>Pessoas</button>
          <button type="button" style={S.aba(aba === "modulos")} onClick={() => irPara("modulos")}>Por módulo</button>
          {temPerfis && <button type="button" style={S.aba(aba === "perfis")} onClick={() => irPara("perfis")}>Perfis de acesso</button>}
        </nav>
      </div>
      {msg && <div style={S.aviso(msg.ok)}>{msg.t}</div>}
      {d?.escopo && (
        <div style={S.amarelo}>
          Você administra <b>{d.modulos.map((m) => m.label).join(", ") || "nenhum módulo"}</b>: dá e tira o acesso de quem usa
          {d.modulos.length === 1 ? " esse módulo" : " esses módulos"}. Criar login, senha e o papel Admin ficam com o admin do portal.
        </div>
      )}
      {!d ? (
        <div style={{ padding: 40, textAlign: "center", color: C.cinza }}>{msg ? "" : "Carregando…"}</div>
      ) : aba === "modulos" ? (
        <PorModulo d={d} abrir={(id) => irPara("pessoas", id)} />
      ) : aba === "perfis" && temPerfis ? (
        <Perfis d={d} acao={acao} />
      ) : (
        <Pessoas key={pessoa ?? ""} d={d} acao={acao} meuId={meuId} inicial={pessoa} />
      )}
    </div>
  );
}

/** Resumo de uma linha da lista: o que a pessoa é, em poucas palavras. */
function resumo(u: Pessoa): { texto: string; cor: string } {
  if (!u.ativo) return { texto: "inativo — não entra", cor: "#dc2626" };
  if (u.super_admin) return { texto: "super-admin", cor: C.violeta };
  if (u.admin_portal) return { texto: "admin do portal", cor: C.violeta };
  const n = u.acessos.length;
  return { texto: n === 0 ? "login, nenhum módulo" : `${n} ${n === 1 ? "módulo" : "módulos"}`, cor: n === 0 ? "#d97706" : C.cinza };
}

function Pessoas({ d, acao, meuId, inicial }: { d: DadosAcessos; acao: Acao; meuId: string; inicial: string | null }) {
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<string | null>(inicial ?? d.usuarios[0]?.id ?? null);
  const [novo, setNovo] = useState(false);
  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return d.usuarios.filter((u) => !t || u.nome.toLowerCase().includes(t) || u.email.toLowerCase().includes(t));
  }, [d, busca]);
  const atual = d.usuarios.find((u) => u.id === sel) ?? null;

  return (
    <div style={S.grade}>
      <div style={{ ...S.cartao, flex: "1 1 260px", maxWidth: 340, minWidth: 0 }}>
        <div style={{ padding: 12, borderBottom: "1px solid #f1f5f9", display: "flex", flexDirection: "column", gap: 8 }}>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="🔎 Buscar por nome ou e-mail…" style={S.campo} />
          {!d.escopo && <button type="button" style={{ ...S.botao, width: "100%" }} onClick={() => { setNovo(true); setSel(null); }}>+ Novo usuário</button>}
        </div>
        <ul style={{ listStyle: "none", margin: 0, padding: "4px 0", maxHeight: "65vh", overflowY: "auto" }}>
          {lista.map((u) => {
            const r = resumo(u);
            const ativo = u.id === sel;
            return (
              <li key={u.id}>
                <button type="button" onClick={() => { setSel(u.id); setNovo(false); }}
                  style={{ ...BT, display: "block", width: "100%", textAlign: "left", border: 0, cursor: "pointer", padding: "8px 12px", background: ativo ? "#0f172a" : !u.ativo ? "#fef2f2" : "transparent", color: ativo ? "#fff" : C.texto }}>
                  <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.nome || u.email}</div>
                  <div style={{ fontSize: 12, color: ativo ? "#cbd5e1" : r.cor, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.nome ? `${u.email} · ` : ""}{r.texto}</div>
                </button>
              </li>
            );
          })}
          {lista.length === 0 && <li style={{ padding: 24, textAlign: "center", color: C.claro }}>Ninguém encontrado.</li>}
        </ul>
      </div>
      <div style={{ ...S.cartao, flex: "3 1 380px", minWidth: 0, padding: 20 }}>
        {novo ? (
          <NovoUsuario acao={acao} perfis={d.perfis ?? []} aoCriar={(id) => { setNovo(false); setSel(id); }} />
        ) : atual ? (
          <Ficha key={atual.id} u={atual} d={d} acao={acao} eu={atual.id === meuId} />
        ) : (
          <p style={{ color: C.claro, margin: 0 }}>Escolha uma pessoa na lista.</p>
        )}
      </div>
    </div>
  );
}

function NovoUsuario({ acao, aoCriar, perfis }: { acao: Acao; aoCriar: (id: string) => void; perfis: Perfil[] }) {
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [perfil, setPerfil] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const ativos = perfis.filter((p) => p.ativo);
  async function criar(e: FormEvent) {
    e.preventDefault();
    setOcupado(true);
    const r = await acao({ acao: "criar_usuario", email, nome, senha, ...(perfil ? { perfil_id: Number(perfil) } : {}) });
    setOcupado(false);
    if (r?.id) {
      alert(`Usuário ${email} criado.\n\nSenha provisória: ${r.senha}\n\nAnote agora — ela não aparece de novo. A pessoa troca a senha no 1º acesso.`);
      aoCriar(String(r.id));
    }
  }
  return (
    <form onSubmit={criar} style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 420 }}>
      <div style={{ fontSize: 18, fontWeight: 600 }}>Novo usuário</div>
      <label style={S.lbl}><span style={S.rotulo}>E-mail</span><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={S.campo} /></label>
      <label style={S.lbl}><span style={S.rotulo}>Nome (opcional)</span><input value={nome} onChange={(e) => setNome(e.target.value)} style={S.campo} /></label>
      <label style={S.lbl}><span style={S.rotulo}>Senha inicial</span><input value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="vazio = o sistema sorteia uma" style={S.campo} /></label>
      {ativos.length > 0 && (
        <label style={S.lbl}><span style={S.rotulo}>Perfil de acesso (opcional)</span>
          <select value={perfil} onChange={(e) => setPerfil(e.target.value)} style={S.campo}>
            <option value="">— nenhum: dar acesso depois, módulo a módulo —</option>
            {ativos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </label>
      )}
      <div><button type="submit" disabled={ocupado} style={{ ...S.botao, opacity: ocupado ? 0.5 : 1 }}>{ocupado ? "Criando…" : "Criar usuário"}</button></div>
    </form>
  );
}

/** FICHA de acesso de UM login: o login no topo, e só os módulos que ele TEM. */
function Ficha({ u, d, acao, eu }: { u: Pessoa; d: DadosAcessos; acao: Acao; eu: boolean }) {
  const [novoMod, setNovoMod] = useState("");
  const [novoPapel, setNovoPapel] = useState("");
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(u.nome);
  const [email, setEmail] = useState(u.email);
  const [perfil, setPerfil] = useState("");
  const papelDe = (m: string) => u.acessos.find((a) => a.modulo === m)?.papel;
  const com = d.modulos.filter((m) => papelDe(m.key));
  const sem = d.modulos.filter((m) => !papelDe(m.key));
  const perfis = (d.perfis ?? []).filter((p) => p.ativo);
  const modNovo = d.modulos.find((m) => m.key === novoMod);
  const papelNovo = modNovo?.papeis.length === 1 ? modNovo.papeis[0] : novoPapel;
  const quem = u.nome || u.email;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        {editando ? (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 8 }}>
            <label style={S.lbl}><span style={S.rotulo}>Nome</span><input value={nome} onChange={(e) => setNome(e.target.value)} style={S.campo} /></label>
            <label style={S.lbl}><span style={S.rotulo}>E-mail</span><input value={email} onChange={(e) => setEmail(e.target.value)} style={S.campo} /></label>
            <button type="button" style={S.botaoP} onClick={async () => { if (await acao({ acao: "editar_usuario", user_id: u.id, nome, email }, "Dados atualizados.")) setEditando(false); }}>Salvar</button>
            <button type="button" style={S.link(C.cinza)} onClick={() => setEditando(false)}>cancelar</button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 18, fontWeight: 600, wordBreak: "break-word" }}>{quem}</div>
            <div style={{ color: C.cinza, wordBreak: "break-all" }}>{u.email}</div>
          </>
        )}
      </div>

      {/* LOGIN */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <span style={u.ativo ? S.selo("#d1fae5", "#047857") : S.selo("#fee2e2", "#b91c1c")}>{u.ativo ? "login ativo" : "inativo"}</span>
        {u.super_admin && <span style={S.selo("#ede9fe", C.violeta)}>super-admin</span>}
        {!u.super_admin && u.admin_portal && <span style={S.selo("#ede9fe", C.violeta)}>admin do portal</span>}
        <span style={S.pequeno}>
          {u.ultimo_acesso ? `último acesso ${new Date(u.ultimo_acesso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : "nunca acessou"}
        </span>
        {!d.escopo && <details style={{ marginLeft: "auto", fontSize: 12 }}>
          <summary style={{ cursor: "pointer", color: C.cinza, fontWeight: 400 }}>Ações do login ▾</summary>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
            <button type="button" style={S.link()} onClick={() => setEditando(true)}>Editar nome / e-mail</button>
            <button type="button" style={S.link()} onClick={async () => {
              if (!confirm(`Gerar uma senha provisória nova para ${u.email}?`)) return;
              const r = await acao({ acao: "trocar_senha", user_id: u.id });
              if (r?.senha) alert(`Senha provisória de ${u.email}: ${r.senha}\n\nAnote agora — ela não aparece de novo. A troca é cobrada no próximo acesso.`);
            }}>Redefinir senha</button>
            {!eu && !u.super_admin && (
              <>
                <button type="button" style={S.link()} onClick={() => acao({ acao: "ativo", user_id: u.id, valor: !u.ativo }, u.ativo ? "Login inativado." : "Login reativado.")}>
                  {u.ativo ? "Inativar login" : "Reativar login"}
                </button>
                <button type="button" style={S.link("#dc2626")} onClick={() => { if (confirm(`Excluir o login ${u.email}? Os acessos serão removidos.`)) acao({ acao: "excluir_usuario", user_id: u.id }, "Login excluído."); }}>Excluir login</button>
              </>
            )}
          </div>
        </details>}
      </div>

      {/* ADMIN DO PORTAL — separado do papel "admin" de cada módulo */}
      {u.super_admin ? (
        <div style={{ borderRadius: 8, border: `1px solid ${C.borda}`, background: "#f8fafc", padding: "8px 12px", color: "#475569" }}>
          Super-admin: vê e administra <b>todos</b> os módulos — não precisa de acesso módulo a módulo.
        </div>
      ) : d.escopo ? null : (
        <label style={{ ...LB, display: "flex", alignItems: "flex-start", gap: 8, borderRadius: 8, padding: "8px 12px", border: `1px solid ${u.admin_portal ? "#ddd6fe" : C.borda}`, background: u.admin_portal ? "#f5f3ff" : "#fff", opacity: eu ? 0.6 : 1 }}>
          <input type="checkbox" style={{ margin: "3px 0 0", width: "auto", padding: 0 }} checked={u.admin_portal} disabled={eu}
            onChange={(e) => {
              const valor = e.target.checked;
              if (valor && !confirm(`Tornar ${quem} ADMIN DO PORTAL?\n\nA pessoa passa a criar contas, dar e tirar acesso a qualquer módulo e ver todos os dados do portal.`)) return;
              acao({ acao: "admin_portal", user_id: u.id, valor }, valor ? "Agora é admin do portal." : "Deixou de ser admin do portal.");
            }} />
          <span>
            <span style={{ fontWeight: 500 }}>Admin do portal</span>
            <span style={{ display: "block", ...S.pequeno }}>
              Cria contas e dá acesso a tudo. O papel &quot;Admin&quot; de um módulo, abaixo, vale só para aquele módulo.
              {eu && " (o seu próprio não se muda por aqui)"}
            </span>
          </span>
        </label>
      )}

      {/* MÓDULOS — só o que a pessoa TEM */}
      {!u.super_admin && (
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
            <span style={S.secao}>Acessa {com.length} {com.length === 1 ? "módulo" : "módulos"}</span>
            {perfis.length > 0 && (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <select value={perfil} onChange={(e) => setPerfil(e.target.value)} style={S.sel}>
                  <option value="">Aplicar perfil…</option>
                  {perfis.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
                <button type="button" disabled={!perfil} style={{ ...S.botaoP, opacity: perfil ? 1 : 0.4 }} onClick={async () => {
                  const pf = perfis.find((p) => String(p.id) === perfil);
                  if (!pf) return;
                  const lista = pf.itens.map((i) => `• ${d.modulos.find((m) => m.key === i.modulo)?.label ?? i.modulo}: ${rotulo(i.papel)}`).join("\n");
                  if (!confirm(`Aplicar o perfil "${pf.nome}"?\n\n${lista || "(sem módulos)"}\n\nNesses módulos, o papel atual é substituído.`)) return;
                  if (await acao({ acao: "aplicar_perfil", user_id: u.id, perfil_id: pf.id }, `Perfil "${pf.nome}" aplicado.`)) setPerfil("");
                }}>Aplicar</button>
              </span>
            )}
          </div>
          {com.length === 0 ? (
            <p style={{ color: C.claro, margin: 0 }}>Nenhum módulo ainda. Dê acesso abaixo{perfis.length ? " ou aplique um perfil" : ""}.</p>
          ) : (
            <div style={{ border: `1px solid ${C.borda}`, borderRadius: 8, overflow: "hidden" }}>
              {com.map((m, i) => (
                <div key={m.key} style={{ ...S.linha, ...(i === 0 ? { borderTop: 0 } : {}) }}>
                  <span style={{ flex: "1 1 160px" }}>{m.label}</span>
                  {d.escopo && papelDe(m.key) === "admin" ? (
                    <span style={S.pequeno}>Admin — só o admin do portal muda</span>
                  ) : m.papeis.length > 1 ? (
                    <select value={papelDe(m.key)} style={S.sel} onChange={(e) => acao({ acao: "conceder_acesso", user_id: u.id, modulo: m.key, papel: e.target.value })}>
                      {m.papeis.map((p) => <option key={p} value={p}>{rotulo(p)}</option>)}
                    </select>
                  ) : (
                    <span style={S.pequeno}>tem acesso</span>
                  )}
                  {!(d.escopo && papelDe(m.key) === "admin") && (
                    <button type="button" style={S.link("#dc2626")} onClick={() => { if (confirm(`Tirar o acesso de ${quem} a ${m.label}?`)) acao({ acao: "revogar_acesso", user_id: u.id, modulo: m.key }); }}>tirar</button>
                  )}
                </div>
              ))}
            </div>
          )}
          {sem.length > 0 && (
            <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 12 }}>
              <span style={{ color: C.cinza }}>+ Dar acesso a</span>
              <select value={novoMod} onChange={(e) => { setNovoMod(e.target.value); setNovoPapel(""); }} style={S.sel}>
                <option value="">— módulo —</option>
                {sem.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
              {modNovo && modNovo.papeis.length > 1 && (
                <select value={novoPapel} onChange={(e) => setNovoPapel(e.target.value)} style={S.sel}>
                  <option value="">— papel —</option>
                  {modNovo.papeis.map((p) => <option key={p} value={p}>{rotulo(p)}</option>)}
                </select>
              )}
              <button type="button" disabled={!novoMod || !papelNovo} style={{ ...S.botaoP, opacity: novoMod && papelNovo ? 1 : 0.4 }}
                onClick={async () => { if (await acao({ acao: "conceder_acesso", user_id: u.id, modulo: novoMod, papel: papelNovo })) { setNovoMod(""); setNovoPapel(""); } }}>Dar acesso</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** A pergunta inversa: quem enxerga cada módulo, e com que papel. */
function PorModulo({ d, abrir }: { d: DadosAcessos; abrir: (id: string) => void }) {
  const todos = d.usuarios.filter((u) => u.super_admin || u.admin_portal);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {todos.length > 0 && (
        <p style={{ margin: 0, color: "#475569" }}><b>Veem todos os módulos</b> (super-admin e admin do portal): {todos.map((u) => u.nome || u.email).join(", ")}.</p>
      )}
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
        {d.modulos.map((m) => {
          const quem = d.usuarios
            .map((u) => ({ u, papel: u.acessos.find((a) => a.modulo === m.key)?.papel }))
            .filter((x) => x.papel && !x.u.super_admin && !x.u.admin_portal);
          return (
            <div key={m.key} style={{ ...S.cartao, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontWeight: 500 }}>{m.label}</span>
                <span style={{ fontSize: 12, color: C.claro, whiteSpace: "nowrap", marginLeft: 8 }}>{quem.length} {quem.length === 1 ? "pessoa" : "pessoas"}</span>
              </div>
              {quem.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, color: C.claro }}>Ninguém além dos admins do portal.</p>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                  {quem.map(({ u, papel }) => (
                    <li key={u.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, color: u.ativo ? "#334155" : "#dc2626" }}>
                      <button type="button" onClick={() => abrir(u.id)} style={{ ...S.link(u.ativo ? "#334155" : "#dc2626"), fontSize: 14, textDecoration: "none", textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {u.nome || u.email}{u.ativo ? "" : " (inativo)"}
                      </button>
                      {m.papeis.length > 1 && <span style={{ flexShrink: 0, ...S.pequeno }}>{rotulo(papel!)}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const VAZIO = (): Perfil => ({ id: 0, nome: "", descricao: null, ordem: 0, ativo: true, itens: [] });

function Perfis({ d, acao }: { d: DadosAcessos; acao: Acao }) {
  const [editando, setEditando] = useState<Perfil | null>(null);
  if (!d.perfis) {
    return <div style={S.amarelo}>Os perfis de acesso ainda não existem neste banco: falta aplicar a migração dos perfis no Supabase.</div>;
  }
  const papelDe = (p: Perfil, m: string) => p.itens.find((i) => i.modulo === m)?.papel ?? "";
  const setPapel = (m: string, papel: string) =>
    setEditando((e) => e && { ...e, itens: [...e.itens.filter((i) => i.modulo !== m), ...(papel ? [{ modulo: m, papel }] : [])] });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <p style={{ margin: 0, maxWidth: 640, color: C.cinza }}>
          Moldes que empacotam <b>módulo → papel</b>. Na ficha de cada pessoa (ou ao criar o usuário), aplique um perfil com
          um clique para dar o pacote de acessos de uma vez.
        </p>
        {!editando && <button type="button" style={S.botao} onClick={() => setEditando(VAZIO())}>+ Novo perfil</button>}
      </div>

      {editando && (
        <div style={{ ...S.cartao, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontWeight: 600 }}>{editando.id ? `Editar: ${editando.nome}` : "Novo perfil"}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
            <label style={{ ...LB, flex: "1 1 200px" }}><span style={S.rotulo}>Nome</span><input value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} style={S.campo} /></label>
            <label style={{ ...LB, width: 90 }}><span style={S.rotulo}>Ordem</span><input type="number" value={editando.ordem} onChange={(e) => setEditando({ ...editando, ordem: Number(e.target.value) })} style={S.campo} /></label>
            <label style={{ ...LB, display: "flex", alignItems: "center", gap: 6, paddingBottom: 8, fontSize: 12 }}>
              <input type="checkbox" style={{ margin: 0, width: "auto", padding: 0 }} checked={editando.ativo} onChange={(e) => setEditando({ ...editando, ativo: e.target.checked })} /> ativo
            </label>
          </div>
          <label style={S.lbl}><span style={S.rotulo}>Descrição</span>
            <input value={editando.descricao ?? ""} onChange={(e) => setEditando({ ...editando, descricao: e.target.value || null })} placeholder="Quem usa este perfil e o que ele libera." style={S.campo} />
          </label>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
            {d.modulos.map((m) => (
              <label key={m.key} style={{ ...LB, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, border: `1px solid ${C.borda}`, borderRadius: 8, padding: "8px 12px" }}>
                <span>{m.label}</span>
                <select value={papelDe(editando, m.key)} onChange={(e) => setPapel(m.key, e.target.value)} style={S.sel}>
                  <option value="">— sem acesso —</option>
                  {m.papeis.map((p) => <option key={p} value={p}>{m.papeis.length === 1 ? "tem acesso" : rotulo(p)}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={S.botao} onClick={async () => {
              if (!editando.nome.trim()) { alert("Informe o nome do perfil."); return; }
              if (await acao({ acao: "salvar_perfil", ...editando }, "Perfil salvo.")) setEditando(null);
            }}>Salvar</button>
            <button type="button" style={S.link(C.cinza)} onClick={() => setEditando(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {d.perfis.length === 0 ? (
        <p style={{ margin: 0, color: C.claro }}>Nenhum perfil cadastrado — crie o primeiro.</p>
      ) : (
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {d.perfis.map((p) => (
            <div key={p.id} style={{ ...S.cartao, padding: 16, ...(p.ativo ? {} : { borderStyle: "dashed", opacity: 0.6 }) }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 500 }}>{p.nome}{!p.ativo && <span style={{ marginLeft: 8, fontSize: 12, color: C.claro }}>(inativo)</span>}</div>
                  {p.descricao && <div style={S.pequeno}>{p.descricao}</div>}
                </div>
                <span style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button type="button" style={S.link()} onClick={() => setEditando(p)}>editar</button>
                  <button type="button" style={S.link("#dc2626")} onClick={() => { if (confirm(`Excluir o perfil "${p.nome}"? Quem já recebeu os acessos continua com eles.`)) acao({ acao: "excluir_perfil", id: p.id }, "Perfil excluído."); }}>excluir</button>
                </span>
              </div>
              <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", color: "#475569" }}>
                {p.itens.length === 0 ? <li style={{ color: C.claro }}>sem módulos</li> : p.itens.map((i) => (
                  <li key={i.modulo}>{d.modulos.find((m) => m.key === i.modulo)?.label ?? i.modulo}: <b>{rotulo(i.papel)}</b></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
