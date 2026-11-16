// Rituais de Gestão no PORTAL de cada cliente: o Checkpoint e as pendências.
//
// Decisão dela (09/11/2026), a mesma do cronograma: o que é de um cliente é
// GRAVADO no banco do portal dele; a Flórida guarda só a CÓPIA (a cada 15 min)
// e o que é só dela. Respostas dela:
//   • "Pendências e Checkpoint" vão para os portais;
//   • "Sim, um por cliente": um Checkpoint por cliente por data (0237);
//   • "Na tela da Flórida": Outlook, participantes e horas do Timesheet
//     continuam feitos lá, presos ao id da cópia — o portal não os vê.
//
//   GET  <portal>/api/fechamento-core/rituais/exportar?desde=<ISO> → ExportacaoRituais
//   POST <portal>/api/fechamento-core/rituais/acao      { AcaoRitual }   → RespostaAcao
//   POST <portal>/api/fechamento-core/rituais/importar  { PacoteRituais } → RespostaImportacaoRituais
//   Authorization: Bearer <chave do portal> (a MESMA do cronograma)
//
// O que mora no portal: os Checkpoints DELE (com as pautas e os pontos
// discutidos) e as pendências/decisões de CLIENTE dele (com responsáveis e o
// histórico). As pendências INTERNAS e os outros rituais (EXEC, Momento,
// R.O.T.A., IF) ficam só na Flórida.
//
// Pessoas por E-MAIL (como o responsável do cronograma) e empresas por CNPJ
// (só dígitos): os ids de pessoa e de empresa de um banco não valem no outro.
//
// ⚠️ CONTRATO entre repositórios. Campo novo pode entrar; campo existente não
// muda de nome nem de sentido sem subir VERSAO_RITUAIS e ajustar os dois lados.
//
// Puro e sem imports de runtime (só tipos).

import type { Autor } from "./contrato";

export const VERSAO_RITUAIS = 1;

export type StatusReuniao = "ABERTA" | "ENCERRADA";
export type SituacaoReuniao = "PREVISTA" | "REALIZADA" | "CANCELADA";
export type NaturezaAcao = "ACAO" | "DECISAO";
export type StatusAcao = "ABERTA" | "CONCLUIDA" | "CANCELADA";
export type AndamentoAcao = "NAO_INICIADA" | "EM_ANDAMENTO" | "AGUARDANDO";
/** O que a tela mostra numa coluna só: o andamento enquanto aberta, senão o status. */
export type SituacaoPendencia = AndamentoAcao | "CONCLUIDA" | "CANCELADA";
export type BolaCom = "FLORIDA" | "CLIENTE";

export const SITUACAO_PENDENCIA_LABEL: Record<SituacaoPendencia, string> = {
  NAO_INICIADA: "Não iniciada", EM_ANDAMENTO: "Em andamento", AGUARDANDO: "Aguardando",
  CONCLUIDA: "Concluída", CANCELADA: "Cancelada",
};

// ── O que o portal exporta (e a Flórida copia) ──

/** O Checkpoint. `empresa_cnpjs` vazio = todas as empresas do portal. */
export interface ReuniaoExport {
  id: number;
  data: string;                       // AAAA-MM-DD
  empresa_cnpjs: string[];
  status: StatusReuniao;
  situacao: SituacaoReuniao;
  motivo_cancelamento: string | null;
  local: string | null;
  hora_inicio: string | null;         // HH:MM
  hora_fim: string | null;
  observacoes: string | null;
  encerrada_em: string | null;
  atualizado_em: string;
}

/** A pauta da reunião (foto das fixas na abertura + as da semana) e os pontos discutidos. */
export interface PautaExport {
  id: number;
  reuniao_id: number;
  titulo: string;
  area: string;
  minutos: number;
  ordem: number;
  fonte: string;
  pontos: string | null;
  pontos_por: string | null;          // nome de quem escreveu por último
  atualizado_em: string;
}

/** A pendência (ACAO) ou decisão (DECISAO) de CLIENTE. `empresa_cnpjs` vazio = o portal inteiro. */
export interface AcaoRitualExport {
  id: number;
  reuniao_id: number | null;          // o Checkpoint em que nasceu; null = criada fora de reunião
  natureza: NaturezaAcao;
  tema: string | null;
  acao: string;
  contexto: string | null;
  prazo: string | null;
  prazo_texto: string | null;
  status: StatusAcao;
  andamento: AndamentoAcao;
  bola_com: BolaCom | null;
  identificada_em: string | null;
  concluida_em: string | null;
  cliente_nome: string | null;
  empresa_cnpjs: string[];
  atualizado_em: string;
}

/** Responsável: uma pessoa (por e-mail — da Flórida ou do portal) ou um nome livre. */
export interface ResponsavelExport {
  acao_id: number;
  email: string | null;
  nome_livre: string | null;
  ordem: number;
}

/** O histórico da pendência: só se ACRESCENTA. */
export interface HistoricoExport {
  id: number;
  acao_id: number;
  tipo: "COMENTARIO" | "STATUS" | "COBRANCA";
  texto: string;
  data: string;
  autor_email: string | null;
  autor_nome: string | null;
  origem: "portal" | "florida";
  criado_em: string;
}

export interface ApagadoRitual { tabela: "reunioes" | "pautas" | "acoes"; id: number; apagado_em: string }

/**
 * Incremental pelo `atualizado_em` (histórico pelo `criado_em`), como o
 * cronograma. Os RESPONSÁVEIS não têm cursor próprio: vão inteiros junto de
 * cada ação exportada (mudar responsável carimba a ação) e a cópia troca o
 * conjunto daquela ação.
 */
export interface ExportacaoRituais {
  versao: number;
  desde: string | null;
  ate: string;
  reunioes: ReuniaoExport[];
  pautas: PautaExport[];
  acoes: AcaoRitualExport[];
  responsaveis: ResponsavelExport[];
  historico: HistoricoExport[];
  apagados: ApagadoRitual[];
}

// ── Gravar pela Flórida (ou pela própria tela do portal: a MESMA função) ──

export interface PautaNova { titulo: string; area: string; minutos: number; fonte: string }
export interface ResponsavelNovo { email: string | null; nome_livre: string | null }
export interface CamposPendencia {
  id?: number;
  reuniao_id: number | null;
  natureza: NaturezaAcao;
  tema: string | null;
  acao: string;
  contexto: string | null;
  prazo: string | null;
  prazo_texto: string | null;
  bola_com: BolaCom | null;
  identificada_em: string | null;
  cliente_nome: string | null;
  empresa_cnpjs: string[];
  responsaveis: ResponsavelNovo[];
}

export type AcaoRitual =
  /** Abrir: quem abre é a Flórida (manda o convite do Outlook); as pautas fixas vão na ação. */
  | { tipo: "abrir_checkpoint"; data: string; empresa_cnpjs: string[]; pautas: PautaNova[]; autor: Autor }
  | { tipo: "detalhes_checkpoint"; id: number; data: string; local: string | null; hora_inicio: string | null; hora_fim: string | null; empresa_cnpjs: string[]; autor: Autor }
  | { tipo: "situacao_checkpoint"; id: number; situacao: SituacaoReuniao; motivo: string | null; autor: Autor }
  | { tipo: "encerrar_checkpoint"; id: number; encerrar: boolean; autor: Autor }
  | { tipo: "excluir_checkpoint"; id: number; autor: Autor }
  | { tipo: "pontos"; pauta_id: number; pontos: string; autor: Autor }
  | { tipo: "salvar_pauta"; reuniao_id: number; pauta: PautaNova & { id?: number }; autor: Autor }
  | { tipo: "remover_pauta"; pauta_id: number; autor: Autor }
  | { tipo: "mover_pauta"; pauta_id: number; direcao: -1 | 1; autor: Autor }
  | { tipo: "salvar_pendencia"; pendencia: CamposPendencia; autor: Autor }
  | { tipo: "situacao_pendencia"; id: number; situacao: SituacaoPendencia; autor: Autor }
  | { tipo: "anotar"; id: number; texto: string; autor: Autor }
  | { tipo: "excluir_pendencia"; id: number; autor: Autor };

const ymd = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const hhmm = (s: unknown) => s === null || (typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(s));
const email = (s: unknown) => typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const idOk = (n: unknown) => Number.isInteger(n) && (n as number) > 0;
const cnpjs = (l: unknown) => Array.isArray(l) && l.every((c) => typeof c === "string" && c.replace(/\D/g, "").length === 14);
const SITUACOES_R: SituacaoReuniao[] = ["PREVISTA", "REALIZADA", "CANCELADA"];

/** Confere a ação ANTES de gravar. Devolve o erro em português, ou null. */
export function validarAcaoRitual(a: unknown): string | null {
  if (!a || typeof a !== "object") return "envie um objeto { tipo, …, autor }";
  const x = a as Record<string, unknown>;
  const autor = x.autor as Record<string, unknown> | undefined;
  if (!autor || !email(autor.email) || !["portal", "florida"].includes(autor.origem as string)) {
    return "autor inválido: { email, nome, origem: portal|florida }";
  }
  const pauta = (p: unknown) => {
    const q = p as Record<string, unknown> | undefined;
    if (!q || typeof q.titulo !== "string" || !q.titulo.trim()) return "pauta sem título";
    if (!Number.isInteger(q.minutos) || (q.minutos as number) < 0) return "minutos da pauta inválidos";
    return null;
  };
  switch (x.tipo) {
    case "abrir_checkpoint":
      if (!ymd(x.data)) return "data deve ser AAAA-MM-DD";
      if (!cnpjs(x.empresa_cnpjs)) return "empresa_cnpjs deve ser uma lista de CNPJs";
      if (!Array.isArray(x.pautas)) return "pautas deve ser uma lista";
      for (const p of x.pautas) { const e = pauta(p); if (e) return e; }
      return null;
    case "detalhes_checkpoint":
      if (!idOk(x.id)) return "id inválido";
      if (!ymd(x.data)) return "data deve ser AAAA-MM-DD";
      if (!hhmm(x.hora_inicio) || !hhmm(x.hora_fim)) return "horário deve ser HH:MM";
      if (x.hora_inicio && x.hora_fim && String(x.hora_fim) <= String(x.hora_inicio)) return "o fim tem de ser depois do início";
      return cnpjs(x.empresa_cnpjs) ? null : "empresa_cnpjs deve ser uma lista de CNPJs";
    case "situacao_checkpoint":
      if (!idOk(x.id)) return "id inválido";
      if (!SITUACOES_R.includes(x.situacao as SituacaoReuniao)) return "situação inválida";
      if (x.situacao === "CANCELADA" && !(typeof x.motivo === "string" && x.motivo.trim())) return "cancelada exige o motivo";
      return null;
    case "encerrar_checkpoint":
      return !idOk(x.id) ? "id inválido" : typeof x.encerrar === "boolean" ? null : "encerrar deve ser true|false";
    case "excluir_checkpoint":
    case "excluir_pendencia":
      return idOk(x.id) ? null : "id inválido";
    case "pontos":
      if (!idOk(x.pauta_id)) return "pauta_id inválido";
      return typeof x.pontos === "string" && x.pontos.length <= 20000 ? null : "pontos inválidos";
    case "salvar_pauta":
      if (!idOk(x.reuniao_id)) return "reuniao_id inválido";
      return pauta(x.pauta);
    case "remover_pauta":
      return idOk(x.pauta_id) ? null : "pauta_id inválido";
    case "mover_pauta":
      return !idOk(x.pauta_id) ? "pauta_id inválido" : x.direcao === 1 || x.direcao === -1 ? null : "direcao deve ser -1|1";
    case "salvar_pendencia": {
      const p = x.pendencia as Record<string, unknown> | undefined;
      if (!p || typeof p.acao !== "string" || !p.acao.trim()) return "descreva a pendência";
      if (p.acao.length > 4000) return "pendência com mais de 4000 caracteres";
      if (p.id != null && !idOk(p.id)) return "id inválido";
      if (p.reuniao_id != null && !idOk(p.reuniao_id)) return "reuniao_id inválido";
      if (p.natureza !== "ACAO" && p.natureza !== "DECISAO") return "natureza deve ser ACAO|DECISAO";
      if (p.prazo != null && !ymd(p.prazo)) return "prazo deve ser AAAA-MM-DD";
      if (p.identificada_em != null && !ymd(p.identificada_em)) return "identificada_em deve ser AAAA-MM-DD";
      if (p.bola_com != null && p.bola_com !== "FLORIDA" && p.bola_com !== "CLIENTE") return "bola_com deve ser FLORIDA|CLIENTE";
      if (!cnpjs(p.empresa_cnpjs)) return "empresa_cnpjs deve ser uma lista de CNPJs";
      if (!Array.isArray(p.responsaveis)) return "responsaveis deve ser uma lista";
      for (const r of p.responsaveis as Record<string, unknown>[]) {
        const temEmail = r?.email != null, temNome = typeof r?.nome_livre === "string" && !!r.nome_livre.trim();
        if (temEmail === temNome) return "cada responsável é um e-mail OU um nome livre";
        if (temEmail && !email(r.email)) return "e-mail de responsável inválido";
      }
      return null;
    }
    case "situacao_pendencia":
      if (!idOk(x.id)) return "id inválido";
      return (x.situacao as string) in SITUACAO_PENDENCIA_LABEL ? null : "situação inválida";
    case "anotar":
      if (!idOk(x.id)) return "id inválido";
      if (typeof x.texto !== "string" || !x.texto.trim()) return "anotação vazia";
      return x.texto.length > 4000 ? "anotação com mais de 4000 caracteres" : null;
    default:
      return "tipo desconhecido";
  }
}

// ── As regras, uma só nos dois lados ──

/** A coluna única da tela, a partir do que o banco guarda. */
export const situacaoPendencia = (status: StatusAcao, andamento: AndamentoAcao | null | undefined): SituacaoPendencia =>
  status === "ABERTA" ? andamento ?? "EM_ANDAMENTO" : status;

/** O que gravar ao trocar a situação (concluir/cancelar data hoje; reabrir apaga a data). */
export function mudancaDeSituacao(para: SituacaoPendencia, hoje: string):
  { status: StatusAcao; concluida_em: string | null; andamento?: AndamentoAcao } {
  if (para === "CONCLUIDA" || para === "CANCELADA") return { status: para, concluida_em: hoje };
  return { status: "ABERTA", concluida_em: null, andamento: para };
}

/** A decisão nasce registrada: concluída na data em que foi tomada. */
export const nascimentoDaDecisao = (natureza: NaturezaAcao, hoje: string) =>
  natureza === "DECISAO" ? { status: "CONCLUIDA" as const, concluida_em: hoje } : { status: "ABERTA" as const, concluida_em: null };

const dataBR = (s: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "sem prazo");
const BOLA_TXT: Record<BolaCom, string> = { FLORIDA: "com a Flórida", CLIENTE: "com o cliente" };

/**
 * A linha STATUS que a edição deixa no histórico (a mesma regra da Flórida,
 * rituais-portal.ts): o que mudou, em português. Vazio = nada mudou.
 * `nome` traduz e-mail em nome (quem não se conhece aparece pelo e-mail).
 */
export function mudancasDaPendencia(
  antes: Pick<CamposPendencia, "tema" | "acao" | "contexto" | "prazo" | "bola_com" | "identificada_em" | "responsaveis">,
  depois: Pick<CamposPendencia, "tema" | "acao" | "contexto" | "prazo" | "bola_com" | "identificada_em" | "responsaveis">,
  nome: (email: string) => string = (e) => e,
): string[] {
  const m: string[] = [];
  if ((antes.tema ?? null) !== (depois.tema ?? null)) m.push(`tema: ${depois.tema ?? "—"}`);
  if (antes.acao !== depois.acao) m.push("texto da ação");
  if ((antes.contexto ?? null) !== (depois.contexto ?? null)) m.push("contexto");
  if ((antes.prazo ?? null) !== (depois.prazo ?? null)) m.push(`prazo: ${dataBR(antes.prazo ?? null)} → ${dataBR(depois.prazo ?? null)}`);
  if ((antes.bola_com ?? null) !== (depois.bola_com ?? null)) m.push(`agora está ${depois.bola_com ? BOLA_TXT[depois.bola_com] : "sem dono"}`);
  if (depois.identificada_em && (antes.identificada_em ?? null) !== depois.identificada_em) m.push(`identificada em ${dataBR(depois.identificada_em)}`);
  const chave = (r: ResponsavelNovo) => (r.email ? `e:${r.email.toLowerCase()}` : `n:${(r.nome_livre ?? "").trim()}`);
  const rot = (r: ResponsavelNovo) => (r.email ? nome(r.email.toLowerCase()) : (r.nome_livre ?? "").trim());
  const a = new Map(antes.responsaveis.map((r) => [chave(r), r]));
  const d = new Map(depois.responsaveis.map((r) => [chave(r), r]));
  const entra = [...d].filter(([k]) => !a.has(k)).map(([, r]) => `+${rot(r)}`);
  const sai = [...a].filter(([k]) => !d.has(k)).map(([, r]) => `−${rot(r)}`);
  if (entra.length || sai.length) m.push(`responsáveis: ${[...entra, ...sai].join(", ")}`);
  return m;
}

/**
 * O recorte por empresa: a pendência (ou o Checkpoint) é deste conjunto de
 * empresas? Vazio dos dois lados = o portal inteiro, então casa.
 */
export function tocaEmpresas(daLinha: string[], escolhidas: string[]): boolean {
  if (!daLinha.length || !escolhidas.length) return true;
  const s = new Set(escolhidas.map((c) => c.replace(/\D/g, "")));
  return daLinha.some((c) => s.has(c.replace(/\D/g, "")));
}

// ── Trazer o histórico da Flórida (uma vez só, por portal) ──
//
// Checkpoints, pautas, pendências, responsáveis e histórico com os MESMOS ids
// que têm na Flórida (o que fica só lá — Outlook, participantes, horas — está
// preso ao id). Só com as tabelas VAZIAS: é a mudança de casa.

export interface PacoteRituais {
  versao: number;
  reunioes: Omit<ReuniaoExport, "atualizado_em">[];
  pautas: Omit<PautaExport, "atualizado_em">[];
  acoes: Omit<AcaoRitualExport, "atualizado_em">[];
  responsaveis: ResponsavelExport[];
  historico: HistoricoExport[];
}

export interface ContagemRituais { reunioes: number; pautas: number; acoes: number; responsaveis: number; historico: number }
export interface RespostaImportacaoRituais { ok: boolean; erro?: string; enviado?: ContagemRituais; gravado?: ContagemRituais }

export const contarPacote = (p: PacoteRituais): ContagemRituais => ({
  reunioes: p.reunioes.length, pautas: p.pautas.length, acoes: p.acoes.length,
  responsaveis: p.responsaveis.length, historico: p.historico.length,
});

/** O que foi tem de ser o que chegou. */
export function conferirContagemRituais(enviado: ContagemRituais, gravado: ContagemRituais): string | null {
  const ks = ["reunioes", "pautas", "acoes", "responsaveis", "historico"] as const;
  const dif = ks.filter((k) => enviado[k] !== gravado[k]);
  return dif.length ? `contagem não bate em ${dif.map((k) => `${k} (${enviado[k]} enviados, ${gravado[k]} gravados)`).join(", ")}` : null;
}

/** O pacote é coerente? Pauta de reunião que não veio, responsável de ação que não veio… */
export function conferirPacote(p: PacoteRituais): string | null {
  const reun = new Set(p.reunioes.map((r) => r.id));
  const acoes = new Set(p.acoes.map((a) => a.id));
  if (p.pautas.some((x) => !reun.has(x.reuniao_id))) return "há pauta de Checkpoint que não está no pacote";
  if (p.acoes.some((a) => a.reuniao_id != null && !reun.has(a.reuniao_id))) return "há pendência de Checkpoint que não está no pacote";
  if (p.responsaveis.some((r) => !acoes.has(r.acao_id))) return "há responsável de pendência que não está no pacote";
  if (p.historico.some((h) => !acoes.has(h.acao_id))) return "há histórico de pendência que não está no pacote";
  if (new Set(p.reunioes.map((r) => r.data)).size !== p.reunioes.length) return "dois Checkpoints na mesma data (é um por cliente por data)";
  return null;
}
