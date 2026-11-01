import { redirect } from "next/navigation";
import { precisaTrocarSenha } from "@/lib/senha";
import { createClient } from "@/lib/supabase/server";
import PortalHub from "@/components/PortalHub";

// Raiz "/" = o Portal (hub com cards de módulos), após o login.
export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (precisaTrocarSenha(user)) redirect("/trocar-senha");

  // Módulos que este usuário pode acessar (RLS deixa cada um ver só os seus).
  const { data } = await supabase.from("user_modules").select("modulo,papel");
  const modulos: Record<string, string> = {};
  (data ?? []).forEach((r) => {
    const row = r as { modulo: string; papel: string };
    modulos[row.modulo] = row.papel;
  });

  return <PortalHub userEmail={user.email ?? ""} modulos={modulos} />;
}
