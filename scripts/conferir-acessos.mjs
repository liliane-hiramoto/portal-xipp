#!/usr/bin/env node
// Desde a Etapa 5 do catálogo (11/11/2026), `public.user_modules` é VIEW sobre
// core.acessos, com a RLS de lá: o admin do portal enxerga as linhas de TODOS.
// Duas regras, conferidas em todo src/ (menos src/vendor):
//   1. LER user_modules com a sessão tem de filtrar pela pessoa (.eq("user_id", …))
//      — sem isso, um maybeSingle() quebra com dois admins e o ehAdmin() diz "não";
//   2. GRAVAR nela não existe mais: conceder/revogar/admin do portal passam pelas
//      funções do banco (a porta acessosFuncoes do acesso-core).
//   node scripts/conferir-acessos.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const arquivos = [];
const andar = (d) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) { if (n !== "vendor" && n !== "node_modules") andar(p); }
    else if (/\.(ts|tsx)$/.test(n)) arquivos.push(p);
  }
};
andar("src");

const erros = [];
for (const f of arquivos) {
  const txt = readFileSync(f, "utf8");
  for (const m of txt.matchAll(/from\(\s*["']user_modules["']\s*\)/g)) {
    // A cadeia da consulta: até o fim da instrução (o primeiro ";").
    const fim = txt.indexOf(";", m.index);
    const cadeia = txt.slice(m.index, fim < 0 ? undefined : fim);
    const linha = txt.slice(0, m.index).split("\n").length;
    if (/\.(upsert|insert|update|delete)\s*\(/.test(cadeia)) erros.push(`${f}:${linha}: grava direto em user_modules — use as funções do banco`);
    else if (!/\.eq\(\s*["']user_id["']/.test(cadeia)) erros.push(`${f}:${linha}: lê user_modules sem .eq("user_id", …) — o admin enxerga as linhas de todos`);
  }
}
if (erros.length) { console.log(erros.join("\n")); process.exit(1); }
console.log(`✓ user_modules: toda leitura filtra a pessoa e nenhuma gravação direta (${arquivos.length} arquivos)`);
