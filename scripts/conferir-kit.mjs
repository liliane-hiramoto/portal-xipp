// conferir-kit.mjs — o TETO de peças de tela desenhadas à mão.
//
// O kit de tela canônico é o kit-core (src/vendor/kit-core, Fase 3 da
// padronização dos portais, 19/10/2026). Decidido com a usuária: a tela que
// existe passa ao kit quando for mexida por outro motivo — nada muda de visual
// de uma vez. Mas cópia NOVA não nasce: este script conta as que existem e o
// número só pode DESCER. Migrou uma tela? Baixe o teto aqui no mesmo PR.
//
//   número em destaque à mão  → <Kpi>/<Kpis> de @/vendor/kit-core/kpi
//   fundo de janela à mão     → <Janela> de @/vendor/kit-core/janela
//   formatador de R$ à mão    → fmtMoney de @/lib/format (que vem do kit)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const TETO = { kpi: 4, janela: 2, dinheiro: 1 };

const REGRAS = {
  kpi: /\bfunction (Kpi|KpiL|Card|Cartao|Indicador|Numero|Resumo)\s*\(/g,
  janela: /fixed inset-0[^"'`\n]*bg-(black|slate-900)\//g,
  dinheiro: /(new Intl\.NumberFormat|toLocaleString)\([^)]*currency/g,
};

const arquivos = [];
(function anda(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) { if (n !== "vendor" && n !== "node_modules") anda(p); continue; }
    if (/\.(tsx?|jsx?)$/.test(n) && !p.endsWith("lib/format.ts")) arquivos.push(p);
  }
})("src");

const conta = Object.fromEntries(Object.keys(REGRAS).map((k) => [k, 0]));
for (const p of arquivos) {
  const s = readFileSync(p, "utf8");
  for (const [k, re] of Object.entries(REGRAS)) conta[k] += (s.match(re) ?? []).length;
}
if (process.argv.includes("--contar")) { console.log(JSON.stringify(conta)); process.exit(0); }

let ruim = 0;
for (const k of Object.keys(REGRAS)) {
  if (conta[k] > TETO[k]) { ruim++; console.log(`✗ ${k}: ${conta[k]} cópias à mão (teto ${TETO[k]}) — use a peça do kit-core`); }
  else if (conta[k] < TETO[k]) console.log(`↓ ${k}: ${conta[k]} (teto ${TETO[k]}) — baixe o teto para ${conta[k]} neste PR`);
  else console.log(`✓ ${k}: ${conta[k]} (teto)`);
}
process.exit(ruim ? 1 : 0);
