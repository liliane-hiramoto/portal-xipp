// AS ETIQUETAS da empresa — um cadastro só, e o papel é etiqueta, não tabela.
//
// O modelo da Flórida e do RQ (core.empresas): a mesma empresa pode ser do
// grupo (própria), cliente e fornecedora ao mesmo tempo — três tabelas para
// isso eram três cadastros do mesmo CNPJ divergindo. O GRUPO ECONÔMICO junta
// empresas (o cliente é o grupo, não o CNPJ) e é opcional.
//
// O cadastro decide categoria, intercompany e folha nos motores: é por isso
// que ele tem de ser UM.

import { mesmoDocumento, raizCnpj, soAlnum } from "./documento";

export type Papel = "propria" | "cliente" | "fornecedor";

export const PAPEIS: { papel: Papel; coluna: "e_propria" | "e_cliente" | "e_fornecedor"; rotulo: string }[] = [
  { papel: "propria", coluna: "e_propria", rotulo: "Do grupo" },
  { papel: "cliente", coluna: "e_cliente", rotulo: "Cliente" },
  { papel: "fornecedor", coluna: "e_fornecedor", rotulo: "Fornecedor" },
];

export interface EmpresaBase {
  id?: number | string;
  cnpj?: string | null;
  apelido?: string | null;
  nome_fantasia?: string | null;
  razao_social?: string | null;
  grupo_id?: number | string | null;
  e_propria?: boolean | null;
  e_cliente?: boolean | null;
  e_fornecedor?: boolean | null;
  ativo?: boolean | null;
}

/** Os papéis marcados na empresa. */
export function papeisDe(e: EmpresaBase): Papel[] {
  return PAPEIS.filter((p) => !!e[p.coluna]).map((p) => p.papel);
}

/** "Do grupo · Cliente" — para a lista. Sem papel: "sem etiqueta". */
export function rotuloPapeis(e: EmpresaBase): string {
  const r = PAPEIS.filter((p) => !!e[p.coluna]).map((p) => p.rotulo);
  return r.length ? r.join(" · ") : "sem etiqueta";
}

export const temPapel = (e: EmpresaBase, papel: Papel) => !!e[PAPEIS.find((p) => p.papel === papel)!.coluna];

/** O nome que a tela mostra: apelido, fantasia, razão — o primeiro que houver. */
export const nomeCurto = (e: EmpresaBase) => (e.apelido || e.nome_fantasia || e.razao_social || "").trim() || "(sem nome)";

const norm = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * A empresa do cadastro para um documento ou nome (de um extrato, uma nota, uma
 * planilha). O CNPJ decide sozinho; só sem CNPJ vale o nome — e o nome só casa
 * quando aponta UMA empresa: dois candidatos é "não sei", nunca o primeiro.
 * `raiz: true` aceita a filial pela raiz do CNPJ (mesma empresa, outro
 * estabelecimento) quando o CNPJ exato não está no cadastro.
 */
export function acharEmpresa<E extends EmpresaBase>(
  lista: E[],
  chave: { cnpj?: string | null; nome?: string | null },
  o: { raiz?: boolean } = {},
): { empresa: E; por: "cnpj" | "raiz" | "nome" } | { empresa: null; por: "nenhuma" | "ambigua"; candidatos: E[] } {
  if (soAlnum(chave.cnpj)) {
    const exata = lista.filter((e) => mesmoDocumento(e.cnpj, chave.cnpj));
    if (exata.length === 1) return { empresa: exata[0], por: "cnpj" };
    if (exata.length > 1) return { empresa: null, por: "ambigua", candidatos: exata };
    if (o.raiz) {
      const r = raizCnpj(chave.cnpj);
      const mesmaRaiz = r ? lista.filter((e) => raizCnpj(e.cnpj) === r) : [];
      if (mesmaRaiz.length === 1) return { empresa: mesmaRaiz[0], por: "raiz" };
      if (mesmaRaiz.length > 1) return { empresa: null, por: "ambigua", candidatos: mesmaRaiz };
    }
    return { empresa: null, por: "nenhuma", candidatos: [] };
  }
  const n = norm(chave.nome);
  if (!n) return { empresa: null, por: "nenhuma", candidatos: [] };
  const porNome = lista.filter((e) => [e.apelido, e.nome_fantasia, e.razao_social].some((x) => norm(x) === n));
  if (porNome.length === 1) return { empresa: porNome[0], por: "nome" };
  return { empresa: null, por: porNome.length ? "ambigua" : "nenhuma", candidatos: porNome };
}

/** Duas empresas do cadastro com o MESMO CNPJ (escrito de jeitos diferentes) — o diagnóstico. */
export function cnpjsRepetidos<E extends EmpresaBase>(lista: E[]): E[][] {
  const por = new Map<string, E[]>();
  for (const e of lista) {
    const c = soAlnum(e.cnpj);
    if (c) por.set(c, [...(por.get(c) ?? []), e]);
  }
  return [...por.values()].filter((g) => g.length > 1);
}
