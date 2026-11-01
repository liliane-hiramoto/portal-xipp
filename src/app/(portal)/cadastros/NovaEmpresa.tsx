"use client";

import { useState, useTransition } from "react";
import { excluirEmpresa, salvarEmpresa, type NovaEmpresa as Empresa } from "./actions";

/** Consulta o CNPJ NO NAVEGADOR (a BrasilAPI recusa a chamada do servidor da
 *  Vercel — lição do Portal Flórida); se falhar, tenta a Minha Receita. */
async function consultarReceita(cnpj: string): Promise<Record<string, unknown> | string> {
  for (const url of [`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, `https://minhareceita.org/${cnpj}`]) {
    try {
      const r = await fetch(url, { headers: { accept: "application/json" } });
      if (r.status === 404) return "A Receita não encontrou este CNPJ.";
      if (r.ok) return (await r.json()) as Record<string, unknown>;
    } catch {
      /* tenta a próxima fonte */
    }
  }
  return "A consulta da Receita falhou. Preencha à mão ou tente de novo em alguns minutos.";
}

const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "");

export default function NovaEmpresa() {
  const [f, setF] = useState<Empresa>({ cnpj: "", apelido: "", razao_social: "", nome_fantasia: "" });
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [rodando, start] = useTransition();

  const buscar = () => start(async () => {
    setMsg(null);
    const d = f.cnpj.replace(/\D/g, "");
    if (d.length !== 14) { setMsg({ ok: false, t: "Digite o CNPJ com 14 dígitos." }); return; }
    const j = await consultarReceita(d);
    if (typeof j === "string") { setMsg({ ok: false, t: j }); return; }
    const simples = j.opcao_pelo_simples;
    setF((x) => ({
      ...x,
      razao_social: s(j.razao_social),
      nome_fantasia: s(j.nome_fantasia),
      apelido: x.apelido || s(j.nome_fantasia) || s(j.razao_social).split(" ").slice(0, 2).join(" "),
      situacao: s(j.descricao_situacao_cadastral),
      optante_simples: simples === true ? true : "opcao_pelo_simples" in j ? false : null,
      regime: simples === true ? "Simples" : null,
      endereco: [s(j.descricao_tipo_de_logradouro), s(j.logradouro), s(j.numero), s(j.bairro), s(j.municipio), s(j.uf)].filter(Boolean).join(", "),
    }));
    setMsg({ ok: true, t: "Dados da Receita preenchidos — confira e clique em Salvar." });
  });

  const salvar = () => start(async () => {
    const r = await salvarEmpresa(f);
    if (!r.ok) { setMsg({ ok: false, t: r.erro }); return; }
    setMsg({ ok: true, t: `Empresa ${f.razao_social || f.cnpj} salva.` });
    setF({ cnpj: "", apelido: "", razao_social: "", nome_fantasia: "" });
  });

  const campo = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";
  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Incluir empresa</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-slate-500">
          CNPJ
          <div className="flex gap-2">
            <input value={f.cnpj} onChange={(e) => setF({ ...f, cnpj: e.target.value })} placeholder="00.000.000/0000-00" className={campo} />
            <button type="button" onClick={buscar} disabled={rodando} className="mt-1 shrink-0 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              Receita
            </button>
          </div>
        </label>
        <label className="text-xs text-slate-500">
          Razão social
          <input value={f.razao_social ?? ""} onChange={(e) => setF({ ...f, razao_social: e.target.value })} className={campo} />
        </label>
        <label className="text-xs text-slate-500">
          Nome fantasia
          <input value={f.nome_fantasia ?? ""} onChange={(e) => setF({ ...f, nome_fantasia: e.target.value })} className={campo} />
        </label>
        <label className="text-xs text-slate-500">
          Apelido
          <input value={f.apelido ?? ""} onChange={(e) => setF({ ...f, apelido: e.target.value })} className={campo} />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={salvar} disabled={rodando || !f.cnpj} className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {rodando ? "Aguarde…" : "Salvar"}
        </button>
        {msg && <span className={`text-xs ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.t}</span>}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">Matriz e filiais: basta uma delas — o Y570 confere pela raiz do CNPJ (8 primeiros dígitos).</p>
    </div>
  );
}

export function BotaoExcluir({ cnpj, nome }: { cnpj: string; nome: string }) {
  const [rodando, start] = useTransition();
  return (
    <button
      type="button"
      disabled={rodando}
      onClick={() => {
        if (!confirm(`Excluir ${nome} do cadastro? O Y570 passa a recusar os PDFs desta empresa; o histórico já guardado continua.`)) return;
        start(async () => {
          const r = await excluirEmpresa(cnpj);
          if (!r.ok) alert(r.erro);
        });
      }}
      className="text-xs text-slate-400 hover:text-rose-600 disabled:opacity-50"
    >
      {rodando ? "…" : "Excluir"}
    </button>
  );
}
