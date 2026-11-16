// Tipos e rótulos do módulo Fechamento (0156). Seguro para o navegador.

import type { Ajuste, MesReferencia, Prazo, RegraPrazo, Situacao, Status } from "./prazo";

export type TipoAtividade = "ATIVIDADE" | "PAGAMENTO" | "OBRIGACAO";

export interface Atividade {
  id: number;
  empresa_id: number;
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
  horas_previstas: number | null;
  responsavel_id: string | null;
  depende_de: number | null;
  link_modulo: string | null;
  ativo: boolean;
  /** 0225 — escopo padrão no Timesheet (ausente antes da migração). */
  ts_projeto_id?: string | null;
  ts_escopo_id?: string | null;
  /** 0233 — a atividade canônica de onde esta saiu (null = própria da empresa). */
  modelo_id?: number | null;
  /** 0226 — "<portal>:<id lá>" quando o responsável é de um portal de cliente. */
  responsavel_ext?: string | null;
}

export interface Ocorrencia {
  id: number;
  atividade_id: number | null;
  empresa_id: number;
  competencia: string;
  ordem: number;
  atividade: string;
  area: string;
  tipo: TipoAtividade;
  responsavel_id: string | null;
  horas_previstas: number | null;
  depende_de: number | null;
  data_prevista: string;
  situacao: Situacao;
  data_entrega: string | null;
  obs: string | null;
  periodicidade?: Periodicidade;
  /** 0224 — ausentes antes da migração. "HH:MM:SS" do Postgres. */
  hora_inicio?: string | null;
  hora_fim?: string | null;
  /** 0225 — escopo vendido na proposta (Timesheet) e o rascunho lançado lá. */
  ts_projeto_id?: string | null;
  ts_escopo_id?: string | null;
  ts_lancamento_id?: string | null;
  responsavel_ext?: string | null;
}

export interface EmpresaOpcao { id: number; nome: string; grupo: string; grupoId?: number | null }
export interface Responsavel { id: string; nome: string; email: string }

// 0226 — responsável do PORTAL DO CLIENTE. Na tela, a escolha é uma lista só:
// usuário da Flórida pelo id do auth.users; usuário de um portal de cliente
// pela chave "ext:<portal>:<id lá>". No banco, cada um vai na sua coluna.
export const chaveExt = (portal: string, id: string) => `ext:${portal}:${id}`;
/** A chave de quem responde pela linha (Flórida ou portal do cliente), ou null. */
export const chaveResponsavel = (o: { responsavel_id: string | null; responsavel_ext?: string | null }) =>
  o.responsavel_id ?? (o.responsavel_ext ? `ext:${o.responsavel_ext}` : null);
/** Da escolha da tela para as duas colunas do banco. */
export function colunasResponsavel(escolha: string | null | undefined): { responsavel_id: string | null; responsavel_ext: string | null } {
  if (!escolha) return { responsavel_id: null, responsavel_ext: null };
  return escolha.startsWith("ext:")
    ? { responsavel_id: null, responsavel_ext: escolha.slice(4) }
    : { responsavel_id: escolha, responsavel_ext: null };
}

/** A regra de prazo de uma atividade no formato do motor. */
export const prazoDe = (a: Pick<Atividade,
  "prazo_regra" | "prazo_n" | "prazo_dia" | "prazo_dia_semana" | "ajuste" | "sabado_util" | "mes_referencia">): Prazo => ({
  regra: a.prazo_regra, n: a.prazo_n, dia: a.prazo_dia, diaSemana: a.prazo_dia_semana,
  ajuste: a.ajuste, sabadoUtil: a.sabado_util, mesReferencia: a.mes_referencia,
});

export const TIPO_LABEL: Record<TipoAtividade, string> = {
  ATIVIDADE: "Atividade", PAGAMENTO: "Pagamento", OBRIGACAO: "Obrigação",
};

export const REGRA_LABEL: Record<RegraPrazo, string> = {
  DU: "Nº dia útil",
  DU_ANTES: "Dias úteis antes da virada",
  ULTIMO_DU: "Último dia útil",
  DIA_FIXO: "Dia fixo do mês",
  DU_APOS_DIA: "Dias úteis após um dia",
  ULTIMA_SEMANA: "Último dia da semana do mês",
  DIARIA: "Rotina — todo dia útil",
  SEMANAL: "Rotina — toda semana",
  QUINZENAL: "Rotina — quinzenal (dia X e último útil)",
};

/** Foto da regra na linha do mês (0223). Linha antiga, sem a coluna, é MENSAL. */
export type Periodicidade = "MENSAL" | "DIARIA" | "SEMANAL" | "QUINZENAL";
export const PERIODICIDADE_LABEL: Record<Periodicidade, string> = {
  MENSAL: "Fechamento", DIARIA: "Diária", SEMANAL: "Semanal", QUINZENAL: "Quinzenal",
};
/** A etiqueta de cada tipo, uma cor para cada (pedido dela, 04/11/2026). */
export const PERIODICIDADE_COR: Record<Periodicidade, string> = {
  MENSAL: "bg-sky-100 text-sky-800",
  DIARIA: "bg-emerald-100 text-emerald-800",
  SEMANAL: "bg-violet-100 text-violet-800",
  QUINZENAL: "bg-amber-100 text-amber-800",
};

export const STATUS_LABEL: Record<Status, string> = {
  NO_PRAZO: "No prazo",
  ENTREGUE_COM_ATRASO: "Entregue com atraso",
  PARCIAL: "Parcial",
  NAO_SE_APLICA: "Não se aplica",
  VENCE_HOJE: "Vence hoje",
  ATRASADO: "Atrasado",
  A_VENCER: "A vencer",
};

/** Mesmas cores do Affix (statuses.json), em classes do Tailwind escritas por
 *  extenso — classe montada por interpolação não é gerada. */
export const STATUS_COR: Record<Status, string> = {
  NO_PRAZO: "bg-emerald-100 text-emerald-800",
  ENTREGUE_COM_ATRASO: "bg-sky-100 text-sky-800",
  PARCIAL: "bg-amber-100 text-amber-800",
  NAO_SE_APLICA: "bg-slate-100 text-slate-500",
  VENCE_HOJE: "bg-violet-100 text-violet-800",
  ATRASADO: "bg-red-100 text-red-800",
  A_VENCER: "bg-slate-100 text-slate-700",
};

/** Ponto de partida do campo Área (texto livre com sugestões). */
export const AREAS_SUGERIDAS = [
  "Contabilidade", "Fiscal", "Financeiro", "Tesouraria", "DP", "RH", "Controladoria",
  "Faturamento", "Operação", "Diretoria", "Repasse", "Comissionamento", "Clientes",
];

export const MESES_NOME = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "AAAA-MM" do mês anterior — a competência que está sendo fechada. */
export function competenciaAnterior(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** 0230 — um comentário de item do mês: da Flórida ou de um portal de cliente (`origem`). */
export interface Comentario {
  ocorrencia_id: number; tipo: "COMENTARIO" | "STATUS"; texto: string;
  autor: string | null; origem: string; criado_em: string;
}

/** 0233 — uma atividade CANÔNICA: o modelo único, aplicável a qualquer empresa. */
export interface AtividadeModelo {
  id: number; ordem: number; atividade: string; descricao: string | null; area: string; tipo: TipoAtividade;
  prazo_regra: Atividade["prazo_regra"]; prazo_n: number | null; prazo_dia: number | null; prazo_dia_semana: number | null;
  ajuste: Atividade["ajuste"]; sabado_util: boolean; mes_referencia: Atividade["mes_referencia"]; meses: number[] | null;
  horas_previstas: number | null; link_modulo: string | null; ativo: boolean;
}

/** Os campos que a canônica DITA (os outros — responsável, ordem, dependência, escopo — são de cada empresa). */
export const CAMPOS_DA_CANONICA = [
  "atividade", "descricao", "area", "tipo", "prazo_regra", "prazo_n", "prazo_dia", "prazo_dia_semana",
  "ajuste", "sabado_util", "mes_referencia", "meses", "horas_previstas", "link_modulo",
] as const;
