// Consulta CPF do Serpro: validação da entrada e leitura da resposta.
// node --experimental-strip-types scripts/testar-serpro-cpf.mjs
import { cpfValido, nascimentoParaSerpro, lerRespostaCpf, dataSerpro, mensagemStatus } from "../src/lib/serpro/cpf.ts";

let falhas = 0;
const t = (nome, obtido, esperado) => {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "  ✓" : "  ✗"} ${nome}${ok ? "" : `  → ${JSON.stringify(obtido)} (esperado ${JSON.stringify(esperado)})`}`);
};
t("CPF válido (de teste do Serpro)", cpfValido("404.428.201-35"), true);
t("CPF com dígito errado", cpfValido("40442820134"), false);
t("CPF todo igual", cpfValido("11111111111"), false);
t("nascimento vira DDMMAAAA", nascimentoParaSerpro("1970-11-14", "2026-10-30"), "14111970");
t("data que não existe", nascimentoParaSerpro("2001-02-30", "2026-10-30"), null);
t("data futura", nascimentoParaSerpro("2027-01-01", "2026-10-30"), null);
t("data do Serpro DDMMAAAA → calendário", dataSerpro("14111970"), "1970-11-14");
const r = lerRespostaCpf({ ni: "40442820135", nome: "NOME DE TESTE", nomeSocial: "", situacao: { codigo: "0", descricao: "Regular" }, nascimento: "14111970", dataInscricao: "01011990" }, "404.428.201-35");
t("resposta: cpf, nome, situação", [r.cpf, r.nome, r.situacao_codigo, r.situacao_descricao], ["40442820135", "NOME DE TESTE", "0", "Regular"]);
t("resposta: nome social vazio vira nulo", r.nome_social, null);
t("resposta: datas no calendário", [r.nascimento, r.data_inscricao], ["1970-11-14", "1990-01-01"]);
t("404 avisa que foi cobrada", /cobrada/.test(mensagemStatus(404)), true);
console.log(falhas ? `\n✗ ${falhas} falha(s)` : "\n✓ serpro cpf ok");
process.exit(falhas ? 1 : 0);
