// A CÓPIA que a Flórida guarda de cada portal (decisão de 09/11/2026).
//
// A Flórida puxa `exportar?desde=<cursor>` de cada portal a cada 15 minutos e
// aplica o que veio. Esta é a conta pura de "o que muda na cópia" — o servidor
// da Flórida só executa o plano. Testada em copia.teste.mjs.
//
// Três regras que o teste protege:
//   1. Exportação COMPLETA troca a cópia inteira daquele portal: o que a cópia
//      tem e o portal não mandou SAI (é assim que a cópia se conserta sozinha).
//   2. Exportação INCREMENTAL só acrescenta/atualiza, e tira o que veio como
//      apagado (lápide). Nunca apaga por ausência.
//   3. O cursor só anda quando a rodada deu certo. Falhou, a próxima pede de
//      novo desde o mesmo ponto — nada se perde, no máximo se repete.
//
// E a regra dos agentes: silêncio nunca quer dizer "tudo certo". Portal que não
// copia há mais de 1 hora (4 rodadas) vira AVISO, em contagem, sem nome de
// pessoa nem conteúdo de atividade.

import type { Apagado, Exportacao } from "./contrato";

export interface LinhaComId { id: number }

export interface PlanoTabela<T extends LinhaComId> {
  gravar: T[];
  apagar: number[];
}

export interface PlanoCopia {
  atividades: PlanoTabela<Exportacao["atividades"][number]>;
  ocorrencias: PlanoTabela<Exportacao["ocorrencias"][number]>;
  comentarios: PlanoTabela<Exportacao["comentarios"][number]>;
  cursor: string;
}

type Tabela = Apagado["tabela"];

function planoDe<T extends LinhaComId>(
  tabela: Tabela, vindas: T[], idsNaCopia: number[], exp: Exportacao,
): PlanoTabela<T> {
  if (exp.completa) {
    const vieram = new Set(vindas.map((v) => v.id));
    return { gravar: vindas, apagar: idsNaCopia.filter((id) => !vieram.has(id)).sort((a, b) => a - b) };
  }
  const apagados = new Set(exp.apagados.filter((a) => a.tabela === tabela).map((a) => a.id));
  return {
    // Linha que voltou a existir depois de apagada (raro) vale o que veio por último:
    // a lápide e a linha nova chegam juntas; a linha nova ganha.
    gravar: vindas,
    apagar: [...apagados].filter((id) => !vindas.some((v) => v.id === id)).sort((a, b) => a - b),
  };
}

/** O que fazer na cópia de UM portal com a exportação que chegou. */
export function planoDeCopia(
  exp: Exportacao,
  naCopia: { atividades: number[]; ocorrencias: number[]; comentarios: number[] },
): PlanoCopia {
  return {
    atividades: planoDe("atividades", exp.atividades, naCopia.atividades, exp),
    ocorrencias: planoDe("ocorrencias", exp.ocorrencias, naCopia.ocorrencias, exp),
    comentarios: planoDe("comentarios", exp.comentarios, naCopia.comentarios, exp),
    cursor: exp.cursor,
  };
}

/** Recusa a exportação que não dá para aplicar. Null = pode aplicar. */
export function exportacaoInvalida(exp: unknown, versaoEsperada: number): string | null {
  if (!exp || typeof exp !== "object") return "resposta vazia";
  const e = exp as Partial<Exportacao>;
  if (e.versao !== versaoEsperada) return `versão do contrato ${e.versao ?? "?"} (esperada ${versaoEsperada}) — atualizar o pacote no portal`;
  if (typeof e.cursor !== "string" || Number.isNaN(Date.parse(e.cursor))) return "cursor inválido";
  for (const k of ["atividades", "ocorrencias", "comentarios", "apagados", "usuarios", "empresas"] as const) {
    if (!Array.isArray(e[k])) return `faltou a lista ${k}`;
  }
  return null;
}

// ── Saúde da cópia: o aviso por portal ──

export interface RodadaPortal {
  portal: string;               // nome do portal
  ok: boolean;
  erro?: string;
  /** Última cópia que deu certo (ISO), antes desta rodada. */
  ultimaOk: string | null;
  linhas?: number;              // quantas linhas vieram nesta rodada
}

export const LIMITE_SEM_COPIA_MIN = 60;

/** Minutos desde a última cópia boa; null = nunca copiou. */
export function minutosSemCopia(r: RodadaPortal, agoraIso: string): number | null {
  if (r.ok) return 0;
  if (!r.ultimaOk) return null;
  return Math.floor((Date.parse(agoraIso) - Date.parse(r.ultimaOk)) / 60000);
}

/**
 * Quais portais pedem aviso. Uma falha isolada NÃO avisa (a próxima rodada, em
 * 15 min, tenta de novo); avisa quando passa do limite ou quando nunca copiou.
 */
export function portaisParaAvisar(rodadas: RodadaPortal[], agoraIso: string): { portal: string; minutos: number | null; erro: string }[] {
  return rodadas
    .filter((r) => !r.ok)
    .map((r) => ({ portal: r.portal, minutos: minutosSemCopia(r, agoraIso), erro: r.erro ?? "sem resposta" }))
    .filter((x) => x.minutos === null || x.minutos >= LIMITE_SEM_COPIA_MIN)
    .sort((a, b) => a.portal.localeCompare(b.portal, "pt-BR"));
}

/** Texto do cartão (Teams/e-mail): só portal, tempo e o erro técnico — nada de conteúdo. */
export function textoDoAviso(avisar: ReturnType<typeof portaisParaAvisar>): string | null {
  if (!avisar.length) return null;
  const linhas = avisar.map((a) => {
    const tempo = a.minutos === null ? "nunca copiou" : `sem cópia há ${a.minutos >= 120 ? `${Math.floor(a.minutos / 60)} h` : `${a.minutos} min`}`;
    return `• ${a.portal}: ${tempo} — ${a.erro}`;
  });
  return `⚠️ Cópia do cronograma parada em ${avisar.length} portal(is). O painel da Flórida mostra dado velho desses portais até voltar.\n${linhas.join("\n")}`;
}
