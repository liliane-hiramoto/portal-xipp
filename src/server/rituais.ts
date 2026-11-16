import "server-only";
import {
  VERSAO_RITUAIS, validarAcaoRitual, mudancaDeSituacao, nascimentoDaDecisao, mudancasDaPendencia,
  situacaoPendencia, conferirPacote, conferirContagemRituais, contarPacote, SITUACAO_PENDENCIA_LABEL,
  type AcaoRitual, type AcaoRitualExport, type ApagadoRitual, type CamposPendencia, type ContagemRituais,
  type ExportacaoRituais, type HistoricoExport, type PacoteRituais, type PautaExport, type ReuniaoExport,
  type RespostaImportacaoRituais, type ResponsavelExport, type ResponsavelNovo, type SituacaoPendencia,
} from "@/vendor/fechamento-core/rituais";
import { desdeComFolga, soDigitos, type RespostaAcao } from "@/vendor/fechamento-core/contrato";
import { PORTAL, admin, todas, type Pessoa } from "@/server/fechamento";

// Rituais de Gestão GRAVADOS NESTE PORTAL (fase 3 da decisão dela de 09/11/2026):
// o Checkpoint deste cliente e as pendências/decisões dele moram neste banco
// (tabelas da fase 2); o Portal Flórida guarda a cópia — puxa `exportarRituais()`
// a cada 15 minutos e grava por `aplicarAcaoRitual()`, a MESMA função que a
// tela daqui usa.
//
// SERVER-ONLY: usa a service role. Quem chama confere antes quem pode:
//   • a tela, pelo login e pela régua do módulo "rituais";
//   • a Flórida, pela chave FLORIDA_FECHAMENTO_TOKEN (chaveDaFloridaConfere).
//
// ⚠️ Arquivo IGUAL nos portais RQ, WR, Inexx e 3Clicks (o que muda — o nome do
// portal — vem de @/server/fechamento). A regra mora no pacote fechamento-core
// (src/vendor/fechamento-core/rituais.ts); aqui só o banco.

// O dia de um instante, em São Paulo (o timestamptz volta em UTC: 21h já seria amanhã).
const diaSP = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
const hhmm = (t: unknown) => (typeof t === "string" ? t.slice(0, 5) : null);
const reuniaoDe = (r: Record<string, unknown>): ReuniaoExport => ({
  ...(r as unknown as ReuniaoExport), hora_inicio: hhmm(r.hora_inicio), hora_fim: hhmm(r.hora_fim),
});

/**
 * Este portal já grava os Rituais aqui? Vale depois que a Flórida trouxe o
 * histórico — mesmo vazio: a importação deixa a lápide 0 ("reunioes", id 0)
 * como marco da mudança, e a cópia de lá a ignora (não há id 0).
 */
export async function temRituaisLocal(): Promise<boolean> {
  try {
    const sb = admin();
    const conta = async (t: string) => (await sb.from(t).select("id", { count: "exact", head: true })).count ?? 0;
    if ((await conta("rituais_acoes")) > 0 || (await conta("rituais_reunioes")) > 0) return true;
    const { data } = await sb.from("rituais_apagados").select("id").eq("tabela", "reunioes").eq("id", 0).maybeSingle();
    return !!data;
  } catch {
    return false; // sem as tabelas ou sem a chave: segue a ponte antiga
  }
}

// ── Gravar: da tela daqui ou da Flórida ──

const SIT = Object.keys(SITUACAO_PENDENCIA_LABEL) as SituacaoPendencia[];

async function responsaveisDe(acaoId: number): Promise<ResponsavelNovo[]> {
  const { data } = await admin().from("rituais_acao_responsaveis").select("email, nome_livre").eq("acao_id", acaoId).order("ordem");
  return (data ?? []).map((r) => ({ email: (r.email as string | null) ?? null, nome_livre: (r.nome_livre as string | null) ?? null }));
}

/** Grava uma ação — da tela daqui ou da Flórida. Mudança em pendência deixa a linha STATUS no histórico. */
export async function aplicarAcaoRitual(a: AcaoRitual, hoje: string, pessoas: Pessoa[]): Promise<RespostaAcao> {
  const erro = validarAcaoRitual(a);
  if (erro) return { ok: false, erro };
  const sb = admin();
  const nome = (email: string) => pessoas.find((p) => p.email.toLowerCase() === email.toLowerCase())?.nome ?? email;
  const historico = (acao_id: number, tipo: "COMENTARIO" | "STATUS", texto: string) => sb.from("rituais_acao_historico").insert({
    acao_id, tipo, texto, autor_email: a.autor.email.toLowerCase(), autor_nome: a.autor.nome, origem: a.autor.origem,
  });
  const aberta = async (id: number) => {
    const { data } = await sb.from("rituais_reunioes").select("status").eq("id", id).maybeSingle();
    return !data ? "Checkpoint não encontrado" : data.status !== "ABERTA" ? "Checkpoint encerrado: só leitura" : null;
  };
  const cnpjs = (l: string[]) => [...new Set(l.map(soDigitos))];

  switch (a.tipo) {
    case "abrir_checkpoint": {
      const { data, error } = await sb.from("rituais_reunioes").insert({ data: a.data, empresa_cnpjs: cnpjs(a.empresa_cnpjs) }).select("id").single();
      if (error) return { ok: false, erro: error.code === "23505" ? "já existe um Checkpoint nesta data" : error.message };
      if (a.pautas.length) {
        const { error: e2 } = await sb.from("rituais_pautas").insert(a.pautas.map((p, i) => ({
          reuniao_id: data.id, titulo: p.titulo.trim(), area: p.area ?? "", minutos: p.minutos, ordem: i + 1, fonte: p.fonte || "livre",
        })));
        if (e2) { await sb.from("rituais_reunioes").delete().eq("id", data.id); return { ok: false, erro: e2.message }; }
      }
      return { ok: true, ids: [data.id as number] };
    }
    case "detalhes_checkpoint": {
      const { data, error } = await sb.from("rituais_reunioes").update({
        data: a.data, local: a.local?.trim() || null, hora_inicio: a.hora_inicio, hora_fim: a.hora_fim, empresa_cnpjs: cnpjs(a.empresa_cnpjs),
      }).eq("id", a.id).select("id");
      if (error) return { ok: false, erro: error.code === "23505" ? "já existe um Checkpoint nesta data" : error.message };
      return data?.length ? { ok: true, ids: [a.id] } : { ok: false, erro: "Checkpoint não encontrado" };
    }
    case "situacao_checkpoint": {
      const { data, error } = await sb.from("rituais_reunioes").update({
        situacao: a.situacao, motivo_cancelamento: a.situacao === "CANCELADA" ? a.motivo?.trim() ?? null : null,
      }).eq("id", a.id).select("id");
      if (error) return { ok: false, erro: error.message };
      return data?.length ? { ok: true, ids: [a.id] } : { ok: false, erro: "Checkpoint não encontrado" };
    }
    case "encerrar_checkpoint": {
      const { data, error } = await sb.from("rituais_reunioes").update({
        status: a.encerrar ? "ENCERRADA" : "ABERTA", encerrada_em: a.encerrar ? new Date().toISOString() : null,
      }).eq("id", a.id).select("id");
      if (error) return { ok: false, erro: error.message };
      return data?.length ? { ok: true, ids: [a.id] } : { ok: false, erro: "Checkpoint não encontrado" };
    }
    case "excluir_checkpoint": {
      // As pendências que nasceram nele ficam (sem reunião): são do cliente, não da agenda.
      const { error } = await sb.from("rituais_reunioes").delete().eq("id", a.id);
      return error ? { ok: false, erro: error.message } : { ok: true, ids: [a.id] };
    }
    case "pontos": {
      const { data: p } = await sb.from("rituais_pautas").select("reuniao_id").eq("id", a.pauta_id).maybeSingle();
      if (!p) return { ok: false, erro: "pauta não encontrada" };
      const trava = await aberta(p.reuniao_id as number);
      if (trava) return { ok: false, erro: trava };
      const { error } = await sb.from("rituais_pautas").update({ pontos: a.pontos.trim() || null, pontos_por: a.autor.nome || a.autor.email }).eq("id", a.pauta_id);
      return error ? { ok: false, erro: error.message } : { ok: true, ids: [a.pauta_id] };
    }
    case "salvar_pauta": {
      const trava = await aberta(a.reuniao_id);
      if (trava) return { ok: false, erro: trava };
      const campos = { titulo: a.pauta.titulo.trim(), area: a.pauta.area ?? "", minutos: a.pauta.minutos, fonte: a.pauta.fonte || "livre" };
      if (a.pauta.id) {
        const { data, error } = await sb.from("rituais_pautas").update(campos).eq("id", a.pauta.id).eq("reuniao_id", a.reuniao_id).select("id");
        if (error) return { ok: false, erro: error.message };
        return data?.length ? { ok: true, ids: [a.pauta.id] } : { ok: false, erro: "pauta não encontrada" };
      }
      const { data: ult } = await sb.from("rituais_pautas").select("ordem").eq("reuniao_id", a.reuniao_id).order("ordem", { ascending: false }).limit(1);
      const { data, error } = await sb.from("rituais_pautas").insert({ ...campos, reuniao_id: a.reuniao_id, ordem: ((ult?.[0]?.ordem as number | undefined) ?? 0) + 1 }).select("id").single();
      return error ? { ok: false, erro: error.message } : { ok: true, ids: [data.id as number] };
    }
    case "remover_pauta": {
      const { data: p } = await sb.from("rituais_pautas").select("reuniao_id").eq("id", a.pauta_id).maybeSingle();
      if (!p) return { ok: false, erro: "pauta não encontrada" };
      const trava = await aberta(p.reuniao_id as number);
      if (trava) return { ok: false, erro: trava };
      const { error } = await sb.from("rituais_pautas").delete().eq("id", a.pauta_id);
      return error ? { ok: false, erro: error.message } : { ok: true, ids: [a.pauta_id] };
    }
    case "mover_pauta": {
      const { data: p } = await sb.from("rituais_pautas").select("reuniao_id").eq("id", a.pauta_id).maybeSingle();
      if (!p) return { ok: false, erro: "pauta não encontrada" };
      const trava = await aberta(p.reuniao_id as number);
      if (trava) return { ok: false, erro: trava };
      const { data: lista } = await sb.from("rituais_pautas").select("id, ordem").eq("reuniao_id", p.reuniao_id).order("ordem").order("id");
      const ids = (lista ?? []).map((x) => x.id as number);
      const i = ids.indexOf(a.pauta_id), j = i + a.direcao;
      if (i < 0 || j < 0 || j >= ids.length) return { ok: true, ids: [] };
      [ids[i], ids[j]] = [ids[j], ids[i]];
      for (const [k, id] of ids.entries()) await sb.from("rituais_pautas").update({ ordem: k + 1 }).eq("id", id);
      return { ok: true, ids: [ids[i], ids[j]] };
    }
    case "salvar_pendencia":
      return salvarPendencia(a.pendencia, a, hoje, nome);
    case "situacao_pendencia": {
      const { data: x } = await sb.from("rituais_acoes").select("status, andamento").eq("id", a.id).maybeSingle();
      if (!x) return { ok: false, erro: "pendência não encontrada" };
      const de = situacaoPendencia(x.status, x.andamento);
      if (de === a.situacao) return { ok: true, ids: [a.id] };
      const { error } = await sb.from("rituais_acoes").update(mudancaDeSituacao(a.situacao, hoje)).eq("id", a.id);
      if (error) return { ok: false, erro: error.message };
      await historico(a.id, "STATUS", `${SITUACAO_PENDENCIA_LABEL[de]} → ${SITUACAO_PENDENCIA_LABEL[a.situacao]}`);
      return { ok: true, ids: [a.id] };
    }
    case "anotar": {
      const { data: x } = await sb.from("rituais_acoes").select("id").eq("id", a.id).maybeSingle();
      if (!x) return { ok: false, erro: "pendência não encontrada" };
      const { error } = await historico(a.id, "COMENTARIO", a.texto.trim());
      return error ? { ok: false, erro: error.message } : { ok: true, ids: [a.id] };
    }
    case "excluir_pendencia": {
      const { error } = await sb.from("rituais_acoes").delete().eq("id", a.id);
      return error ? { ok: false, erro: error.message } : { ok: true, ids: [a.id] };
    }
  }
}

async function salvarPendencia(p: CamposPendencia, a: AcaoRitual, hoje: string, nome: (e: string) => string): Promise<RespostaAcao> {
  const sb = admin();
  const resp = dedupResp(p.responsaveis);
  const campos = {
    natureza: p.natureza, tema: p.tema?.trim() || null, acao: p.acao.trim(), contexto: p.contexto?.trim() || null,
    prazo: p.prazo, prazo_texto: p.prazo_texto?.trim() || null, bola_com: p.bola_com,
    identificada_em: p.identificada_em, cliente_nome: p.cliente_nome?.trim() || null,
    empresa_cnpjs: [...new Set(p.empresa_cnpjs.map(soDigitos))],
  };
  const autor = { autor_email: a.autor.email.toLowerCase(), autor_nome: a.autor.nome, origem: a.autor.origem };
  const gravarResp = async (id: number) => {
    await sb.from("rituais_acao_responsaveis").delete().eq("acao_id", id);
    if (resp.length) await sb.from("rituais_acao_responsaveis").insert(resp.map((r, i) => ({ acao_id: id, email: r.email, nome_livre: r.nome_livre, ordem: i })));
  };
  if (!p.id) {
    if (p.reuniao_id) {
      const { data: r } = await sb.from("rituais_reunioes").select("status").eq("id", p.reuniao_id).maybeSingle();
      if (!r) return { ok: false, erro: "Checkpoint não encontrado" };
      if (r.status !== "ABERTA") return { ok: false, erro: "Checkpoint encerrado: só leitura" };
    }
    const { data, error } = await sb.from("rituais_acoes")
      .insert({ ...campos, reuniao_id: p.reuniao_id, andamento: "NAO_INICIADA", ...nascimentoDaDecisao(p.natureza, hoje) }).select("id").single();
    if (error) return { ok: false, erro: error.message };
    const id = data.id as number;
    await gravarResp(id);
    await sb.from("rituais_acao_historico").insert({ acao_id: id, tipo: "STATUS", texto: a.autor.origem === "portal" ? `Criada no ${PORTAL.nome}.` : "Criada pela Flórida.", ...autor });
    return { ok: true, ids: [id] };
  }
  const { data: x } = await sb.from("rituais_acoes").select("*").eq("id", p.id).maybeSingle();
  if (!x) return { ok: false, erro: "pendência não encontrada" };
  const antes = { tema: x.tema, acao: x.acao, contexto: x.contexto, prazo: x.prazo, bola_com: x.bola_com, identificada_em: x.identificada_em, responsaveis: await responsaveisDe(p.id) };
  const mudou = mudancasDaPendencia(antes, { ...campos, responsaveis: resp }, nome);
  if (!mudou.length && x.natureza === campos.natureza && x.prazo_texto === campos.prazo_texto
      && (x.cliente_nome ?? null) === campos.cliente_nome && JSON.stringify(x.empresa_cnpjs ?? []) === JSON.stringify(campos.empresa_cnpjs)) {
    return { ok: true, ids: [p.id] };
  }
  const { error } = await sb.from("rituais_acoes").update(campos).eq("id", p.id);
  if (error) return { ok: false, erro: error.message };
  if (mudou.some((m) => m.startsWith("responsáveis:"))) await gravarResp(p.id);
  if (mudou.length) await sb.from("rituais_acao_historico").insert({ acao_id: p.id, tipo: "STATUS", texto: `Editada: ${mudou.join("; ")}.`, ...autor });
  return { ok: true, ids: [p.id] };
}

function dedupResp(l: ResponsavelNovo[]): ResponsavelNovo[] {
  const vistos = new Set<string>();
  const saida: ResponsavelNovo[] = [];
  for (const r of l) {
    const email = r.email ? r.email.trim().toLowerCase() : null;
    const nome_livre = email ? null : r.nome_livre?.trim() || null;
    const k = email ? `e:${email}` : `n:${nome_livre}`;
    if ((!email && !nome_livre) || vistos.has(k)) continue;
    vistos.add(k);
    saida.push({ email, nome_livre });
  }
  return saida;
}

// ── Ler: o que a Flórida copia ──

/** O que a Flórida copia. Sem `desde`: tudo (a cópia de lá troca inteira). */
export async function exportarRituais(desde: string | null): Promise<ExportacaoRituais> {
  const sb = admin();
  const ate = new Date().toISOString(); // ANTES de ler: o que gravar durante a leitura vem na próxima
  const a = desdeComFolga(desde);
  const filtro = <Q extends { gt(c: string, v: string): Q }>(q: Q, col: string) => (a ? q.gt(col, a) : q);
  const [reunioes, pautas, acoes, historico, apagados] = await Promise.all([
    todas<Record<string, unknown>>((de, x) => filtro(sb.from("rituais_reunioes").select("*"), "atualizado_em").order("id").range(de, x)),
    todas<PautaExport>((de, x) => filtro(sb.from("rituais_pautas").select("*"), "atualizado_em").order("id").range(de, x)),
    todas<AcaoRitualExport>((de, x) => filtro(sb.from("rituais_acoes").select("*"), "atualizado_em").order("id").range(de, x)),
    todas<HistoricoExport>((de, x) => filtro(sb.from("rituais_acao_historico").select("*"), "criado_em").order("id").range(de, x)),
    a ? todas<ApagadoRitual>((de, x) => sb.from("rituais_apagados").select("*").gt("apagado_em", a).gt("id", 0).order("id").range(de, x)) : Promise.resolve([]),
  ]);
  // Os responsáveis vão inteiros junto de cada ação exportada (mudar responsável carimba a ação).
  const responsaveis: ResponsavelExport[] = [];
  const ids = acoes.map((x) => x.id);
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await sb.from("rituais_acao_responsaveis").select("acao_id, email, nome_livre, ordem").in("acao_id", ids.slice(i, i + 300));
    responsaveis.push(...((data ?? []) as ResponsavelExport[]));
  }
  return { versao: VERSAO_RITUAIS, desde: a, ate, reunioes: reunioes.map(reuniaoDe), pautas, acoes, responsaveis, historico, apagados };
}

/** A mudança de casa: o histórico da Flórida, com os mesmos ids, só com as tabelas VAZIAS. */
export async function importarRituais(p: PacoteRituais): Promise<RespostaImportacaoRituais> {
  if (p.versao !== VERSAO_RITUAIS) return { ok: false, erro: `versão ${p.versao} (esperada ${VERSAO_RITUAIS})` };
  const torto = conferirPacote(p);
  if (torto) return { ok: false, erro: torto };
  const sb = admin();
  const conta = async (): Promise<ContagemRituais> => {
    const n = async (t: string) => (await sb.from(t).select("id", { count: "exact", head: true })).count ?? 0;
    return {
      reunioes: await n("rituais_reunioes"), pautas: await n("rituais_pautas"), acoes: await n("rituais_acoes"),
      responsaveis: await n("rituais_acao_responsaveis"), historico: await n("rituais_acao_historico"),
    };
  };
  const antes = await conta();
  if (Object.values(antes).some((v) => v > 0) || (await temRituaisLocal())) {
    return { ok: false, erro: "este portal já tem Rituais gravados — a importação é só para a primeira vez", gravado: antes };
  }
  const enviado = contarPacote(p);
  const lote = async (t: string, linhas: object[]) => {
    for (let i = 0; i < linhas.length; i += 500) {
      const { error } = await sb.from(t).insert(linhas.slice(i, i + 500));
      if (error) throw new Error(`${t}: ${error.message}`);
    }
  };
  const limpar = async () => {
    for (const t of ["rituais_acao_historico", "rituais_acao_responsaveis", "rituais_acoes", "rituais_pautas", "rituais_reunioes"]) {
      await sb.from(t).delete().gte("id", 0);
    }
    await sb.from("rituais_apagados").delete().gte("id", 0);
  };
  try {
    await lote("rituais_reunioes", p.reunioes.map((x) => ({ ...x, empresa_cnpjs: x.empresa_cnpjs.map(soDigitos) })));
    await lote("rituais_pautas", p.pautas);
    await lote("rituais_acoes", p.acoes.map((x) => ({ ...x, empresa_cnpjs: x.empresa_cnpjs.map(soDigitos) })));
    await lote("rituais_acao_responsaveis", p.responsaveis.map((r) => ({ ...r, email: r.email?.toLowerCase() ?? null })));
    await lote("rituais_acao_historico", p.historico.map((h) => ({ ...h, autor_email: h.autor_email?.toLowerCase() ?? null })));
    await sb.rpc("rituais_acertar_sequencias");
    // As lápides que a importação deixou não são apagamentos de verdade; fica só o marco da mudança.
    await sb.from("rituais_apagados").delete().gte("id", 0);
    const { error } = await sb.from("rituais_apagados").insert({ tabela: "reunioes", id: 0 });
    if (error) throw new Error(`marco da mudança: ${error.message}`);
  } catch (e) {
    // Meia mudança não serve: desfaz tudo, para poder tentar de novo do zero.
    await limpar();
    return { ok: false, erro: `${e instanceof Error ? e.message : String(e)} — nada ficou gravado; pode tentar de novo`, enviado, gravado: await conta() };
  }
  const gravado = await conta();
  const erro = conferirContagemRituais(enviado, gravado);
  return erro ? { ok: false, erro, enviado, gravado } : { ok: true, enviado, gravado };
}

// ── O que a tela mostra ──

export interface PendenciaLocal {
  id: number; tema: string; acao: string; contexto: string;
  responsaveis: string[]; prazo: string | null; prazoTexto: string | null;
  situacao: SituacaoPendencia; situacaoLabel: string; bolaCom: "FLORIDA" | "CLIENTE" | null;
  atrasada: boolean; historico: { data: string; tipo: string; texto: string; autor: string }[];
  responsaveisPortal: string[]; responsaveisFixos: string[]; identificadaEm: string;
}

/**
 * As pendências deste cliente para a tela (o MESMO formato que a ponte antiga
 * devolvia, para <PendenciasFlorida> desenhar igual). Responsável do portal =
 * o e-mail (é o id da lista de usuários); os demais vão em "fixos", pelo nome.
 */
export async function lerPendencias(comConcluidas: boolean, hoje: string, usuarios: Pessoa[], nomes: Map<string, string>) {
  const sb = admin();
  const consulta = () => {
    const q = sb.from("rituais_acoes").select("*").eq("natureza", "ACAO");
    return comConcluidas ? q : q.eq("status", "ABERTA");
  };
  const acoes = await todas<Record<string, unknown>>((de, ate) => consulta().order("id").range(de, ate));
  const { data: temasTodos } = await sb.from("rituais_acoes").select("tema").not("tema", "is", null);
  const temas = [...new Set((temasTodos ?? []).map((t) => t.tema as string))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const ids = acoes.map((a) => a.id as number);
  const resp: Record<string, unknown>[] = [], hist: Record<string, unknown>[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    const pedaco = ids.slice(i, i + 300);
    const [r, h] = await Promise.all([
      sb.from("rituais_acao_responsaveis").select("*").in("acao_id", pedaco).order("ordem"),
      sb.from("rituais_acao_historico").select("*").in("acao_id", pedaco).order("data").order("id"),
    ]);
    resp.push(...(r.data ?? [])); hist.push(...(h.data ?? []));
  }
  const doPortal = new Set(usuarios.map((u) => u.email.toLowerCase()));
  const nomeDe = (email: string) => usuarios.find((u) => u.email.toLowerCase() === email)?.nome ?? nomes.get(email) ?? email;
  const pendencias: PendenciaLocal[] = acoes.map((a) => {
    const id = a.id as number;
    const rs = resp.filter((r) => r.acao_id === id);
    const situacao = situacaoPendencia(a.status as "ABERTA", a.andamento as "EM_ANDAMENTO");
    return {
      id, tema: (a.tema as string) ?? "", acao: a.acao as string, contexto: (a.contexto as string) ?? "",
      responsaveis: rs.map((r) => (r.email ? nomeDe(r.email as string) : (r.nome_livre as string))),
      prazo: (a.prazo as string) ?? null, prazoTexto: (a.prazo_texto as string) ?? null,
      situacao, situacaoLabel: SITUACAO_PENDENCIA_LABEL[situacao], bolaCom: (a.bola_com as "FLORIDA") ?? null,
      atrasada: a.status === "ABERTA" && !!a.prazo && (a.prazo as string) < hoje,
      historico: hist.filter((h) => h.acao_id === id).map((h) => ({
        data: h.data as string, tipo: h.tipo as string, texto: h.texto as string,
        autor: (h.autor_nome as string) || (h.autor_email ? nomeDe(h.autor_email as string) : "") || "",
      })),
      responsaveisPortal: rs.filter((r) => r.email && doPortal.has(r.email as string)).map((r) => r.email as string),
      responsaveisFixos: rs.filter((r) => !(r.email && doPortal.has(r.email as string))).map((r) => (r.email ? nomeDe(r.email as string) : (r.nome_livre as string))),
      identificadaEm: (a.identificada_em as string) ?? diaSP(a.criado_em as string),
    };
  }).sort((x, y) => (x.tema || "~").localeCompare(y.tema || "~", "pt-BR") || x.id - y.id);
  return {
    versao: 1, portal: { id: PORTAL.id, nome: PORTAL.nome }, hoje,
    situacoes: SIT.map((v) => ({ valor: v, rotulo: SITUACAO_PENDENCIA_LABEL[v] })),
    pendencias, usuarios: usuarios.map((u) => ({ id: u.email.toLowerCase(), nome: u.nome })), temas,
  };
}

/**
 * A edição feita na tela daqui: responsável escolhido é usuário DESTE portal
 * (e-mail); os da Flórida e os nomes livres que já estavam ficam como estão.
 */
export async function pendenciaDaTela(acaoId: number | undefined, campos: {
  tema: string; acao: string; contexto: string; prazo: string | null; bolaCom: "FLORIDA" | "CLIENTE" | null;
  identificadaEm: string | null; responsaveis: string[];
}, usuarios: Pessoa[]): Promise<CamposPendencia | { erro: string }> {
  const doPortal = new Set(usuarios.map((u) => u.email.toLowerCase()));
  const escolhidos = campos.responsaveis.map((e) => e.toLowerCase()).filter((e) => doPortal.has(e));
  let base: Record<string, unknown> | null = null;
  let fixos: ResponsavelNovo[] = [];
  if (acaoId) {
    const { data } = await admin().from("rituais_acoes").select("*").eq("id", acaoId).maybeSingle();
    if (!data) return { erro: "pendência não encontrada" };
    base = data;
    fixos = (await responsaveisDe(acaoId)).filter((r) => !(r.email && doPortal.has(r.email)));
  }
  return {
    ...(acaoId ? { id: acaoId } : {}),
    reuniao_id: (base?.reuniao_id as number | null) ?? null,
    natureza: (base?.natureza as "ACAO") ?? "ACAO",
    tema: campos.tema || null, acao: campos.acao, contexto: campos.contexto || null,
    prazo: campos.prazo, prazo_texto: (base?.prazo_texto as string | null) ?? null, bola_com: campos.bolaCom,
    identificada_em: campos.identificadaEm, cliente_nome: (base?.cliente_nome as string | null) ?? PORTAL.nome,
    empresa_cnpjs: (base?.empresa_cnpjs as string[] | null) ?? [],
    responsaveis: [...escolhidos.map((email) => ({ email, nome_livre: null })), ...fixos],
  };
}

export const ehSituacao = (s: string): s is SituacaoPendencia => (SIT as string[]).includes(s);
