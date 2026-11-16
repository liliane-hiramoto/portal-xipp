// A cópia que a Flórida guarda de cada portal (copia.ts).
import { planoDeCopia, exportacaoInvalida, portaisParaAvisar, textoDoAviso } from "./copia.ts";

let falhas = 0;
const t = (nome, obtido, esperado) => {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`  ${ok ? "✓" : "✗"} ${nome}${ok ? "" : ` → ${JSON.stringify(obtido)} ≠ ${JSON.stringify(esperado)}`}`);
};
const exp = (o) => ({ versao: 2, portal: { id: "rq", nome: "Portal RQ" }, cursor: "2026-11-09T10:15:00Z", completa: false,
  atividades: [], ocorrencias: [], comentarios: [], apagados: [], usuarios: [], empresas: [], ...o });
const na = { atividades: [1, 2, 3], ocorrencias: [10, 11], comentarios: [] };

console.log("── Completa troca tudo ──");
let p = planoDeCopia(exp({ completa: true, atividades: [{ id: 1 }, { id: 3 }], ocorrencias: [{ id: 11 }] }), na);
t("o que o portal não mandou sai", p.atividades.apagar, [2]);
t("ocorrência ausente sai", p.ocorrencias.apagar, [10]);
t("o que veio é gravado", p.atividades.gravar.map((a) => a.id), [1, 3]);

console.log("── Incremental nunca apaga por ausência ──");
p = planoDeCopia(exp({ atividades: [{ id: 4 }] }), na);
t("nada sai sem lápide", p.atividades.apagar, []);
t("a nova entra", p.atividades.gravar.map((a) => a.id), [4]);
p = planoDeCopia(exp({ apagados: [{ tabela: "ocorrencias", id: 10, apagado_em: "x" }, { tabela: "atividades", id: 2, apagado_em: "x" }] }), na);
t("lápide de ocorrência tira só ela", p.ocorrencias.apagar, [10]);
t("lápide de atividade tira só ela", p.atividades.apagar, [2]);
p = planoDeCopia(exp({ atividades: [{ id: 2 }], apagados: [{ tabela: "atividades", id: 2, apagado_em: "x" }] }), na);
t("linha que voltou junto com a lápide fica", p.atividades.apagar, []);
t("cursor vem da exportação", p.cursor, "2026-11-09T10:15:00Z");

console.log("── Exportação recusada ──");
t("versão velha", exportacaoInvalida(exp({ versao: 1 }), 2)?.startsWith("versão do contrato 1"), true);
t("sem lista", exportacaoInvalida({ ...exp({}), comentarios: undefined }, 2), "faltou a lista comentarios");
t("cursor ruim", exportacaoInvalida(exp({ cursor: "ontem" }), 2), "cursor inválido");
t("boa passa", exportacaoInvalida(exp({}), 2), null);

console.log("── Aviso: silêncio não é 'tudo certo' ──");
const agora = "2026-11-09T12:00:00Z";
const r = [
  { portal: "Portal RQ", ok: true, ultimaOk: "2026-11-09T11:45:00Z" },
  { portal: "Portal Affix", ok: false, erro: "HTTP 500", ultimaOk: "2026-11-09T11:45:00Z" },  // 15 min: não avisa
  { portal: "Portal WR", ok: false, erro: "chave inválida", ultimaOk: "2026-11-09T10:30:00Z" }, // 90 min
  { portal: "Portal Inexx", ok: false, erro: "tempo esgotado", ultimaOk: null },               // nunca
];
const av = portaisParaAvisar(r, agora);
t("falha isolada não avisa; parado há 1h+ e nunca copiou avisam", av.map((a) => a.portal), ["Portal Inexx", "Portal WR"]);
t("minutos", av.map((a) => a.minutos), [null, 90]);
const txt = textoDoAviso(av);
t("cartão diz quantos", txt.includes("2 portal(is)"), true);
t("cartão diz nunca copiou", txt.includes("Portal Inexx: nunca copiou"), true);
t("nada a avisar = null", textoDoAviso([]), null);

if (falhas) { console.log(`\n✗ ${falhas} falha(s)`); process.exit(1); }
console.log("\n✓ cópia ok");
