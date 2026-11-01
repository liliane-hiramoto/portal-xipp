// A LISTA de categorias que o <SeletorCategoria> oferece e a BUSCA por
// digitação. Puro, para a regra ter teste. Vindo da Headset
// (`busca-categoria.ts`), sem o tipo dela: cada portal entrega os grupos no
// formato comum abaixo (o adaptador mora no portal).

/** Um grupo da Estrutura e as categorias dele, na ordem do Fluxo de Caixa. */
export interface GrupoOpcoes {
  /** "Operacional › Receita Líquida" — o caminho que vira o cabeçalho. */
  rotulo: string;
  /** `valor` é o que se grava (o id na Headset, o NOME nos outros portais). */
  itens: { valor: string; nome: string }[];
}

/** Um cabeçalho de grupo, ou uma categoria escolhível. */
export type ItemLista =
  | { tipo: "grupo"; rotulo: string }
  | { tipo: "cat"; id: string; nome: string; caminho: string };

/**
 * Os grupos achatados em cabeçalho + categorias, na ordem recebida.
 *
 * `apenas` restringe às categorias presentes (o filtro em cascata só oferece o
 * que existe no recorte) SEM desmanchar o agrupamento; `excluir` tira valores
 * que a tela não oferece. Grupo que fica vazio não vira cabeçalho solto.
 */
export function listaDeGrupos(
  grupos: GrupoOpcoes[],
  opts: {
    apenas?: Iterable<string>;
    excluir?: Iterable<string>;
    /** Atalho NO TOPO; as categorias continuam também no seu lugar. */
    destaque?: { rotulo: string; ids: Iterable<string> };
    /** Cabeçalho das categorias que estão no dado mas não na estrutura. */
    rotuloOrfas?: string;
  } = {},
): ItemLista[] {
  const so = opts.apenas ? new Set(opts.apenas) : null;
  const fora = new Set(opts.excluir ?? []);
  const out: ItemLista[] = [];
  for (const g of grupos) {
    const itens = g.itens.filter((c) => !fora.has(c.valor) && (!so || so.has(c.valor)));
    if (!itens.length) continue;
    out.push({ tipo: "grupo", rotulo: g.rotulo });
    for (const c of itens) out.push({ tipo: "cat", id: c.valor, nome: c.nome, caminho: g.rotulo });
  }
  // A CATEGORIA QUE NÃO ESTÁ NA ESTRUTURA não some: um lançamento classificado
  // numa categoria apagada ainda existe, e o filtro tem de conseguir achá-lo.
  if (so) {
    const conhecidas = new Set(grupos.flatMap((g) => g.itens.map((c) => c.valor)));
    const orfas = [...so].filter((v) => v && !conhecidas.has(v) && !fora.has(v));
    if (orfas.length) {
      const caminho = opts.rotuloOrfas ?? "Fora da Estrutura FC";
      out.push({ tipo: "grupo", rotulo: caminho });
      for (const v of orfas.sort()) out.push({ tipo: "cat", id: v, nome: v, caminho });
    }
  }
  if (opts.destaque) {
    const ids = new Set(opts.destaque.ids);
    const topo = out.filter((x): x is Extract<ItemLista, { tipo: "cat" }> => x.tipo === "cat" && ids.has(x.id));
    if (topo.length) return [{ tipo: "grupo", rotulo: opts.destaque.rotulo }, ...topo, ...out];
  }
  return out;
}

export const semAcento = (s: string) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * O que a pessoa digitou, contra o NOME e o CAMINHO: cada palavra tem de
 * aparecer em algum dos dois, em qualquer ordem e sem acento. "pessoal" acha o
 * grupo inteiro, "pessoal vale" estreita para o vale dentro de Pessoal.
 *
 * A ORDEM NÃO MUDA com a busca: ordenar por "relevância" faria a mesma
 * categoria pular de lugar a cada letra digitada.
 */
export function buscarCategorias(lista: ItemLista[], texto: string): ItemLista[] {
  const palavras = semAcento(texto).split(/\s+/).filter(Boolean);
  if (!palavras.length) return lista;
  const out: ItemLista[] = [];
  let cab: ItemLista | null = null;
  for (const x of lista) {
    if (x.tipo === "grupo") { cab = x; continue; }
    const alvo = semAcento(`${x.caminho} ${x.nome}`);
    if (!palavras.every((p) => alvo.includes(p))) continue;
    if (cab) { out.push(cab); cab = null; }
    out.push(x);
  }
  return out;
}
