// Contrato entre o PORTAL de cada cliente e o Portal Flórida (versão 2).
//
// Decisão dela (09/11/2026): o cronograma é GRAVADO no banco de cada portal;
// a Flórida guarda só a CÓPIA, puxada a cada 15 minutos. A equipe Flórida grava
// nos dois lugares — pela tela do portal (tem login lá) ou pela tela da Flórida,
// que chama a API do portal com a chave DAQUELE portal. A Flórida nunca recebe a
// chave mestra (service role) do banco de ninguém.
//
//   GET  <portal>/api/fechamento-core/exportar?desde=<ISO>   → Exportacao
//   POST <portal>/api/fechamento-core/acao   { Acao }        → RespostaAcao
//   Authorization: Bearer <chave do portal>
//
// ⚠️ CONTRATO entre repositórios. Campo novo pode entrar; campo existente não
// muda de nome nem de sentido sem subir VERSAO_CONTRATO e ajustar os dois lados.
//
// Puro e sem imports de runtime (só tipos): roda no navegador, no servidor e no
// teste em node puro.

import type { Ajuste, MesReferencia, RegraPrazo, Situacao } from "./prazo";
import type { Periodicidade, TipoAtividade } from "./tipos";
import type { DocTipo, EtapaChave, EtapaOcorrencia, PagamentoDef, SituacaoEtapa } from "./etapas";
import { validarPagamento } from "./etapas";

export const VERSAO_CONTRATO = 2;

/** Quem fez — sempre por e-mail: a equipe Flórida também tem login nos portais. */
export interface Autor { email: string; nome: string | null; origem: "portal" | "florida" }

/** A empresa é a do Cadastro Geral DO PORTAL; a Flórida casa pelo CNPJ (0232). */
export interface EmpresaExport { cnpj: string; nome: string }

export interface AtividadeExport {
  id: number;
  empresa_cnpj: string;
  ordem: number;
  atividade: string;
  descricao: string | null;
  area: string;
  tipo: TipoAtividade;
  prazo_regra: RegraPrazo;
  prazo_n: number | null;
  prazo_dia: number | null;
  prazo_dia_semana: number | null;
  ajuste: Ajuste;
  sabado_util: boolean;
  mes_referencia: MesReferencia;
  meses: number[] | null;
  responsavel_email: string | null;
  depende_de: number | null;
  /** Id da atividade CANÔNICA da Flórida (0233) de onde esta saiu; null = própria da empresa. */
  modelo_id: number | null;
  /** Tipo PAGAMENTO: as etapas (responsável e prazo de cada uma) e os
   *  documentos exigidos (etapas.ts, 13/11/2026). Ausente/null = sem fluxo. */
  pagamento?: PagamentoDef | null;
  ativo: boolean;
  atualizado_em: string;
}

export interface OcorrenciaExport {
  id: number;
  atividade_id: number | null;
  empresa_cnpj: string;
  competencia: string;          // AAAA-MM
  ordem: number;
  atividade: string;
  area: string;
  tipo: TipoAtividade;
  periodicidade: Periodicidade;
  responsavel_email: string | null;
  depende_de: number | null;
  data_prevista: string;        // AAAA-MM-DD
  situacao: Situacao;
  data_entrega: string | null;
  hora_inicio: string | null;   // HH:MM
  hora_fim: string | null;
  /** O estado de cada etapa no mês (copiado do cadastro ao gerar). */
  etapas?: EtapaOcorrencia[] | null;
  atualizado_em: string;
}

export interface ComentarioExport {
  id: number;
  ocorrencia_id: number;
  tipo: "COMENTARIO" | "STATUS";
  texto: string;
  autor_email: string | null;
  autor_nome: string | null;
  origem: "portal" | "florida";
  criado_em: string;
}

/** Linha apagada no portal desde o cursor (gatilho de "lápide"). */
export interface Apagado { tabela: "atividades" | "ocorrencias" | "comentarios"; id: number; apagado_em: string }

export interface Exportacao {
  versao: number;
  portal: { id: string; nome: string };
  /** Até onde esta exportação vai; a próxima pede `desde` = este valor. */
  cursor: string;
  /** true = `desde` veio vazio e isto é TUDO (a cópia troca inteira). */
  completa: boolean;
  atividades: AtividadeExport[];
  ocorrencias: OcorrenciaExport[];
  comentarios: ComentarioExport[];
  apagados: Apagado[];
  /** Sempre inteiros (são poucos): quem pode ser responsável e as empresas do cadastro. */
  usuarios: { email: string; nome: string }[];
  empresas: EmpresaExport[];
}

// ── Gravar pela Flórida (ou pela própria tela do portal: a MESMA função) ──

export type Acao =
  | { tipo: "situacao"; id: number; situacao: Situacao; data_entrega?: string | null; autor: Autor }
  | { tipo: "responsavel"; id: number; email: string | null; autor: Autor }
  | { tipo: "comentar"; id: number; texto: string; autor: Autor }
  | { tipo: "horario"; id: number; hora_inicio: string | null; hora_fim: string | null; autor: Autor }
  | { tipo: "gerar_mes"; competencia: string; autor: Autor }
  | { tipo: "salvar_atividade"; atividade: Omit<AtividadeExport, "id" | "atualizado_em"> & { id?: number }; autor: Autor }
  | { tipo: "excluir_atividade"; id: number; com_historico: boolean; autor: Autor }
  | { tipo: "etapa"; id: number; chave: EtapaChave; situacao: SituacaoEtapa; obs?: string | null;
      docs_recebidos?: DocTipo[]; valor_documento?: number | null; valor_previsto?: number | null;
      remessa_em?: string | null; retorno_em?: string | null; autor: Autor };

export interface RespostaAcao { ok: boolean; erro?: string; /** ids tocados, para a Flórida recopiar já. */ ids?: number[] }

const SITUACOES = ["PENDENTE", "ENTREGUE", "PARCIAL", "NAO_SE_APLICA"];
const ymd = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const hhmm = (s: unknown) => s === null || (typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(s));
const email = (s: unknown) => typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/** Confere a ação ANTES de gravar. Devolve o erro em português, ou null. */
export function validarAcao(a: unknown): string | null {
  if (!a || typeof a !== "object") return "envie um objeto { tipo, …, autor }";
  const x = a as Record<string, unknown>;
  const autor = x.autor as Record<string, unknown> | undefined;
  if (!autor || !email(autor.email) || !["portal", "florida"].includes(autor.origem as string)) {
    return "autor inválido: { email, nome, origem: portal|florida }";
  }
  const comId = () => (Number.isInteger(x.id) && (x.id as number) > 0 ? null : "id inválido");
  switch (x.tipo) {
    case "situacao":
      if (!SITUACOES.includes(x.situacao as string)) return "situação inválida";
      if (x.data_entrega != null && !ymd(x.data_entrega)) return "data_entrega deve ser AAAA-MM-DD";
      return comId();
    case "responsavel":
      if (x.email !== null && !email(x.email)) return "responsável deve ser um e-mail ou null";
      return comId();
    case "comentar":
      if (typeof x.texto !== "string" || !x.texto.trim()) return "comentário vazio";
      if (x.texto.length > 4000) return "comentário com mais de 4000 caracteres";
      return comId();
    case "horario":
      if (!hhmm(x.hora_inicio) || !hhmm(x.hora_fim)) return "horário deve ser HH:MM";
      if (x.hora_inicio && x.hora_fim && String(x.hora_fim) <= String(x.hora_inicio)) return "o fim tem de ser depois do início";
      return comId();
    case "gerar_mes":
      return typeof x.competencia === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(x.competencia) ? null : "competência deve ser AAAA-MM";
    case "salvar_atividade": {
      const at = x.atividade as Record<string, unknown> | undefined;
      if (!at || typeof at.atividade !== "string" || !at.atividade.trim()) return "atividade sem nome";
      if (typeof at.empresa_cnpj !== "string" || at.empresa_cnpj.replace(/\D/g, "").length !== 14) return "empresa_cnpj inválido";
      if (at.pagamento != null && at.tipo !== "PAGAMENTO") return "etapas de pagamento só em atividade do tipo PAGAMENTO";
      return validarPagamento(at.pagamento);
    }
    case "excluir_atividade":
      return typeof x.com_historico === "boolean" ? comId() : "com_historico deve ser true|false";
    case "etapa": {
      if (!["RECEBER", "CONFERIR", "PAGAR", "CAIXA"].includes(x.chave as string)) return "etapa inválida";
      if (!["PENDENTE", "FEITA", "DIVERGENTE", "NAO_SE_APLICA"].includes(x.situacao as string)) return "situação da etapa inválida";
      if (x.obs != null && (typeof x.obs !== "string" || x.obs.length > 2000)) return "observação com mais de 2000 caracteres";
      const valor = (v: unknown) => v == null || (typeof v === "number" && Number.isFinite(v) && v >= 0);
      if (!valor(x.valor_documento) || !valor(x.valor_previsto)) return "valor deve ser um número ≥ 0";
      if (x.docs_recebidos !== undefined && (!Array.isArray(x.docs_recebidos) || x.docs_recebidos.some((d) => !["GUIA", "APURACAO", "BOLETO", "FATURA", "OUTRO"].includes(d)))) return "documento recebido inválido";
      if ((x.remessa_em != null && !ymd(x.remessa_em)) || (x.retorno_em != null && !ymd(x.retorno_em))) return "datas de remessa/retorno devem ser AAAA-MM-DD";
      return comId();
    }
    default:
      return "tipo desconhecido";
  }
}

/** A regra da tela, uma só nos dois lados: entregue/parcial sem data ganha HOJE; pendente apaga a data. */
export function dataDaEntrega(situacao: Situacao, informada: string | null | undefined, hoje: string): string | null {
  if (situacao === "PENDENTE" || situacao === "NAO_SE_APLICA") return null;
  return informada ?? hoje;
}

/** Só dígitos — o CNPJ com ou sem máscara casa igual. */
export const soDigitos = (cnpj: string | null | undefined) => (cnpj ?? "").replace(/\D/g, "");

/**
 * Folga do cursor. O `atualizado_em` é o instante em que a transação COMEÇOU:
 * uma gravação que começa antes da exportação e termina depois chega com hora
 * anterior ao cursor. O portal exporta a partir de `cursor - folga`; a linha
 * repetida é inofensiva (a cópia regrava pelo id), a perdida não seria.
 */
export const FOLGA_CURSOR_MIN = 5;
export function desdeComFolga(cursor: string | null | undefined): string | null {
  if (!cursor || Number.isNaN(Date.parse(cursor))) return null;
  return new Date(Date.parse(cursor) - FOLGA_CURSOR_MIN * 60000).toISOString();
}

// ── Trazer o histórico da Flórida (uma vez só, por portal) ──
//
//   POST <portal>/api/fechamento-core/importar  { PacoteImportacao } → RespostaImportacao
//
// Leva atividades, meses e comentários com os MESMOS ids que têm na Flórida:
// assim o que fica só na Flórida (horas previstas, observação, Timesheet),
// preso ao id, continua apontando para a linha certa. O portal só aceita com as
// tabelas VAZIAS — não é sincronização, é a mudança de casa.

export interface PacoteImportacao {
  versao: number;
  atividades: Omit<AtividadeExport, "atualizado_em">[];
  ocorrencias: Omit<OcorrenciaExport, "atualizado_em">[];
  comentarios: ComentarioExport[];
}

export interface Contagem { atividades: number; ocorrencias: number; comentarios: number }
export interface RespostaImportacao { ok: boolean; erro?: string; enviado?: Contagem; gravado?: Contagem }

/** A conferência por contagem que ela pediu: o que foi tem de ser o que chegou. */
export function conferirContagem(enviado: Contagem, gravado: Contagem): string | null {
  const dif = (["atividades", "ocorrencias", "comentarios"] as const).filter((k) => enviado[k] !== gravado[k]);
  return dif.length ? `contagem não bate em ${dif.map((k) => `${k} (${enviado[k]} enviados, ${gravado[k]} gravados)`).join(", ")}` : null;
}
