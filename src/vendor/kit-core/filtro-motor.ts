// FILTRO POR COLUNA, COM CASCATA — o motor (puro, com teste). A tela só
// DECLARA as suas colunas; o desenho é o balão no cabeçalho
// (`filtro-coluna.tsx`), estilo escolhido pela usuária em 20/10/2026.
// Vindo da Headset (`lib/filtros-coluna.ts`), agora com VÁRIOS valores por
// coluna (Aluguel + Energia), como os balões do Flórida, RQ e LH já faziam.
//
// AS QUATRO COISAS QUE ESTE ARQUIVO EXISTE PARA NÃO DEIXAR ERRAR:
//
// 1. A CASCATA É O `skip`. As opções da coluna X saem do conjunto filtrado
//    pelas OUTRAS colunas, ignorando o filtro de X. Sem isso a lista se reduz
//    ao que já está escolhido, e marcar uma segunda opção vira impossível.
// 2. NENHUMA OPÇÃO OFERECIDA LEVA A ZERO LINHAS — é a consequência do item 1.
// 3. O QUE ESTÁ ESCOLHIDO VOLTA SEMPRE PARA A LISTA, mesmo que a combinação
//    atual não exista em linha nenhuma: senão a tela filtra por algo que não
//    mostra, e não há como desmarcar.
// 4. AUSENTE É UMA OPÇÃO, não a falta dela. `SEM` filtra as linhas SEM o
//    campo — é o que se procura quando o trabalho é completar cadastro.

import type { GrupoOpcoes } from "./categorias";

/** Uma coluna filtrável. */
export type Coluna<T> = {
  /** Chave do filtro no estado. */
  k: string;
  rotulo: string;
  /** O valor da linha nesta coluna. Vazio/ausente = a linha não tem o campo. */
  de: (x: T) => string | number | undefined | null;
  /**
   * `lista`    = marcar entre os distintos, em cascata (vários de uma vez);
   * `texto`    = digitar e casar por trecho, sem acento;
   * `booleano` = liga/desliga (o estado é "" ou "1").
   */
  tipo: "lista" | "texto" | "booleano";
  /**
   * Casamento PRÓPRIO, quando "contém o texto" não serve (número exato OU
   * trecho, por exemplo). Obrigatório no `booleano`, que não tem texto.
   * Recebe o valor filtrado como texto — na lista, um valor por vez.
   */
  casa?: (x: T, filtro: string) => boolean;
  /** Ordem das opções. Ausente = alfabética (pt-BR). `null` = ordem de chegada. */
  ordem?: ((a: string, b: string) => number) | null;
  /** Como a opção aparece na tela (ex.: id → nome). */
  rotuloDe?: (v: string) => string;
  /**
   * A coluna é de CATEGORIA: o balão agrupa as opções pela Estrutura FC (o
   * adaptador do portal monta os grupos). Quem decide QUAIS aparecem continua
   * sendo a cascata.
   */
  grupos?: GrupoOpcoes[];
  /**
   * Valores que NÃO são categoria numa coluna de categoria (o "não
   * classificado" das regras): vão no topo do balão, com este rótulo.
   */
  extras?: Record<string, string>;
};

/** Lista sem filtro. Também se aceita `[]` ou "". */
export const TODOS = "ALL";
/** Só as linhas SEM o campo. Pode ir junto com outros valores na lista. */
export const SEM = "__none";
/** O estado "ligado" de uma coluna booleana. */
export const LIGADO = "1";

/** Por coluna: na lista, os valores marcados (ou um só, em texto); no texto, o que se digitou. */
export type Estado = Record<string, string | string[]>;

export function estadoVazio<T>(cols: Coluna<T>[]): Estado {
  return Object.fromEntries(cols.map((c) => [c.k, c.tipo === "lista" ? [] : ""]));
}

/** Os valores marcados numa coluna de lista (vazio = sem filtro). */
export function marcados(v: string | string[] | undefined): string[] {
  if (v === undefined || v === "" || v === TODOS) return [];
  return Array.isArray(v) ? v : [v];
}

/** Quantos filtros esta coluna tem ligados — o número no cabeçalho. */
export function quantosNaColuna<T>(c: Coluna<T>, v: string | string[] | undefined): number {
  if (c.tipo === "lista") return marcados(v).length;
  const s = Array.isArray(v) ? v.join("") : (v ?? "");
  if (c.tipo === "booleano") return s === LIGADO ? 1 : 0;
  return s.trim() ? 1 : 0;
}

export function temFiltro<T>(cols: Coluna<T>[], est: Estado): boolean {
  return cols.some((c) => quantosNaColuna(c, est[c.k]) > 0);
}

export const semAcentoMinusculo = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const vazio = (v: unknown) => v === undefined || v === null || v === "";

/** O predicado dos filtros ligados. `skip` ignora UM deles — é a cascata. */
export function criarPassa<T>(cols: Coluna<T>[], est: Estado): (x: T, skip?: string) => boolean {
  const ligados = cols.filter((c) => quantosNaColuna(c, est[c.k]) > 0).map((c) => {
    const v = est[c.k];
    const texto = Array.isArray(v) ? v.join("") : (v ?? "");
    return { c, lista: c.tipo === "lista" ? new Set(marcados(v)) : null, texto };
  });
  return (x, skip) => {
    for (const { c, lista, texto } of ligados) {
      if (c.k === skip) continue;
      if (lista) {
        // Na lista, passa se casar com QUALQUER um dos marcados.
        const campo = c.de(x);
        let algum = false;
        for (const m of lista) {
          if (m === SEM ? vazio(campo) : c.casa ? c.casa(x, m) : !vazio(campo) && String(campo) === m) { algum = true; break; }
        }
        if (!algum) return false;
      } else if (c.casa) {
        if (!c.casa(x, texto)) return false;
      } else if (c.tipo === "booleano") {
        // Sem `casa`, o booleano olha se o campo existe — deixar passar calado
        // faria o filtro marcado não filtrar nada.
        if (vazio(c.de(x))) return false;
      } else if (!semAcentoMinusculo(String(c.de(x) ?? "")).includes(semAcentoMinusculo(texto))) {
        return false;
      }
    }
    return true;
  };
}

export function filtrar<T>(linhas: T[], cols: Coluna<T>[], est: Estado): T[] {
  const passa = criarPassa(cols, est);
  return linhas.filter((x) => passa(x));
}

const alfabetica = (a: string, b: string) => a.localeCompare(b, "pt-BR", { numeric: true });

export type Opcoes = { valores: string[]; temVazio: boolean };

/**
 * As opções de cada coluna de lista, já em cascata. `temVazio` diz se há linha
 * SEM o campo no recorte — só então a opção "(sem …)" aparece.
 */
export function opcoesPorColuna<T>(
  linhas: T[],
  cols: Coluna<T>[],
  est: Estado,
  /** O predicado, quando quem chama já o tem (para não montar um segundo, diferente). */
  passaDado?: (x: T, skip?: string) => boolean,
): Map<string, Opcoes> {
  const passa = passaDado ?? criarPassa(cols, est);
  const out = new Map<string, Opcoes>();
  for (const c of cols) {
    if (c.tipo !== "lista") continue;
    const set = new Set<string>();
    let temVazio = false;
    for (const x of linhas) {
      if (!passa(x, c.k)) continue;
      const v = c.de(x);
      if (vazio(v)) temVazio = true;
      else set.add(String(v));
    }
    // O marcado volta SEMPRE — item 3 do topo.
    for (const m of marcados(est[c.k])) {
      if (m === SEM) temVazio = true;
      else set.add(m);
    }
    const vals = [...set];
    out.set(c.k, { valores: c.ordem === null ? vals : vals.sort(c.ordem ?? alfabetica), temVazio });
  }
  return out;
}

/** Uma ordem que segue uma lista de referência (ex.: a Estrutura FC); o resto vai ao fim, em ordem alfabética. */
export function ordemDaLista(ids: string[]): (a: string, b: string) => number {
  const pos = new Map(ids.map((id, i) => [id, i]));
  return (a, b) => (pos.get(a) ?? Infinity) - (pos.get(b) ?? Infinity) || alfabetica(a, b);
}

/** Marca ou desmarca um valor da lista. */
export function alternar(atual: string | string[] | undefined, v: string): string[] {
  const s = marcados(atual);
  return s.includes(v) ? s.filter((x) => x !== v) : [...s, v];
}
