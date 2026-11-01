// conferir-senha.mjs — nenhuma senha fixa no código.
//
// Até 18/10/2026 toda conta nova nascia com a mesma senha, escrita no servidor
// e num componente do navegador (pública no .js do site). Hoje a provisória é
// sorteada (`senhaProvisoria()`, src/lib/senha.ts). Este script barra a volta:
// a senha antiga por extenso, uma constante SENHA_PADRAO ou `password: "…"`.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const PROIBIDO = [/Florida20\d\d/, /SENHA_PADRAO/, /password:\s*["'`][^"'`]+["'`]/];
const achados = [];
(function anda(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) { if (n !== "vendor") anda(p); continue; }
    if (!/\.(ts|tsx|js|mjs)$/.test(n)) continue;
    readFileSync(p, "utf8").split("\n").forEach((l, i) => {
      if (PROIBIDO.some((re) => re.test(l))) achados.push(`${p}:${i + 1}: ${l.trim()}`);
    });
  }
})("src");
if (achados.length) {
  console.log("✗ senha fixa no código (use senhaProvisoria() de src/lib/senha.ts):");
  for (const a of achados) console.log("  " + a);
  process.exit(1);
}
console.log("✅ nenhuma senha fixa no src/");
