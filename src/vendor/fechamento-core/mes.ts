// O MÊS do cronograma: gerar as linhas e montar o que a tela mostra.
//
// Uma conta só para o portal (que grava) e para a Flórida (que copia e mostra
// o consolidado). Era o `gerarMes` (actions.ts) e o `montarPayload` (portal.ts)
// do Portal Flórida, agora puros: o banco fica com quem chama.
//
// Puro: feriados entram por parâmetro (feriadosDe), "hoje" também.

import { datasPrevistas, ehRotina, rotuloDia, statusDe, valeNaCompetencia, type Situacao, type Status } from "./prazo";
import type { AtividadeExport, ComentarioExport, OcorrenciaExport } from "./contrato";
import type { Periodicidade } from "./tipos";
import { ETAPA_NOME, etapasDaLinha, type EtapaChave, type EtapaOcorrencia, type SituacaoEtapa } from "./etapas";

/** Feriados nacionais do ano (os móveis pela Páscoa). Igual ao de src/lib/intranet.ts da Flórida. */
export function feriadosNacionais(ano: number): { data: string; nome: string }[] {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mesP = Math.floor((h + l - 7 * m + 114) / 31), diaP = ((h + l - 7 * m + 114) % 31) + 1;
  const pascoa = Date.UTC(ano, mesP - 1, diaP);
  const desloc = (dias: number) => new Date(pascoa + dias * 86400000).toISOString().slice(0, 10);
  const fixo = (mm: number, dd: number) => `${ano}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  return [
    { data: fixo(1, 1), nome: "Confraternização Universal" },
    { data: desloc(-48), nome: "Carnaval (ponto facultativo)" },
    { data: desloc(-47), nome: "Carnaval (ponto facultativo)" },
    { data: desloc(-2), nome: "Sexta-feira Santa" },
    { data: fixo(4, 21), nome: "Tiradentes" },
    { data: fixo(5, 1), nome: "Dia do Trabalho" },
    { data: desloc(60), nome: "Corpus Christi (ponto facultativo)" },
    { data: fixo(9, 7), nome: "Independência do Brasil" },
    { data: fixo(10, 12), nome: "Nossa Senhora Aparecida" },
    { data: fixo(11, 2), nome: "Finados" },
    { data: fixo(11, 15), nome: "Proclamação da República" },
    { data: fixo(11, 20), nome: "Dia da Consciência Negra" },
    { data: fixo(12, 25), nome: "Natal" },
  ].sort((x, y) => x.data.localeCompare(y.data));
}

/** O conjunto de datas de feriado dos anos pedidos. */
export const feriadosDe = (anos: number[]) => new Set(anos.flatMap((a) => feriadosNacionais(a).map((f) => f.data)));

/** Feriados que o mês de uma competência pode tocar (ano anterior, o dela e o seguinte). */
export const feriadosDaCompetencia = (competencia: string) => {
  const ano = Number(competencia.slice(0, 4));
  return feriadosDe([ano - 1, ano, ano + 1]);
};

export type LinhaNova = Omit<OcorrenciaExport, "id" | "atualizado_em" | "situacao" | "data_entrega" | "hora_inicio" | "hora_fim">;

/**
 * As linhas do mês para as atividades ATIVAS: fechamento = uma linha; rotina
 * (diária/semanal/quinzenal) = uma por data do mês de trabalho. Gravar com
 * "on conflict (atividade_id, competencia, data_prevista) do nothing": gerar
 * de novo só acrescenta.
 */
export function linhasDoMes(atividades: Omit<AtividadeExport, "atualizado_em">[], competencia: string): LinhaNova[] {
  const fer = feriadosDaCompetencia(competencia);
  return atividades
    .filter((a) => a.ativo && valeNaCompetencia(a.meses, competencia))
    .flatMap((a) => datasPrevistas(competencia, {
      regra: a.prazo_regra, n: a.prazo_n, dia: a.prazo_dia, diaSemana: a.prazo_dia_semana,
      ajuste: a.ajuste, sabadoUtil: a.sabado_util, mesReferencia: a.mes_referencia,
    }, fer).map((data) => ({
      atividade_id: a.id, empresa_cnpj: a.empresa_cnpj, competencia, ordem: a.ordem,
      atividade: a.atividade, area: a.area, tipo: a.tipo,
      periodicidade: (ehRotina(a.prazo_regra) ? a.prazo_regra : "MENSAL") as Periodicidade,
      responsavel_email: a.responsavel_email, depende_de: a.depende_de, data_prevista: data,
      // Pagamento com etapas: cada etapa ganha o seu responsável e a sua data (13/11/2026).
      ...(a.tipo === "PAGAMENTO" && a.pagamento ? { etapas: etapasDaLinha(a.pagamento, data, fer) } : {}),
    })));
}

// ── O que a tela mostra ──

export interface ItemDoMes {
  id: number;
  empresa: string;
  empresa_cnpj: string;
  competencia: string;
  data_prevista: string;
  rotulo: string | null;
  atividade: string;
  area: string;
  tipo: OcorrenciaExport["tipo"];
  periodicidade: Periodicidade;
  responsavel_email: string | null;
  responsavel: string | null;     // nome, quando se conhece o e-mail
  situacao: Situacao;
  status: Status;
  data_entrega: string | null;
  hora_inicio: string | null;
  hora_fim: string | null;
  /** Pagamento em etapas (etapas.ts): o estado de cada etapa; null = sem fluxo. */
  etapas: EtapaOcorrencia[] | null;
  comentarios: { tipo: "COMENTARIO" | "STATUS"; texto: string; autor: string; quando: string; origem: string }[];
}

export interface VisaoDoMes {
  competencia: string;
  hoje: string;
  itens: ItemDoMes[];
  /** Pendentes de competências ANTERIORES que já venceram — o atraso não some na virada. */
  atrasadosAnteriores: ItemDoMes[];
  resumo: { total: number; entregues: number; noPrazo: number; atrasados: number; venceHoje: number };
}

export function visaoDoMes(entrada: {
  competencia: string;
  hoje: string;
  /** As do mês E as pendentes de antes (a função separa). */
  ocorrencias: OcorrenciaExport[];
  comentarios: ComentarioExport[];
  /** Nome por CNPJ (só dígitos) — do Cadastro Geral de quem mostra. */
  empresas: Map<string, string>;
  /** Nome por e-mail (minúsculo). */
  pessoas: Map<string, string>;
}): VisaoDoMes {
  const { competencia, hoje } = entrada;
  const fer = feriadosDaCompetencia(competencia);
  const comDe = new Map<number, ItemDoMes["comentarios"]>();
  for (const c of [...entrada.comentarios].sort((a, b) => a.criado_em.localeCompare(b.criado_em))) {
    const l = comDe.get(c.ocorrencia_id) ?? [];
    l.push({ tipo: c.tipo, texto: c.texto, autor: c.autor_nome || c.autor_email || "—", quando: c.criado_em, origem: c.origem });
    comDe.set(c.ocorrencia_id, l);
  }
  const item = (o: OcorrenciaExport): ItemDoMes => ({
    id: o.id, empresa: entrada.empresas.get(o.empresa_cnpj) ?? o.empresa_cnpj, empresa_cnpj: o.empresa_cnpj,
    competencia: o.competencia, data_prevista: o.data_prevista,
    rotulo: rotuloDia(o.data_prevista, o.competencia, fer),
    atividade: o.atividade, area: o.area, tipo: o.tipo, periodicidade: o.periodicidade,
    responsavel_email: o.responsavel_email,
    responsavel: o.responsavel_email ? entrada.pessoas.get(o.responsavel_email.toLowerCase()) ?? o.responsavel_email : null,
    situacao: o.situacao, status: statusDe(o, hoje), data_entrega: o.data_entrega,
    hora_inicio: o.hora_inicio, hora_fim: o.hora_fim, etapas: o.etapas ?? null, comentarios: comDe.get(o.id) ?? [],
  });
  const ordem = (a: ItemDoMes, b: ItemDoMes) =>
    a.data_prevista.localeCompare(b.data_prevista) || a.empresa.localeCompare(b.empresa, "pt-BR") || a.atividade.localeCompare(b.atividade, "pt-BR");
  const itens = entrada.ocorrencias.filter((o) => o.competencia === competencia).map(item).sort(ordem);
  const atrasadosAnteriores = entrada.ocorrencias
    .filter((o) => o.competencia < competencia && o.situacao === "PENDENTE" && o.data_prevista < hoje)
    .map(item).sort(ordem);
  const entregues = itens.filter((i) => i.situacao === "ENTREGUE");
  return {
    competencia, hoje, itens, atrasadosAnteriores,
    resumo: {
      total: itens.length,
      entregues: entregues.length,
      noPrazo: entregues.filter((i) => i.status === "NO_PRAZO").length,
      atrasados: itens.filter((i) => i.status === "ATRASADO").length,
      venceHoje: itens.filter((i) => i.status === "VENCE_HOJE").length,
    },
  };
}

const SIT_TXT: Record<Situacao, string> = { PENDENTE: "Pendente", ENTREGUE: "Entregue", PARCIAL: "Parcial", NAO_SE_APLICA: "Não se aplica" };

/** A linha STATUS que cada mudança deixa nos comentários (a regra da 0230). */
export function textoDaMudanca(m:
  | { tipo: "situacao"; situacao: Situacao; data_entrega: string | null }
  | { tipo: "responsavel"; nome: string | null }
  | { tipo: "horario"; hora_inicio: string | null; hora_fim: string | null }
  | { tipo: "etapa"; chave: EtapaChave; situacao: SituacaoEtapa; obs?: string | null }): string {
  if (m.tipo === "etapa") {
    const txt: Record<SituacaoEtapa, string> = { PENDENTE: "pendente", FEITA: "concluída", DIVERGENTE: "DIVERGENTE", NAO_SE_APLICA: "não se aplica" };
    return `Etapa ${ETAPA_NOME[m.chave]}: ${txt[m.situacao]}${m.obs ? ` — ${m.obs}` : ""}`;
  }
  if (m.tipo === "situacao") {
    const [y, mm, d] = (m.data_entrega ?? "").split("-");
    return `Situação: ${SIT_TXT[m.situacao]}${m.data_entrega ? ` em ${d}/${mm}/${y}` : ""}`;
  }
  if (m.tipo === "responsavel") return m.nome ? `Responsável: ${m.nome}` : "Responsável: (ninguém)";
  return m.hora_inicio || m.hora_fim ? `Horário: ${m.hora_inicio ?? "?"}–${m.hora_fim ?? "?"}` : "Horário apagado";
}
