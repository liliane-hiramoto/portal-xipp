// Consulta CPF do Serpro (v3) — a parte PURA: validar a entrada e ler a
// resposta. Testado em supabase/testes/serpro-cpf.mjs. A chamada de rede (token
// + consulta) mora em cpf-cliente.ts, só no servidor.
//
// v3 (29/05/2026): a chave da consulta é CPF + DATA DE NASCIMENTO
// (`/v3/cpf/{cpf}/{DDMMAAAA}`). Devolve CPF, nome, nome social, nascimento,
// situação cadastral, data de inscrição e da última atualização. NÃO devolve
// endereço (30/10/2026: confirmado na pesquisa; nenhum serviço do Serpro entrega
// o endereço da pessoa física).
// ⚠️ Os nomes dos campos da v3 não puderam ser conferidos na documentação (a rede
// desta sessão bloqueia o site do Serpro): a leitura aceita as grafias conhecidas
// e guarda a resposta crua (`resposta`) para conferir depois.

export const soDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** CPF válido pelos dígitos verificadores (e não todos iguais). */
export function cpfValido(cpf: string): boolean {
  const c = soDigitos(cpf);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (base: string, peso: number) => {
    let s = 0;
    for (const ch of base) s += Number(ch) * peso--;
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(c.slice(0, 9), 10) === Number(c[9]) && dv(c.slice(0, 10), 11) === Number(c[10]);
}

/** "AAAA-MM-DD" (o <input type=date>) → "DDMMAAAA" (o que o Serpro pede).
 *  Nulo se a data não existe no calendário ou é futura em relação a `hoje`. */
export function nascimentoParaSerpro(ymd: string, hoje: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd ?? "");
  if (!m) return null;
  const [, a, mm, d] = m;
  const dt = new Date(Date.UTC(+a, +mm - 1, +d));
  if (dt.getUTCFullYear() !== +a || dt.getUTCMonth() !== +mm - 1 || dt.getUTCDate() !== +d) return null;
  if (ymd > hoje || +a < 1890) return null;
  return `${d}${mm}${a}`;
}

/** "DDMMAAAA" ou "AAAA-MM-DD…" → "AAAA-MM-DD" (calendário, sem fuso). */
export function dataSerpro(v: unknown): string | null {
  const s = String(v ?? "").trim();
  let m = /^(\d{2})(\d{2})(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export interface ConsultaCpf {
  cpf: string;
  nome: string | null;
  nome_social: string | null;
  nascimento: string | null;
  situacao_codigo: string | null;
  situacao_descricao: string | null;
  data_inscricao: string | null;
  data_atualizacao: string | null;
}

const txt = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v).trim();
  return s ? s : null;
};

/** Lê a resposta do Serpro (aceita as grafias conhecidas da v2/v3). */
export function lerRespostaCpf(j: Record<string, unknown>, cpfPedido: string): ConsultaCpf {
  const sit = (j.situacao ?? {}) as Record<string, unknown>;
  return {
    cpf: soDigitos(String(j.ni ?? j.cpf ?? cpfPedido)) || soDigitos(cpfPedido),
    nome: txt(j.nome),
    nome_social: txt(j.nomeSocial ?? j.nome_social),
    nascimento: dataSerpro(j.nascimento ?? j.dataNascimento),
    situacao_codigo: txt(typeof j.situacao === "object" ? sit.codigo : j.situacaoCodigo),
    situacao_descricao: txt(typeof j.situacao === "object" ? sit.descricao : j.situacao),
    data_inscricao: dataSerpro(j.dataInscricao ?? j.inscricao ?? j.data_inscricao),
    data_atualizacao: dataSerpro(j.dataAtualizacao ?? j.ultimaAtualizacao ?? j.data_ultima_atualizacao),
  };
}

/** Mensagem para o status HTTP do Serpro. 200, 206 e 404 são COBRADOS. */
export function mensagemStatus(status: number): string {
  if (status === 200) return "Consulta feita.";
  if (status === 206) return "A Receita devolveu os dados incompletos (consulta cobrada).";
  if (status === 404) return "CPF não encontrado, ou a data de nascimento não confere (consulta cobrada).";
  if (status === 400) return "O Serpro recusou o pedido: confira o CPF e a data de nascimento.";
  if (status === 401 || status === 403) return "O Serpro recusou as chaves de acesso: confira SERPRO_CONSUMER_KEY e SERPRO_CONSUMER_SECRET na Vercel.";
  if (status === 429) return "Muitas consultas seguidas: espere um minuto e tente de novo.";
  return `O Serpro respondeu com erro (HTTP ${status}). Tente de novo em alguns minutos.`;
}
