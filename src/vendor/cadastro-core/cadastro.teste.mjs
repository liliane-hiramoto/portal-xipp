// Teste do cadastro-core — vai junto no espelho. A rede é de mentira.
import { cnpjValido, cpfValido, formatarDoc, situacaoCnpj, situacaoDoc, raizCnpj, mesmoDocumento } from "./documento.ts";
import { mapearReceita, respostaDaEmpresa, mesclarCadastro, consultarReceita, NAO_INFORMADO } from "./receita.ts";
import {
  normalizarVigencias, vigenteEm, planejarMudancaRegime, efeitoTroca, definirRegime, definirAliquotas,
  moverVigencia, removerVigencia, rotuloPeriodo, deDatas, paraDatas, DESDE_SEMPRE,
} from "./vigencia.ts";
import { papeisDe, rotuloPapeis, acharEmpresa, cnpjsRepetidos, nomeCurto } from "./etiquetas.ts";
import { codigoBanco, nomeBanco, rotuloConta, faltaNaConta, contaDoExtrato, contaQuePaga } from "./conta.ts";

export default async function teste(t) {
  // ── documento ───────────────────────────────────────────────────────────
  t.ok("CNPJ numérico válido", cnpjValido("11.659.040/0001-66"));
  t.ok("separador errado com 14 dígitos: inválido pelo DV", !cnpjValido("29.321.531/0001=69"));
  t.ok("CNPJ alfanumérico (exemplo da Receita) válido", cnpjValido("12.ABC.345/01DE-35"));
  t.ok("alfanumérico com DV errado: inválido", !cnpjValido("12ABC34501DE36"));
  t.ok("todos iguais não existe", !cnpjValido("00000000000000"));
  t.ok("CPF válido", cpfValido("529.982.247-25") && !cpfValido("529.982.247-24"));
  t.eq("máscara no CNPJ alfanumérico", formatarDoc("12abc34501de35"), "12.ABC.345/01DE-35");
  t.eq("lixo volta como veio (não esconde o erro)", formatarDoc("XX.XXX.XXX/0001-XX"), "XX.XXX.XXX/0001-XX");
  t.eq("situação", [situacaoCnpj(""), situacaoCnpj("11659040000166"), situacaoDoc("123")], ["vazio", "ok", "invalido"]);
  t.eq("raiz", raizCnpj("11.659.040/0001-66"), "11659040");
  t.ok("mesmo documento sem a máscara; vazio nunca é igual", mesmoDocumento("11.659.040/0001-66", "11659040000166") && !mesmoDocumento("", ""));

  // ── Receita ─────────────────────────────────────────────────────────────
  const bruto = {
    cnpj: "11659040000166", razao_social: "IZII S/A", nome_fantasia: "", municipio: "SAO PAULO", uf: "SP",
    descricao_tipo_de_logradouro: "AVENIDA", logradouro: "MARQUES DE SAO VICENTE", numero: "1619", cep: "01139003",
    data_inicio_atividade: "2010-03-01", ddd_telefone_1: "1131516327", cnae_fiscal: 6202300, cnae_fiscal_descricao: "Desenvolvimento",
    opcao_pelo_simples: null, data_exclusao_do_simples: "2019-01-01",
    qsa: [{ nome_socio: "FULANO DE TAL", qualificacao_socio: "Presidente", cnpj_cpf_do_socio: "***123456**", data_entrada_sociedade: "2010-03-01" }, { nome_socio: "" }],
  };
  const d = mapearReceita(bruto);
  t.eq("endereço, CEP e data no formato do Cartão CNPJ", [d.cadastro.logradouro, d.cadastro.cep, d.cadastro.abertura, d.cadastro.telefone], ["AVENIDA MARQUES DE SAO VICENTE", "01.139-003", "01/03/2010", "(11) 3151-6327"]);
  t.eq("fantasia vazia vira nulo", d.nome_fantasia, null);
  t.eq("null no Simples = NÃO optante (com a data da exclusão)", d.cadastro.simples_nacional, "NÃO optante pelo Simples Nacional (excluída em 01/01/2019)");
  t.eq("chave ausente = não informado", d.cadastro.simei, NAO_INFORMADO);
  t.eq("QSA sem a linha sem nome", d.qsa.map((s) => s.nome), ["FULANO DE TAL"]);
  t.ok("resposta de outro CNPJ não grava", respostaDaEmpresa("11.659.040/0001-66", bruto) && !respostaDaEmpresa("12.ABC.345/01DE-35", bruto));
  t.eq("mescla só onde a Receita trouxe valor", mesclarCadastro({ email: "a@x", cep: "1" }, { email: null, cep: "2" }), { email: "a@x", cep: "2" });
  {
    const urls = [];
    const f = async (url) => { urls.push(url); return url.includes("brasilapi") ? { ok: false, status: 403, json: async () => ({}) } : { ok: true, status: 200, json: async () => bruto }; };
    const r = await consultarReceita("11.659.040/0001-66", f);
    t.ok("BrasilAPI recusa → Minha Receita responde", r.ok && urls.length === 2 && urls[1].endsWith("/11659040000166"));
    const nf = await consultarReceita("11659040000166", async () => ({ ok: false, status: 404, json: async () => ({}) }));
    t.ok("404 é resposta: não tenta a outra", !nf.ok && nf.erro.includes("não encontrou"));
    t.ok("CNPJ curto nem consulta", !(await consultarReceita("123", f)).ok);
  }

  // ── vigência ────────────────────────────────────────────────────────────
  const base = [{ inicio: "2026-05", regime: "presumido", pis: 0.65 }, { inicio: DESDE_SEMPRE, regime: "simples", das: 6 }];
  const n = normalizarVigencias(base);
  t.eq("ordena e deriva o fim", n.map((v) => [v.inicio, v.fim]), [[DESDE_SEMPRE, "2026-04"], ["2026-05", null]]);
  t.eq("vigente no mês e numa data", [vigenteEm(base, "2026-04")?.regime, vigenteEm(base, "2026-05-31")?.regime], ["simples", "presumido"]);
  t.eq("sem período: nenhum", vigenteEm([], "2026-01"), null);
  const troca = planejarMudancaRegime([], "presumido", "2027-01", { regime: "simples", das: 6, iss: 2 });
  t.eq("sem período, a troca cria o histórico E o novo", troca.map((v) => [v.inicio, v.regime, v.das]), [[DESDE_SEMPRE, "simples", 6], ["2027-01", "presumido", 6]]);
  t.eq("o novo herda as alíquotas do anterior", troca[1].iss, 2);
  t.eq("efeito: regime novo / só período / nada", [
    efeitoTroca(base, "real", "2026-06").efeito, efeitoTroca(base, "presumido", "2026-06").efeito, efeitoTroca(base, "presumido", "2026-05").efeito,
  ], ["regime-novo", "so-novo-periodo", "sem-efeito"]);
  t.eq("definir regime de um período", definirRegime(base, "2026-05", "real").map((v) => v.regime), ["simples", "real"]);
  t.eq("definir alíquota não mexe no regime nem na data", definirAliquotas(base, "2026-05", { pis: 1, inicio: "2030-01", regime: "x" })[1], { inicio: "2026-05", regime: "presumido", pis: 1, fim: null });
  t.eq("mover o início refaz o fim", moverVigencia(base, "2026-05", "2026-08")[0].fim, "2026-07");
  t.eq("o único período não sai", removerVigencia([base[0]], "2026-05").length, 1);
  t.eq("rótulos", n.map(rotuloPeriodo), ["até abr/26", "desde mai/26"]);
  const rq = deDatas([{ id: 1, inicio: null, fim: "2026-03-31", regime: "presumido" }, { id: 2, inicio: "2026-04-01", fim: null, regime: "simples" }]);
  t.eq("datas do RQ → meses (o fim gravado se refaz)", rq.map((v) => [v.id, v.inicio, v.fim]), [[1, DESDE_SEMPRE, "2026-03"], [2, "2026-04", null]]);
  t.eq("meses → datas (fim no último dia, fevereiro incluso)", paraDatas([{ inicio: DESDE_SEMPRE }, { inicio: "2028-03" }]).map((v) => [v.inicio, v.fim]), [[null, "2028-02-29"], ["2028-03-01", null]]);

  // ── etiquetas ───────────────────────────────────────────────────────────
  const emps = [
    { id: 1, apelido: "IZII", cnpj: "11.659.040/0001-66", e_propria: true, e_cliente: true },
    { id: 2, razao_social: "Cliente Ltda", cnpj: "12ABC34501DE35", e_cliente: true },
    { id: 3, apelido: "Dup", cnpj: "11659040000166" },
    { id: 4, nome_fantasia: "Newco", cnpj: "" },
    { id: 5, nome_fantasia: "Newco" },
  ];
  t.eq("papéis", [papeisDe(emps[0]), rotuloPapeis(emps[0]), rotuloPapeis(emps[3])], [["propria", "cliente"], "Do grupo · Cliente", "sem etiqueta"]);
  t.eq("nome curto", nomeCurto(emps[1]), "Cliente Ltda");
  t.eq("CNPJ casa sem máscara", acharEmpresa(emps.slice(0, 2), { cnpj: "12.ABC.345/01DE-35" }).empresa?.id, 2);
  t.eq("CNPJ repetido no cadastro é ambíguo", acharEmpresa(emps, { cnpj: "11659040000166" }).por, "ambigua");
  t.eq("filial pela raiz só quando pedida", [acharEmpresa(emps.slice(0, 2), { cnpj: "11659040000247" }).por, acharEmpresa(emps.slice(0, 2), { cnpj: "11659040000247" }, { raiz: true }).por], ["nenhuma", "raiz"]);
  t.eq("nome que aponta duas empresas não decide", acharEmpresa(emps, { nome: "newco" }).por, "ambigua");
  t.eq("nome sem acento e caixa", acharEmpresa(emps, { nome: "  izii " }).empresa?.id, 1);
  t.eq("diagnóstico de CNPJ repetido", cnpjsRepetidos(emps).map((g) => g.map((e) => e.id)), [[1, 3]]);

  // ── contas ──────────────────────────────────────────────────────────────
  t.eq("código e nome do banco", [codigoBanco(1), nomeBanco("336"), nomeBanco("999")], ["001", "C6 Bank (336)", "999"]);
  const contas = [
    { id: 1, banco: "336", agencia: "0001", conta: "12345678", conta_dv: "9" },
    { id: 2, banco: "237", agencia: "1234", conta: "0056789", conta_dv: "0", principal: true },
    { id: 3, banco: "237", agencia: "1234", conta: "99999", ativo: false },
  ];
  t.eq("rótulo", rotuloConta(contas[1]), "Bradesco (237) · ag 1234 · cc 0056789-0");
  t.eq("o que falta", faltaNaConta({ banco: "336", conta: "1" }), ["agência"]);
  t.eq("OFX com o DV colado", contaDoExtrato(contas, { banco: "336", conta: "123456789" }).conta?.id, 1);
  t.eq("OFX sem o DV e com zeros", contaDoExtrato(contas, { banco: "0237", conta: "00056789" }).conta?.id, 2);
  t.eq("OFX com a agência na frente", contaDoExtrato(contas, { conta: "0001 12345678-9" }).conta?.id, 1);
  t.eq("fim igual com outra agência não casa", contaDoExtrato(contas, { conta: "9999 56789-0" }).motivo, "nenhuma");
  t.eq("banco diferente não casa", contaDoExtrato(contas, { banco: "341", conta: "123456789" }).motivo, "nenhuma");
  t.eq("conta inativa não reconhece", contaDoExtrato(contas, { banco: "237", conta: "99999" }).motivo, "nenhuma");
  t.eq("a que paga: a principal", contaQuePaga(contas)?.id, 2);
  t.eq("sem principal e duas ativas: nenhuma", contaQuePaga(contas.slice(0, 1).concat({ id: 9, banco: "1", conta: "1" })), null);
}
