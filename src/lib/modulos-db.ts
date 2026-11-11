// OS CARDS E OS ACESSOS LIDOS DO BANCO (Etapa 2 do catálogo, 11/11/2026 — o
// desenho do Portal RQ, da Inexx, do 3Clicks e da Affix).
//
// O Menu Principal e o proxy leem `core.modulos` + `core.acessos` pelas
// views do public (0014 — as Etapas 1 e 2 juntas). A lista do código (`MODULOS`, src/lib/modulos.ts)
// vira a SEMENTE e a reserva.
//
// ⚠️ Regra única desta etapa: **nada aqui pode TIRAR acesso nem esvaziar o
// menu**. Erro de leitura, view que não existe ainda, resposta vazia: cai na
// lista do código e no `user_modules`, exatamente como antes. Nenhuma exceção
// sobe. Puro o bastante para ter teste (scripts/testar-modulos-db.mjs).

import { FAIXAS, MODULOS, type Faixa, type Modulo } from "./modulos";

// Iguais aos de src/lib/papel.ts (que importa o servidor e não roda no teste).
const SUPER_ADMIN = "liliane.hiramoto@grupoflorida.com.br";
const MODULO_PORTAL = "portal";

/** Uma linha da view `public.modulos`. */
export interface LinhaModulo {
  key: string;
  label: string | null;
  descricao: string | null;
  emoji: string | null;
  href: string | null;
  grupo: string | null;
  status: string | null;
  atalho_de: string | null;
  externo: boolean | null;
  oculto: boolean | null;
  sem_gate: boolean | null;
  so_admin: boolean | null;
  ordem: number | null;
  ativo: boolean | null;
}

/** Uma linha da view `public.acessos` (ou do `user_modules`). */
export interface LinhaAcesso {
  modulo: string;
  papel: string;
  admin_modulo?: boolean | null;
}

export type Busca = (
  tabela: string,
  colunas: string,
  filtro?: { coluna: string; valor: string },
) => Promise<{ data: unknown[] | null; error: unknown }>;

/** Card que só admin vê, pelo CÓDIGO: o banco pode acrescentar, nunca tirar. */
const SO_ADMIN_NO_CODIGO = new Set(MODULOS.filter((m) => m.soAdmin).map((m) => m.key));

/** A linha do banco vira o card. Campo que o banco não souber dizer cai no do código. */
export function modDaLinha(l: LinhaModulo): Modulo {
  const doCodigo = MODULOS.find((m) => m.key === l.key);
  const faixa = (FAIXAS as readonly string[]).includes(l.grupo ?? "")
    ? (l.grupo as Faixa)
    : (doCodigo?.faixa ?? "Configurações");
  const status = l.status ?? (doCodigo ? (doCodigo.ready ? "ativo" : "breve") : "ativo");
  const atalho = (l.atalho_de ?? "").trim();
  return {
    key: l.key,
    faixa,
    href: (l.href ?? "").trim() || doCodigo?.href || "#",
    icon: (l.emoji ?? "").trim() || doCodigo?.icon || "▫",
    titulo: (l.label ?? "").trim() || doCodigo?.titulo || l.key,
    desc: (l.descricao ?? "").trim() || doCodigo?.desc || "",
    ready: status === "ativo" || status === "externo",
    ...((l.sem_gate ?? doCodigo?.semGate) ? { semGate: true } : {}),
    // UNIÃO: só-admin no código continua só-admin, diga o banco o que disser.
    ...((l.so_admin || SO_ADMIN_NO_CODIGO.has(l.key)) ? { soAdmin: true } : {}),
    ...(atalho ? { atalhoDe: atalho } : {}),
    // A etiqueta do card fechado ("pendente Serpro") é do código.
    ...(doCodigo?.etiqueta ? { etiqueta: doCodigo.etiqueta } : {}),
  };
}

/**
 * Os cards do MENU, na ordem do banco (faixa na ordem de FAIXAS; dentro dela,
 * a coluna `ordem`). `ativo = false` e `oculto = true` ficam fora.
 * ⚠️ Banco mudo (nulo, vazio, tudo inativo) devolve a lista do CÓDIGO.
 */
export function cardsDoMenu(linhas: LinhaModulo[] | null | undefined): Modulo[] {
  const ordemFaixa = (g: string | null) => {
    const i = (FAIXAS as readonly string[]).indexOf(g ?? "");
    return i < 0 ? 99 : i;
  };
  const vivas = (linhas ?? [])
    .filter((l) => l && l.key && l.ativo !== false)
    .sort((a, b) => ordemFaixa(a.grupo) - ordemFaixa(b.grupo) || (a.ordem ?? 100) - (b.ordem ?? 100) || a.key.localeCompare(b.key));
  if (!vivas.length) return MODULOS;
  return vivas.filter((l) => !l.oculto).map(modDaLinha);
}

/** Admin do PORTAL (0013): a super-admin ou a linha explícita 'portal' — o
 *  papel admin de um módulo vale só para aquele módulo. */
export function ehAdminPortal(email: string, modulos: Record<string, string>): boolean {
  return email.toLowerCase() === SUPER_ADMIN || modulos[MODULO_PORTAL] === "admin";
}

/**
 * Quem vê qual card — a regra de sempre do PortalHub, agora sobre a lista que
 * veio do banco: Acessos (soAdmin) só admin do portal; ele vê todos; Cadastros
 * (semGate) todo login; o resto, quem tem o módulo (o dono, se for atalho).
 */
export function cardsVisiveis(cards: Modulo[], modulos: Record<string, string>, ehAdmin: boolean): Modulo[] {
  return cards.filter((m) =>
    m.soAdmin ? ehAdmin : ehAdmin ? true : m.semGate ? true : (m.atalhoDe ?? m.key) in modulos,
  );
}

/** O catálogo do banco (`public.modulos`), ou `null` se o banco não respondeu. */
export async function lerModulos(buscar: Busca): Promise<LinhaModulo[] | null> {
  try {
    const { data, error } = await buscar(
      "modulos",
      "key,label,descricao,emoji,href,grupo,status,atalho_de,externo,oculto,sem_gate,so_admin,ordem,ativo",
    );
    if (error || !data?.length) return null;
    return data as LinhaModulo[];
  } catch {
    return null;
  }
}

/**
 * Os acessos de UMA pessoa: a tabela nova; sem resposta, a de sempre.
 * ⚠️ O filtro por `user_id` é obrigatório: o admin do portal enxerga as linhas
 * de todo mundo em core.acessos, e sem o filtro "teria" os módulos de todos.
 */
export async function lerAcessos(buscar: Busca, userId: string): Promise<LinhaAcesso[]> {
  const filtro = { coluna: "user_id", valor: userId };
  try {
    const { data, error } = await buscar("acessos", "modulo,papel,admin_modulo", filtro);
    if (!error && data?.length) return data as LinhaAcesso[];
  } catch { /* sem a view: a tabela de sempre responde */ }
  try {
    const { data } = await buscar("user_modules", "modulo,papel", filtro);
    return (data ?? []) as LinhaAcesso[];
  } catch {
    return [];
  }
}
