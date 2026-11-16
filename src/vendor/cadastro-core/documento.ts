// Validação de CNPJ e CPF pelo DÍGITO VERIFICADOR — não só pelo formato.
// (Veio do Portal Inexx, src/lib/cnpj.ts, o único que já lia o CNPJ alfanumérico.)
//
// Checar formato não bastava, e a produção provou três vezes: o cadastro do HDS
// ficou meses com "298720" (curto), depois recebeu "XX.XXX.XXX/0001-XX" (um
// exemplo colado sem querer) e depois "29.321.531/0001=68" (separador errado).
// O terceiro tem 14 dígitos e passaria por qualquer checagem de tamanho — mas
// só o dígito verificador diz se o número EXISTE.
//
// Um cadastro assim não avisa nada: a empresa simplesmente para de casar com a
// folha e com as NFs, e a tela mostra "não reconhecida" como se o arquivo é que
// estivesse errado.
//
// CNPJ ALFANUMÉRICO (em vigor desde julho/2026): os 12 primeiros caracteres
// podem ter letras, e os 2 dígitos verificadores continuam numéricos. O cálculo
// é o mesmo, trocando "o dígito" por "código ASCII menos 48" — que para os
// algarismos dá o próprio valor. Uma implementação serve para os dois formatos;
// tratar só o numérico rejeitaria um CNPJ novo válido.

/** Só letras e números, em caixa alta (tira máscara, espaço e lixo). */
export const soAlnum = (s?: string | null): string =>
  (s || "").toUpperCase().replace(/[^0-9A-Z]/g, "");

/** Só dígitos — para CPF, que não é alfanumérico. */
export const soDigitos = (s?: string | null): string => (s || "").replace(/\D/g, "");

/** Valor do caractere na conta do DV: '0'→0 … '9'→9, 'A'→17 … 'Z'→42. */
const valor = (c: string) => c.charCodeAt(0) - 48;

/**
 * Um dígito verificador. Os pesos caem de `base.length + 1` até 2, e cada peso
 * ACIMA de 9 entra na conta menos 8 — para 12 caracteres, a sequência clássica
 * 5,4,3,2,9,8,7,6,5,4,3,2. O decremento é do peso BRUTO: transformar antes e
 * decrementar depois faz a série virar 5,4,3,2,1,… e o dígito sair errado.
 */
function digito(base: string, ciclico: boolean): string {
  let soma = 0;
  let peso = base.length + 1;
  for (const c of base) {
    // No CNPJ o peso volta ao topo depois do 2 (12 caracteres, 8 pesos úteis).
    // No CPF ele só desce — 10..2 e 11..2 —, e aplicar a regra do CNPJ aqui
    // transformaria o peso 10 em 2 e reprovaria CPF válido.
    soma += valor(c) * (ciclico && peso > 9 ? peso - 8 : peso);
    peso--;
  }
  const r = soma % 11;
  return r < 2 ? "0" : String(11 - r);
}
const digitoCnpj = (base: string) => digito(base, true);
const digitoCpf = (base: string) => digito(base, false);

/** CNPJ válido? Aceita o formato numérico e o alfanumérico. */
export function cnpjValido(entrada?: string | null): boolean {
  const s = soAlnum(entrada);
  if (s.length !== 14) return false;
  if (/^(.)\1+$/.test(s)) return false; // 000…0, AAA…A: passam na conta, não existem
  if (!/^\d{2}$/.test(s.slice(12))) return false; // os DV são sempre numéricos
  const base = s.slice(0, 12);
  const d1 = digitoCnpj(base);
  return s.slice(12) === d1 + digitoCnpj(base + d1);
}

/** CPF válido? (clientes e fornecedores podem ser pessoa física) */
export function cpfValido(entrada?: string | null): boolean {
  const s = soDigitos(entrada);
  if (s.length !== 11 || /^(\d)\1+$/.test(s)) return false;
  const base = s.slice(0, 9);
  const d1 = digitoCpf(base);
  return s.slice(9) === d1 + digitoCpf(base + d1);
}

/** Situação do documento, para a tela decidir o que mostrar. */
export type SituacaoDoc = "vazio" | "ok" | "invalido";

/** CNPJ (empresas). Vazio não é erro — é campo não preenchido. */
export function situacaoCnpj(entrada?: string | null): SituacaoDoc {
  if (!soAlnum(entrada)) return "vazio";
  return cnpjValido(entrada) ? "ok" : "invalido";
}

/** CNPJ ou CPF (clientes/fornecedores, que podem ser pessoa física). */
export function situacaoDoc(entrada?: string | null): SituacaoDoc {
  const s = soAlnum(entrada);
  if (!s) return "vazio";
  return cnpjValido(entrada) || cpfValido(entrada) ? "ok" : "invalido";
}

/**
 * Aplica a máscara ao gravar: 00.000.000/0000-00 e 000.000.000-00.
 * É o que impede um "=" no lugar do "-" de ficar guardado — e o que faz a
 * mesma empresa não aparecer com duas grafias em telas diferentes.
 * Documento que não valida é devolvido como veio: normalizar lixo esconderia
 * o erro em vez de mostrá-lo.
 */
export function formatarDoc(entrada?: string | null): string {
  const bruto = (entrada || "").trim();
  if (cnpjValido(bruto)) {
    const s = soAlnum(bruto);
    return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
  }
  if (cpfValido(bruto)) {
    const s = soDigitos(bruto);
    return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`;
  }
  return bruto;
}

/** A raiz do CNPJ (os 8 primeiros caracteres): matriz e filiais têm a mesma. */
export function raizCnpj(entrada?: string | null): string {
  const s = soAlnum(entrada);
  return s.length === 14 ? s.slice(0, 8) : "";
}

/**
 * O mesmo documento, escrito de dois jeitos? Compara sem a máscara — o
 * "12.345.678/0001-90" da tela e o "12345678000190" do arquivo são um só.
 * Vazio nunca é igual a nada (dois cadastros sem CNPJ não são a mesma empresa).
 */
export function mesmoDocumento(a?: string | null, b?: string | null): boolean {
  const x = soAlnum(a);
  return !!x && x === soAlnum(b);
}
