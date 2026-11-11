import { redirect } from "next/navigation";
import { precisaTrocarSenha } from "@/lib/senha";
import { createClient } from "@/lib/supabase/server";
import PortalHub from "@/components/PortalHub";
import { cardsDoMenu, cardsVisiveis, ehAdminPortal, lerAcessos, lerModulos, type Busca } from "@/lib/modulos-db";

// Raiz "/" = o Portal (hub com cards de módulos), após o login.
export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (precisaTrocarSenha(user)) redirect("/trocar-senha");

  // Cards e acessos do BANCO (0014), com a lista do código e o user_modules de
  // reserva (src/lib/modulos-db.ts). lerAcessos filtra pela própria pessoa.
  const buscar: Busca = async (tabela, colunas, filtro) => {
    let q = supabase.from(tabela).select(colunas);
    if (filtro) q = q.eq(filtro.coluna, filtro.valor);
    const { data, error } = await q;
    return { data: data as unknown[] | null, error };
  };
  const [linhas, acessos] = await Promise.all([lerModulos(buscar), lerAcessos(buscar, user.id)]);
  const modulos: Record<string, string> = {};
  for (const r of acessos) modulos[r.modulo] = r.papel;
  const cards = cardsVisiveis(cardsDoMenu(linhas), modulos, ehAdminPortal(user.email ?? "", modulos));

  return <PortalHub userEmail={user.email ?? ""} cards={cards} ordemMenu={user.user_metadata?.menu_cards} />;
}
