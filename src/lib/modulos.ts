// OS CARDS DO MENU PRINCIPAL — a SEMENTE e a reserva (Etapa 2 do catálogo,
// 11/11/2026). Desde a 0014 o menu lê `core.modulos` pela view `public.modulos`
// (src/lib/modulos-db.ts); esta lista é o que vale quando o banco não responde,
// e o que preenche o que ele não souber dizer. Era o MODULOS do PortalHub.

import { PORTAL } from "../config/portal";

export interface Modulo {
  key: string; // chave em user_modules.modulo (ou "*" = sempre visível a logados)
  href: string;
  icon: string;
  titulo: string;
  desc: string;
  ready: boolean;
  semGate?: boolean; // não exige entrada em user_modules (ex.: Cadastros)
  soAdmin?: boolean; // só o admin do portal vê (Acessos)
  atalhoDe?: string; // card que é atalho de outro módulo (vê quem tem o dono)
  faixa: Faixa; // a faixa do menu em que o card nasce (cada pessoa pode mover)
  /** Etiqueta do card que ainda não abre (sem ela, "em breve"). */
  etiqueta?: string;
}

/** Rotas que o next.config manda para outro app (rewrites). */
export const ZONAS = ["/tributos", "/cnpj", "/y570"];

// As faixas do menu principal (10/11/2026, pedido dela para todos os portais:
// separar os cards por assunto). A ordem é a padrão; cada pessoa reorganiza em
// "⇅ Organizar" e a ordem dela fica na conta (kit-core, menu-cards.tsx).
export const FAIXAS = ["Fiscal", "Configurações"] as const;
export type Faixa = (typeof FAIXAS)[number];

export const MODULOS: Modulo[] = [
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
    soAdmin: true,
    icon: "🔐",
    titulo: "Acessos",
    desc: "Quem entra no portal e o papel em cada módulo: pessoas, visão por módulo e perfis de acesso.",
    ready: true,
  },
];

