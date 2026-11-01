import "server-only";

// A chamada ao Serpro (token OAuth2 + Consulta CPF v3). SÓ NO SERVIDOR: as
// chaves (SERPRO_CONSUMER_KEY / SERPRO_CONSUMER_SECRET, nas variáveis da Vercel)
// identificam o contrato e cada consulta é cobrada — nunca vão ao navegador.
//
// O endereço da v3 fica em variável porque o Serpro publicou dois (o gateway
// e o apicpf.estaleiro): SERPRO_CPF_URL troca sem mexer no código.

const TOKEN_URL = process.env.SERPRO_TOKEN_URL || "https://gateway.apiserpro.serpro.gov.br/token";
const CPF_URL = (process.env.SERPRO_CPF_URL || "https://gateway.apiserpro.serpro.gov.br/consulta-cpf-df/v3/cpf").replace(/\/+$/, "");

let cache: { token: string; ate: number } | null = null;

export function serproConfigurado(): boolean {
  return !!(process.env.SERPRO_CONSUMER_KEY && process.env.SERPRO_CONSUMER_SECRET);
}

async function token(): Promise<string> {
  if (cache && cache.ate > Date.now() + 60_000) return cache.token;
  const basic = Buffer.from(`${process.env.SERPRO_CONSUMER_KEY}:${process.env.SERPRO_CONSUMER_SECRET}`).toString("base64");
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!r.ok) throw Object.assign(new Error(`token HTTP ${r.status}`), { status: r.status });
  const j = (await r.json()) as { access_token: string; expires_in?: number };
  cache = { token: j.access_token, ate: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return j.access_token;
}

/** Consulta um CPF. `nascimento` já no formato DDMMAAAA. */
export async function consultarSerpro(cpf: string, nascimento: string): Promise<{ status: number; corpo: Record<string, unknown> | null }> {
  const t = await token();
  const r = await fetch(`${CPF_URL}/${cpf}/${nascimento}`, {
    headers: { Authorization: `Bearer ${t}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (r.status === 401) cache = null; // token vencido/revogado: o próximo pede outro
  const corpo = (await r.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: r.status, corpo };
}
