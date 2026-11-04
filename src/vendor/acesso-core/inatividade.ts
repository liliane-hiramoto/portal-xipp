// Saída por inatividade: as regras puras (sem React, sem Supabase) — a tela
// que vigia é a `<SaidaPorInatividade>`, em ./vigia.
//
// Decisão da usuária (19/10/2026, "opção 2"): 3 minutos parado nas telas
// financeiras e 15 nas de uso do time (Timesheet, Intranet, Pessoas…), onde
// quem escreve uma descrição longa ou lê um comunicado perdia o que digitava.
// O CURTO é o padrão: a rota que o portal não listar como longa fica com 3 min
// — esquecer uma rota nova a deixa mais segura, nunca menos.

export interface RegraInatividade {
  /** Minutos para as rotas que não estão em `longas` (as financeiras). */
  curto: number;
  /** Minutos para as rotas em `longas`. */
  longo: number;
  /** Rotas com o tempo longo: "/intranet" vale para ela e tudo abaixo; "/" só para a home. */
  longas: string[];
}

/**
 * A atividade é uma só para todas as abas do navegador (localStorage): quem
 * trabalha no Timesheet numa aba não é derrubado pela aba do Financeiro
 * esquecida aberta ao lado — a sessão é a mesma.
 */
export const CHAVE_ATIVIDADE = "acesso-core:ultima-atividade";

export function naRota(path: string, rota: string): boolean {
  return path === rota || (rota !== "/" && path.startsWith(rota + "/"));
}

/** Quantos minutos parado esta rota aceita. */
export function minutosDaRota(path: string, regra: RegraInatividade): number {
  return regra.longas.some((r) => naRota(path, r)) ? regra.longo : regra.curto;
}

/** Já passou do limite? `ultimaAtividade` e `agora` em milissegundos. */
export function expirou(ultimaAtividade: number, agora: number, minutos: number): boolean {
  return agora - ultimaAtividade >= minutos * 60_000;
}

/** A mais recente entre a desta aba e a gravada pelas outras (lixo no storage não conta). */
export function ultimaAtividade(destaAba: number, gravada: string | null): number {
  const n = Number(gravada);
  return Number.isFinite(n) && n > destaAba ? n : destaAba;
}
