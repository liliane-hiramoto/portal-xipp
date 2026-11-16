// Rituais no portal (rituais.ts): a ação é conferida ANTES de gravar, e as
// regras da tela (situação, decisão, histórico, recorte) são uma só nos dois lados.
import {
  validarAcaoRitual, situacaoPendencia, mudancaDeSituacao, nascimentoDaDecisao,
  mudancasDaPendencia, tocaEmpresas, conferirPacote, conferirContagemRituais, contarPacote,
} from "./rituais.ts";

let falhas = 0;
const t = (nome, obtido, esperado) => {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`  ${ok ? "✓" : "✗"} ${nome}${ok ? "" : ` → ${JSON.stringify(obtido)} ≠ ${JSON.stringify(esperado)}`}`);
};
const autor = { email: "dani@florida.com.br", nome: "Dani", origem: "florida" };
const CNPJ = "12345678000190";
const pend = (o = {}) => ({
  reuniao_id: null, natureza: "ACAO", tema: null, acao: "Enviar o balancete", contexto: null, prazo: null,
  prazo_texto: null, bola_com: null, identificada_em: null, cliente_nome: null, empresa_cnpjs: [], responsaveis: [], ...o,
});

console.log("── validarAcaoRitual ──");
t("abrir bom", validarAcaoRitual({ tipo: "abrir_checkpoint", data: "2026-11-10", empresa_cnpjs: [], pautas: [{ titulo: "Status", area: "", minutos: 10, fonte: "livre" }], autor }), null);
t("abrir com CNPJ curto", validarAcaoRitual({ tipo: "abrir_checkpoint", data: "2026-11-10", empresa_cnpjs: ["123"], pautas: [], autor }), "empresa_cnpjs deve ser uma lista de CNPJs");
t("abrir com pauta sem título", validarAcaoRitual({ tipo: "abrir_checkpoint", data: "2026-11-10", empresa_cnpjs: [], pautas: [{ titulo: " ", minutos: 5 }], autor }), "pauta sem título");
t("sem autor", validarAcaoRitual({ tipo: "excluir_pendencia", id: 3 })?.startsWith("autor inválido"), true);
t("cancelar sem motivo", validarAcaoRitual({ tipo: "situacao_checkpoint", id: 1, situacao: "CANCELADA", motivo: "", autor }), "cancelada exige o motivo");
t("cancelar com motivo", validarAcaoRitual({ tipo: "situacao_checkpoint", id: 1, situacao: "CANCELADA", motivo: "feriado", autor }), null);
t("fim antes do início", validarAcaoRitual({ tipo: "detalhes_checkpoint", id: 1, data: "2026-11-10", local: null, hora_inicio: "10:00", hora_fim: "09:00", empresa_cnpjs: [], autor }), "o fim tem de ser depois do início");
t("pendência sem texto", validarAcaoRitual({ tipo: "salvar_pendencia", pendencia: pend({ acao: "  " }), autor }), "descreva a pendência");
t("pendência boa", validarAcaoRitual({ tipo: "salvar_pendencia", pendencia: pend({ empresa_cnpjs: [CNPJ], responsaveis: [{ email: "ju@wr.com", nome_livre: null }] }), autor }), null);
t("responsável com e-mail E nome", validarAcaoRitual({ tipo: "salvar_pendencia", pendencia: pend({ responsaveis: [{ email: "ju@wr.com", nome_livre: "Ju" }] }), autor }), "cada responsável é um e-mail OU um nome livre");
t("responsável nome livre", validarAcaoRitual({ tipo: "salvar_pendencia", pendencia: pend({ responsaveis: [{ email: null, nome_livre: "Contador" }] }), autor }), null);
t("bola inventada", validarAcaoRitual({ tipo: "salvar_pendencia", pendencia: pend({ bola_com: "NINGUEM" }), autor }), "bola_com deve ser FLORIDA|CLIENTE");
t("situação de pendência inventada", validarAcaoRitual({ tipo: "situacao_pendencia", id: 2, situacao: "FEITA", autor }), "situação inválida");
t("anotação vazia", validarAcaoRitual({ tipo: "anotar", id: 2, texto: " ", autor }), "anotação vazia");
t("mover para o lado", validarAcaoRitual({ tipo: "mover_pauta", pauta_id: 2, direcao: 2, autor }), "direcao deve ser -1|1");
t("tipo desconhecido", validarAcaoRitual({ tipo: "apagar_tudo", autor }), "tipo desconhecido");

console.log("── situação ──");
t("aberta sem andamento = em andamento", situacaoPendencia("ABERTA", null), "EM_ANDAMENTO");
t("aberta aguardando", situacaoPendencia("ABERTA", "AGUARDANDO"), "AGUARDANDO");
t("concluída vence o andamento", situacaoPendencia("CONCLUIDA", "AGUARDANDO"), "CONCLUIDA");
t("concluir data hoje", mudancaDeSituacao("CONCLUIDA", "2026-11-09"), { status: "CONCLUIDA", concluida_em: "2026-11-09" });
t("reabrir apaga a data", mudancaDeSituacao("NAO_INICIADA", "2026-11-09"), { status: "ABERTA", concluida_em: null, andamento: "NAO_INICIADA" });
t("decisão nasce concluída", nascimentoDaDecisao("DECISAO", "2026-11-09"), { status: "CONCLUIDA", concluida_em: "2026-11-09" });
t("pendência nasce aberta", nascimentoDaDecisao("ACAO", "2026-11-09"), { status: "ABERTA", concluida_em: null });

console.log("── mudancasDaPendencia (a linha do histórico) ──");
const a = pend({ prazo: "2026-11-10", responsaveis: [{ email: "ju@wr.com", nome_livre: null }] });
t("nada mudou", mudancasDaPendencia(a, { ...a }), []);
t("prazo", mudancasDaPendencia(a, { ...a, prazo: "2026-11-20" }), ["prazo: 10/11/2026 → 20/11/2026"]);
t("bola", mudancasDaPendencia(a, { ...a, bola_com: "CLIENTE" }), ["agora está com o cliente"]);
t("responsáveis pelo nome", mudancasDaPendencia(a, { ...a, responsaveis: [{ email: "dani@florida.com.br", nome_livre: null }] },
  (e) => ({ "ju@wr.com": "Ju", "dani@florida.com.br": "Dani" })[e] ?? e), ["responsáveis: +Dani, −Ju"]);
t("e-mail em maiúscula é o mesmo", mudancasDaPendencia(a, { ...a, responsaveis: [{ email: "JU@wr.com", nome_livre: null }] }), []);

console.log("── tocaEmpresas (o recorte por empresa) ──");
t("Checkpoint de todas vê tudo", tocaEmpresas([CNPJ], []), true);
t("pendência de todas aparece em qualquer", tocaEmpresas([], [CNPJ]), true);
t("outra empresa não", tocaEmpresas(["98765432000110"], [CNPJ]), false);
t("com máscara casa", tocaEmpresas(["12.345.678/0001-90"], [CNPJ]), true);

console.log("── pacote do histórico ──");
const pac = {
  versao: 1,
  reunioes: [{ id: 7, data: "2026-11-03" }],
  pautas: [{ id: 1, reuniao_id: 7 }],
  acoes: [{ id: 4, reuniao_id: 7 }, { id: 5, reuniao_id: null }],
  responsaveis: [{ acao_id: 4 }],
  historico: [{ id: 9, acao_id: 5 }],
};
t("coerente", conferirPacote(pac), null);
t("pauta órfã", conferirPacote({ ...pac, pautas: [{ id: 1, reuniao_id: 8 }] }), "há pauta de Checkpoint que não está no pacote");
t("histórico órfão", conferirPacote({ ...pac, historico: [{ id: 9, acao_id: 6 }] }), "há histórico de pendência que não está no pacote");
t("duas na mesma data", conferirPacote({ ...pac, reunioes: [{ id: 7, data: "2026-11-03" }, { id: 8, data: "2026-11-03" }] }), "dois Checkpoints na mesma data (é um por cliente por data)");
t("contagem", contarPacote(pac), { reunioes: 1, pautas: 1, acoes: 2, responsaveis: 1, historico: 1 });
t("contagem que não bate", conferirContagemRituais(contarPacote(pac), { ...contarPacote(pac), historico: 0 }), "contagem não bate em historico (1 enviados, 0 gravados)");

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log("\nrituais: ok");
