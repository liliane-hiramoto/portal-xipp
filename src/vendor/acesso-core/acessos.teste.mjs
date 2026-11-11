// Teste da regra da tela de Acessos — vai junto no espelho. Uma porta de
// mentira, em memória, no lugar do Supabase.
import { listarAcessos, tratarAcao, itensValidos, MODULO_PORTAL } from "./acessos.ts";

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
}
