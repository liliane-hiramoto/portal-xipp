#!/usr/bin/env node
// ============================================================================
// Barra o "hoje" em UTC: `new Date().toISOString().slice(0, 10)` (ou `, 7)`, e
// o mesmo com `Date.now()`) devolve AMANHÃ das 21h à meia-noite em São Paulo.
// Hoje é `hojeYmd()` / `mesAtual()` de `src/lib/hoje.ts`.
//
//   node scripts/conferir-hoje.mjs
// ============================================================================
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const RUIM = /new Date\((Date\.now\(\)[^)]*)?\)\.toISOString\(\)\.(slice|substring)\(0, ?(10|7)\)|new Date\((Date\.now\(\)[^)]*)?\)\.toISOString\(\)\.split\(/;

const achados = [];
const varre = (dir) => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) varre(p);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(n)) {
      readFileSync(p, "utf8").split("\n").forEach((l, i) => {
        if (RUIM.test(l) && !/^\s*(\*|\/\/)/.test(l)) achados.push(`${p}:${i + 1}: ${l.trim()}`);
      });
    }
  }
};
varre("src");

if (achados.length) {
  for (const a of achados) console.error("❌ hoje em UTC:", a);
  console.error("\nUse hojeYmd() / mesAtual() de src/lib/hoje.ts.");
  process.exit(1);
}
console.log("✅ nenhum \"hoje\" em UTC no src/");
