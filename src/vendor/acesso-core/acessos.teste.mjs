// Teste da regra da tela de Acessos — vai junto no espelho. Uma porta de
// mentira, em memória, no lugar do Supabase.
import { listarAcessos, tratarAcao, itensValidos, acessosFuncoes, MODULO_PORTAL } from "./acessos.ts";

const SUPER = "dona@exemplo.com";
function portaFalsa(euId = "eu") {
  const logins = new Map([
    ["eu", { id: "eu", email: "eu@x.com", nome: "Eu", ultimo_acesso: null, banido_ate: null, app_metadata: {}, user_metadata: { nome: "Eu" } }],
    ["ana", { id: "ana", email: "ana@x.com", nome: "Ana", ultimo_acesso: null, banido_ate: null, app_metadata: {}, user_metadata: { nome: "Ana", outro: 1 } }],
    ["dona", { id: "dona", email: "Dona@Exemplo.com", nome: "", ultimo_acesso: null, banido_ate: null, app_metadata: {}, user_metadata: {} }],
    ["bia", { id: "bia", email: "bia@x.com", nome: "Bia", ultimo_acesso: null, banido_ate: "2999-01-01T00:00:00Z", app_metadata: {}, user_metadata: {} }],
  ]);
  let linhas = [
    { user_id: "eu", modulo: MODULO_PORTAL, papel: "admin" },
    { user_id: "ana", modulo: "fin", papel: "admin" },
    { user_id: "ana", modulo: "velho", papel: "editor" }, // módulo fora da lista
  ];
  let perfis = [{ id: 1, nome: "Contábil", descricao: null, ordem: 0, ativo: true, itens: [{ modulo: "fin", papel: "viewer" }, { modulo: "crono", papel: "editor" }] }];
  const log = [];
  const porta = {
    superAdmin: SUPER,
    euId,
    modulos: [{ key: "fin", label: "Financeiro" }, { key: "crono", label: "Cronograma", papeis: ["editor"] }],
    logins: {
      listar: async () => [...logins.values()],
      ler: async (id) => logins.get(id) ?? null,
      criar: async (d) => { logins.set("novo", { id: "novo", email: d.email, nome: d.nome, ultimo_acesso: null, banido_ate: null, app_metadata: { senha_provisoria: true } }); log.push(["criar", d]); return "novo"; },
      atualizar: async (id, d) => { log.push(["atualizar", id, d]); },
      excluir: async (id) => { logins.delete(id); log.push(["excluir", id]); },
    },
    acessos: {
      listar: async () => linhas,
      conceder: async (u, m, p) => { linhas = [...linhas.filter((l) => !(l.user_id === u && l.modulo === m)), { user_id: u, modulo: m, papel: p }]; },
      revogar: async (u, m) => { linhas = linhas.filter((l) => !(l.user_id === u && l.modulo === m)); },
      marcarAdminPortal: async (u, v) => { linhas = linhas.filter((l) => !(l.user_id === u && l.modulo === MODULO_PORTAL)); if (v) linhas.push({ user_id: u, modulo: MODULO_PORTAL, papel: "admin" }); },
    },
    perfis: {
      listar: async () => perfis,
      salvar: async (p) => { const id = p.id ?? 9; perfis = [...perfis.filter((x) => x.id !== id), { ...p, id }]; return id; },
      excluir: async (id) => { perfis = perfis.filter((x) => x.id !== id); },
    },
  };
  return { porta, log, linhas: () => linhas, perfis: () => perfis };
}

export default async function testeAcessos(t) {
  {
    const { porta } = portaFalsa();
    const d = await listarAcessos(porta, Date.parse("2026-11-11"));
    const ana = d.usuarios.find((u) => u.id === "ana");
    t.eq("lista em ordem de nome (sem nome, pelo e-mail)", d.usuarios.map((u) => u.id), ["ana", "bia", "dona", "eu"]);
    t.eq("só os módulos da lista aparecem na pessoa", ana.acessos, [{ modulo: "fin", papel: "admin" }]);
    t.ok("admin de MÓDULO não é admin do portal", ana.admin_portal === false);
    t.ok("a linha 'portal' é admin do portal", d.usuarios.find((u) => u.id === "eu").admin_portal);
    t.ok("super-admin pelo e-mail, sem maiúsculas", d.usuarios.find((u) => u.id === "dona").super_admin);
    t.ok("login bloqueado aparece inativo", d.usuarios.find((u) => u.id === "bia").ativo === false);
    t.eq("módulo sem papéis declarados aceita os três", d.modulos[0].papeis, ["viewer", "editor", "admin"]);
    t.eq("módulo 'tem ou não tem'", d.modulos[1].papeis, ["editor"]);
    t.eq("perfis vêm junto", d.perfis.length, 1);
    const semPerfis = await listarAcessos({ ...porta, perfis: undefined });
    t.ok("portal sem perfis: o campo nem existe", !("perfis" in semPerfis));
    const falta = await listarAcessos({ ...porta, perfis: { ...porta.perfis, listar: async () => { throw new Error("relation does not exist"); } } });
    t.eq("perfis sem a migração: null (a aba avisa)", falta.perfis, null);
  }
  {
    const { porta, log } = portaFalsa();
    const r = await tratarAcao(porta, { acao: "criar_usuario", email: " novo@x.com ", nome: "Novo" });
    t.ok("criar sem senha sorteia uma de 12", r.status === 200 && String(r.corpo.senha).length === 12);
    t.eq("criar limpa o e-mail", log[0][1].email, "novo@x.com");
    t.eq("senha curta é recusada", (await tratarAcao(porta, { acao: "criar_usuario", email: "a@x.com", senha: "123" })).status, 400);
    t.eq("e-mail vazio é recusado", (await tratarAcao(porta, { acao: "criar_usuario", email: "" })).status, 400);
  }
  {
    const { porta, linhas } = portaFalsa();
    await tratarAcao(porta, { acao: "criar_usuario", email: "c@x.com", perfil_id: 1 });
    t.eq("criar com perfil aplica os módulos", linhas().filter((l) => l.user_id === "novo").length, 2);
  }
  {
    const { porta, log } = portaFalsa();
    t.eq("ninguém se inativa", (await tratarAcao(porta, { acao: "ativo", user_id: "eu", valor: false })).status, 400);
    t.eq("ninguém se exclui", (await tratarAcao(porta, { acao: "excluir_usuario", user_id: "eu" })).status, 400);
    t.eq("super-admin não se inativa", (await tratarAcao(porta, { acao: "ativo", user_id: "dona", valor: false })).status, 400);
    t.eq("super-admin não se exclui", (await tratarAcao(porta, { acao: "excluir_usuario", user_id: "dona" })).status, 400);
    t.eq("e-mail da super-admin não se troca", (await tratarAcao(porta, { acao: "editar_usuario", user_id: "dona", email: "outra@x.com" })).status, 400);
    t.eq("ninguém muda o próprio admin do portal", (await tratarAcao(porta, { acao: "admin_portal", user_id: "eu", valor: false })).status, 400);
    t.eq("super-admin não precisa da marca", (await tratarAcao(porta, { acao: "admin_portal", user_id: "dona", valor: true })).status, 400);
    t.eq("inativar outra pessoa passa", (await tratarAcao(porta, { acao: "ativo", user_id: "ana", valor: false })).status, 200);
    t.eq("…e grava ativo=false", log.at(-1), ["atualizar", "ana", { ativo: false }]);
    await tratarAcao(porta, { acao: "editar_usuario", user_id: "ana", nome: "Ana Paula", email: "ana@x.com" });
    t.eq("editar guarda o resto do user_metadata e não reenvia o mesmo e-mail", log.at(-1), ["atualizar", "ana", { user_metadata: { nome: "Ana Paula", outro: 1 } }]);
    const s = await tratarAcao(porta, { acao: "trocar_senha", user_id: "ana" });
    t.ok("redefinir sorteia e marca a troca no app_metadata", s.status === 200 && log.at(-1)[2].app_metadata.senha_provisoria === true && log.at(-1)[2].senha === s.corpo.senha);
  }
  {
    const { porta, linhas } = portaFalsa();
    t.eq("papel fora do módulo é recusado", (await tratarAcao(porta, { acao: "conceder_acesso", user_id: "ana", modulo: "crono", papel: "admin" })).status, 400);
    t.eq("módulo fora da lista é recusado", (await tratarAcao(porta, { acao: "conceder_acesso", user_id: "ana", modulo: MODULO_PORTAL, papel: "admin" })).status, 400);
    t.eq("conceder passa", (await tratarAcao(porta, { acao: "conceder_acesso", user_id: "ana", modulo: "crono", papel: "editor" })).status, 200);
    await tratarAcao(porta, { acao: "revogar_acesso", user_id: "ana", modulo: "fin" });
    t.ok("revogar tira a linha", !linhas().some((l) => l.user_id === "ana" && l.modulo === "fin"));
    t.eq("revogar 'portal' pela porta de módulo é recusado", (await tratarAcao(porta, { acao: "revogar_acesso", user_id: "eu", modulo: MODULO_PORTAL })).status, 400);
    await tratarAcao(porta, { acao: "admin_portal", user_id: "ana", valor: true });
    t.ok("marcar admin do portal grava a linha 'portal'", linhas().some((l) => l.user_id === "ana" && l.modulo === MODULO_PORTAL));
  }
  {
    const { porta, perfis } = portaFalsa();
    t.eq("itens: só módulo da lista, papel aceito e sem repetir",
      itensValidos(porta, [{ modulo: "fin", papel: "editor" }, { modulo: "fin", papel: "admin" }, { modulo: "crono", papel: "viewer" }, { modulo: "x", papel: "admin" }]),
      [{ modulo: "fin", papel: "editor" }]);
    const r = await tratarAcao(porta, { acao: "salvar_perfil", nome: " Novo ", itens: [{ modulo: "crono", papel: "editor" }] });
    t.ok("salvar perfil novo", r.status === 200 && perfis().some((p) => p.nome === "Novo"));
    t.eq("perfil sem nome é recusado", (await tratarAcao(porta, { acao: "salvar_perfil", nome: " " })).status, 400);
    t.eq("perfil que não existe", (await tratarAcao(porta, { acao: "aplicar_perfil", user_id: "ana", perfil_id: 77 })).status, 404);
    t.eq("sem perfis no portal, salvar é recusado", (await tratarAcao({ ...porta, perfis: undefined }, { acao: "salvar_perfil", nome: "x" })).status, 400);
  }
  {
    const { porta } = portaFalsa();
    const quebra = { ...porta, acessos: { ...porta.acessos, conceder: async () => { throw new Error("banco fora"); } } };
    const r = await tratarAcao(quebra, { acao: "conceder_acesso", user_id: "ana", modulo: "fin", papel: "viewer" });
    t.ok("erro da porta vira 500 com a mensagem (não some)", r.status === 500 && r.corpo.error === "banco fora");
    t.eq("ação desconhecida", (await tratarAcao(porta, { acao: "xyz" })).status, 400);
  }
  await testePortaFuncoes(t);
  await testeEscopo(t);
  await testeEstrelaFicha(t);
}

export async function testePortaFuncoes(t) {
  const chamadas = [];
  const tabelaFalsa = () => {
    const q = { _op: null, upsert(v) { chamadas.push(["tabela.upsert", v]); return Promise.resolve({ error: null }); },
      delete() { return { eq: () => ({ eq: () => { chamadas.push(["tabela.delete"]); return Promise.resolve({ error: null }); } }) }; },
      select() { return Promise.resolve({ data: [{ user_id: "a", modulo: "fin", papel: "viewer" }], error: null }); } };
    return { from: () => q };
  };
  const sessao = (erro) => ({ rpc: async (fn, args) => { chamadas.push(["rpc", fn, args]); return { error: erro }; } });

  let p = acessosFuncoes(sessao(null), tabelaFalsa());
  await p.conceder("a", "fin", "editor");
  t.eq("com a função: grava pela função, com a sessão", chamadas.at(-1), ["rpc", "conceder_modulo", { p_user_id: "a", p_modulo: "fin", p_papel: "editor" }]);
  await p.marcarAdminPortal("a", true);
  t.eq("admin do portal pela marcar_admin_portal", chamadas.at(-1)[1], "marcar_admin_portal");
  t.eq("lê pela service role", (await p.listar()).length, 1);

  p = acessosFuncoes(sessao({ code: "PGRST202", message: "Could not find the function" }), tabelaFalsa());
  await p.conceder("a", "fin", "editor");
  t.eq("sem a função: cai na tabela", chamadas.at(-1)[0], "tabela.upsert");

  p = acessosFuncoes(sessao({ code: "42501", message: "Só o admin do portal concede." }), tabelaFalsa());
  let msg = "";
  try { await p.conceder("a", "fin", "editor"); } catch (e) { msg = e.message; }
  t.eq("recusa da régua NÃO cai na tabela: vira erro", msg, "Só o admin do portal concede.");
}

export async function testeEscopo(t) {
  let linhas = [
    { user_id: "ana", modulo: "fin", papel: "admin" },
    { user_id: "bia", modulo: "fin", papel: "viewer" },
    { user_id: "bia", modulo: "outro", papel: "editor" },
  ];
  const login = (id) => ({ id, email: `${id}@x.com`, nome: id, ultimo_acesso: null, banido_ate: null });
  const porta = {
    superAdmin: "dona@x.com", euId: "eu", escopo: ["fin"],
    modulos: [{ key: "fin", label: "Financeiro" }, { key: "outro", label: "Outro" }],
    logins: { listar: async () => ["ana", "bia", "cris"].map(login), ler: async (id) => login(id), criar: async () => "x", atualizar: async () => {}, excluir: async () => {} },
    acessos: {
      listar: async () => linhas,
      conceder: async (u, m, p) => { linhas = [...linhas.filter((l) => !(l.user_id === u && l.modulo === m)), { user_id: u, modulo: m, papel: p }]; },
      revogar: async (u, m) => { linhas = linhas.filter((l) => !(l.user_id === u && l.modulo === m)); },
      marcarAdminPortal: async () => {},
    },
    perfis: { listar: async () => [], salvar: async () => 1, excluir: async () => {} },
  };
  const d = await listarAcessos(porta);
  t.eq("admin de módulo vê só os módulos dele", d.modulos.map((m) => m.key), ["fin"]);
  t.eq("…e o papel admin não é oferecido", d.modulos[0].papeis, ["viewer", "editor"]);
  t.eq("…e o que a pessoa tem fora dele não aparece", d.usuarios.find((u) => u.id === "bia").acessos, [{ modulo: "fin", papel: "viewer" }]);
  t.ok("…sem perfis, com o escopo dito", !("perfis" in d) && d.escopo[0] === "fin");
  t.eq("dar acesso no módulo dele passa", (await tratarAcao(porta, { acao: "conceder_acesso", user_id: "cris", modulo: "fin", papel: "editor" })).status, 200);
  t.eq("dar o papel admin é recusado", (await tratarAcao(porta, { acao: "conceder_acesso", user_id: "cris", modulo: "fin", papel: "admin" })).status, 403);
  t.eq("módulo que não administra é recusado", (await tratarAcao(porta, { acao: "conceder_acesso", user_id: "cris", modulo: "outro", papel: "viewer" })).status, 403);
  t.eq("mexer em quem é admin do módulo é recusado", (await tratarAcao(porta, { acao: "revogar_acesso", user_id: "ana", modulo: "fin" })).status, 403);
  for (const acao of ["criar_usuario", "trocar_senha", "ativo", "excluir_usuario", "admin_portal", "salvar_perfil", "aplicar_perfil", "editar_usuario"])
    t.eq(`admin de módulo não faz "${acao}"`, (await tratarAcao(porta, { acao, user_id: "bia", email: "a@x.com", nome: "x" })).status, 403);
}

export async function testeEstrelaFicha(t) {
  let linhas = [
    { user_id: "ana", modulo: "fin", papel: "editor", admin_modulo: true },
    { user_id: "bia", modulo: "fin", papel: "viewer" },
  ];
  let ficha = { ana: { nome_completo: "Ana Souza", telefone: "11999990000" } };
  const login = (id) => ({ id, email: `${id}@x.com`, nome: id, ultimo_acesso: null, banido_ate: null });
  const base = {
    superAdmin: "dona@x.com", euId: "eu",
    modulos: [{ key: "fin", label: "Financeiro" }],
    logins: { listar: async () => ["ana", "bia", "eu"].map(login), ler: async (id) => login(id), criar: async () => "x", atualizar: async () => {}, excluir: async () => {} },
    acessos: {
      listar: async () => linhas,
      conceder: async (u, m, p) => { linhas = [...linhas.filter((l) => !(l.user_id === u && l.modulo === m)), { user_id: u, modulo: m, papel: p }]; },
      revogar: async (u, m) => { linhas = linhas.filter((l) => !(l.user_id === u && l.modulo === m)); },
      marcarAdminModulo: async (u, m, v) => { linhas = linhas.map((l) => (l.user_id === u && l.modulo === m ? { ...l, admin_modulo: v } : l)); },
    },
    ficha: {
      campos: [{ key: "nome_completo", label: "Nome completo" }, { key: "telefone", label: "Telefone", tipo: "telefone" }, { key: "nascimento", label: "Nascimento", tipo: "data" }],
      ler: async () => ficha,
      salvar: async (u, v) => { ficha = { ...ficha, [u]: v }; },
    },
  };
  const d = await listarAcessos(base);
  t.eq("recursos: sem admin do portal pela tela, com ★ e ficha", [d.recursos.adminPortal, d.recursos.estrela, d.recursos.ficha.length], [false, true, 3]);
  t.ok("a ★ vem na pessoa", d.usuarios.find((u) => u.id === "ana").acessos[0].admin_modulo === true);
  t.eq("a ficha vem na pessoa", d.usuarios.find((u) => u.id === "ana").ficha.nome_completo, "Ana Souza");
  t.eq("sem marcarAdminPortal, admin do portal é recusado", (await tratarAcao(base, { acao: "admin_portal", user_id: "bia", valor: true })).status, 400);
  t.eq("★ em quem tem o módulo passa", (await tratarAcao(base, { acao: "admin_modulo", user_id: "bia", modulo: "fin", valor: true })).status, 200);
  t.ok("…e grava", linhas.find((l) => l.user_id === "bia").admin_modulo === true);
  await tratarAcao(base, { acao: "revogar_acesso", user_id: "bia", modulo: "fin" });
  t.eq("★ em quem não tem o módulo é recusada", (await tratarAcao(base, { acao: "admin_modulo", user_id: "bia", modulo: "fin", valor: true })).status, 400);
  t.eq("ninguém muda a própria ★", (await tratarAcao(base, { acao: "admin_modulo", user_id: "eu", modulo: "fin", valor: true })).status, 400);
  t.eq("ficha: data errada é recusada", (await tratarAcao(base, { acao: "salvar_ficha", user_id: "ana", ficha: { nascimento: "31/12/1990" } })).status, 400);
  await tratarAcao(base, { acao: "salvar_ficha", user_id: "ana", ficha: { nome_completo: " Ana P. ", telefone: "(11) 98888-7777", nascimento: "1990-12-31" } });
  t.eq("ficha: limpa o texto e o telefone, vazio vira null", ficha.ana, { nome_completo: "Ana P.", telefone: "11988887777", nascimento: "1990-12-31" });

  const escopo = { ...base, euId: "bia", escopo: ["fin"] };
  linhas = [{ user_id: "ana", modulo: "fin", papel: "editor", admin_modulo: true }, { user_id: "bia", modulo: "fin", papel: "editor", admin_modulo: true }, { user_id: "cris", modulo: "fin", papel: "viewer" }];
  const de = await listarAcessos(escopo);
  t.ok("admin de módulo não vê ficha nem ★", de.recursos.ficha === null && de.recursos.estrela === false && !("ficha" in de.usuarios[0]));
  t.eq("admin de módulo não mexe em quem tem a ★", (await tratarAcao(escopo, { acao: "revogar_acesso", user_id: "ana", modulo: "fin" })).status, 403);
  t.eq("admin de módulo não mexe no próprio acesso", (await tratarAcao(escopo, { acao: "conceder_acesso", user_id: "bia", modulo: "fin", papel: "viewer" })).status, 403);
  t.eq("admin de módulo não dá ★", (await tratarAcao(escopo, { acao: "admin_modulo", user_id: "cris", modulo: "fin", valor: true })).status, 403);
  t.eq("admin de módulo não grava ficha", (await tratarAcao(escopo, { acao: "salvar_ficha", user_id: "cris", ficha: {} })).status, 403);
  t.eq("…mas mexe em quem não é admin", (await tratarAcao(escopo, { acao: "conceder_acesso", user_id: "cris", modulo: "fin", papel: "editor" })).status, 200);
}
