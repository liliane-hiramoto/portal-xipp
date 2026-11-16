// Motor do cronograma de fechamento (0156) — CANÔNICO para todos os portais.
//
// Junta duas peças que existiam separadas:
//   • a do Fechamento Contábil do Affix (fc-affix-web, src/lib/uteis/diasUteis.ts):
//     "Nº dia útil", "2º dia útil após o dia 15", "última sexta do mês", e a
//     regra de que a competência M é cobrada no mês M+1;
//   • a do Portal Headset (src/lib/dias-uteis.ts): dia FIXO que antecipa ou
//     posterga quando não há expediente bancário, e o sábado que conta como útil
//     no salário.
// E acrescenta o que o cronograma desenhado em 15/10/2026 pede: dias úteis ANTES
// da virada do mês (D-3 do timesheet) e o último dia útil (pró-labore, IRPJ).
//
// Puro e SEM imports, de propósito: o teste (supabase/testes/fechamento-prazo.mjs)
// roda em node puro, que não conhece o alias `@/`. Os feriados entram por
// PARÂMETRO — quem chama passa `feriadosNacionais()` de src/lib/intranet.ts.
//
// Datas são strings "AAAA-MM-DD" o tempo todo, e a conta é em UTC: `YYYY-MM-DD`
// é data de CALENDÁRIO (a lição de 18/09/2026 — o fuso comia um dia).

export type RegraPrazo =
  | "DU"            // n-ésimo dia útil do mês de referência
  | "DU_ANTES"      // n-ésimo dia útil ANTES da virada (1 = último útil da competência)
  | "ULTIMO_DU"     // último dia útil do mês de referência
  | "DIA_FIXO"      // dia d do mês de referência, com ajuste se não houver expediente
  | "DU_APOS_DIA"   // n dias úteis depois do dia d (o "2º dia útil após o dia 15" do Affix)
  | "ULTIMA_SEMANA" // último <dia da semana> do mês (a "última sexta" do Affix)
  // ROTINA (0223): várias datas no MÊS DE TRABALHO, não uma entrega do fechamento.
  | "DIARIA"        // todo dia útil
  | "SEMANAL"       // todo <dia da semana> (feriado antecipa)
  | "QUINZENAL";    // dia d (padrão 15) e o último dia útil

export type Ajuste = "ANTECIPA" | "POSTERGA" | "NENHUM";
/** Em que mês o prazo é contado: o seguinte à competência (o normal do
 *  fechamento) ou o próprio mês (pró-labore, cartão do mês). */
export type MesReferencia = "SEGUINTE" | "MESMO";

export interface Prazo {
  regra: RegraPrazo;
  n?: number | null;
  dia?: number | null;
  /** 1 = segunda … 5 = sexta. */
  diaSemana?: number | null;
  ajuste?: Ajuste | null;
  sabadoUtil?: boolean | null;
  mesReferencia?: MesReferencia | null;
}

const DIA = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
const ms = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`);
const ymdDe = (t: number) => new Date(t).toISOString().slice(0, 10);
const somaDias = (ymd: string, n: number) => ymdDe(ms(ymd) + n * DIA);
const ultimoDiaDoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

/** "AAAA-MM" → ano e mês (1–12) do mês seguinte. */
export function mesSeguinte(competencia: string): { ano: number; mes: number } {
  const [y, m] = competencia.split("-").map(Number);
  return m === 12 ? { ano: y + 1, mes: 1 } : { ano: y, mes: m + 1 };
}

export function ehUtil(ymd: string, feriados: Set<string>, sabadoUtil = false): boolean {
  const dow = new Date(ms(ymd)).getUTCDay(); // 0 dom … 6 sáb
  if (dow === 0) return false;
  if (dow === 6 && !sabadoUtil) return false;
  return !feriados.has(ymd);
}

/** n-ésimo dia útil do mês (n ≥ 1). Mês sem n dias úteis devolve o último. */
function nesimoUtil(ano: number, mes: number, n: number, f: Set<string>, sab: boolean): string {
  let achados = 0, ultimo = "";
  for (let d = 1; d <= ultimoDiaDoMes(ano, mes); d++) {
    const ymd = `${ano}-${pad(mes)}-${pad(d)}`;
    if (!ehUtil(ymd, f, sab)) continue;
    ultimo = ymd;
    if (++achados === Math.max(1, n)) return ymd;
  }
  return ultimo;
}

/** n-ésimo dia útil contando de trás para a frente (1 = último útil do mês). */
function nesimoUtilDoFim(ano: number, mes: number, n: number, f: Set<string>, sab: boolean): string {
  let achados = 0, primeiro = "";
  for (let d = ultimoDiaDoMes(ano, mes); d >= 1; d--) {
    const ymd = `${ano}-${pad(mes)}-${pad(d)}`;
    if (!ehUtil(ymd, f, sab)) continue;
    primeiro = ymd;
    if (++achados === Math.max(1, n)) return ymd;
  }
  return primeiro;
}

/** Regras de ROTINA: o pedido dela (04/11/2026) — "mensal = fechamento do mês
 *  anterior; diário/semanal/quinzenal = do mês atual". O mês atual é o de
 *  TRABALHO, o mesmo em que o fechamento da competência acontece (mês seguinte,
 *  pelo padrão de `mesReferencia`). */
export const REGRAS_ROTINA: ReadonlySet<RegraPrazo> = new Set(["DIARIA", "SEMANAL", "QUINZENAL"]);
export const ehRotina = (r: RegraPrazo) => REGRAS_ROTINA.has(r);

/** Dia útil mais próximo de `ymd` sem sair do mês: tenta o sentido pedido e,
 *  se ele cruzar a virada, o outro (sexta 1º feriado posterga em vez de cair
 *  no mês anterior). */
function utilNoMes(ymd: string, ajuste: Ajuste, f: Set<string>, sab: boolean): string {
  if (ajuste === "NENHUM" || ehUtil(ymd, f, sab)) return ymd;
  const mes = ymd.slice(0, 7);
  for (const passo of ajuste === "POSTERGA" ? [1, -1] : [-1, 1]) {
    let d = ymd;
    while (d.slice(0, 7) === mes && !ehUtil(d, f, sab)) d = somaDias(d, passo);
    if (d.slice(0, 7) === mes) return d;
  }
  return ymd;
}

/**
 * TODAS as datas de uma atividade na competência: uma só no fechamento
 * (`dataPrevista`), várias na rotina. Em ordem e sem repetir.
 */
export function datasPrevistas(competencia: string, p: Prazo, feriados: Set<string>): string[] {
  if (!ehRotina(p.regra)) return [dataPrevista(competencia, p, feriados)];
  const [cy, cm] = competencia.split("-").map(Number);
  const ref = p.mesReferencia === "MESMO" ? { ano: cy, mes: cm } : mesSeguinte(competencia);
  const sab = !!p.sabadoUtil;
  const dias = Array.from({ length: ultimoDiaDoMes(ref.ano, ref.mes) },
    (_, i) => `${ref.ano}-${pad(ref.mes)}-${pad(i + 1)}`);
  const ajuste = p.ajuste ?? "ANTECIPA";
  let datas: string[];
  switch (p.regra) {
    case "DIARIA":
      datas = dias.filter((d) => ehUtil(d, feriados, sab));
      break;
    case "SEMANAL": {
      const alvo = Math.min(6, Math.max(1, p.diaSemana ?? 5));
      datas = dias.filter((d) => new Date(ms(d)).getUTCDay() === alvo).map((d) => utilNoMes(d, ajuste, feriados, sab));
      break;
    }
    default: { // QUINZENAL
      const dia = Math.min(Math.max(1, p.dia ?? 15), ultimoDiaDoMes(ref.ano, ref.mes));
      datas = [
        utilNoMes(`${ref.ano}-${pad(ref.mes)}-${pad(dia)}`, ajuste, feriados, sab),
        nesimoUtilDoFim(ref.ano, ref.mes, 1, feriados, sab),
      ];
    }
  }
  return [...new Set(datas)].sort();
}

/**
 * Data prevista de uma atividade para a competência "AAAA-MM".
 * `feriados` = conjunto "AAAA-MM-DD" que cubra o ano da competência E o seguinte
 * (dezembro é cobrado em janeiro).
 */
export function dataPrevista(competencia: string, p: Prazo, feriados: Set<string>): string {
  const [cy, cm] = competencia.split("-").map(Number);
  const ref = p.mesReferencia === "MESMO" ? { ano: cy, mes: cm } : mesSeguinte(competencia);
  const sab = !!p.sabadoUtil;
  const n = Math.max(1, p.n ?? 1);

  switch (p.regra) {
    case "DU":
      return nesimoUtil(ref.ano, ref.mes, n, feriados, sab);

    case "DU_ANTES":
      // Sempre relativo à virada da COMPETÊNCIA: D-1 é o último útil do próprio mês.
      return nesimoUtilDoFim(cy, cm, n, feriados, sab);

    case "ULTIMO_DU":
      return nesimoUtilDoFim(ref.ano, ref.mes, 1, feriados, sab);

    case "DIA_FIXO": {
      const dia = Math.min(Math.max(1, p.dia ?? 1), ultimoDiaDoMes(ref.ano, ref.mes));
      let ymd = `${ref.ano}-${pad(ref.mes)}-${pad(dia)}`;
      const ajuste = p.ajuste ?? "ANTECIPA";
      if (ajuste === "NENHUM") return ymd;
      const passo = ajuste === "ANTECIPA" ? -1 : 1;
      while (!ehUtil(ymd, feriados, sab)) ymd = somaDias(ymd, passo);
      return ymd;
    }

    case "DU_APOS_DIA": {
      // Igual ao Affix: o dia-base não conta; conta-se n úteis DEPOIS dele.
      const dia = Math.min(Math.max(1, p.dia ?? 15), ultimoDiaDoMes(ref.ano, ref.mes));
      let ymd = `${ref.ano}-${pad(ref.mes)}-${pad(dia)}`;
      let achados = 0;
      while (achados < n) {
        ymd = somaDias(ymd, 1);
        if (ehUtil(ymd, feriados, sab)) achados++;
      }
      return ymd;
    }

    case "ULTIMA_SEMANA": {
      const alvo = Math.min(6, Math.max(1, p.diaSemana ?? 5));
      let ymd = `${ref.ano}-${pad(ref.mes)}-${pad(ultimoDiaDoMes(ref.ano, ref.mes))}`;
      while (new Date(ms(ymd)).getUTCDay() !== alvo) ymd = somaDias(ymd, -1);
      // A última sexta pode ser feriado (25/12/2026): vale o útil anterior, como
      // no dia fixo que antecipa. Sem isso o cronograma marcava entrega no Natal.
      while (!ehUtil(ymd, feriados, sab)) ymd = somaDias(ymd, -1);
      return ymd;
    }

    // Rotina: a PRIMEIRA data do mês (o exemplo da tela). Todas: datasPrevistas().
    case "DIARIA":
    case "SEMANAL":
    case "QUINZENAL":
      return datasPrevistas(competencia, p, feriados)[0];
  }
}

/** O dia útil seguinte a `ymd` (o "amanhã" do aviso da véspera — na sexta, é a segunda). */
export function proximoDiaUtil(ymd: string, feriados: Set<string>): string {
  let d = somaDias(ymd, 1);
  while (!ehUtil(d, feriados)) d = somaDias(d, 1);
  return d;
}

/**
 * Rótulo do dia no ritmo do fechamento: "D+5" = 5º dia útil do mês seguinte à
 * competência; "D-1" = último dia útil da própria competência. Data mais longe
 * (obrigação trimestral, anual) fica sem rótulo — a tela mostra só a data.
 * Dia sem expediente leva o número do último útil antes dele.
 */
export function rotuloDia(ymd: string, competencia: string, feriados: Set<string>): string | null {
  const [cy, cm] = competencia.split("-").map(Number);
  const seg = mesSeguinte(competencia);
  const [y, m, d] = ymd.split("-").map(Number);
  if (y === seg.ano && m === seg.mes) {
    let n = 0;
    for (let i = 1; i <= d; i++) if (ehUtil(`${y}-${pad(m)}-${pad(i)}`, feriados)) n++;
    return `D+${Math.max(n, 1)}`;
  }
  if (y === cy && m === cm) {
    let n = 0;
    for (let i = ultimoDiaDoMes(y, m); i >= d; i--) if (ehUtil(`${y}-${pad(m)}-${pad(i)}`, feriados)) n++;
    return `D-${Math.max(n, 1)}`;
  }
  return null;
}

/** A atividade vale nesta competência? `meses` vazio/nulo = todo mês. */
export function valeNaCompetencia(meses: number[] | null | undefined, competencia: string): boolean {
  if (!meses || meses.length === 0) return true;
  return meses.includes(Number(competencia.slice(5, 7)));
}

// ---------- status (o desenho do Affix, statuses.json) ----------

/** O que alguém GRAVA. "Em andamento" não existe: é derivado. */
export type Situacao = "PENDENTE" | "ENTREGUE" | "PARCIAL" | "NAO_SE_APLICA";

/** O que a tela MOSTRA — derivado da situação, das datas e de hoje. */
export type Status =
  | "NO_PRAZO" | "ENTREGUE_COM_ATRASO" | "PARCIAL" | "NAO_SE_APLICA"
  | "VENCE_HOJE" | "ATRASADO" | "A_VENCER";

export function statusDe(
  o: { situacao: Situacao; data_prevista: string; data_entrega: string | null },
  hoje: string,
): Status {
  if (o.situacao === "NAO_SE_APLICA") return "NAO_SE_APLICA";
  if (o.situacao === "ENTREGUE") {
    return o.data_entrega && o.data_entrega > o.data_prevista ? "ENTREGUE_COM_ATRASO" : "NO_PRAZO";
  }
  if (o.situacao === "PARCIAL") return "PARCIAL";
  if (hoje === o.data_prevista) return "VENCE_HOJE";
  return hoje > o.data_prevista ? "ATRASADO" : "A_VENCER";
}

/** Só estes dois pedem ação — o resto é informação (regra do Affix). */
export const STATUS_ALERTA: ReadonlySet<Status> = new Set(["VENCE_HOJE", "ATRASADO"]);

/** Descrição curta do prazo, para a tela ("5º DU", "dia 20, antecipa"…). */
export function descreverPrazo(p: Prazo): string {
  const mes = p.mesReferencia === "MESMO" ? " (mesmo mês)" : "";
  const n = p.n ?? 1;
  switch (p.regra) {
    case "DU": return `${n}º dia útil${mes}`;
    case "DU_ANTES": return n === 1 ? "último dia útil da competência" : `${n}º dia útil antes da virada`;
    case "ULTIMO_DU": return `último dia útil${mes}`;
    case "DIA_FIXO": {
      const aj = p.ajuste === "POSTERGA" ? ", posterga" : p.ajuste === "NENHUM" ? "" : ", antecipa";
      return `dia ${pad(p.dia ?? 1)}${aj}${mes}`;
    }
    case "DU_APOS_DIA": return `${n}º dia útil após o dia ${p.dia ?? 15}${mes}`;
    case "ULTIMA_SEMANA": {
      const nomes = ["", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
      return `último(a) ${nomes.at(p.diaSemana ?? 5) ?? "sexta"} do mês${mes}`;
    }
    case "DIARIA": return `rotina: todo dia útil${mes}`;
    case "SEMANAL": {
      const nomes = ["", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
      return `rotina: toda ${nomes.at(p.diaSemana ?? 5) ?? "sexta"}${mes}`;
    }
    case "QUINZENAL": return `rotina: dia ${pad(p.dia ?? 15)} e último dia útil${mes}`;
  }
}
