"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MenuCards, salvarMenuNaConta } from "@/vendor/kit-core/menu-cards";
import { PORTAL } from "@/config/portal";

interface Modulo {
  key: string; // chave em user_modules.modulo (ou "*" = sempre visível a logados)
  href: string;
  icon: string;
  titulo: string;
  desc: string;
  ready: boolean;
  semGate?: boolean; // não exige entrada em user_modules (ex.: Cadastros)
  faixa: Faixa; // a faixa do menu em que o card nasce (cada pessoa pode mover)
  /** Etiqueta do card que ainda não abre (sem ela, "em breve"). */
  etiqueta?: string;
}

/** Rotas que o next.config manda para outro app (rewrites). */
const ZONAS = ["/tributos", "/cnpj", "/y570"];

// As faixas do menu principal (10/11/2026, pedido dela para todos os portais:
// separar os cards por assunto). A ordem é a padrão; cada pessoa reorganiza em
// "⇅ Organizar" e a ordem dela fica na conta (kit-core, menu-cards.tsx).
const FAIXAS = ["Fiscal", "Configurações"] as const;
type Faixa = (typeof FAIXAS)[number];

const MODULOS: Modulo[] = [
  {
    // Instância do canônico tributos-web servida em /tributos (rewrite no
    // next.config.ts; endereço em src/config/portal.ts).
    key: "tributos",
    faixa: "Fiscal",
    href: "/tributos",
    icon: "⚖️",
    titulo: "Tributos",
    desc: "Tributos federais: DARFs pagos e em atraso, Situação Fiscal do e-CAC, certidões e parcelamentos.",
    ready: true,
  },
  {
    // Módulo PRÓPRIO, fora do Tributos (decisão dela, 30/10/2026): base
    // cadastral é dado público da Receita; o Tributos é dado fiscal sigiloso.
    // Ferramenta cnpj-base-web servida em /cnpj; `brand` pinta com a cor da marca.
    key: "cnpj",
    faixa: "Fiscal",
    href: `/cnpj?brand=${PORTAL.brandHex}`,
    icon: "🏢",
    titulo: "Consulta CNPJ + Simples Nacional",
    desc: "Base cadastral pela Receita: cartão CNPJ, sócios, Simples Nacional, SIMEI e regime regular do IBS/CBS. Importa lista e exporta Excel.",
    ready: true,
  },
  {
    // Módulo próprio desde a 0009 (era do menu do Tributos): ferramenta
    // y570-fonte-pagadora servida em /y570; o histórico fica no banco do portal.
    key: "y570",
    faixa: "Fiscal",
    href: `/y570?brand=${PORTAL.brandHex}`,
    icon: "📄",
    titulo: "Y570 · ECF",
    desc: "Lê os PDFs de Fontes Pagadoras do e-CAC e gera o registro Y570 da ECF em Excel, com histórico por empresa.",
    ready: true,
  },
  {
    // Consulta CPF no Serpro (v3: CPF + data de nascimento), servida por este
    // app em /cpf. Cada consulta é cobrada: só editor/admin consulta (0011).
    // FECHADO por pedido dela (01/11/2026): "deixar sem consulta CPF, por
    // enquanto — pendente Serpro". Reabrir = ready: true e tirar a etiqueta.
    // ⚠️ O que ela quer é o MUNICÍPIO da pessoa (reforma tributária), e a
    // Consulta CPF v3 não devolve endereço: conferir o produto antes.
    key: "cpf",
    faixa: "Fiscal",
    href: "/cpf",
    icon: "🪪",
    titulo: "Consulta CPF",
    desc: "Situação cadastral do CPF na Receita (Serpro): nome, nome social, nascimento e situação. Consulta por CPF + data de nascimento.",
    ready: false,
    etiqueta: "pendente Serpro",
  },
  {
    key: "cadastros",
    faixa: "Configurações",
    href: "/cadastros",
    icon: "🏢",
    titulo: "Cadastros",
    desc: `Empresas do ${PORTAL.grupo}. Só empresa cadastrada aqui entra no Tributos e no Y570.`,
    ready: true,
    semGate: true,
  },
  {
    key: "admin",
    faixa: "Configurações",
    href: "/acessos",
    icon: "🔐",
    titulo: "Acessos",
    desc: "Quem entra no portal e o papel em cada módulo: pessoas, visão por módulo e perfis de acesso.",
    ready: true,
  },
];

export default function PortalHub({
  userEmail,
  modulos,
  ordemMenu,
}: {
  userEmail: string;
  modulos: Record<string, string>;
  /** A ordem do menu que a pessoa guardou (user_metadata.menu_cards). */
  ordemMenu?: unknown;
}) {
  const router = useRouter();
  const ehAdmin = userEmail.toLowerCase() === "liliane.hiramoto@grupoflorida.com.br" || Object.values(modulos).includes("admin");

  // Só mostra as caixinhas que o usuário tem acesso: módulo em user_modules,
  // Cadastros (semGate = todos) e Admin (só quem tem papel admin).
  // O admin do portal (e a super-admin) vê TODOS os cards: o proxy e a RLS já
  // o deixam entrar em todo módulo. Antes só via os módulos com linha própria
  // em user_modules, e a super-admin — que não tem linha nenhuma — só via
  // Cadastros e Admin (achado no Portal Benevix, 04/11/2026).
  const temAcesso = (m: Modulo) => (ehAdmin ? true : m.semGate ? true : m.key in modulos);
  const visiveis = MODULOS.filter(temAcesso).map((m) => ({ ...m, id: m.key }));

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
