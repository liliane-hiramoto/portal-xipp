// OS CARDS DO MENU, EDITÁVEIS PELA TELA (Etapa 3 do catálogo, 10/11/2026 — a
// mesma régua da Inexx e da Flórida). O que Admin › Cards do menu pode mudar num
// card: nome, descrição, ícone, faixa, ordem e "mostrar no menu" (`oculto`).
// ⚠️ `key`, `href`, `sem_gate` e `so_admin` ficam FORA: a chave liga o card a
// quem tem acesso, o destino é a porta, e quem-vê-o-quê mexe em acesso.

import { FAIXAS } from "./modulos";

export interface EdicaoCard {
  label: string;
  descricao: string;
  emoji: string;
  grupo: string;
  ordem: number;
  oculto: boolean;
}

/** Confere o formulário ANTES do banco; a recusa vai direto para a tela.
 *  `grupoAtual`: a faixa que o card JÁ tem vale mesmo fora da lista. */
export function validarCard(
  c: Record<string, unknown>,
  grupoAtual?: string | null,
): { ok: true; mudanca: EdicaoCard } | { ok: false; erro: string } {
  const txt = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const label = txt(c.label);
  const descricao = txt(c.descricao);
  const emoji = txt(c.emoji);
  const grupo = txt(c.grupo);
  const ordem = typeof c.ordem === "number" ? c.ordem : Number(txt(c.ordem));
  if (!label) return { ok: false, erro: "O card precisa de um nome." };
  if (label.length > 60) return { ok: false, erro: "Nome com mais de 60 letras não cabe no card." };
  if (descricao.length > 240) return { ok: false, erro: "Descrição com mais de 240 letras não cabe no card." };
  if ([...emoji].length > 4) return { ok: false, erro: "O ícone é um emoji só." };
  if (!(FAIXAS as readonly string[]).includes(grupo) && grupo !== (grupoAtual ?? "").trim()) return { ok: false, erro: `Faixa desconhecida: ${grupo || "(vazia)"}.` };
  if (!Number.isInteger(ordem) || ordem < 0 || ordem > 9999) return { ok: false, erro: "A ordem é um número inteiro (10, 20, 30…)." };
  if (typeof c.oculto !== "boolean") return { ok: false, erro: "Faltou dizer se o card aparece no menu." };
  return { ok: true, mudanca: { label, descricao, emoji, grupo, ordem, oculto: c.oculto } };
}
