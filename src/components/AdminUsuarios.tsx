"use client";

import { useEffect, useState } from "react";

interface Usuario {
  id: string;
  email: string;
  nome: string;
  papel: string; // "" = sem acesso ao Tributos (o módulo do formulário de criação)
  papeis: Record<string, string>; // papel por módulo (tributos, cnpj, y570, cpf)
  ativo: boolean;
}

// Papel por módulo: os quatro cards do portal fiscal. Cada um com papel
// próprio, para dar acesso à base cadastral (CNPJ) sem dar ao dado fiscal
// (Tributos, Y570) nem ao dado pessoal (CPF). A mesma lista mora em
// MODULOS_ACESSO (src/lib/papel.ts), que é server-only; a tela repete os rótulos.
const MODULOS: { key: string; label: string }[] = [
  { key: "tributos", label: "Tributos" },
  { key: "cnpj", label: "Consulta CNPJ" },
  { key: "y570", label: "Y570 · ECF" },
  { key: "cpf", label: "Consulta CPF" },
];


const PAPEL_OPCOES: { valor: string; label: string }[] = [
  { valor: "", label: "Sem acesso" },
  { valor: "viewer", label: "Somente leitura" },
  { valor: "editor", label: "Editor" },
  { valor: "admin", label: "Admin" },
];

const SUPER_ADMIN = "liliane.hiramoto@grupoflorida.com.br";

export default function AdminUsuarios({ meuEmail }: { meuEmail: string }) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; txt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetId, setResetId] = useState<string | null>(null);
  const [novaSenha, setNovaSenha] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editEmail, setEditEmail] = useState("");

  // form de criação
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState(""); // vazio = o servidor sorteia uma
  const [papel, setPapel] = useState("viewer");

  async function carregar() {
    const r = await fetch("/api/admin/usuarios", { cache: "no-store" });
    const d = await r.json();
    if (r.ok) setUsuarios(d.usuarios ?? []);
    else setMsg({ tipo: "erro", txt: d.erro ?? "Falha ao listar" });
    setCarregado(true);
  }
  useEffect(() => {
    carregar();
  }, []);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, nome, senha, papel }),
      });
      const d = await r.json();
      if (!r.ok) {
        setMsg({ tipo: "erro", txt: d.erro ?? "Falha ao criar" });
      } else {
        setMsg({ tipo: "ok", txt: `Usuário ${email} criado como ${PAPEL_OPCOES.find((p) => p.valor === papel)?.label}. Senha provisória: ${d.senha} — anote agora, ela não aparece de novo (troca no 1º acesso).` });
        setEmail(""); setNome(""); setSenha(""); setPapel("viewer");
        await carregar();
      }
    } finally {
      setBusy(false);
    }
  }

  async function resetarSenha(u: Usuario) {
    if (novaSenha && novaSenha.length < 8) { setMsg({ tipo: "erro", txt: "Senha de no mínimo 8 caracteres (ou deixe vazio para sortear)." }); return; }
    setBusy(true);
    const r = await fetch("/api/admin/usuarios", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: u.id, ...(novaSenha ? { senha: novaSenha } : {}) }),
    });
    const d = await r.json();
    setBusy(false);
    setResetId(null);
    setNovaSenha("");
    setMsg(r.ok ? { tipo: "ok", txt: `Senha provisória de ${u.email}: ${d.senha} — anote agora, ela não aparece de novo (troca no próximo acesso).` } : { tipo: "erro", txt: d.erro ?? "Falha" });
  }

  function abrirEdicao(u: Usuario) {
    setResetId(null);
    setEditId(u.id);
    setEditNome(u.nome);
    setEditEmail(u.email);
  }
  async function salvarEdicao(u: Usuario) {
    setBusy(true);
    const r = await fetch("/api/admin/usuarios", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: u.id, nome: editNome, email: editEmail.trim() }),
    });
    const d = await r.json();
    setBusy(false);
    if (r.ok) {
      setUsuarios((us) => us.map((x) => (x.id === u.id ? { ...x, nome: editNome, email: editEmail.trim() || x.email } : x)));
      setEditId(null);
      setMsg({ tipo: "ok", txt: `Dados de ${editEmail || u.email} atualizados.` });
    } else {
      setMsg({ tipo: "erro", txt: d.erro ?? "Falha ao editar" });
    }
  }

  async function toggleAtivo(u: Usuario) {
    const novo = !u.ativo;
    setUsuarios((us) => us.map((x) => (x.id === u.id ? { ...x, ativo: novo } : x)));
    const r = await fetch("/api/admin/usuarios", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: u.id, ativo: novo }),
    });
    if (!r.ok) {
      const d = await r.json();
      setMsg({ tipo: "erro", txt: d.erro ?? "Falha ao atualizar" });
      carregar();
    } else {
      setMsg({ tipo: "ok", txt: `${u.email} ${novo ? "ativado" : "inativado"}.` });
    }
  }

  async function mudarPapel(u: Usuario, modulo: string, novo: string) {
    setUsuarios((us) => us.map((x) => (x.id === u.id
      ? { ...x, papel: modulo === "tributos" ? novo : x.papel, papeis: { ...x.papeis, [modulo]: novo } }
      : x)));
    const r = await fetch("/api/admin/usuarios", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: u.id, modulo, papel: novo }),
    });
    if (!r.ok) {
      const d = await r.json();
      setMsg({ tipo: "erro", txt: d.erro ?? "Falha ao atualizar" });
      carregar();
    } else {
      const rotulo = MODULOS.find((m) => m.key === modulo)?.label ?? modulo;
      setMsg({ tipo: "ok", txt: `${u.email}: acesso ao ${rotulo} atualizado.` });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Admin de usuários</h1>
        <p className="mt-1 text-sm text-slate-500">
          Cadastre usuários e defina o acesso a cada módulo — <strong>Tributos</strong>, <strong>Consulta CNPJ</strong>, <strong>Y570</strong> e <strong>Consulta CPF</strong> (Somente leitura, Editor ou Admin). Quem é Admin em algum módulo administra o portal.
        </p>
      </div>

      {msg && (
        <div className={`rounded-lg px-4 py-2 text-xs ${msg.tipo === "ok" ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "border border-rose-200 bg-rose-50 text-rose-700"}`}>
          {msg.txt}
        </div>
      )}

      {/* Criar usuário */}
      <form onSubmit={criar} className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Novo usuário</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs text-slate-500 lg:col-span-2">
            E-mail
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]" />
          </label>
          <label className="text-xs text-slate-500">
            Nome (opcional)
            <input value={nome} onChange={(e) => setNome(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]" />
          </label>
          <label className="text-xs text-slate-500">
            Senha inicial
            <input type="text" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="vazio = sortear" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]" />
          </label>
          <label className="text-xs text-slate-500">
            Acesso ao Tributos
            <select value={papel} onChange={(e) => setPapel(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {PAPEL_OPCOES.filter((p) => p.valor).map((p) => (<option key={p.valor} value={p.valor}>{p.label}</option>))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button type="submit" disabled={busy} className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {busy ? "Criando…" : "Criar usuário"}
          </button>
          <span className="text-[11px] text-slate-400">Sem senha escolhida, o sistema sorteia uma e mostra só uma vez. O usuário é obrigado a trocá-la no 1º acesso.</span>
        </div>
      </form>

      {/* Lista de usuários */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">Usuários ({usuarios.length})</div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">E-mail</th>
              <th className="px-4 py-2 font-medium">Nome</th>
              {MODULOS.map((m) => (
                <th key={m.key} className="w-36 px-4 py-2 font-medium">{m.label}</th>
              ))}
              <th className="w-56 px-4 py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => {
              const protegido = u.email === SUPER_ADMIN || u.email === meuEmail;
              return (
                <tr key={u.id} className="border-t border-slate-50 align-top">
                  <td className="px-4 py-2 text-slate-700">{u.email}</td>
                  <td className="px-4 py-2 text-slate-500">{u.nome || "—"}</td>
                  {MODULOS.map((m) => (
                    <td key={m.key} className="px-4 py-2">
                      <select value={u.papeis?.[m.key] ?? ""} onChange={(e) => mudarPapel(u, m.key, e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
                        {PAPEL_OPCOES.map((p) => (<option key={p.valor} value={p.valor}>{p.label}</option>))}
                      </select>
                    </td>
                  ))}
                  <td className="px-4 py-2">
                    {editId === u.id ? (
                      <div className="flex flex-wrap items-center gap-1">
                        <input autoFocus value={editNome} onChange={(e) => setEditNome(e.target.value)} placeholder="nome" className="w-28 rounded border border-slate-300 px-2 py-1 text-xs" />
                        <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="e-mail" className="w-48 rounded border border-slate-300 px-2 py-1 text-xs" />
                        <button disabled={busy} onClick={() => salvarEdicao(u)} className="rounded bg-[var(--brand)] px-2 py-1 text-[11px] font-medium text-white disabled:opacity-50">salvar</button>
                        <button onClick={() => setEditId(null)} className="text-[11px] text-slate-500">cancelar</button>
                      </div>
                    ) : resetId === u.id ? (
                      <div className="flex flex-wrap items-center gap-1">
                        <input type="text" autoFocus value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} placeholder="vazio = sortear" className="w-36 rounded border border-slate-300 px-2 py-1 text-xs" />
                        <button disabled={busy} onClick={() => resetarSenha(u)} className="rounded bg-[var(--brand)] px-2 py-1 text-[11px] font-medium text-white disabled:opacity-50">salvar</button>
                        <button onClick={() => { setResetId(null); setNovaSenha(""); }} className="text-[11px] text-slate-500">cancelar</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${u.ativo ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{u.ativo ? "ativo" : "inativo"}</span>
                        <button onClick={() => abrirEdicao(u)} className="text-[11px] font-medium text-slate-600 hover:underline">editar</button>
                        <button onClick={() => { setResetId(u.id); setEditId(null); setNovaSenha(""); }} className="text-[11px] font-medium text-[var(--accent)] hover:underline">resetar senha</button>
                        {!protegido && (
                          <button onClick={() => toggleAtivo(u)} className={`text-[11px] font-medium hover:underline ${u.ativo ? "text-rose-600" : "text-emerald-700"}`}>
                            {u.ativo ? "inativar" : "ativar"}
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {carregado && usuarios.length === 0 && (
              <tr><td colSpan={3 + MODULOS.length} className="px-4 py-6 text-center text-sm text-slate-400">Nenhum usuário.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
