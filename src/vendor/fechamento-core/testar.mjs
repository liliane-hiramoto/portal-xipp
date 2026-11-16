// ============================================================================
// fechamento-core — o teste que vai JUNTO com o espelho (o modelo do kit-core).
//
//   1. Cada arquivo desta pasta tem de bater com a impressão digital (sha256)
//      do MANIFESTO.json. Nos portais, é isto que recusa o espelho editado à
//      mão: a mudança nasce no repositório fechamento-core e é copiada para
//      os portais, nunca o contrário.
//   2. Roda cada *.teste.mjs em node puro, com o fuso de São Paulo.
//
//   node src/testar.mjs                                (aqui)
//   node src/vendor/fechamento-core/testar.mjs         (portal)
//   node src/testar.mjs --manifesto   regrava o MANIFESTO.json (SÓ no core)
// ============================================================================
import { readFileSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const DIR = dirname(fileURLToPath(import.meta.url));
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const listar = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? listar(p) : [relative(DIR, p)];
});
const naPasta = listar(DIR).filter((n) => n !== "MANIFESTO.json").sort();

if (process.argv.includes("--manifesto")) {
  const arquivos = Object.fromEntries(naPasta.map((n) => [n, sha(join(DIR, n))]));
  writeFileSync(join(DIR, "MANIFESTO.json"), JSON.stringify({ fonte: "liliane-hiramoto/fechamento-core", arquivos }, null, 2) + "\n");
  console.log(`MANIFESTO.json regravado (${naPasta.length} arquivos).`);
  process.exit(0);
}

// As peças importam umas às outras SEM extensão ("./prazo"), como o Next espera;
// o Node puro exige ".ts". Este gancho completa a extensão — só no teste.
const GANCHO = "export async function resolve(s,c,n){try{return await n(s,c)}catch(e){" +
  "if(/^\\.\\.?\\//.test(s)&&!/\\.[mc]?[jt]sx?$/.test(s))return n(s+'.ts',c);throw e}}";
const COMPLETA_EXTENSAO = "data:text/javascript," + encodeURIComponent(
  `import{register}from"node:module";register(${JSON.stringify("data:text/javascript," + encodeURIComponent(GANCHO))});`);

let falhou = 0;
console.log("igual à fonte (fechamento-core):");
const manifesto = JSON.parse(readFileSync(join(DIR, "MANIFESTO.json"), "utf8"));
const esperados = Object.keys(manifesto.arquivos).sort();
if (JSON.stringify(esperados) !== JSON.stringify(naPasta)) {
  falhou++; console.log(`  ✗ arquivos a mais ou a menos → ${naPasta.filter((n) => !esperados.includes(n)).concat(esperados.filter((n) => !naPasta.includes(n))).join(", ")}`);
}
for (const [nome, h] of Object.entries(manifesto.arquivos)) {
  let atual = "(faltando)";
  try { atual = sha(join(DIR, nome)); } catch {}
  if (atual !== h) { falhou++; console.log(`  ✗ ${nome} — editado no portal? A mudança nasce no fechamento-core.`); }
}
if (!falhou) console.log(`  ✓ ${esperados.length} arquivos iguais à fonte`);

for (const n of naPasta.filter((n) => n.endsWith(".teste.mjs"))) {
  console.log(`\n${n}:`);
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--import", COMPLETA_EXTENSAO, join(DIR, n)], {
    stdio: "inherit", env: { ...process.env, TZ: "America/Sao_Paulo" },
  });
  if (r.status !== 0) falhou++;
}
if (falhou) { console.log(`\n✗ fechamento-core: ${falhou} problema(s)`); process.exit(1); }
console.log("\n✓ fechamento-core ok");
