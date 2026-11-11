// ============================================================================
// @grupo/acesso-core — o teste que vai JUNTO com o espelho.
//
//   1. Cada arquivo desta pasta tem de bater com a impressão digital (sha256)
//      do MANIFESTO.json. Nos portais, é isto que recusa o espelho editado à
//      mão: a mudança nasce no repositório acesso-core e é copiada para os
//      cinco, nunca o contrário.
//   2. Roda os testes de cada peça (*.teste.mjs) — os mesmos em todo portal.
//
//   node --experimental-strip-types src/testar.mjs                  (aqui)
//   node --experimental-strip-types src/vendor/acesso-core/testar.mjs (portal)
//   node src/testar.mjs --manifesto   regrava o MANIFESTO.json (SÓ no core)
// ============================================================================
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { register } from "node:module";

// As peças importam umas às outras SEM extensão ("./senha"), como o Next
// espera; o Node puro exige ".ts". Este gancho completa a extensão — só para o
// teste, só para import relativo.
register("data:text/javascript," + encodeURIComponent(
  "export async function resolve(s,c,n){try{return await n(s,c)}catch(e){" +
  "if(/^\\.\\.?\\//.test(s)&&!/\\.[mc]?[jt]sx?$/.test(s))return n(s+'.ts',c);throw e}}"));

const DIR = dirname(fileURLToPath(import.meta.url));
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const naPasta = readdirSync(DIR).filter((n) => n !== "MANIFESTO.json").sort();

if (process.argv.includes("--manifesto")) {
  const arquivos = Object.fromEntries(naPasta.map((n) => [n, sha(join(DIR, n))]));
  writeFileSync(join(DIR, "MANIFESTO.json"), JSON.stringify({ fonte: "liliane-hiramoto/acesso-core", arquivos }, null, 2) + "\n");
  console.log(`MANIFESTO.json regravado (${naPasta.length} arquivos).`);
  process.exit(0);
}

let passou = 0, falhou = 0;
const ok = (nome, cond, detalhe = "") => {
  if (cond) { passou++; console.log(`  ✓ ${nome}`); }
  else { falhou++; console.log(`  ✗ ${nome} ${detalhe}`); }
};
const eq = (nome, a, b) => ok(nome, JSON.stringify(a) === JSON.stringify(b), `→ ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

console.log("igual à fonte (acesso-core):");
const manifesto = JSON.parse(readFileSync(join(DIR, "MANIFESTO.json"), "utf8"));
eq("nenhum arquivo a mais ou a menos", naPasta, Object.keys(manifesto.arquivos).sort());
for (const [nome, h] of Object.entries(manifesto.arquivos)) {
  let atual = "(faltando)";
  try { atual = sha(join(DIR, nome)); } catch {}
  ok(`${nome} igual à fonte`, atual === h,
    "— editado no portal? A mudança nasce no repositório acesso-core e é copiada para os cinco.");
}

for (const n of naPasta.filter((n) => n.endsWith(".teste.mjs"))) {
  console.log(`\n${n}:`);
  const mod = await import(pathToFileURL(join(DIR, n)).href);
  await mod.default({ ok, eq });
}

console.log(`\n${passou} ok, ${falhou} falhou`);
if (falhou) process.exit(1);
