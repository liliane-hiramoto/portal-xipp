// Acessos: a regra da tela de Acessos (Pessoas · Por módulo · Perfis), a
// MESMA em todo portal (item 9 do comparativo, passo 2 — 11/11/2026).
//
// A tela (`acessos-tela.tsx`) fala com UMA rota do portal (`/api/acessos`), e a
// rota só faz duas coisas: conferir que quem pede é ADMIN DO PORTAL e chamar
// `listarAcessos(porta)` (GET) ou `tratarAcao(porta, corpo)` (POST). O que muda
// de portal para portal é a PORTA: onde moram os acessos (`user_modules`, as
// funções `conceder_modulo` do core.acessos…) e se há perfis de acesso.
//
// As travas moram AQUI, e não na tela, porque a tela só esconde:
//   • ninguém inativa, exclui ou muda o próprio admin do portal;
//   • a super-admin (pelo e-mail) não se inativa, exclui, nem troca de e-mail;
//   • só módulo da lista e papel que o módulo aceita;
//   • senha escolhida tem no mínimo SENHA_MINIMA; sem ela, uma SORTEADA, que
//     volta uma vez na resposta, e a troca é cobrada no 1º acesso.
//
// Sem React, sem Next, sem Supabase direto: roda no servidor e no teste. Os
// atalhos `loginsSupabase`, `acessosUserModules` e `perfisTabelas` montam as
// partes comuns da porta a partir do cliente com a service role.

import { SENHA_MINIMA, senhaProvisoria } from "./senha";

/** A marca que o proxy lê (`precisaTrocarSenha`, ./senha): só no app_metadata. */
const MARCA_TROCA = "senha_provisoria";

/** A linha que marca o admin do PORTAL — separada do papel "admin" de um módulo. */
export const MODULO_PORTAL = "portal";
export const PAPEIS = ["viewer", "editor", "admin"] as const;
export type Papel = (typeof PAPEIS)[number];

export interface ModuloAcesso {
  key: string;
  label: string;
  /** Papéis que o módulo aceita. Padrão: os três. Um só = "tem ou não tem". */
  papeis?: Papel[];
}
export interface Login {
  id: string;
  email: string;
  nome: string;
  ultimo_acesso: string | null;
  /** Até quando o login está bloqueado (inativo), ou null. */
  banido_ate: string | null;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}
export interface LinhaAcesso { user_id: string; modulo: string; papel: string }
export interface PerfilItem { modulo: string; papel: string }
export interface Perfil { id: number; nome: string; descricao: string | null; ordem: number; ativo: boolean; itens: PerfilItem[] }

export interface PortaLogins {
  listar(): Promise<Login[]>;
  ler(id: string): Promise<Login | null>;
  criar(d: { email: string; senha: string; nome: string }): Promise<string>;
  atualizar(id: string, d: { email?: string; user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown>; senha?: string; ativo?: boolean }): Promise<void>;
  excluir(id: string): Promise<void>;
}
export interface PortaGuarda {
  /** Todas as linhas, inclusive a de MODULO_PORTAL. */
  listar(): Promise<LinhaAcesso[]>;
  conceder(user_id: string, modulo: string, papel: string): Promise<void>;
  revogar(user_id: string, modulo: string): Promise<void>;
  marcarAdminPortal(user_id: string, valor: boolean): Promise<void>;
}
export interface PortaPerfis {
  /** null = as tabelas não existem neste banco (a aba avisa). */
  listar(): Promise<Perfil[] | null>;
  salvar(p: Omit<Perfil, "id"> & { id?: number }): Promise<number>;
  excluir(id: number): Promise<void>;
}
export interface PortaAcessos {
  /** E-mail da super-admin de bootstrap (comparado sem maiúsculas). */
  superAdmin: string;
  modulos: ModuloAcesso[];
  /** Quem está pedindo (o admin logado). */
  euId: string | null;
  logins: PortaLogins;
  acessos: PortaGuarda;
  /** Sem perfis neste portal: a aba Perfis não aparece. */
  perfis?: PortaPerfis;
  /**
   * ADMIN DE MÓDULO (a ★ da Etapa 4; a régua da 0008 da Affix): quem pede NÃO
   * é admin do portal, mas administra estes módulos. Vê só eles e só dá/tira
   * acesso a eles — sem dar o papel admin, sem mexer em quem já é admin ali,
   * e sem nada do login (criar, senha, inativar, excluir, admin do portal,
   * perfis). Ausente = admin do portal (tudo). A régua de verdade continua no
   * banco (`conceder_modulo`); aqui é a mesma regra, para a tela explicar.
   */
  escopo?: string[];
}

export interface Pessoa {
  id: string; email: string; nome: string; ultimo_acesso: string | null;
  ativo: boolean; super_admin: boolean; admin_portal: boolean;
  acessos: PerfilItem[];
}
export interface DadosAcessos {
  usuarios: Pessoa[];
  modulos: (ModuloAcesso & { papeis: Papel[] })[];
  /** undefined = o portal não tem perfis; null = falta a migração. */
  perfis?: Perfil[] | null;
  /** Presente = quem vê é admin SÓ destes módulos (a tela esconde o resto). */
  escopo?: string[];
}
export interface Resposta { status: number; corpo: Record<string, unknown> }

const papeisDe = (m: ModuloAcesso): Papel[] => (m.papeis?.length ? m.papeis : [...PAPEIS]);
const semAdmin = (m: ModuloAcesso): Papel[] => { const p = papeisDe(m).filter((x) => x !== "admin"); return p.length ? p : papeisDe(m); };
const eSuper = (porta: PortaAcessos, email: string) => email.trim().toLowerCase() === porta.superAdmin.toLowerCase();
const ativoAgora = (banido: string | null, agora: number) => !banido || new Date(banido).getTime() < agora;
const erro = (status: number, mensagem: string): Resposta => ({ status, corpo: { ok: false, error: mensagem } });
const certo = (extra: Record<string, unknown> = {}): Resposta => ({ status: 200, corpo: { ok: true, ...extra } });
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** O que a tela mostra: as pessoas (logins), os módulos e os perfis. */
export async function listarAcessos(porta: PortaAcessos, agora = Date.now()): Promise<DadosAcessos> {
  const [logins, linhas, perfis] = await Promise.all([
    porta.logins.listar(),
    porta.acessos.listar(),
    porta.perfis ? porta.perfis.listar().catch(() => null) : Promise.resolve(undefined),
  ]);
  const modulos = porta.escopo ? porta.modulos.filter((m) => porta.escopo!.includes(m.key)) : porta.modulos;
  const chaves = new Set(modulos.map((m) => m.key));
  const usuarios: Pessoa[] = logins.map((u) => ({
    id: u.id,
    email: u.email,
    nome: u.nome,
    ultimo_acesso: u.ultimo_acesso,
    ativo: ativoAgora(u.banido_ate, agora),
    super_admin: eSuper(porta, u.email),
    admin_portal: linhas.some((l) => l.user_id === u.id && l.modulo === MODULO_PORTAL && l.papel === "admin"),
    acessos: linhas.filter((l) => l.user_id === u.id && chaves.has(l.modulo)).map((l) => ({ modulo: l.modulo, papel: l.papel })),
  }));
  usuarios.sort((a, b) => (a.nome || a.email).localeCompare(b.nome || b.email, "pt-BR"));
  const dados: DadosAcessos = {
    usuarios,
    // Admin de módulo não dá o papel admin: a tela nem oferece.
    modulos: modulos.map((m) => ({ ...m, papeis: porta.escopo ? semAdmin(m) : papeisDe(m) })),
  };
  if (porta.escopo) dados.escopo = [...porta.escopo];
  else if (porta.perfis) dados.perfis = perfis ?? null;
  return dados;
}

/** Uma ação da tela. `corpo.acao` diz qual. Nunca lança: erro vira status. */
export async function tratarAcao(porta: PortaAcessos, corpo: Record<string, unknown>): Promise<Resposta> {
  try {
    return await tratar(porta, corpo);
  } catch (e) {
    return erro(500, msg(e));
  }
}

async function tratar(porta: PortaAcessos, b: Record<string, unknown>): Promise<Resposta> {
  if (porta.escopo) {
    const r = await travaEscopo(porta, porta.escopo, b);
    if (r) return r;
  }
  const uid = String(b.user_id ?? "");
  const modulo = porta.modulos.find((m) => m.key === String(b.modulo ?? ""));
  const souEu = !!uid && uid === porta.euId;
  const alvo = async () => (uid ? await porta.logins.ler(uid) : null);
  const senhaOuSorteio = (s: unknown): string | Resposta => {
    const senha = String(s ?? "");
    if (!senha) return senhaProvisoria();
    if (senha.length < SENHA_MINIMA) return erro(400, `senha de no mínimo ${SENHA_MINIMA} caracteres`);
    return senha;
  };

  switch (b.acao) {
    case "criar_usuario": {
      const email = String(b.email ?? "").trim();
      if (!email || !email.includes("@")) return erro(400, "e-mail obrigatório");
      const pass = senhaOuSorteio(b.senha);
      if (typeof pass !== "string") return pass;
      const id = await porta.logins.criar({ email, senha: pass, nome: String(b.nome ?? "").trim() });
      // Perfil escolhido na criação: aplica já, e diz se não deu.
      if (b.perfil_id && porta.perfis) {
        const r = await aplicarPerfil(porta, id, Number(b.perfil_id));
        if (r.status !== 200) return { status: 200, corpo: { ok: true, id, senha: pass, aviso: `Login criado, mas o perfil não foi aplicado: ${r.corpo.error}` } };
      }
      return certo({ id, senha: pass });
    }

    case "editar_usuario": {
      const u = await alvo();
      if (!u) return erro(404, "usuário não encontrado");
      const email = String(b.email ?? "").trim();
      if (email && email.toLowerCase() !== u.email.toLowerCase() && eSuper(porta, u.email)) return erro(400, "não é possível trocar o e-mail da super-admin");
      await porta.logins.atualizar(uid, {
        user_metadata: { ...(u.user_metadata ?? {}), nome: String(b.nome ?? "").trim() },
        ...(email && email.toLowerCase() !== u.email.toLowerCase() ? { email } : {}),
      });
      return certo();
    }

    case "ativo": {
      const u = await alvo();
      if (!u) return erro(404, "usuário não encontrado");
      if (souEu) return erro(400, "você não pode inativar a si mesmo");
      if (eSuper(porta, u.email)) return erro(400, "não é possível inativar a super-admin");
      await porta.logins.atualizar(uid, { ativo: !!b.valor });
      return certo();
    }

    case "trocar_senha": {
      const u = await alvo();
      if (!u) return erro(404, "usuário não encontrado");
      const pass = senhaOuSorteio(b.senha);
      if (typeof pass !== "string") return pass;
      await porta.logins.atualizar(uid, { senha: pass, app_metadata: { ...(u.app_metadata ?? {}), [MARCA_TROCA]: true } });
      return certo({ senha: pass });
    }

    case "excluir_usuario": {
      const u = await alvo();
      if (!u) return erro(404, "usuário não encontrado");
      if (souEu) return erro(400, "você não pode excluir a si mesmo");
      if (eSuper(porta, u.email)) return erro(400, "não é possível excluir a super-admin");
      await porta.logins.excluir(uid);
      return certo();
    }

    case "conceder_acesso": {
      const papel = String(b.papel ?? "");
      if (!uid || !modulo) return erro(400, "usuário ou módulo inválido");
      if (!papeisDe(modulo).includes(papel as Papel)) return erro(400, `papel inválido para ${modulo.label}`);
      await porta.acessos.conceder(uid, modulo.key, papel);
      return certo();
    }

    case "revogar_acesso": {
      if (!uid || !modulo) return erro(400, "usuário ou módulo inválido");
      await porta.acessos.revogar(uid, modulo.key);
      return certo();
    }

    case "admin_portal": {
      const u = await alvo();
      if (!u) return erro(404, "usuário não encontrado");
      if (souEu) return erro(400, "ninguém muda o próprio admin do portal");
      if (eSuper(porta, u.email)) return erro(400, "a super-admin é admin do portal pelo e-mail");
      await porta.acessos.marcarAdminPortal(uid, !!b.valor);
      return certo();
    }

    case "aplicar_perfil": {
      if (!uid) return erro(400, "user_id obrigatório");
      return aplicarPerfil(porta, uid, Number(b.perfil_id));
    }

    case "salvar_perfil": {
      if (!porta.perfis) return erro(400, "este portal não tem perfis de acesso");
      const nome = String(b.nome ?? "").trim();
      if (!nome) return erro(400, "nome do perfil obrigatório");
      const itens = itensValidos(porta, b.itens);
      const id = await porta.perfis.salvar({
        id: Number(b.id) || undefined,
        nome,
        descricao: b.descricao ? String(b.descricao) : null,
        ordem: Number.isFinite(Number(b.ordem)) ? Number(b.ordem) : 0,
        ativo: b.ativo !== false,
        itens,
      });
      return certo({ id });
    }

    case "excluir_perfil": {
      if (!porta.perfis) return erro(400, "este portal não tem perfis de acesso");
      const id = Number(b.id);
      if (!id) return erro(400, "id obrigatório");
      await porta.perfis.excluir(id);
      return certo();
    }

    default:
      return erro(400, "ação desconhecida");
  }
}

/** Admin de MÓDULO: só dar/tirar acesso nos módulos dele, sem o papel admin. */
async function travaEscopo(porta: PortaAcessos, escopo: string[], b: Record<string, unknown>): Promise<Resposta | null> {
  if (b.acao !== "conceder_acesso" && b.acao !== "revogar_acesso") return erro(403, "só o admin do portal faz isto");
  const modulo = String(b.modulo ?? "");
  if (!escopo.includes(modulo)) return erro(403, "você não administra este módulo");
  if (b.acao === "conceder_acesso" && String(b.papel) === "admin") return erro(403, "só o admin do portal dá o papel admin");
  const uid = String(b.user_id ?? "");
  const linhas = await porta.acessos.listar();
  if (linhas.some((l) => l.user_id === uid && l.modulo === modulo && l.papel === "admin"))
    return erro(403, "só o admin do portal mexe em quem é admin deste módulo");
  return null;
}

/** Só módulo da lista e papel que o módulo aceita. */
export function itensValidos(porta: Pick<PortaAcessos, "modulos">, itens: unknown): PerfilItem[] {
  const vistos = new Set<string>();
  return (Array.isArray(itens) ? itens : [])
    .map((i) => i as { modulo?: unknown; papel?: unknown })
    .filter((i) => {
      const m = porta.modulos.find((x) => x.key === String(i.modulo));
      if (!m || vistos.has(m.key) || !papeisDe(m).includes(String(i.papel) as Papel)) return false;
      vistos.add(m.key);
      return true;
    })
    .map((i) => ({ modulo: String(i.modulo), papel: String(i.papel) }));
}

async function aplicarPerfil(porta: PortaAcessos, uid: string, perfilId: number): Promise<Resposta> {
  if (!porta.perfis) return erro(400, "este portal não tem perfis de acesso");
  const perfis = (await porta.perfis.listar()) ?? [];
  const p = perfis.find((x) => x.id === perfilId);
  if (!p) return erro(404, "perfil não encontrado");
  const itens = itensValidos(porta, p.itens);
  if (!itens.length) return erro(400, "o perfil não tem módulos");
  for (const i of itens) await porta.acessos.conceder(uid, i.modulo, i.papel);
  return certo({ aplicados: itens.length });
}

// ---------------------------------------------------------------------------
// Atalhos para a porta, sobre o cliente Supabase com a SERVICE ROLE. Tipados
// por fora (sem importar o @supabase), só com o que se usa.
// ---------------------------------------------------------------------------
/* eslint-disable @typescript-eslint/no-explicit-any */
type Sb = any;
const falha = (r: { error?: { message?: string } | null }) => { if (r?.error) throw new Error(r.error.message ?? "erro no Supabase"); };

const paraLogin = (u: any): Login => ({
  id: u.id,
  email: u.email ?? "",
  nome: (u.user_metadata?.nome as string) ?? "",
  ultimo_acesso: u.last_sign_in_at ?? null,
  banido_ate: u.banned_until ?? null,
  app_metadata: u.app_metadata ?? {},
  user_metadata: u.user_metadata ?? {},
});

/** Os logins pelo Supabase Auth (iguais em todo portal). */
export function loginsSupabase(sb: Sb): PortaLogins {
  return {
    async listar() {
      const todos: Login[] = [];
      for (let page = 1; page <= 20; page++) {
        const r = await sb.auth.admin.listUsers({ page, perPage: 1000 });
        falha(r);
        const lote = r.data?.users ?? [];
        todos.push(...lote.map(paraLogin));
        if (lote.length < 1000) break;
      }
      return todos;
    },
    async ler(id) {
      const r = await sb.auth.admin.getUserById(id);
      return r.data?.user ? paraLogin(r.data.user) : null;
    },
    async criar({ email, senha, nome }) {
      const r = await sb.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        // A troca no 1º acesso é cobrada pelo proxy; a marca fica no
        // app_metadata, que o próprio usuário não grava.
        app_metadata: { [MARCA_TROCA]: true },
        ...(nome ? { user_metadata: { nome } } : {}),
      });
      falha(r);
      return r.data.user.id as string;
    },
    async atualizar(id, d) {
      const upd: Record<string, unknown> = {};
      if (d.email) { upd.email = d.email; upd.email_confirm = true; }
      if (d.user_metadata) upd.user_metadata = d.user_metadata;
      if (d.app_metadata) upd.app_metadata = d.app_metadata;
      if (d.senha) { upd.password = d.senha; upd.email_confirm = true; }
      if (d.ativo !== undefined) upd.ban_duration = d.ativo ? "none" : "876000h";
      falha(await sb.auth.admin.updateUserById(id, upd));
    },
    async excluir(id) {
      falha(await sb.auth.admin.deleteUser(id));
    },
  };
}

/** Acessos numa TABELA `user_modules(user_id, modulo, papel)` (fiscais, WR…). */
export function acessosUserModules(sb: Sb, tabela = "user_modules"): PortaGuarda {
  return {
    async listar() {
      const r = await sb.from(tabela).select("user_id,modulo,papel");
      falha(r);
      return (r.data ?? []) as LinhaAcesso[];
    },
    async conceder(user_id, modulo, papel) {
      falha(await sb.from(tabela).upsert({ user_id, modulo, papel }, { onConflict: "user_id,modulo" }));
    },
    async revogar(user_id, modulo) {
      falha(await sb.from(tabela).delete().eq("user_id", user_id).eq("modulo", modulo));
    },
    async marcarAdminPortal(user_id, valor) {
      falha(valor
        ? await sb.from(tabela).upsert({ user_id, modulo: MODULO_PORTAL, papel: "admin" }, { onConflict: "user_id,modulo" })
        : await sb.from(tabela).delete().eq("user_id", user_id).eq("modulo", MODULO_PORTAL));
    },
  };
}

/** Perfis nas tabelas `perfis_acesso` + `perfil_acesso_itens` (0012 dos fiscais). */
export function perfisTabelas(sb: Sb): PortaPerfis {
  return {
    async listar() {
      const [p, i] = await Promise.all([
        sb.from("perfis_acesso").select("id,nome,descricao,ordem,ativo").order("ordem"),
        sb.from("perfil_acesso_itens").select("perfil_id,modulo,papel"),
      ]);
      if (p.error || i.error) return null;
      return (p.data as Omit<Perfil, "itens">[]).map((x) => ({
        ...x,
        itens: (i.data as (PerfilItem & { perfil_id: number })[]).filter((it) => it.perfil_id === x.id).map(({ modulo, papel }) => ({ modulo, papel })),
      }));
    },
    async salvar(p) {
      const reg = { nome: p.nome, descricao: p.descricao, ordem: p.ordem, ativo: p.ativo };
      let id = p.id ?? 0;
      if (id) falha(await sb.from("perfis_acesso").update(reg).eq("id", id));
      else {
        const r = await sb.from("perfis_acesso").insert(reg).select("id").single();
        falha(r);
        id = r.data.id as number;
      }
      falha(await sb.from("perfil_acesso_itens").delete().eq("perfil_id", id));
      if (p.itens.length) falha(await sb.from("perfil_acesso_itens").insert(p.itens.map((x) => ({ perfil_id: id, ...x }))));
      return id;
    },
    async excluir(id) {
      falha(await sb.from("perfis_acesso").delete().eq("id", id));
    },
  };
}

/** A função do banco ainda não existe (a migração não foi aplicada). */
const semFuncao = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === "PGRST202" || e.code === "42883" || /could not find the function|does not exist/i.test(e.message ?? ""));

/**
 * Acessos gravados por FUNÇÕES do banco, com a SESSÃO de quem pede — a régua
 * fica dentro delas (core.acessos, Etapa 5 do catálogo):
 *   conceder_modulo(p_user_id, p_modulo, p_papel) · revogar_modulo(p_user_id, p_modulo)
 *   marcar_admin_portal(p_user_id, p_valor)
 * A leitura vai pela service role (`servico`). Sem a função no banco, cai na
 * tabela de sempre (`tabela`), com a service role — a rota já conferiu o admin.
 */
export function acessosFuncoes(sessao: Sb, servico: Sb, tabela = "user_modules"): PortaGuarda {
  const reserva = acessosUserModules(servico, tabela);
  const chama = async (fn: string, args: Record<string, unknown>, senao: () => Promise<void>) => {
    const r = await sessao.rpc(fn, args);
    if (!r?.error) return;
    if (semFuncao(r.error)) return senao();
    throw new Error(r.error.message ?? `falhou ${fn}`);
  };
  return {
    listar: reserva.listar,
    conceder: (user_id, modulo, papel) =>
      chama("conceder_modulo", { p_user_id: user_id, p_modulo: modulo, p_papel: papel }, () => reserva.conceder(user_id, modulo, papel)),
    revogar: (user_id, modulo) =>
      chama("revogar_modulo", { p_user_id: user_id, p_modulo: modulo }, () => reserva.revogar(user_id, modulo)),
    marcarAdminPortal: (user_id, valor) =>
      chama("marcar_admin_portal", { p_user_id: user_id, p_valor: valor }, () => reserva.marcarAdminPortal(user_id, valor)),
  };
}
