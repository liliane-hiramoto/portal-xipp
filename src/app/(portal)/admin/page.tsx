import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/papel";
import ModuloTopbar from "@/components/ModuloTopbar";
import AdminUsuarios from "@/components/AdminUsuarios";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const admin = await ehAdmin();

  return (
    <div className="min-h-screen bg-slate-50">
      <ModuloTopbar titulo="Admin de usuários" userEmail={user.email ?? ""} />
      <main className="mx-auto max-w-4xl px-6 py-10">
        {admin ? (
          <AdminUsuarios meuEmail={user.email ?? ""} />
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Acesso restrito a <strong>administradores</strong>. Peça a um admin para liberar seu acesso.
          </div>
        )}
      </main>
    </div>
  );
}
