// Cronograma de fechamento da FLÓRIDA, lido pelo servidor deste portal.
//
// SERVER-ONLY: usa a chave FLORIDA_FECHAMENTO_TOKEN, que nunca vai ao navegador.
// Os dados moram no banco do Portal Flórida (decisão de 16/10/2026, "opção B");
// este portal só LÊ a parte dele, pela API /api/fechamento/portal. Quem marca
// entrega é a equipe Flórida, no Portal Flórida.
//
// ⚠️ Arquivo IGUAL nos portais Affix, Headset (Inexx), RQ e WR (cópia do
// componente canônico do Portal Flórida, src/lib/fechamento/portal.ts é o lado
// de lá). O formato é CONTRATO: `versao` 1. Mudou lá, muda aqui nos quatro.
//
// Env vars (Vercel deste portal):
//   FLORIDA_FECHAMENTO_TOKEN = a chave gerada em Portal Flórida › Fechamento › Portais dos clientes
//   FLORIDA_FECHAMENTO_URL   = opcional; padrão https://portal-florida.vercel.app

import type { EtapaOcorrencia, MudancaEtapa } from "@/vendor/fechamento-core/etapas";
import { validarAcao } from "@/vendor/fechamento-core/contrato";

export type SituacaoFech = "PENDENTE" | "ENTREGUE" | "PARCIAL" | "NAO_SE_APLICA";
export type StatusFech =
  | "NO_PRAZO" | "ENTREGUE_COM_ATRASO" | "PARCIAL" | "NAO_SE_APLICA"
  | "VENCE_HOJE" | "ATRASADO" | "A_VENCER";

export interface ItemFech {
  empresa: string;
  competencia: string;
  data_prevista: string;
  rotulo: string | null;
  atividade: string;
  area: string;
  tipo: "ATIVIDADE" | "PAGAMENTO" | "OBRIGACAO";
  responsavel: string | null;
  situacao: SituacaoFech;
  status: StatusFech;
  data_entrega: string | null;
  // ── 09/11/2026 (a Flórida manda; opcionais para não quebrar com a versão anterior de lá) ──
  /** id do item — é por ele que este portal grava a situação, o responsável e o comentário. */
  id?: number;
  /** CNPJ da empresa (só dígitos): casa com o Cadastro Geral DESTE portal. */
  empresa_cnpj?: string | null;
  /** O responsável, quando é usuário DESTE portal (o id daqui). */
  responsavel_portal?: string | null;
  comentarios?: ComentarioFech[];
  /** MENSAL = fechamento; DIARIA/SEMANAL/QUINZENAL = rotina (a etiqueta de "Tipo"). */
  periodicidade?: "MENSAL" | "DIARIA" | "SEMANAL" | "QUINZENAL";
  /** 13/11/2026 — pagamento em etapas (fechamento-core/etapas.ts); só com o cronograma gravado aqui. */
  etapas?: EtapaOcorrencia[] | null;
}

export interface ComentarioFech { tipo: "COMENTARIO" | "STATUS"; texto: string; autor: string; quando: string; origem: string }

export interface CronogramaFech {
  versao: number;
  portal: { id: string; nome: string };
  competencia: string;
  hoje: string;
  itens: ItemFech[];
  atrasadosAnteriores: ItemFech[];
  resumo: { total: number; entregues: number; noPrazo: number; atrasados: number; venceHoje: number };
  /** Quem deste portal pode ser responsável (a lista que este portal manda à Flórida). */
  usuarios?: { id: string; nome: string }[];
}

export type ResultadoFech = { ok: true; dados: CronogramaFech } | { ok: false; erro: string };

const VERSAO = 1;

export async function buscarCronogramaFlorida(competencia?: string): Promise<ResultadoFech> {
  const chave = process.env.FLORIDA_FECHAMENTO_TOKEN;
  if (!chave) {
    return { ok: false, erro: "O cronograma ainda não foi ligado: falta a variável FLORIDA_FECHAMENTO_TOKEN na Vercel deste portal." };
  }
  const base = (process.env.FLORIDA_FECHAMENTO_URL || "https://portal-florida.vercel.app").replace(/\/$/, "");
  const q = competencia && /^\d{4}-(0[1-9]|1[0-2])$/.test(competencia) ? `?c=${competencia}` : "";
  try {
    const res = await fetch(`${base}/api/fechamento/portal${q}`, {
      headers: { Authorization: `Bearer ${chave}` },
      cache: "no-store",
    });
    if (res.status === 401) {
      return { ok: false, erro: "O Portal Flórida recusou a chave. Gere uma nova em Fechamento › Portais dos clientes e atualize FLORIDA_FECHAMENTO_TOKEN aqui." };
    }
    if (!res.ok) return { ok: false, erro: `O Portal Flórida respondeu ${res.status}. Tente de novo em alguns minutos.` };
    const dados = (await res.json()) as CronogramaFech;
    if (dados.versao !== VERSAO) {
      return { ok: false, erro: `O formato do cronograma mudou (versão ${dados.versao}); este portal precisa ser atualizado.` };
    }
    return { ok: true, dados };
  } catch (e) {
    return { ok: false, erro: `Não consegui falar com o Portal Flórida: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ── 0226 do Portal Flórida: os usuários DESTE portal podem ser responsáveis ──
//
// Na abertura do Cronograma, o servidor daqui manda à Flórida a lista de
// usuários (id, nome, e-mail), com a mesma chave. A Flórida troca a lista
// inteira — quem saiu daqui some de lá. Falhar não atrapalha a tela: é só a
// lista de lá que fica como estava.

export interface UsuarioPortal { id: string; nome: string; email: string }

/** Clientes Supabase com a service role (o tipo exato varia de portal a portal). */
interface ClienteAdmin {
  auth: { admin: { listUsers(p: { page?: number; perPage?: number }): Promise<{
    data: { users: { id: string; email?: string; banned_until?: string | null; user_metadata?: Record<string, unknown> }[] } | null;
    error: unknown;
  }> } };
  from(tabela: string): { select(c: string): PromiseLike<{ data: unknown[] | null; error: unknown }> };
}

/**
 * Os NOMES da equipe Flórida, pelo e-mail (09/11/2026, pedido dela: "manter o
 * nome"). Quem é da equipe Flórida e não tem nome cadastrado AQUI aparecia como
 * e-mail no Cronograma e nos Rituais. Só dá nome a um e-mail — não vira lista de
 * escolha. Falhar devolve vazio (fica o e-mail, como antes).
 */
export async function nomesDaFlorida(): Promise<Map<string, string>> {
  const chave = process.env.FLORIDA_FECHAMENTO_TOKEN;
  if (!chave) return new Map();
  const base = (process.env.FLORIDA_FECHAMENTO_URL || "https://portal-florida.vercel.app").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/fechamento/portal/pessoas`, {
      headers: { Authorization: `Bearer ${chave}` },
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return new Map();
    const j = (await res.json()) as { pessoas?: { email: string; nome: string }[] };
    return new Map((j.pessoas ?? []).map((p) => [p.email.toLowerCase(), p.nome]));
  } catch {
    return new Map();
  }
}

/** Os usuários ativos deste portal: o Auth (quem existe e não está bloqueado) + o nome do `profiles`, se houver. */
export async function usuariosDestePortal(admin: ClienteAdmin | null): Promise<UsuarioPortal[]> {
  if (!admin) return [];
  const daFlorida = await nomesDaFlorida();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error || !data) return [];
  const agora = Date.now();
  const nomes = new Map<string, string>();
  try {
    const { data: perfis } = await admin.from("profiles").select("id, nome");
    for (const p of (perfis ?? []) as { id: string; nome: string | null }[]) if (p.nome) nomes.set(p.id, p.nome);
  } catch { /* portal sem profiles: fica o nome do Auth */ }
  return data.users
    .filter((u) => !(u.banned_until && new Date(u.banned_until).getTime() > agora))
    .map((u) => {
      const meta = u.user_metadata ?? {};
      const nome = nomes.get(u.id) || (typeof meta.nome === "string" && meta.nome) || (typeof meta.full_name === "string" && meta.full_name)
        || daFlorida.get((u.email ?? "").toLowerCase()) || u.email || u.id;
      return { id: u.id, nome, email: u.email ?? "" };
    });
}

export async function enviarUsuariosFlorida(usuarios: UsuarioPortal[]): Promise<void> {
  const chave = process.env.FLORIDA_FECHAMENTO_TOKEN;
  if (!chave || !usuarios.length) return;
  const base = (process.env.FLORIDA_FECHAMENTO_URL || "https://portal-florida.vercel.app").replace(/\/$/, "");
  try {
    await fetch(`${base}/api/fechamento/portal/usuarios`, {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ usuarios }),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* a tela não depende disto */ }
}

// ── 09/11/2026: este portal MUDA o cronograma (grava no item da Flórida) ──
//
// Pedido dela: "no portal da empresa permitir mudar status, mas sempre
// replicando no Portal Flórida; responsável deve ser usuário do portal; coluna
// comentários (quem/quando)". Não há cópia: grava direto no item de lá, pela
// mesma chave; a Flórida confere o recorte e carimba o autor e a origem.

export type MudancaCron =
  | { tipo: "situacao"; id: number; situacao: SituacaoFech }
  | { tipo: "responsavel"; id: number; usuario: string | null }
  | { tipo: "comentar"; id: number; texto: string }
  | { tipo: "etapa"; id: number; mudanca: MudancaEtapa };
export type RespostaCron = { ok: true } | { ok: false; erro: string };

/** Valida o que veio do navegador (a action é um endpoint público). */
export function mudancaValida(m: unknown): MudancaCron | null {
  if (!m || typeof m !== "object") return null;
  const x = m as Record<string, unknown>;
  if (typeof x.id !== "number" || !Number.isInteger(x.id) || x.id <= 0) return null;
  if (x.tipo === "situacao" && ["PENDENTE", "ENTREGUE", "PARCIAL", "NAO_SE_APLICA"].includes(String(x.situacao))) {
    return { tipo: "situacao", id: x.id, situacao: x.situacao as SituacaoFech };
  }
  if (x.tipo === "responsavel" && (x.usuario === null || typeof x.usuario === "string")) {
    return { tipo: "responsavel", id: x.id, usuario: (x.usuario as string | null) || null };
  }
  if (x.tipo === "etapa" && x.mudanca && typeof x.mudanca === "object") {
    // A conferência é a do contrato (a mesma que a Flórida passa); o autor aqui é só de forma.
    const m = x.mudanca as MudancaEtapa;
    const erro = validarAcao({ tipo: "etapa", id: x.id, ...m, autor: { email: "tela@portal.local", nome: null, origem: "portal" } });
    return erro ? null : { tipo: "etapa", id: x.id, mudanca: m };
  }
  if (x.tipo === "comentar" && typeof x.texto === "string" && x.texto.trim()) {
    return { tipo: "comentar", id: x.id, texto: x.texto.trim().slice(0, 4000) };
  }
  return null;
}

/** Grava na Flórida. `autor` = o nome de quem está logado AQUI. */
export async function mudarCronogramaFlorida(m: MudancaCron, autor: string): Promise<RespostaCron> {
  if (m.tipo === "etapa") return { ok: false, erro: "As etapas do pagamento só se marcam aqui depois que o cronograma passar a ser gravado neste portal. Por ora, marque pela tela da Flórida." };
  const chave = process.env.FLORIDA_FECHAMENTO_TOKEN;
  if (!chave) return { ok: false, erro: "Falta a variável FLORIDA_FECHAMENTO_TOKEN na Vercel deste portal." };
  const base = (process.env.FLORIDA_FECHAMENTO_URL || "https://portal-florida.vercel.app").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/fechamento/portal`, {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...m, autor }), cache: "no-store",
    });
    if (res.ok) return { ok: true };
    if (res.status === 405) return { ok: false, erro: "O Portal Flórida ainda não aceita mudanças pelo portal. Tente depois da próxima publicação de lá." };
    const j = (await res.json().catch(() => ({}))) as { erro?: string };
    return { ok: false, erro: j.erro || `O Portal Flórida respondeu ${res.status}.` };
  } catch (e) {
    return { ok: false, erro: `Não consegui falar com o Portal Flórida: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * As empresas do CADASTRO GERAL deste portal (opção "a" dela, 09/11/2026): o
 * nome que a tela mostra sai daqui, casado com a Flórida pelo CNPJ. Os quatro
 * portais têm a tabela `empresas` com `cnpj`; o nome é o primeiro que existir.
 */
interface ClienteLeitura { from(t: string): { select(c: string): PromiseLike<{ data: unknown[] | null; error: unknown }> } }
export async function empresasDoCadastroPortal(admin: ClienteLeitura | null): Promise<{ cnpj: string; nome: string }[]> {
  if (!admin) return [];
  try {
    const { data } = await admin.from("empresas").select("*");
    return ((data ?? []) as Record<string, unknown>[]).map((e) => ({
      cnpj: String(e.cnpj ?? "").replace(/\D/g, ""),
      nome: String(e.apelido || e.nome_fantasia || e.nome || e.razao_social || "").trim(),
    })).filter((e) => e.cnpj && e.nome);
  } catch {
    return [];
  }
}

/**
 * 0232 da Flórida: manda as empresas do Cadastro Geral DESTE portal (CNPJ e
 * nome), para a tela de Portais dos clientes oferecer estas — e não o cadastro
 * de lá. A Flórida troca a lista inteira. Falhar não atrapalha a tela.
 */
export async function enviarEmpresasFlorida(empresas: { cnpj: string; nome: string }[]): Promise<void> {
  const chave = process.env.FLORIDA_FECHAMENTO_TOKEN;
  if (!chave || !empresas.length) return;
  const base = (process.env.FLORIDA_FECHAMENTO_URL || "https://portal-florida.vercel.app").replace(/\/$/, "");
  try {
    await fetch(`${base}/api/fechamento/portal/empresas`, {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ empresas }),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* a tela não depende disto */ }
}
