import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase com a SERVICE ROLE — USO EXCLUSIVO NO SERVIDOR.
 *
 * ⚠️ Ignora RLS. Nunca importe em código "use client". Usado pelo sync da Omie
 * para gravar lançamentos com a chave de serviço (que não vai ao navegador).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no ambiente."
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
