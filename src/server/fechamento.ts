import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PORTAL as IDENTIDADE } from "@/config/portal";

// A parte COMUM da ponte com o Portal Flórida (fechamento-core): o banco com a
// service role, a chave que a Flórida manda e a leitura em páginas.
//
// Nos portais com Cronograma (RQ, WR, Inexx, 3Clicks) este arquivo também tem o
// adaptador do cronograma. Aqui só há os Rituais de Gestão (pedido dela,
// 16/11/2026: "CTESK e Xipp add Rituais de Gestão (canônico)"), então ficou só
// o que `src/server/rituais.ts` — IGUAL nos portais — importa daqui.
//
// SERVER-ONLY: usa a service role. Quem chama confere antes quem pode:
//   • a tela, pelo login e pela régua do módulo "rituais";
//   • a Flórida, pela chave FLORIDA_FECHAMENTO_TOKEN (chaveDaFloridaConfere).

export const PORTAL = { id: IDENTIDADE.prefixoLocal, nome: IDENTIDADE.nome };

export function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) throw new Error("servidor sem a chave do banco (SUPABASE_SERVICE_ROLE_KEY)");
  return createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** A chave que a Flórida manda é a deste portal? (comparação em tempo constante) */
export function chaveDaFloridaConfere(cabecalho: string | null): boolean {
  const esperada = process.env.FLORIDA_FECHAMENTO_TOKEN;
  const veio = cabecalho?.startsWith("Bearer ") ? cabecalho.slice(7).trim() : "";
  if (!esperada || veio.length < 20) return false;
  const h = (s: string) => createHash("sha256").update(s, "utf8").digest();
  return timingSafeEqual(h(veio), h(esperada));
}

// O PostgREST devolve no máximo 1.000 linhas por vez.
export async function todas<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const saida: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta(de, de + 999);
    if (error) throw new Error(error.message);
    saida.push(...(data ?? []));
    if (!data || data.length < 1000) return saida;
  }
}

export interface Pessoa { email: string; nome: string }
