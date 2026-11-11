"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MenuCards, salvarMenuNaConta } from "@/vendor/kit-core/menu-cards";
import { PORTAL } from "@/config/portal";
import { FAIXAS, ZONAS, type Modulo } from "@/lib/modulos";

export default function PortalHub({
  userEmail,
  cards,
  ordemMenu,
}: {
  userEmail: string;
  /** Os cards que ESTA pessoa vê, já filtrados no servidor (src/lib/modulos-db.ts). */
  cards: Modulo[];
  /** A ordem do menu que a pessoa guardou (user_metadata.menu_cards). */
  ordemMenu?: unknown;
}) {
  const router = useRouter();
  const visiveis = cards.map((m) => ({ ...m, id: m.key }));

  async function sair() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="brand-bg flex items-center justify-between px-6 py-4 text-slate-100">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={PORTAL.logo} alt={PORTAL.empresa} className="h-8 w-auto" />
          <span className="text-sm font-light tracking-wide text-slate-200">{PORTAL.nome}</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="hidden text-slate-200 sm:inline">{userEmail}</span>
          <button onClick={sair} className="rounded-md bg-white/10 px-3 py-1.5 hover:bg-white/20">
            Sair
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-2xl font-semibold text-slate-800">Bem-vinda ao {PORTAL.nome}</h1>
        <p className="mt-1 text-sm text-slate-500">Escolha o sistema que deseja acessar.</p>

        <div className="mt-8">
          <MenuCards
            cards={visiveis}
            faixas={[...FAIXAS]}
            salvo={ordemMenu}
            aoSalvar={(ordem) => salvarMenuNaConta(createClient(), ordem)}
            grade={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}
            desenhar={(m) => {
              const liberado = m.ready;
              const etiqueta: string | null = m.ready ? null : (m.etiqueta ?? "em breve");

              const card = (
                <div
                  className={`flex h-full flex-col rounded-2xl border bg-white p-6 shadow-sm transition ${
                    liberado
                      ? "border-slate-200 hover:-translate-y-0.5 hover:border-[var(--brand)] hover:shadow-md"
                      : "border-dashed border-slate-200 opacity-70"
                  }`}
                >
                  <div className="text-3xl">{m.icon}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-slate-800">{m.titulo}</h2>
                    {etiqueta && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                        {etiqueta}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 flex-1 text-sm text-slate-500">{m.desc}</p>
                  <div className={`mt-4 text-sm font-medium ${liberado ? "text-[var(--brand)]" : "text-slate-400"}`}>
                    {liberado ? "Acessar →" : m.etiqueta ? "Indisponível por enquanto" : "Em desenvolvimento"}
                  </div>
                </div>
              );

              if (!liberado) return <div className="h-full cursor-not-allowed">{card}</div>;
              // Zona de OUTRO app (rewrite do next.config.ts): vai por <a>, não
              // <Link> — a navegação do Next deste app cairia numa página que ele
              // não tem (lição do Portal Flórida).
              if (ZONAS.some((z) => m.href === z || m.href.startsWith(z + "/") || m.href.startsWith(z + "?"))) {
                return <a href={m.href} className="block h-full">{card}</a>;
              }
              return <Link href={m.href} className="block h-full">{card}</Link>;
            }}
          />
        </div>

        <p className="mt-10 text-center text-[11px] text-slate-400">
          Não vê um módulo que deveria acessar? Peça ao administrador para liberar em Admin de usuários.
        </p>
      </main>
    </div>
  );
}
