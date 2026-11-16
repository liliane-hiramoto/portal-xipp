// AS CONTAS BANCÁRIAS da empresa — com tela, no cadastro, e não espalhadas.
//
// No RQ a conta morava em três lugares (a Folha, o cadastro do IZII e a lista
// que reconhece o extrato), e o do banco diverge calado, até o arquivo voltar
// recusado (03/11/2026). Aqui é a conta: banco (código COMPE), agência, conta e
// os dígitos, o convênio quando há, e se é a conta que PAGA (a do CNAB/remessa).
//
// `contaDoExtrato` reconhece de quem é um extrato pela conta que ele traz: o
// OFX escreve a conta de vários jeitos ("12345-6", "0000123456", "0001 12345-6"),
// então a comparação é pelos dígitos, sem zeros à esquerda, com ou sem o DV.

export interface ContaBancaria {
  id?: number | string;
  empresa_id?: number | string | null;
  /** Código COMPE, 3 dígitos (336 C6, 237 Bradesco…). */
  banco: string;
  agencia?: string | null;
  agencia_dv?: string | null;
  conta: string;
  conta_dv?: string | null;
  /** Código do convênio no banco (identifica a empresa no arquivo de remessa). */
  convenio?: string | null;
  apelido?: string | null;
  /** A conta pela qual a empresa PAGA (CNAB, remessa). Uma por empresa. */
  principal?: boolean | null;
  ativo?: boolean | null;
}

export const BANCOS: Record<string, string> = {
  "001": "Banco do Brasil", "033": "Santander", "077": "Inter", "104": "Caixa",
  "208": "BTG Pactual", "212": "Original", "237": "Bradesco", "260": "Nubank",
  "290": "PagBank", "323": "Mercado Pago", "336": "C6 Bank", "341": "Itaú",
  "348": "XP", "380": "PicPay", "422": "Safra", "655": "Votorantim", "748": "Sicredi", "756": "Sicoob",
};

const dig = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const semZeros = (s: string) => s.replace(/^0+(?=\d)/, "");

/** "1" → "001"; vazio fica vazio. */
export const codigoBanco = (b: string | number | null | undefined) => { const d = dig(String(b ?? "")); return d ? d.padStart(3, "0").slice(-3) : ""; };

/** "C6 Bank (336)". Banco fora da lista: só o código. */
export const nomeBanco = (b: string | number | null | undefined) => { const c = codigoBanco(b); return c ? (BANCOS[c] ? `${BANCOS[c]} (${c})` : c) : ""; };

/** "336 · ag 0001 · cc 12345-6". */
export function rotuloConta(c: ContaBancaria): string {
  const ag = c.agencia ? `ag ${c.agencia}${c.agencia_dv ? `-${c.agencia_dv}` : ""}` : "";
  const cc = `cc ${c.conta}${c.conta_dv ? `-${c.conta_dv}` : ""}`;
  return [nomeBanco(c.banco), ag, cc].filter(Boolean).join(" · ");
}

/** O que falta na conta para ela servir num arquivo de banco. Lista vazia = pronta. */
export function faltaNaConta(c: Partial<ContaBancaria>): string[] {
  const f: string[] = [];
  if (!codigoBanco(c.banco)) f.push("banco");
  if (!dig(c.agencia)) f.push("agência");
  if (!dig(c.conta)) f.push("conta");
  return f;
}

/** As formas da conta que um extrato pode escrever: com o DV e sem, sem zeros à esquerda. */
function formas(c: Pick<ContaBancaria, "conta" | "conta_dv">): string[] {
  const conta = semZeros(dig(c.conta));
  const dv = dig(c.conta_dv);
  const f = new Set([conta]);
  if (dv) f.add(semZeros(conta + dv));
  return [...f].filter(Boolean);
}

/**
 * A conta do cadastro que o extrato traz (banco + conta do OFX: BANKID e
 * ACCTID). O banco tem de bater quando o extrato o informa. Duas contas
 * casando é "não sei" — a importação pergunta, não escolhe.
 */
export function contaDoExtrato<C extends ContaBancaria>(
  contas: C[],
  extrato: { banco?: string | null; conta?: string | null },
): { conta: C } | { conta: null; motivo: "nenhuma" | "ambigua"; candidatas: C[] } {
  const b = codigoBanco(extrato.banco);
  const bruto = dig(extrato.conta);
  if (!bruto) return { conta: null, motivo: "nenhuma", candidatas: [] };
  // O OFX pode trazer a agência colada na frente ("0001123456"): casa pelo FIM.
  const alvo = semZeros(bruto);
  // A agência colada só vale se for a DESTA conta: casar só pelo fim ("…56789")
  // pegava conta de outra empresa que termina igual.
  const agencias = (c: ContaBancaria) => {
    const a = dig(c.agencia);
    return new Set([semZeros(a), semZeros(a + dig(c.agencia_dv))].filter((x) => x && x !== "0"));
  };
  const casa = contas.filter((c) => (c.ativo ?? true)
    && (!b || codigoBanco(c.banco) === b)
    && formas(c).some((f) => alvo === f
      || (alvo.endsWith(f) && agencias(c).has(semZeros(alvo.slice(0, alvo.length - f.length))))));
  if (casa.length === 1) return { conta: casa[0] };
  return { conta: null, motivo: casa.length ? "ambigua" : "nenhuma", candidatas: casa };
}

/** A conta que paga: a marcada como principal; sem marca, a única ativa; senão nenhuma. */
export function contaQuePaga<C extends ContaBancaria>(contas: C[]): C | null {
  const ativas = contas.filter((c) => c.ativo ?? true);
  return ativas.find((c) => c.principal) ?? (ativas.length === 1 ? ativas[0] : null);
}
