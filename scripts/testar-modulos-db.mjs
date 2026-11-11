#!/usr/bin/env node
// ============================================================================
// O Menu Principal lido do BANCO (Etapa 2 do catálogo, src/lib/modulos-db.ts).
// (1) a semente da 0014 é a lista do código; (2) com o banco igual a ela, o menu
// e quem vê o quê saem IDÊNTICOS aos de hoje; (3) banco mudo devolve o código;
// (4) o banco nunca tira o "só admin" do código; (5) as leituras caem no
// user_modules quando a view falta.
//
//   node --experimental-strip-types scripts/testar-modulos-db.mjs
// ============================================================================
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";

// As libs importam sem extensão ("./modulos"), como o Next espera; o Node puro
// exige ".ts". O mesmo gancho do testar.mjs do kit-core.
register("data:text/javascript," + encodeURIComponent(
  "export async function resolve(s,c,n){try{return await n(s,c)}catch(e){" +
  "if(/^\\.\\.?\\//.test(s)&&!/\\.[mc]?[jt]sx?$/.test(s))return n(s+'.ts',c);throw e}}"));

const { MODULOS } = await import("../src/lib/modulos.ts");
const { cardsDoMenu, cardsVisiveis, ehAdminPortal, lerAcessos, lerModulos, modDaLinha } = await import("../src/lib/modulos-db.ts");

let n = 0;
const ok = (nome, f) => { f(); n++; console.log("  ✓", nome); };
const J = (x) => JSON.stringify(x);

// A semente do SQL, lida do próprio arquivo.
const sql = readFileSync(new URL("../supabase/migrations/0014_core_modulos_acessos.sql", import.meta.url), "utf8");
const re = /\('([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']*)', (true|false), (true|false), (\d+)\)/g;
const semente = [...sql.matchAll(re)].map((m) => ({
  key: m[1], label: m[2], descricao: m[3], emoji: m[4], href: m[5], grupo: m[6], status: m[7],
  sem_gate: m[8] === "true", so_admin: m[9] === "true", ordem: Number(m[10]),
  atalho_de: null, externo: false, oculto: false, ativo: true,
}));

console.log("a semente da 0014 é a lista do código:");
ok(`os ${MODULOS.length} cards estão na semente`, () => assert.equal(semente.length, MODULOS.length));
for (const m of MODULOS) ok(`${m.key}: nome, descrição, ícone, destino, faixa, pronto, Cadastros e só-admin iguais`, () => {
  const s = semente.find((l) => l.key === m.key);
  assert.ok(s, "ausente na semente");
  assert.deepEqual(
    [s.label, s.descricao, s.emoji, s.href, s.grupo, s.status === "ativo", s.sem_gate, s.so_admin],
    [m.titulo, m.desc, m.icon, m.href, m.faixa, m.ready, !!m.semGate, !!m.soAdmin]);
});

const tela = (cs) => J(cs.map((m) => [m.key, m.titulo, m.desc, m.icon, m.href, m.faixa, m.ready, !!m.semGate, !!m.soAdmin]));
const porFaixa = (cs) => J(["Fiscal", "Configurações"].map((f) => cs.filter((m) => m.faixa === f).map((m) => m.key)));
console.log("\ncom o banco igual à semente, nada muda:");
ok("os mesmos cards, na mesma ordem dentro de cada faixa", () => assert.equal(porFaixa(cardsDoMenu([...semente].reverse())), porFaixa(MODULOS)));
ok("…com os mesmos textos", () => assert.equal(J(JSON.parse(tela(cardsDoMenu(semente))).sort()), J(JSON.parse(tela(MODULOS)).sort())));
const perfis = {
  "admin do portal (vê tudo)": [{ portal: "admin" }, true],
  "admin SÓ do tributos (não é admin do portal)": [{ tributos: "admin" }, false],
  "sem módulo nenhum": [{}, false],
  "tributos e cnpj": [{ tributos: "viewer", cnpj: "viewer" }, false],
};
for (const [nome, [mods, adm]] of Object.entries(perfis)) ok(`quem vê o quê, igual a hoje: ${nome}`, () => {
  // A regra do PortalHub antes do banco: admin do portal vê tudo; os outros,
  // Cadastros (semGate) e os módulos que têm — Acessos ("admin") não é módulo.
  const hoje = MODULOS.filter((m) => (adm ? true : m.semGate ? true : m.key in mods)).map((m) => m.key).sort();
  assert.deepEqual(cardsVisiveis(cardsDoMenu(semente), mods, adm).map((m) => m.key).sort(), hoje);
});
ok("admin do portal = super-admin ou a linha 'portal' (0013)", () =>
  assert.deepEqual([ehAdminPortal("LILIANE.HIRAMOTO@grupoflorida.com.br", {}), ehAdminPortal("x@y", { portal: "admin" }), ehAdminPortal("x@y", { tributos: "admin" })], [true, true, false]));

console.log("\nbanco mudo devolve o código:");
ok("nulo", () => assert.equal(cardsDoMenu(null), MODULOS));
ok("vazio", () => assert.equal(cardsDoMenu([]), MODULOS));
ok("tudo inativo", () => assert.equal(cardsDoMenu(semente.map((l) => ({ ...l, ativo: false }))), MODULOS));

console.log("\no banco muda o card, sem tirar acesso:");
ok("renomear no banco muda o nome", () => assert.equal(cardsDoMenu(semente.map((l) => (l.key === "cnpj" ? { ...l, label: "CNPJ" } : l))).find((m) => m.key === "cnpj").titulo, "CNPJ"));
ok("nome vazio cai no do código", () => assert.equal(modDaLinha({ ...semente.find((l) => l.key === "cnpj"), label: "  " }).titulo, "Consulta CNPJ + Simples Nacional"));
ok("faixa desconhecida cai na do código", () => assert.equal(modDaLinha({ ...semente.find((l) => l.key === "y570"), grupo: "Marketing" }).faixa, "Fiscal"));
ok("'breve' no banco = em breve na tela (Consulta CPF)", () => assert.equal(cardsDoMenu(semente).find((m) => m.key === "cpf").ready, false));
ok("…e a etiqueta 'pendente Serpro' continua (é do código)", () => assert.equal(cardsDoMenu(semente).find((m) => m.key === "cpf").etiqueta, "pendente Serpro"));
ok("oculto some do menu", () => assert.ok(!cardsDoMenu(semente.map((l) => (l.key === "y570" ? { ...l, oculto: true } : l))).some((m) => m.key === "y570")));
ok("o banco NÃO tira o só-admin do Acessos", () => {
  const solto = cardsDoMenu(semente.map((l) => ({ ...l, so_admin: false })));
  assert.deepEqual(cardsVisiveis(solto, { tributos: "viewer" }, false).map((m) => m.key).filter((k) => k === "admin"), []);
});
ok("…e pode pôr só-admin num card novo", () => assert.ok(modDaLinha({ ...semente[0], key: "novo", so_admin: true }).soAdmin));
ok("card novo só no banco aparece para quem tem o módulo", () => {
  const novo = { ...semente[0], key: "contratos", label: "Contratos", href: "/contratos", ordem: 50 };
  assert.ok(cardsVisiveis(cardsDoMenu([...semente, novo]), { contratos: "viewer" }, false).some((m) => m.key === "contratos"));
});
ok("atalho: quem abre é o módulo dono", () => {
  const atalho = { ...semente[0], key: "aprovacoes", label: "Aprovação", href: "/tributos?aba=darf", atalho_de: "tributos", ordem: 60 };
  assert.ok(cardsVisiveis(cardsDoMenu([...semente, atalho]), { tributos: "viewer" }, false).some((m) => m.key === "aprovacoes"));
});

console.log("\nas leituras:");
const falso = (resp) => { const pedidos = []; const f = async (t, _c, fi) => {
  pedidos.push(`${t}${fi ? `?${fi.coluna}=${fi.valor}` : ""}`);
  const r = resp[t]; if (r === "explode") throw new Error("relation does not exist"); return r ?? { data: null, error: "sem tabela" };
}; f.pedidos = pedidos; return f; };
assert.equal(await lerModulos(falso({ modulos: { data: null, error: { code: "42P01" } } })), null); n++; console.log("  ✓ lerModulos: view ausente → null");
const velha = [{ modulo: "tributos", papel: "editor" }];
const nova = [{ modulo: "tributos", papel: "editor", admin_modulo: false }];
const b1 = falso({ acessos: { data: nova, error: null }, user_modules: { data: velha, error: null } });
assert.deepEqual(await lerAcessos(b1, "u1"), nova); n++; console.log("  ✓ lerAcessos: a tabela nova responde");
assert.equal(b1.pedidos[0], "acessos?user_id=u1"); n++; console.log("  ✓ …sempre filtrada pela pessoa");
assert.deepEqual(await lerAcessos(falso({ acessos: { data: null, error: "schema" }, user_modules: { data: velha, error: null } }), "u1"), velha); n++; console.log("  ✓ lerAcessos: sem a view → o user_modules");
assert.deepEqual(await lerAcessos(falso({ acessos: { data: [], error: null }, user_modules: { data: velha, error: null } }), "u1"), velha); n++; console.log("  ✓ lerAcessos: nova vazia → confere a velha (não tira acesso)");
assert.deepEqual(await lerAcessos(falso({ acessos: "explode", user_modules: "explode" }), "u1"), []); n++; console.log("  ✓ lerAcessos: tudo explode → nenhum acesso, sem exceção");
assert.equal(await lerModulos(falso({ modulos: "explode" })), null); n++; console.log("  ✓ lerModulos: exceção → null");

console.log(`\n${n} ok`);
