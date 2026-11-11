"use client";

/**
 * Acessos — o layout do Portal Flórida (src/app/acessos de lá), na régua de
 * `user_modules` deste portal. Três abas:
 *   • Pessoas:    lista à esquerda, FICHA do login à direita (só os módulos
 *                 que a pessoa TEM, "módulo → papel"), com as ações do login;
 *   • Por módulo: a pergunta inversa — "quem enxerga o Tributos?";
 *   • Perfis:     moldes "módulo → papel" aplicados num clique (0012).
 * Aqui a "pessoa" é o próprio login: o portal fiscal não tem cadastro de RH.
 * Tudo passa pela /api/acessos, que exige admin do portal.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

interface Acesso { modulo: string; papel: string }
interface Usuario {
  id: string; email: string; nome: string; ultimo_acesso: string | null;
  ativo: boolean; super_admin: boolean; admin_portal?: boolean; acessos: Acesso[];
}
interface Modulo { key: string; label: string }
interface PerfilItem { modulo: string; papel: string }
interface Perfil { id: number; nome: string; descricao: string | null; ordem: number; ativo: boolean; itens: PerfilItem[] }
interface Dados { usuarios: Usuario[]; modulos: Modulo[]; perfis: Perfil[] | null }
type Acao = (payload: Record<string, unknown>, ok?: string) => Promise<Record<string, unknown> | null>;

const PAPEIS: { valor: string; label: string }[] = [
  { valor: "viewer", label: "Somente leitura" },
  { valor: "editor", label: "Editor" },
  { valor: "admin", label: "Admin" },
];
const rotuloPapel = (p: string) => PAPEIS.find((x) => x.valor === p)?.label ?? p;
const campo = "w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-900";
const badge = "rounded-full px-2 py-0.5 text-[11px] font-medium";

type Aba = "pessoas" | "modulos" | "perfis";

export default function AcessosClient({ meuId }: { meuId: string }) {
  const sp = useSearchParams();
  const p = sp.get("aba");
  const aba: Aba = p === "perfis" ? "perfis" : p === "modulos" ? "modulos" : "pessoas";
  const [d, setD] = useState<Dados | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  const buscar = useCallback(async () => {
    const r = await fetch("/api/acessos", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { dados: j as Dados } : { erro: (j.error || j.erro || "Falha ao carregar.") as string };
  }, []);
  const aplicar = useCallback((r: { dados?: Dados; erro?: string }) => {
    if (r.erro) setMsg({ ok: false, t: r.erro });
    else if (r.dados) setD(r.dados);
  }, []);
  const carregar = useCallback(async () => aplicar(await buscar()), [buscar, aplicar]);
  // O setState fica no callback da promessa, não no corpo do efeito.
  useEffect(() => {
    let vivo = true;
    buscar().then((r) => { if (vivo) aplicar(r); });
    return () => { vivo = false; };
  }, [buscar, aplicar]);

  const acao: Acao = useCallback(async (payload, ok) => {
    const r = await fetch("/api/acessos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) { setMsg({ ok: false, t: "Erro: " + (j.error || r.statusText) }); return null; }
    setMsg(ok ? { ok: true, t: ok } : null);
    await carregar();
    return j;
  }, [carregar]);

  const tab = (ativa: boolean) => `rounded-md px-3 py-1.5 text-sm ${ativa ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-800">Acessos</h1>
        <nav className="flex gap-1">
          <Link href="/acessos" className={tab(aba === "pessoas")}>Pessoas</Link>
          <Link href="/acessos?aba=modulos" className={tab(aba === "modulos")}>Por módulo</Link>
          <Link href="/acessos?aba=perfis" className={tab(aba === "perfis")}>Perfis de acesso</Link>
        </nav>
      </div>
      {msg && (
        <div className={`rounded-lg px-4 py-2 text-sm ${msg.ok ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "border border-red-200 bg-red-50 text-red-700"}`}>{msg.t}</div>
      )}
      {!d ? (
        <div className="py-10 text-center text-sm text-slate-500">Carregando…</div>
      ) : aba === "pessoas" ? (
        <Pessoas d={d} acao={acao} meuId={meuId} inicial={sp.get("pessoa")} />
      ) : aba === "modulos" ? (
        <PorModulo d={d} />
      ) : (
        <Perfis d={d} acao={acao} />
      )}
    </div>
  );
}

/** Resumo de uma linha da lista: o que a pessoa é, em poucas palavras. */
function resumo(u: Usuario): { texto: string; cls: string } {
  if (!u.ativo) return { texto: "inativo — não entra", cls: "text-red-600" };
  if (u.super_admin) return { texto: "super-admin", cls: "text-violet-600" };
  if (u.admin_portal) return { texto: "admin do portal", cls: "text-violet-600" };
  const n = u.acessos.length;
  return { texto: n === 0 ? "login, nenhum módulo" : `${n} ${n === 1 ? "módulo" : "módulos"}`, cls: n === 0 ? "text-amber-600" : "text-slate-500" };
}

function Pessoas({ d, acao, meuId, inicial }: { d: Dados; acao: Acao; meuId: string; inicial: string | null }) {
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<string | null>(inicial ?? d.usuarios[0]?.id ?? null);
  const [novo, setNovo] = useState(false);
  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return d.usuarios.filter((u) => !t || u.nome.toLowerCase().includes(t) || u.email.toLowerCase().includes(t));
  }, [d, busca]);
  const atual = d.usuarios.find((u) => u.id === sel) ?? null;

  return (
    <div className="grid gap-4 md:grid-cols-[300px_minmax(0,1fr)]">
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="space-y-2 border-b border-slate-100 p-3">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="🔎 Buscar por nome ou e-mail…" className={campo} />
          <button onClick={() => { setNovo(true); setSel(null); }} className="w-full rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800">
            + Novo usuário
          </button>
        </div>
        <ul className="max-h-[65vh] overflow-y-auto py-1">
          {lista.map((u) => {
            const r = resumo(u);
            const ativo = u.id === sel;
            return (
              <li key={u.id}>
                <button onClick={() => { setSel(u.id); setNovo(false); }}
                  className={`block w-full px-3 py-2 text-left ${ativo ? "bg-slate-900 text-white" : !u.ativo ? "bg-red-50 hover:bg-red-100" : "hover:bg-slate-50"}`}>
                  <div className="truncate text-sm font-medium">{u.nome || u.email}</div>
                  <div className={`text-xs ${ativo ? "text-slate-300" : r.cls}`}>{u.nome ? `${u.email} · ` : ""}{r.texto}</div>
                </button>
              </li>
            );
          })}
          {lista.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-400">Ninguém encontrado.</li>}
        </ul>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        {novo ? (
          <NovoUsuario acao={acao} aoCriar={(id) => { setNovo(false); setSel(id); }} perfis={d.perfis ?? []} />
        ) : atual ? (
          <Ficha key={atual.id} u={atual} d={d} acao={acao} eu={atual.id === meuId} />
        ) : (
          <p className="text-sm text-slate-400">Escolha uma pessoa na lista.</p>
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
  const [busy, setBusy] = useState(false);
  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await acao({ acao: "criar_usuario", email, nome, senha });
    if (r?.id && perfil) await acao({ acao: "aplicar_perfil", user_id: r.id, perfil_id: Number(perfil) });
    setBusy(false);
    if (r?.id) {
      alert(`Usuário ${email} criado.\n\nSenha provisória: ${r.senha}\n\nAnote agora — ela não aparece de novo. A pessoa troca a senha no 1º acesso.`);
      aoCriar(String(r.id));
    }
  }
  return (
    <form onSubmit={criar} className="space-y-3 text-sm">
      <div className="text-lg font-semibold text-slate-800">Novo usuário</div>
      <label className="block text-xs text-slate-500">E-mail
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={campo} />
      </label>
      <label className="block text-xs text-slate-500">Nome (opcional)
        <input value={nome} onChange={(e) => setNome(e.target.value)} className={campo} />
      </label>
      <label className="block text-xs text-slate-500">Senha inicial
        <input value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="vazio = o sistema sorteia uma" className={campo} />
      </label>
      {perfis.some((p) => p.ativo) && (
        <label className="block text-xs text-slate-500">Perfil de acesso (opcional)
          <select value={perfil} onChange={(e) => setPerfil(e.target.value)} className={campo}>
            <option value="">— nenhum: dar acesso depois, módulo a módulo —</option>
            {perfis.filter((p) => p.ativo).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </label>
      )}
      <button disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
        {busy ? "Criando…" : "Criar usuário"}
      </button>
    </form>
  );
}

/** FICHA de acesso de UM login: o login no topo, e só os módulos que ele TEM. */
function Ficha({ u, d, acao, eu }: { u: Usuario; d: Dados; acao: Acao; eu: boolean }) {
  const [novoMod, setNovoMod] = useState("");
  const [novoPapel, setNovoPapel] = useState("");
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(u.nome);
  const [email, setEmail] = useState(u.email);
  const papelDe = (m: string) => u.acessos.find((a) => a.modulo === m)?.papel;
  const com = d.modulos.filter((m) => papelDe(m.key));
  const sem = d.modulos.filter((m) => !papelDe(m.key));
  const perfis = (d.perfis ?? []).filter((p) => p.ativo);
  const [perfil, setPerfil] = useState("");

  return (
    <div className="space-y-5 text-sm">
      <div>
        {editando ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-500">Nome<input value={nome} onChange={(e) => setNome(e.target.value)} className={campo} /></label>
            <label className="text-xs text-slate-500">E-mail<input value={email} onChange={(e) => setEmail(e.target.value)} className={campo} /></label>
            <button onClick={async () => { if (await acao({ acao: "editar_usuario", user_id: u.id, nome, email }, "Dados atualizados.")) setEditando(false); }}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white">Salvar</button>
            <button onClick={() => setEditando(false)} className="text-xs text-slate-500 hover:underline">cancelar</button>
          </div>
        ) : (
          <>
            <div className="text-lg font-semibold text-slate-800">{u.nome || u.email}</div>
            <div className="text-slate-500">{u.email}</div>
          </>
        )}
      </div>

      {/* LOGIN */}
      <div className="flex flex-wrap items-center gap-3">
        <span className={`${badge} ${u.ativo ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{u.ativo ? "login ativo" : "inativo"}</span>
        {u.super_admin && <span className={`${badge} bg-violet-100 text-violet-700`}>super-admin</span>}
        {!u.super_admin && u.admin_portal && <span className={`${badge} bg-violet-100 text-violet-700`}>admin do portal</span>}
        <span className="text-xs text-slate-500">
          {u.ultimo_acesso ? `último acesso ${new Date(u.ultimo_acesso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : "nunca acessou"}
        </span>
        <details className="ml-auto text-xs">
          <summary className="cursor-pointer select-none text-slate-500 hover:text-slate-800">Ações do login ▾</summary>
          <div className="mt-2 flex flex-col items-start gap-1.5">
            <button onClick={() => setEditando(true)} className="text-slate-700 hover:underline">Editar nome / e-mail</button>
            <button
              onClick={async () => {
                if (!confirm(`Gerar uma senha provisória nova para ${u.email}?`)) return;
                const r = await acao({ acao: "trocar_senha", user_id: u.id });
                if (r?.senha) alert(`Senha provisória de ${u.email}: ${r.senha}\n\nAnote agora — ela não aparece de novo. A troca é cobrada no próximo acesso.`);
              }}
              className="text-slate-700 hover:underline">Redefinir senha</button>
            {!eu && !u.super_admin && (
              <>
                <button onClick={() => acao({ acao: "ativo", user_id: u.id, valor: !u.ativo }, u.ativo ? "Login inativado." : "Login reativado.")} className="text-slate-700 hover:underline">
                  {u.ativo ? "Inativar login" : "Reativar login"}
                </button>
                <button onClick={() => { if (confirm(`Excluir o login ${u.email}? Os acessos serão removidos.`)) acao({ acao: "excluir_usuario", user_id: u.id }, "Login excluído."); }}
                  className="text-red-600 hover:underline">Excluir login</button>
              </>
            )}
          </div>
        </details>
      </div>

      {/* ADMIN DO PORTAL (0013) — separado do papel "admin" de cada módulo */}
      {!u.super_admin && (
        <label className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${u.admin_portal ? "border-violet-200 bg-violet-50" : "border-slate-200"} ${eu ? "opacity-60" : ""}`}>
          <input type="checkbox" className="mt-0.5" checked={!!u.admin_portal} disabled={eu}
            onChange={(e) => {
              const valor = e.target.checked;
              if (valor && !confirm(`Tornar ${u.nome || u.email} ADMIN DO PORTAL?\n\nA pessoa passa a criar contas, dar e tirar acesso a qualquer módulo e ver todos os dados do portal.`)) return;
              acao({ acao: "admin_portal", user_id: u.id, valor }, valor ? "Agora é admin do portal." : "Deixou de ser admin do portal.");
            }} />
          <span>
            <span className="font-medium text-slate-800">Admin do portal</span>
            <span className="block text-xs text-slate-500">
              Cria contas e dá acesso a tudo. O papel &quot;admin&quot; de um módulo, abaixo, vale só para aquele módulo.
              {eu && " (o seu próprio não se muda por aqui)"}
            </span>
          </span>
        </label>
      )}

      {/* PERMISSÕES — só o que a pessoa TEM */}
      {u.super_admin ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">
          Super-admin: vê e administra <b>todos</b> os módulos — não precisa de acesso módulo a módulo.
        </div>
      ) : (
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Acessa {com.length} {com.length === 1 ? "módulo" : "módulos"}
            </span>
            {perfis.length > 0 && (
              <div className="flex items-center gap-1.5">
                <select value={perfil} onChange={(e) => setPerfil(e.target.value)} className="rounded border border-slate-300 px-1.5 py-1 text-xs">
                  <option value="">Aplicar perfil…</option>
                  {perfis.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
                <button disabled={!perfil}
                  onClick={async () => {
                    const pf = perfis.find((p) => String(p.id) === perfil);
                    if (!pf) return;
                    const lista = pf.itens.map((i) => `• ${d.modulos.find((m) => m.key === i.modulo)?.label ?? i.modulo}: ${rotuloPapel(i.papel)}`).join("\n");
                    if (!confirm(`Aplicar o perfil "${pf.nome}"?\n\n${lista || "(sem módulos)"}\n\nNesses módulos, o papel atual é substituído.`)) return;
                    if (await acao({ acao: "aplicar_perfil", user_id: u.id, perfil_id: pf.id }, `Perfil "${pf.nome}" aplicado.`)) setPerfil("");
                  }}
                  className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-40">Aplicar</button>
              </div>
            )}
          </div>
          {com.length === 0 ? (
            <p className="text-slate-400">Nenhum módulo ainda. Dê acesso abaixo ou aplique um perfil.</p>
          ) : (
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
              {com.map((m) => (
                <div key={m.key} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <span className="min-w-[160px] flex-1 text-slate-800">{m.label}</span>
                  <select value={papelDe(m.key)} onChange={(e) => acao({ acao: "conceder_acesso", user_id: u.id, modulo: m.key, papel: e.target.value })}
                    className="rounded border border-slate-300 px-1.5 py-1 text-xs">
                    {PAPEIS.map((p) => <option key={p.valor} value={p.valor}>{p.label}</option>)}
                  </select>
                  <button onClick={() => { if (confirm(`Tirar o acesso de ${u.nome || u.email} a ${m.label}?`)) acao({ acao: "revogar_acesso", user_id: u.id, modulo: m.key }); }}
                    className="text-xs text-red-600 hover:underline">tirar</button>
                </div>
              ))}
            </div>
          )}
          {sem.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500">+ Dar acesso a</span>
              <select value={novoMod} onChange={(e) => setNovoMod(e.target.value)} className="rounded border border-slate-300 px-1.5 py-1">
                <option value="">— módulo —</option>
                {sem.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
              {novoMod && (
                <select value={novoPapel} onChange={(e) => setNovoPapel(e.target.value)} className="rounded border border-slate-300 px-1.5 py-1">
                  <option value="">— papel —</option>
                  {PAPEIS.map((p) => <option key={p.valor} value={p.valor}>{p.label}</option>)}
                </select>
              )}
              <button disabled={!novoMod || !novoPapel}
                onClick={async () => { if (await acao({ acao: "conceder_acesso", user_id: u.id, modulo: novoMod, papel: novoPapel })) { setNovoMod(""); setNovoPapel(""); } }}
                className="rounded border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-100 disabled:opacity-40">Dar acesso</button>
            </div>
          )}
          <p className="mt-3 text-[11px] text-slate-400">Admin em qualquer módulo administra o portal (Acessos e Cadastros).</p>
        </div>
      )}
    </div>
  );
}

/** A pergunta inversa: quem enxerga cada módulo, e com que papel. */
function PorModulo({ d }: { d: Dados }) {
  const supers = d.usuarios.filter((u) => u.super_admin);
  return (
    <div className="space-y-3">
      {supers.length > 0 && (
        <p className="text-sm text-slate-600"><b>Super-admin</b> (vê todos os módulos): {supers.map((u) => u.nome || u.email).join(", ")}.</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {d.modulos.map((m) => {
          const quem = d.usuarios
            .map((u) => ({ u, papel: u.acessos.find((a) => a.modulo === m.key)?.papel }))
            .filter((x) => x.papel && !x.u.super_admin);
          return (
            <div key={m.key} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium text-slate-800">{m.label}</span>
                <span className="text-xs text-slate-400">{quem.length} {quem.length === 1 ? "pessoa" : "pessoas"}</span>
              </div>
              {quem.length === 0 ? (
                <p className="text-xs text-slate-400">Ninguém além dos super-admins.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {quem.map(({ u, papel }) => (
                    <li key={u.id} className={`flex items-center justify-between gap-2 ${u.ativo ? "text-slate-700" : "text-red-600"}`}>
                      <Link href={`/acessos?pessoa=${u.id}`} className="truncate hover:underline">{u.nome || u.email}{u.ativo ? "" : " (inativo)"}</Link>
                      <span className="shrink-0 text-xs text-slate-500">{rotuloPapel(papel!)}</span>
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

function Perfis({ d, acao }: { d: Dados; acao: Acao }) {
  const [editando, setEditando] = useState<Perfil | null>(null);
  if (d.perfis === null) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Os perfis de acesso ainda não existem neste banco: falta aplicar a migração <b>0012_perfis_acesso.sql</b> no Supabase.
      </div>
    );
  }
  const papelDe = (p: Perfil, m: string) => p.itens.find((i) => i.modulo === m)?.papel ?? "";
  const setPapel = (m: string, papel: string) =>
    setEditando((e) => e && { ...e, itens: [...e.itens.filter((i) => i.modulo !== m), ...(papel ? [{ modulo: m, papel }] : [])] });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-500">
          Moldes que empacotam <b>módulo → papel</b>. Na ficha de cada pessoa (ou ao criar o usuário), aplique um perfil com
          um clique para dar o pacote de acessos de uma vez.
        </p>
        {!editando && (
          <button onClick={() => setEditando(VAZIO())} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">+ Novo perfil</button>
        )}
      </div>

      {editando && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <h2 className="font-semibold text-slate-700">{editando.id ? `Editar: ${editando.nome}` : "Novo perfil"}</h2>
          <div className="grid gap-3 sm:grid-cols-[1fr_100px_auto]">
            <label className="text-xs text-slate-500">Nome<input value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} className={campo} /></label>
            <label className="text-xs text-slate-500">Ordem<input type="number" value={editando.ordem} onChange={(e) => setEditando({ ...editando, ordem: Number(e.target.value) })} className={campo} /></label>
            <label className="flex items-end gap-1.5 pb-2 text-xs text-slate-600">
              <input type="checkbox" checked={editando.ativo} onChange={(e) => setEditando({ ...editando, ativo: e.target.checked })} /> ativo
            </label>
          </div>
          <label className="block text-xs text-slate-500">Descrição
            <input value={editando.descricao ?? ""} onChange={(e) => setEditando({ ...editando, descricao: e.target.value || null })} placeholder="Quem usa este perfil e o que ele libera." className={campo} />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            {d.modulos.map((m) => (
              <label key={m.key} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                <span className="text-slate-700">{m.label}</span>
                <select value={papelDe(editando, m.key)} onChange={(e) => setPapel(m.key, e.target.value)} className="rounded border border-slate-300 px-1.5 py-1 text-xs">
                  <option value="">— sem acesso —</option>
                  {PAPEIS.map((p) => <option key={p.valor} value={p.valor}>{p.label}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                if (!editando.nome.trim()) { alert("Informe o nome do perfil."); return; }
                if (await acao({ acao: "salvar_perfil", ...editando }, "Perfil salvo.")) setEditando(null);
              }}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Salvar</button>
            <button onClick={() => setEditando(null)} className="px-3 text-sm text-slate-500 hover:underline">Cancelar</button>
          </div>
        </div>
      )}

      {d.perfis.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhum perfil cadastrado — crie o primeiro.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {d.perfis.map((p) => (
            <div key={p.id} className={`rounded-xl border bg-white p-4 ${p.ativo ? "border-slate-200" : "border-dashed border-slate-200 opacity-60"}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-slate-800">{p.nome}{!p.ativo && <span className="ml-2 text-xs text-slate-400">(inativo)</span>}</div>
                  {p.descricao && <div className="text-xs text-slate-500">{p.descricao}</div>}
                </div>
                <div className="flex shrink-0 gap-2 text-xs">
                  <button onClick={() => setEditando(p)} className="text-slate-600 hover:underline">editar</button>
                  <button onClick={() => { if (confirm(`Excluir o perfil "${p.nome}"? Quem já recebeu os acessos continua com eles.`)) acao({ acao: "excluir_perfil", id: p.id }, "Perfil excluído."); }}
                    className="text-red-600 hover:underline">excluir</button>
                </div>
              </div>
              <ul className="mt-2 space-y-0.5 text-sm text-slate-600">
                {p.itens.length === 0 ? <li className="text-slate-400">sem módulos</li> : p.itens.map((i) => (
                  <li key={i.modulo}>{d.modulos.find((m) => m.key === i.modulo)?.label ?? i.modulo}: <b>{rotuloPapel(i.papel)}</b></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
