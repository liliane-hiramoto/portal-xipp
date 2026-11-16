// A consulta do CNPJ na RECEITA (BrasilAPI, com a Minha Receita de reserva) —
// o cartão CNPJ e o QSA (quadro de sócios) da empresa.
//
// Veio do Portal Flórida (src/lib/receita-brasilapi.ts e o bloco "Receita
// Federal" do cadastro), que veio do Portal Headset. Duas lições que vêm junto:
//  • a consulta é feita no NAVEGADOR: a BrasilAPI devolve 403 para a chamada
//    que sai do servidor da Vercel (16/10/2026);
//  • como a resposta vem do navegador, quem GRAVA confere que ela é do CNPJ da
//    empresa (`respostaDaEmpresa`) — senão um clique errado grava o cadastro
//    de outra.
//
// ⚠️ As chaves de `cadastro` são as do Cartão CNPJ (logradouro, municipio,
// cep…): a proposta da Flórida escreve o emissor com elas. Não renomear.
//
// Puro, fora `consultarReceita` (que recebe o fetch, para o teste).

import { soAlnum } from "./documento";

export interface SocioQSA { nome: string; qualificacao: string | null; documento: string | null; entrada: string | null }

export interface DadosReceita {
  razao_social: string | null;
  nome_fantasia: string | null;
  cidade: string | null;
  uf: string | null;
  cadastro: Record<string, string | null>;
  qsa: SocioQSA[];
}

const txt = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
};
/** "2009-03-12" → "12/03/2009" (o formato do Cartão CNPJ) */
const dataBR = (v: unknown) => { const s = txt(v); const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : s; };
const cepFmt = (v: unknown) => { const d = (txt(v) ?? "").replace(/\D/g, ""); return d.length === 8 ? `${d.slice(0, 2)}.${d.slice(2, 5)}-${d.slice(5)}` : txt(v); };
const telFmt = (v: unknown) => { const d = (txt(v) ?? "").replace(/\D/g, ""); return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : txt(v); };

/** Valor gravado quando a fonte não traz o campo. É texto (e não nulo) de
 *  propósito: `mesclarCadastro` só sobrescreve chave não nula, e um "Não
 *  optante" antigo ficaria para sempre na empresa que depois entrou no Simples. */
export const NAO_INFORMADO = "Não informado pela fonte";

const sim = (v: unknown) => v === true || /^(s|sim|true|1)$/i.test(String(v ?? "").trim());

/** "Situação no Simples Nacional" / "no SIMEI", como na Consulta Optantes.
 *  Na BrasilAPI e na Minha Receita, `null` em `opcao_pelo_simples` = a empresa
 *  não está no arquivo do Simples = NÃO optante; só a chave AUSENTE quer dizer
 *  que a fonte não informou. */
function situacaoOpcao(j: Record<string, unknown>, chave: string, dataOpcao: string, dataExclusao: string, rotulo: string, rotuloNao: string) {
  if (!(chave in j)) return NAO_INFORMADO;
  if (sim(j[chave])) { const d = dataBR(j[dataOpcao]); return `${rotulo}${d ? ` desde ${d}` : ""}`; }
  const ex = dataBR(j[dataExclusao]);
  return `${rotuloNao}${ex ? ` (excluída em ${ex})` : ""}`;
}

/** "Situação no Regime Regular do IBS / da CBS" (LC 214/2025): a base aberta
 *  ainda não traz o campo com nome conhecido (27/10/2026) — lê qualquer chave
 *  com `ibs`/`cbs`, se um dia vier. Fora do Simples é "Não optante" (a opção só
 *  existe para quem é do Simples); do Simples sem o campo, "não informado". */
function situacaoRegimeRegular(j: Record<string, unknown>, tributo: "ibs" | "cbs", simples: string) {
  const re = new RegExp(`(^|_)${tributo}(_|$)`, "i");
  const chave = Object.keys(j).find((k) => re.test(k) && (typeof j[k] === "boolean" || typeof j[k] === "string"));
  if (chave) {
    const v = j[chave];
    if (typeof v === "string" && !/^(s|n|sim|n[aã]o|true|false|0|1)$/i.test(v.trim())) return txt(v) ?? NAO_INFORMADO;
    return sim(v) ? "Optante" : "Não optante";
  }
  return simples.startsWith("NÃO optante") ? "Não optante" : NAO_INFORMADO;
}

/** O JSON da BrasilAPI / Minha Receita (formato da Receita) → o que o portal grava. */
export function mapearReceita(j: Record<string, unknown>): DadosReceita {
  const cnae = [txt(j.cnae_fiscal), txt(j.cnae_fiscal_descricao)].filter(Boolean).join(" - ") || null;
  const logradouro = [txt(j.descricao_tipo_de_logradouro), txt(j.logradouro)].filter(Boolean).join(" ") || null;
  const qsa = Array.isArray(j.qsa) ? (j.qsa as Record<string, unknown>[]) : [];
  const simples = situacaoOpcao(j, "opcao_pelo_simples", "data_opcao_pelo_simples", "data_exclusao_do_simples", "Optante pelo Simples Nacional", "NÃO optante pelo Simples Nacional");
  return {
    razao_social: txt(j.razao_social),
    nome_fantasia: txt(j.nome_fantasia),
    cidade: txt(j.municipio),
    uf: txt(j.uf),
    cadastro: {
      cnpj: txt(j.cnpj),
      razao_social: txt(j.razao_social),
      nome_fantasia: txt(j.nome_fantasia),
      situacao_cadastral: txt(j.descricao_situacao_cadastral),
      abertura: dataBR(j.data_inicio_atividade),
      natureza_juridica: txt(j.natureza_juridica),
      porte: txt(j.porte) ?? txt(j.descricao_porte),
      cnae_principal: cnae,
      capital_social: j.capital_social === undefined || j.capital_social === null ? null : String(j.capital_social),
      logradouro,
      numero: txt(j.numero),
      complemento: txt(j.complemento),
      bairro: txt(j.bairro),
      municipio: txt(j.municipio),
      uf: txt(j.uf),
      cep: cepFmt(j.cep),
      email: txt(j.email),
      telefone: telFmt(j.ddd_telefone_1),
      simples_nacional: simples,
      simei: situacaoOpcao(j, "opcao_pelo_mei", "data_opcao_pelo_mei", "data_exclusao_do_mei", "Enquadrado no SIMEI", "NÃO enquadrado no SIMEI"),
      ibs_regime_regular: situacaoRegimeRegular(j, "ibs", simples),
      cbs_regime_regular: situacaoRegimeRegular(j, "cbs", simples),
    },
    qsa: qsa.map((s) => ({
      nome: txt(s.nome_socio) ?? "",
      qualificacao: txt(s.qualificacao_socio),
      documento: txt(s.cnpj_cpf_do_socio),
      entrada: txt(s.data_entrada_sociedade),
    })).filter((s) => s.nome),
  };
}

/** A resposta é do CNPJ desta empresa? (quem grava confere — a consulta vem do navegador) */
export function respostaDaEmpresa(cnpjEmpresa: string | null | undefined, bruto: Record<string, unknown>): boolean {
  const c = soAlnum(cnpjEmpresa);
  return c.length === 14 && soAlnum(String(bruto?.cnpj ?? "")) === c;
}

/** O cadastro novo POR CIMA do antigo, só onde a Receita trouxe valor: o que só
 *  existe no portal (digitado, ou de um PDF antigo) fica. */
export function mesclarCadastro(antigo: Record<string, unknown> | null | undefined, novo: Record<string, string | null>): Record<string, unknown> {
  return { ...(antigo ?? {}), ...Object.fromEntries(Object.entries(novo).filter(([, v]) => v !== null)) };
}

export const FONTES_RECEITA = [
  (cnpj: string) => `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
  (cnpj: string) => `https://minhareceita.org/${cnpj}`,
];

type Fetch = (url: string, init?: { headers?: Record<string, string> }) =>
  Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/**
 * Consulta o CNPJ (chamar NO NAVEGADOR). Tenta a BrasilAPI e, se ela falhar, a
 * Minha Receita — as duas leem a base aberta da Receita, com os mesmos campos.
 * 404 é resposta ("não encontrou"), não falha: não adianta tentar a outra.
 */
export async function consultarReceita(
  cnpj: string,
  f: Fetch = fetch as unknown as Fetch,
): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; erro: string }> {
  const doc = soAlnum(cnpj);
  if (doc.length !== 14) return { ok: false, erro: "Preencha o CNPJ (14 caracteres) e salve antes de consultar a Receita." };
  let ultimo = "";
  for (const url of FONTES_RECEITA) {
    try {
      const r = await f(url(doc), { headers: { accept: "application/json" } });
      if (r.status === 404) return { ok: false, erro: "A Receita não encontrou este CNPJ." };
      if (r.ok) return { ok: true, json: (await r.json()) as Record<string, unknown> };
      ultimo = `HTTP ${r.status}`;
    } catch (e) {
      ultimo = e instanceof Error ? e.message : String(e);
    }
  }
  return { ok: false, erro: `A consulta da Receita falhou (${ultimo}). Tente de novo em alguns minutos.` };
}
