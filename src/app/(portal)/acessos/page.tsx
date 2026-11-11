import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/papel";
import ModuloTopbar from "@/components/ModuloTopbar";
import { TelaAcessos } from "@/vendor/acesso-core/acessos-tela";
import CardsMenu from "@/components/CardsMenu";

// Acessos — o modelo do Portal Flórida (pedido dela, 01/11/2026): Pessoas
// (lista + ficha de cada login), Por módulo ("quem enxerga o Tributos?") e
// Perfis de acesso (moldes módulo → papel aplicados num clique). Só admin.
// A tela é a do acesso-core, a mesma em todo portal (item 9, passo 2). Os
// Cards do menu (Etapa 3 do catálogo) são uma aba dela (`abasExtras`, #10).
export default async function AcessosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const admin = await ehAdmin();

  return (
    <div className="min-h-screen bg-slate-50">
      <ModuloTopbar titulo="Acessos" userEmail={user.email ?? ""} />
      <main className="mx-auto max-w-6xl px-6 py-8">
        {admin ? (
          <TelaAcessos meuId={user.id}
            abasExtras={[{ id: "cards", rotulo: "Cards do menu", conteudo: <CardsMenu /> }]} />
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Acesso restrito a <strong>administradores</strong>. Peça a um admin para liberar seu acesso.
          </div>
        )}
      </main>
    </div>
  );
}
