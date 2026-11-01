"use client";

import { useEffect, useMemo, useState } from "react";

/** Consulta CPF (Serpro v3): CPF + data de nascimento. O navegador só fala com
 *  /api/cpf — as chaves do Serpro ficam no servidor (0011). */

type Consulta = {
  id: number | null;
  cpf: string;
  nascimento_informado: string;
  http_status: number;
  nome: string | null;
  nome_social: string | null;
  nascimento: string | null;
  situacao_codigo: string | null;
  situacao_descricao: string | null;
  data_inscricao: string | null;
  data_atualizacao: string | null;
  consultado_em: string;
};

const fmtCpf = (c: string) => c.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
/** "AAAA-MM-DD" é calendário: monta dd/mm/aaaa sem passar por Date (fuso). */
const fmtYmd = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "—");
const fmtQuando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

function Situacao({ c }: { c: Consulta }) {
  if (c.http_status === 404) return <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">não encontrado / nascimento não confere</span>;
  const d = c.situacao_descricao || "—";
  const regular = /regular/i.test(d) && !/pendente/i.test(d);
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${regular ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
      {d}
      {c.http_status === 206 ? " (incompleto)" : ""}
    </span>
  );
}

export default function CpfClient() {
  const [cpf, setCpf] = useState("");
  const [nasc, setNasc] = useState("");
  const [lista, setLista] = useState<Consulta[]>([]);
  const [pode, setPode] = useState(false);
  const [configurado, setConfigurado] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [rodando, setRodando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [ultima, setUltima] = useState<Consulta | null>(null);
  const [filtro, setFiltro] = useState("");

  useEffect(() => {
    let vivo = true;
    fetch("/api/cpf", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        if (!j.ok) setMsg({ ok: false, t: j.erro });
        else {
          setLista(j.consultas);
          setPode(!!j.podeConsultar);
          setConfigurado(!!j.configurado);
        }
      })
      .catch(() => vivo && setMsg({ ok: false, t: "Não consegui carregar o histórico." }))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, []);

  async function consultar(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setRodando(true);
    try {
      const r = await fetch("/api/cpf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf, nascimento: nasc }),
      });
      const j = await r.json();
      if (!j.ok) {
        setMsg({ ok: false, t: j.erro });
        return;
      }
      setUltima(j.consulta);
      setLista((l) => [j.consulta, ...l]);
      setMsg({ ok: !j.avisoGravacao, t: j.avisoGravacao || j.mensagem });
    } catch {
      setMsg({ ok: false, t: "Falha de rede ao consultar." });
    } finally {
      setRodando(false);
    }
  }

  const filtradas = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    const fd = f.replace(/\D/g, "");
    if (!f) return lista;
    return lista.filter((c) => (fd && c.cpf.includes(fd)) || (c.nome ?? "").toLowerCase().includes(f));
  }, [lista, filtro]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h1 className="text-lg font-semibold text-slate-800">Consulta CPF (Serpro)</h1>
        <p className="mt-1 text-sm text-slate-500">
          Situação cadastral na Receita Federal, pelo CPF e pela data de nascimento. Traz nome, nome social, nascimento,
          situação e datas de inscrição e atualização. <b>Não traz endereço</b> — o Serpro não fornece endereço de pessoa física.
          Cada consulta é cobrada pelo Serpro.
        </p>

        {!configurado && (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            As chaves do Serpro ainda não foram colocadas na Vercel. Até lá, dá para ver o histórico, mas não consultar.
          </p>
        )}

        <form onSubmit={consultar} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm text-slate-600">
            CPF
            <input
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              placeholder="000.000.000-00"
              inputMode="numeric"
              className="mt-1 block w-44 rounded-md border border-slate-300 px-3 py-2 text-sm"
              required
            />
          </label>
          <label className="text-sm text-slate-600">
            Data de nascimento
            <input
              type="date"
              value={nasc}
              onChange={(e) => setNasc(e.target.value)}
              className="mt-1 block rounded-md border border-slate-300 px-3 py-2 text-sm"
              required
            />
          </label>
          <button
            type="submit"
            disabled={rodando || !pode || !configurado}
            title={!pode ? "Seu acesso é só leitura" : undefined}
            className="rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {rodando ? "Consultando…" : "Consultar"}
          </button>
          {!pode && !carregando && <span className="text-xs text-slate-500">Seu acesso é só leitura: você vê o histórico.</span>}
        </form>
        {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.t}</p>}

        {ultima && (
          <div className="mt-4 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2">
            <div><span className="text-slate-400">CPF</span> <b>{fmtCpf(ultima.cpf)}</b></div>
            <div><span className="text-slate-400">Situação</span> <Situacao c={ultima} /></div>
            <div><span className="text-slate-400">Nome</span> {ultima.nome || "—"}</div>
            <div><span className="text-slate-400">Nome social</span> {ultima.nome_social || "—"}</div>
            <div><span className="text-slate-400">Nascimento</span> {fmtYmd(ultima.nascimento)}</div>
            <div><span className="text-slate-400">Inscrição</span> {fmtYmd(ultima.data_inscricao)}</div>
            <div><span className="text-slate-400">Última atualização</span> {fmtYmd(ultima.data_atualizacao)}</div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-800">Histórico ({filtradas.length})</h2>
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtrar por CPF ou nome"
            className="w-60 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        {carregando ? (
          <p className="text-sm text-slate-400">Carregando…</p>
        ) : filtradas.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma consulta ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">CPF</th>
                  <th className="px-2 py-2">Nome</th>
                  <th className="px-2 py-2">Nascimento</th>
                  <th className="px-2 py-2">Situação</th>
                  <th className="px-2 py-2">Inscrição</th>
                  <th className="px-2 py-2">Consultado em</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((c, i) => (
                  <tr key={c.id ?? `n${i}`} className="border-b border-slate-100 last:border-0">
                    <td className="px-2 py-2 font-mono text-xs">{fmtCpf(c.cpf)}</td>
                    <td className="px-2 py-2">
                      {c.nome || "—"}
                      {c.nome_social && <div className="text-xs text-slate-500">nome social: {c.nome_social}</div>}
                    </td>
                    <td className="px-2 py-2">{fmtYmd(c.nascimento ?? c.nascimento_informado)}</td>
                    <td className="px-2 py-2"><Situacao c={c} /></td>
                    <td className="px-2 py-2">{fmtYmd(c.data_inscricao)}</td>
                    <td className="px-2 py-2 text-xs text-slate-500">{fmtQuando(c.consultado_em)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
