import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente Supabase para uso no navegador (componentes "use client").
 * Usa a anon key pública — toda segurança real vem das políticas RLS no banco.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
