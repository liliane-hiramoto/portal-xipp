// Recorte das empresas de um portal de cliente (src/lib/fechamento/recorte.ts).
//   TZ=America/Sao_Paulo node --experimental-strip-types supabase/testes/fechamento-recorte.mjs
import { empresasDoPortal } from "./recorte.ts";

let falhas = 0;
const t = (nome, obtido, esperado) => {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "  ✓" : "  ✗"} ${nome.padEnd(62)} ${JSON.stringify(obtido)}${ok ? "" : ` (esperado ${JSON.stringify(esperado)})`}`);
};

// Grupo 1 = Affix (empresas 10, 11, 12); grupo 2 = Inexx (20, 21); sem grupo: 30, 31.
const E = [
  { id: 10, grupoId: 1 }, { id: 11, grupoId: 1 }, { id: 12, grupoId: 1 },
  { id: 20, grupoId: 2 }, { id: 21, grupoId: 2 },
  { id: 30, grupoId: null }, { id: 31, grupoId: null },
];

console.log("── Recorte do portal ──");
t("nada marcado = nada", empresasDoPortal(E, [], []), []);
t("grupo sem empresa escolhida = o grupo inteiro", empresasDoPortal(E, [1], []), [10, 11, 12]);
t("grupo com empresa escolhida = só as escolhidas", empresasDoPortal(E, [1], [11]), [11]);
t("um grupo inteiro e o outro recortado", empresasDoPortal(E, [1, 2], [20]), [10, 11, 12, 20]);
t("empresa sem grupo entra sozinha", empresasDoPortal(E, [], [30]), [30]);
t("empresa de grupo NÃO marcado entra sozinha", empresasDoPortal(E, [1], [21]), [10, 11, 12, 21]);
t("empresa cadastrada depois entra no grupo inteiro",
  empresasDoPortal([...E, { id: 13, grupoId: 1 }], [1], []), [10, 11, 12, 13]);

if (falhas) { console.log(`\n✗ ${falhas} falha(s)`); process.exit(1); }
console.log("\n✓ recorte ok");
