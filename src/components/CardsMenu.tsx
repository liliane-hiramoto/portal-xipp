"use client";

/**
 * Admin › CARDS DO MENU (Etapa 3 do catálogo, 10/11/2026). Um formulário por
 * card: nome, descrição, ícone, faixa, ordem dentro da faixa e "mostrar no
 * menu". Era um PR para cada nome trocado. Só admin do portal.
 *
 * ⚠️ Desmarcar "mostrar" tira o card do Menu Principal de TODO MUNDO; quem tem
 * o módulo continua entrando pelo endereço. Para tirar acesso, use a lista de
 * usuários acima.
 */

import { useCallback, useEffect, useState } from "react";
import { FAIXAS } from "@/lib/modulos";

type Card = { key: string; label: string | null; descricao: string | null; emoji: string | null; href: string | null; grupo: string | null; ordem: number | null; oculto: boolean | null };
const CAMPO = "rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus:border-[var(--accent)]";

export default function CardsMenu() {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);

  const carregar = useCallback(
    () =>
      fetch("/api/admin/cards")
        .then(async (r) => ({ r, j: await r.json().catch(() => ({})) }))
        .then(({ r, j }) => {
          if (!r.ok) setMsg({ tipo: "erro", texto: j.erro || "falha ao carregar os cards" });
          else setCards(j.cards);
        }),
    [],
  );
  // O estado só muda quando a resposta chega (no .then), não durante o efeito.
  useEffect(() => {
    fetch("/api/admin/cards")
      .then(async (r) => ({ r, j: await r.json().catch(() => ({})) }))
      .then(({ r, j }) => {
        if (!r.ok) setMsg({ tipo: "erro", texto: j.erro || "falha ao carregar os cards" });
        else setCards(j.cards);
      });
  }, []);

  async function salvar(c: Card, form: HTMLFormElement) {
    const f = new FormData(form);
    setSalvando(c.key);
    const r = await fetch("/api/admin/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: c.key, label: f.get("label"), descricao: f.get("descricao"), emoji: f.get("emoji"),
        grupo: f.get("grupo"), ordem: f.get("ordem"), oculto: f.get("mostrar") !== "on",
      }),
    });
    const j = await r.json().catch(() => ({}));
    setSalvando(null);
    if (!r.ok || j.ok === false) return setMsg({ tipo: "erro", texto: `${c.label ?? c.key}: ${j.erro || r.statusText}` });
    setMsg({ tipo: "ok", texto: `Card "${String(f.get("label"))}" salvo. Recarregue o Portal para ver no menu.` });
    await carregar();
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Cards do menu</h2>
        <p className="text-sm text-slate-500">Nome, descrição, ícone, faixa e ordem de cada card do Menu Principal. A chave e o endereço não mudam por aqui.</p>
      </div>
      {msg ? (
        <div className={`rounded-lg border px-4 py-2 text-sm ${msg.tipo === "erro" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{msg.texto}</div>
      ) : null}
      {!cards ? (
        msg ? null : <div className="py-6 text-center text-sm text-slate-500">Carregando…</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Ícone</th><th className="px-3 py-2">Nome</th><th className="px-3 py-2">Descrição</th>
                <th className="px-3 py-2">Faixa</th><th className="px-3 py-2">Ordem</th><th className="px-3 py-2">No menu</th><th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {cards.map((c) => {
                const faixas: string[] = !c.grupo || (FAIXAS as readonly string[]).includes(c.grupo) ? [...FAIXAS] : [...FAIXAS, c.grupo];
                const f = `card-${c.key}`;
                return (
                  <tr key={c.key} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-2"><input form={f} name="emoji" defaultValue={c.emoji ?? ""} className={`${CAMPO} w-12 text-center`} /></td>
                    <td className="px-3 py-2">
                      <input form={f} name="label" defaultValue={c.label ?? ""} required maxLength={60} className={`${CAMPO} w-48`} />
                      <div className="mt-1 font-mono text-[10px] text-slate-400" title="A chave e o endereço não se editam aqui">{c.key} · {c.href ?? "sem destino"}</div>
                    </td>
                    <td className="px-3 py-2"><textarea form={f} name="descricao" defaultValue={c.descricao ?? ""} rows={2} maxLength={240} className={`${CAMPO} w-72`} /></td>
                    <td className="px-3 py-2">
                      <select form={f} name="grupo" defaultValue={c.grupo ?? FAIXAS[0]} className={CAMPO}>
                        {faixas.map((g) => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2"><input form={f} name="ordem" type="number" min={0} max={9999} step={1} defaultValue={c.ordem ?? 100} className={`${CAMPO} w-20`} /></td>
                    <td className="px-3 py-2">
                      <label className="flex items-center gap-1.5 text-xs text-slate-600">
                        <input form={f} type="checkbox" name="mostrar" defaultChecked={!c.oculto} /> mostrar
                      </label>
                    </td>
                    <td className="px-3 py-2">
                      <form id={f} onSubmit={(e) => { e.preventDefault(); salvar(c, e.currentTarget); }}>
                        <button disabled={salvando === c.key} className="rounded-md bg-[var(--brand)] px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">
                          {salvando === c.key ? "Salvando…" : "Salvar"}
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-400">
        A <b>ordem</b> vale dentro da faixa (10, 20, 30…). Desmarcar <b>mostrar</b> tira o card do menu de todo mundo; quem tem o
        módulo continua entrando pelo endereço — para tirar acesso, use a lista de usuários acima. Quem já organizou o próprio
        menu (⇅ Organizar) mantém a ordem dele.
      </p>
    </section>
  );
}
