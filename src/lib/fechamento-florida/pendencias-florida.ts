// Pendências (Rituais de Gestão) da FLÓRIDA, lidas e mudadas pelo servidor deste portal.
//
// SERVER-ONLY: usa a chave FLORIDA_FECHAMENTO_TOKEN (a MESMA do cronograma),
// que nunca vai ao navegador. As pendências moram no banco do Portal Flórida
// (0227 de lá); este portal LÊ as dele e pode ANOTAR e MUDAR A SITUAÇÃO, pela
// API /api/rituais/portal. Criar, apagar e trocar responsável é na Flórida.
// O recorte (quais pendências são deste cliente) é decidido LÁ, pela chave.
//
// ⚠️ Arquivo IGUAL nos portais Affix, Inexx, RQ e WR (o lado de lá é
// src/lib/rituais-portal.ts do Portal Flórida). O formato é CONTRATO:
// `versao` 1. Mudou lá, muda aqui nos quatro.

export type SituacaoPend = "NAO_INICIADA" | "EM_ANDAMENTO" | "AGUARDANDO" | "CONCLUIDA" | "CANCELADA";

export interface AnotacaoPend { data: string; tipo: string; texto: string; autor: string }
export interface Pendencia {
  id: number; tema: string; acao: string; contexto: string;
  responsaveis: string[]; prazo: string | null; prazoTexto: string | null;
  situacao: SituacaoPend; situacaoLabel: string; bolaCom: "FLORIDA" | "CLIENTE" | null;
  atrasada: boolean; historico: AnotacaoPend[];
  /** Os usuários DESTE portal que são responsáveis (id). Opcional: a Flórida manda desde 09/11/2026. */
  responsaveisPortal?: string[];
  /** Os responsáveis que o portal não edita (Flórida, nome livre): só os nomes. */
  responsaveisFixos?: string[];
  /** Quando a pendência foi identificada (YYYY-MM-DD). */
  identificadaEm?: string;
}
export interface PendenciasFlorida {
  versao: number; portal: { id: string; nome: string }; hoje: string;
  situacoes: { valor: SituacaoPend; rotulo: string }[];
  pendencias: Pendencia[];
  /** Quem deste portal pode ser responsável (a lista que o Cronograma manda à Flórida). */
  usuarios?: { id: string; nome: string }[];
  /** Os temas que já existem neste cliente. */
  temas?: string[];
}
export type ResultadoPend = { ok: true; dados: PendenciasFlorida } | { ok: false; erro: string };

const VERSAO = 1;
const base = () => (process.env.FLORIDA_FECHAMENTO_URL || "https://portal-florida.vercel.app").replace(/\/$/, "");
const SEM_CHAVE = "Os Rituais de Gestão ainda não foram ligados: falta a variável FLORIDA_FECHAMENTO_TOKEN na Vercel deste portal.";

export async function buscarPendenciasFlorida(todas = false): Promise<ResultadoPend> {
  const chave = process.env.FLORIDA_FECHAMENTO_TOKEN;
  if (!chave) return { ok: false, erro: SEM_CHAVE };
  try {
    const res = await fetch(`${base()}/api/rituais/portal${todas ? "?todas=1" : ""}`, {
      headers: { Authorization: `Bearer ${chave}` }, cache: "no-store",
    });
    if (res.status === 401) {
      return { ok: false, erro: "O Portal Flórida recusou a chave. Gere uma nova em Fechamento › Portais dos clientes e atualize FLORIDA_FECHAMENTO_TOKEN aqui." };
    }
    if (res.status === 404) return { ok: false, erro: "O Portal Flórida ainda não tem a parte dos Rituais para os portais. Tente de novo depois da próxima publicação de lá." };
    if (!res.ok) return { ok: false, erro: `O Portal Flórida respondeu ${res.status}. Tente de novo em alguns minutos.` };
    const dados = (await res.json()) as PendenciasFlorida;
    if (dados.versao !== VERSAO) return { ok: false, erro: `O formato das pendências mudou (versão ${dados.versao}); este portal precisa ser atualizado.` };
    return { ok: true, dados };
  } catch (e) {
    return { ok: false, erro: `Não consegui falar com o Portal Flórida: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export interface CamposPend {
  tema: string; acao: string; contexto: string;
  prazo: string | null; bolaCom: "FLORIDA" | "CLIENTE" | null; identificadaEm: string | null;
  /** ids dos usuários DESTE portal; os da Flórida ficam como estão. */
  responsaveis: string[];
}

export type MudancaPend =
  | { tipo: "anotar"; acaoId: number; texto: string; autor: string }
  | { tipo: "situacao"; acaoId: number; situacao: SituacaoPend; autor: string }
  | ({ tipo: "salvar"; acaoId?: number; autor: string } & CamposPend);

/** Anota, muda a situação, cria ou edita. `autor` = o nome de quem está logado AQUI. */
export async function mudarPendenciaFlorida(m: MudancaPend): Promise<{ ok: true } | { ok: false; erro: string }> {
  const chave = process.env.FLORIDA_FECHAMENTO_TOKEN;
  if (!chave) return { ok: false, erro: SEM_CHAVE };
  try {
    const res = await fetch(`${base()}/api/rituais/portal`, {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify(m), cache: "no-store",
    });
    if (res.ok) return { ok: true };
    const j = (await res.json().catch(() => ({}))) as { erro?: string };
    return { ok: false, erro: j.erro || `O Portal Flórida respondeu ${res.status}.` };
  } catch (e) {
    return { ok: false, erro: `Não consegui falar com o Portal Flórida: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Lê o FormData dos formulários do <PendenciasFlorida> e devolve a mudança (ou null, se o formulário veio torto ou sem a ação). */
export function mudancaDoForm(fd: FormData, autor: string): MudancaPend | null {
  const tipo = String(fd.get("tipo") ?? "");
  const acaoId = Number(fd.get("acaoId"));
  if (tipo !== "salvar" && (!Number.isInteger(acaoId) || acaoId <= 0)) return null;
  if (tipo === "anotar") {
    const texto = String(fd.get("texto") ?? "").trim();
    return texto ? { tipo, acaoId, texto, autor } : null;
  }
  if (tipo === "salvar") {
    const id = Number(fd.get("acaoId"));
    const txt = (k: string) => String(fd.get(k) ?? "").trim();
    const ymd = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(txt(k)) ? txt(k) : null);
    const bola = txt("bolaCom");
    if (!txt("acao")) return null;
    return {
      tipo, acaoId: Number.isInteger(id) && id > 0 ? id : undefined, autor,
      tema: txt("tema"), acao: txt("acao"), contexto: txt("contexto"),
      prazo: ymd("prazo"), identificadaEm: ymd("identificadaEm"),
      bolaCom: bola === "FLORIDA" || bola === "CLIENTE" ? bola : null,
      responsaveis: fd.getAll("responsaveis").map(String).filter(Boolean),
    };
  }
  if (tipo === "situacao") {
    const situacao = String(fd.get("situacao") ?? "") as SituacaoPend;
    return ["NAO_INICIADA", "EM_ANDAMENTO", "AGUARDANDO", "CONCLUIDA", "CANCELADA"].includes(situacao) ? { tipo, acaoId, situacao, autor } : null;
  }
  return null;
}
