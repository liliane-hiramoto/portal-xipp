// O contrato portal ↔ Flórida (contrato.ts): a ação é conferida ANTES de gravar.
import { validarAcao, dataDaEntrega, soDigitos, desdeComFolga, conferirContagem } from "./contrato.ts";

let falhas = 0;
const t = (nome, obtido, esperado) => {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`  ${ok ? "✓" : "✗"} ${nome}${ok ? "" : ` → ${JSON.stringify(obtido)} ≠ ${JSON.stringify(esperado)}`}`);
};
const autor = { email: "tati@florida.com.br", nome: "Tati", origem: "florida" };

console.log("── validarAcao ──");
t("situação boa", validarAcao({ tipo: "situacao", id: 5, situacao: "ENTREGUE", autor }), null);
t("situação inventada", validarAcao({ tipo: "situacao", id: 5, situacao: "FEITO", autor }), "situação inválida");
t("sem autor", validarAcao({ tipo: "situacao", id: 5, situacao: "ENTREGUE" })?.startsWith("autor inválido"), true);
t("origem fora da lista", validarAcao({ tipo: "comentar", id: 5, texto: "oi", autor: { ...autor, origem: "x" } })?.startsWith("autor inválido"), true);
t("id zero", validarAcao({ tipo: "comentar", id: 0, texto: "oi", autor }), "id inválido");
t("comentário vazio", validarAcao({ tipo: "comentar", id: 5, texto: "  ", autor }), "comentário vazio");
t("responsável null = tirar", validarAcao({ tipo: "responsavel", id: 5, email: null, autor }), null);
t("responsável sem e-mail", validarAcao({ tipo: "responsavel", id: 5, email: "Pri", autor }), "responsável deve ser um e-mail ou null");
t("fim antes do início", validarAcao({ tipo: "horario", id: 5, hora_inicio: "10:00", hora_fim: "09:00", autor }), "o fim tem de ser depois do início");
t("horário bom", validarAcao({ tipo: "horario", id: 5, hora_inicio: "09:00", hora_fim: "10:30", autor }), null);
t("competência ruim", validarAcao({ tipo: "gerar_mes", competencia: "2026-13", autor }), "competência deve ser AAAA-MM");
t("CNPJ curto", validarAcao({ tipo: "salvar_atividade", atividade: { atividade: "DCTFWeb", empresa_cnpj: "123" }, autor }), "empresa_cnpj inválido");
t("CNPJ com máscara passa", validarAcao({ tipo: "salvar_atividade", atividade: { atividade: "DCTFWeb", empresa_cnpj: "12.345.678/0001-90" }, autor }), null);
t("tipo desconhecido", validarAcao({ tipo: "apagar_tudo", autor }), "tipo desconhecido");

console.log("── dataDaEntrega (a regra da tela, nos dois lados) ──");
t("entregue sem data ganha hoje", dataDaEntrega("ENTREGUE", null, "2026-11-09"), "2026-11-09");
t("entregue com data mantém", dataDaEntrega("ENTREGUE", "2026-11-05", "2026-11-09"), "2026-11-05");
t("pendente apaga a data", dataDaEntrega("PENDENTE", "2026-11-05", "2026-11-09"), null);
t("não se aplica não tem data", dataDaEntrega("NAO_SE_APLICA", null, "2026-11-09"), null);
t("CNPJ só dígitos", soDigitos("12.345.678/0001-90"), "12345678000190");

console.log("── folga do cursor ──");
t("volta 5 minutos", desdeComFolga("2026-11-09T10:15:00.000Z"), "2026-11-09T10:10:00.000Z");
t("sem cursor = tudo", desdeComFolga(null), null);
t("cursor ruim = tudo", desdeComFolga("ontem"), null);

console.log("── conferência por contagem ──");
t("bate", conferirContagem({ atividades: 3, ocorrencias: 90, comentarios: 4 }, { atividades: 3, ocorrencias: 90, comentarios: 4 }), null);
t("não bate diz onde", conferirContagem({ atividades: 3, ocorrencias: 90, comentarios: 4 }, { atividades: 3, ocorrencias: 89, comentarios: 4 }), "contagem não bate em ocorrencias (90 enviados, 89 gravados)");

if (falhas) { console.log(`\n✗ ${falhas} falha(s)`); process.exit(1); }
console.log("\n✓ contrato ok");
