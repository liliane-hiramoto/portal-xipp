import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/papel";

/**
 * Quem entra nos Rituais de Gestão: quem tem o módulo 'rituais' (Acessos) ou o
 * admin do portal — a mesma régua de rituais_le() no banco (0018). Devolve o
 * nome de quem está logado (vai como autor da anotação), ou null.
 */
export async function quemPodeRituais(): Promise<{ nome: string; email: string } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  // Filtrado pela pessoa: o admin do portal enxerga as linhas de todos (Etapa 5).
  const { data: mods } = await supabase.from("user_modules").select("modulo").eq("user_id", user.id).eq("modulo", "rituais");
  if (!mods?.length && !(await ehAdmin())) return null;
  const meta = user.user_metadata ?? {};
  const nome = (typeof meta.nome === "string" && meta.nome) || (typeof meta.full_name === "string" && meta.full_name) || user.email || "Portal";
  return { nome, email: (user.email ?? "").toLowerCase() };
}
