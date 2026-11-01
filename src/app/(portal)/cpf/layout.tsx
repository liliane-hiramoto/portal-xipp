import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ModuloTopbar from "@/components/ModuloTopbar";
import { PORTAL } from "@/config/portal";

export const metadata = { title: `Consulta CPF · ${PORTAL.nome}` };

// Guard: quem tem o módulo `cpf` em user_modules (0011) — cpf_is_user() já diz
// sim para o admin do portal e para o super-admin. A RLS de cpf_consultas
// repete a régua no banco.
export default async function CpfLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: ok } = await supabase.rpc("cpf_is_user");
  if (!ok) redirect("/");

  return (
    <div className="min-h-screen bg-slate-50">
      <ModuloTopbar titulo="Consulta CPF" userEmail={user.email ?? ""} />
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
