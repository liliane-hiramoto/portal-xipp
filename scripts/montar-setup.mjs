// Junta as migrações do modelo num arquivo só, supabase/SETUP-COMPLETO.sql —
// o que a usuária cola UMA vez no SQL Editor de um portal novo (em vez de dez
// arquivos na ordem certa). Cada migração é idempotente e traz o seu
// BEGIN/COMMIT; juntas, rodam de cima a baixo. A 0006 (grupo e empresa do
// portal) fica de fora: é de cada portal, e as empresas entram pela tela
// Cadastros.
//
//   node scripts/montar-setup.mjs            — escreve o arquivo
//   node scripts/montar-setup.mjs --conferir — falha se ele estiver desatualizado (CI)
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";

const DIR = "supabase/migrations";
const SAIDA = "supabase/SETUP-COMPLETO.sql";
const fora = new Set(["0006_empresa.sql"]);
const arquivos = readdirSync(DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f) && !fora.has(f)).sort();

const partes = arquivos.map((f) => `-- ==================== ${f} ====================\n${readFileSync(`${DIR}/${f}`, "utf8").trim()}\n`);
const texto = `-- SETUP COMPLETO do portal fiscal — GERADO por scripts/montar-setup.mjs, não edite.
-- Cole tudo no Supabase › SQL Editor do portal novo e clique em Run (uma vez).
-- Junta, na ordem: ${arquivos.join(", ")}.
-- A última tabela que aparece é a conferência do Consulta CPF (true · 2 · 2).

${partes.join("\n")}`;

if (process.argv.includes("--conferir")) {
  const atual = existsSync(SAIDA) ? readFileSync(SAIDA, "utf8") : "";
  if (atual !== texto) {
    console.error(`✗ ${SAIDA} está desatualizado — rode: node scripts/montar-setup.mjs`);
    process.exit(1);
  }
  console.log(`✓ ${SAIDA} em dia (${arquivos.length} migrações)`);
} else {
  writeFileSync(SAIDA, texto);
  console.log(`✓ ${SAIDA} escrito (${arquivos.length} migrações)`);
}
