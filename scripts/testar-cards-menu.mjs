#!/usr/bin/env node
// Admin › Cards do menu (src/lib/cards-menu.ts, Etapa 3 do catálogo, 10/11/2026).
//   node --experimental-strip-types scripts/testar-cards-menu.mjs
import assert from "node:assert/strict";
import { register } from "node:module";
register("data:text/javascript," + encodeURIComponent(
  "export async function resolve(s,c,n){try{return await n(s,c)}catch(e){" +
  "if(/^\\.\\.?\\//.test(s)&&!/\\.[mc]?[jt]sx?$/.test(s))return n(s+'.ts',c);throw e}}"));
const { validarCard } = await import("../src/lib/cards-menu.ts");

let n = 0;
const ok = (nome, cond) => { assert.ok(cond, nome); n++; console.log("  ✓", nome); };
const base = { label: "Tributos", descricao: "DARFs e certidões", emoji: "⚖️", grupo: "Fiscal", ordem: "10", oculto: false };
const v = validarCard(base);
ok("card válido passa, com a ordem em número", v.ok && v.mudanca.ordem === 10 && v.mudanca.oculto === false);
ok("…e 'mostrar' desligado chega como oculto", (() => { const r = validarCard({ ...base, oculto: true }); return r.ok && r.mudanca.oculto; })());
ok("nome vazio recusa", !validarCard({ ...base, label: " " }).ok);
ok("nome de 61 letras recusa", !validarCard({ ...base, label: "x".repeat(61) }).ok);
ok("faixa inventada recusa", !validarCard({ ...base, grupo: "Marketing" }).ok);
ok("…a não ser a que o card JÁ tem", validarCard({ ...base, grupo: "Antiga" }, "Antiga").ok);
ok("ordem com letra recusa", !validarCard({ ...base, ordem: "dez" }).ok);
ok("ordem negativa recusa", !validarCard({ ...base, ordem: -1 }).ok);
ok("cinco emojis recusa", !validarCard({ ...base, emoji: "😀😀😀😀😀" }).ok);
ok("sem dizer se aparece recusa", !validarCard({ ...base, oculto: undefined }).ok);
const r = validarCard({ ...base, key: "x", href: "/x", so_admin: false, sem_gate: true });
ok("chave, endereço, so_admin e sem_gate NÃO entram na mudança", r.ok && !("key" in r.mudanca) && !("href" in r.mudanca) && !("so_admin" in r.mudanca) && !("sem_gate" in r.mudanca));
console.log(`\n${n} ok`);
