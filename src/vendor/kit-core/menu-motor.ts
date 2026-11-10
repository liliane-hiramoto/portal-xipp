// O MENU PRINCIPAL em faixas, com a ordem de cada pessoa (10/11/2026, pedido
// dela para todos os portais: "criar faixas no menu principal para separar os
// cards por assunto: Financeiro, Contabilidade, Fiscal… mas também permitir que
// o usuário movimente os cards e organize da forma que quiser").
//
// PURO (teste: menu-motor.teste.mjs). O portal diz em que faixa cada card nasce
// e a ordem padrão das faixas; a pessoa pode reordenar os cards, trocar um card
// de faixa e reordenar as faixas. O que ela fez é a OrdemMenu, guardada na
// conta dela (user_metadata — ver menu-cards.tsx), e vale em qualquer
// computador.
//
// Regras:
//   · card que a ordem salva não conhece (módulo novo, acesso novo) entra na
//     faixa padrão dele, no FIM, na ordem do portal — nunca some;
//   · id salvo que não existe mais (módulo apagado, acesso tirado) é ignorado;
//   · faixa salva que o portal não tem mais é ignorada (o card volta à padrão);
//   · a ordem salva vem do navegador da pessoa: é lida como dado não confiável
//     (formato errado = ordem padrão).

export interface CardDoMenu { id: string; faixa: string }

export interface OrdemMenu {
  v: 1;
  /** A ordem das faixas. */
  faixas: string[];
  /** faixa → ids dos cards, na ordem. */
  cards: Record<string, string[]>;
}

export interface FaixaMontada<T> { faixa: string; cards: T[] }

/** Lê a ordem salva com desconfiança: o que não tiver o formato vira null. */
export function lerOrdem(v: unknown): OrdemMenu | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Partial<OrdemMenu>;
  if (o.v !== 1 || !Array.isArray(o.faixas) || !o.cards || typeof o.cards !== "object") return null;
  const faixas = o.faixas.filter((f): f is string => typeof f === "string").slice(0, 50);
  const cards: Record<string, string[]> = {};
  for (const [f, ids] of Object.entries(o.cards)) {
    if (Array.isArray(ids)) cards[f] = ids.filter((i): i is string => typeof i === "string").slice(0, 200);
  }
  return { v: 1, faixas, cards };
}

/**
 * Monta as faixas para a tela. `vazias` = mostrar também as faixas sem card
 * (no modo "Organizar", para ter onde soltar).
 */
export function montarMenu<T extends CardDoMenu>(
  cards: T[], faixasPadrao: string[], salvo?: unknown, vazias = false,
): FaixaMontada<T>[] {
  const ordem = lerOrdem(salvo);
  // As faixas que existem: as do portal + as que algum card usa (na ordem em que aparecem).
  const conhecidas: string[] = [];
  for (const f of [...faixasPadrao, ...cards.map((c) => c.faixa)]) if (!conhecidas.includes(f)) conhecidas.push(f);
  const ordemFaixas = [
    ...(ordem?.faixas ?? []).filter((f, i, a) => conhecidas.includes(f) && a.indexOf(f) === i),
    ...conhecidas,
  ].filter((f, i, a) => a.indexOf(f) === i);

  const porId = new Map(cards.map((c) => [c.id, c]));
  const colocado = new Set<string>();
  const saida = new Map<string, T[]>(ordemFaixas.map((f) => [f, []]));
  if (ordem) {
    for (const f of ordemFaixas) {
      for (const id of ordem.cards[f] ?? []) {
        const c = porId.get(id);
        if (c && !colocado.has(id)) { saida.get(f)!.push(c); colocado.add(id); }
      }
    }
  }
  for (const c of cards) if (!colocado.has(c.id)) { saida.get(c.faixa)!.push(c); colocado.add(c.id); }
  return ordemFaixas.map((f) => ({ faixa: f, cards: saida.get(f)! })).filter((x) => vazias || x.cards.length > 0);
}

/** A ordem que a tela está mostrando, para guardar. */
export function ordemDe<T extends CardDoMenu>(montado: FaixaMontada<T>[]): OrdemMenu {
  return { v: 1, faixas: montado.map((x) => x.faixa), cards: Object.fromEntries(montado.map((x) => [x.faixa, x.cards.map((c) => c.id)])) };
}

/** A ordem é a mesma do portal? (Então não há o que guardar: "padrão".) */
export function ehPadrao<T extends CardDoMenu>(cards: T[], faixasPadrao: string[], montado: FaixaMontada<T>[]): boolean {
  const a = ordemDe(montarMenu(cards, faixasPadrao, null)), b = ordemDe(montado.filter((x) => x.cards.length));
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Move o card `id` para a faixa `para`, antes do card `antesDe` (null = no fim).
 * Devolve um NOVO montado (não mexe no que recebeu).
 */
export function moverCard<T extends CardDoMenu>(montado: FaixaMontada<T>[], id: string, para: string, antesDe: string | null): FaixaMontada<T>[] {
  if (id === antesDe) return montado;
  let card: T | undefined;
  const sem = montado.map((x) => {
    const c = x.cards.find((k) => k.id === id);
    if (c) card = c;
    return { faixa: x.faixa, cards: x.cards.filter((k) => k.id !== id) };
  });
  if (!card) return montado;
  const destino = sem.find((x) => x.faixa === para);
  if (!destino) return montado;
  const i = antesDe ? destino.cards.findIndex((k) => k.id === antesDe) : -1;
  if (i < 0) destino.cards.push(card); else destino.cards.splice(i, 0, card);
  return sem;
}

/** Anda o card uma casa para trás (-1) ou para a frente (+1) dentro da faixa. */
export function passoCard<T extends CardDoMenu>(montado: FaixaMontada<T>[], id: string, dir: -1 | 1): FaixaMontada<T>[] {
  const x = montado.find((f) => f.cards.some((c) => c.id === id));
  if (!x) return montado;
  const i = x.cards.findIndex((c) => c.id === id), j = i + dir;
  if (j < 0 || j >= x.cards.length) return montado;
  const cards = x.cards.slice();
  [cards[i], cards[j]] = [cards[j], cards[i]];
  return montado.map((f) => (f === x ? { faixa: f.faixa, cards } : f));
}

/** Sobe (-1) ou desce (+1) uma faixa inteira. */
export function passoFaixa<T>(montado: FaixaMontada<T>[], faixa: string, dir: -1 | 1): FaixaMontada<T>[] {
  const i = montado.findIndex((f) => f.faixa === faixa), j = i + dir;
  if (i < 0 || j < 0 || j >= montado.length) return montado;
  const out = montado.slice();
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
