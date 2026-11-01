import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ModuloTopbar from "@/components/ModuloTopbar";
import { ehAdmin } from "@/lib/papel";
import NovaEmpresa, { BotaoExcluir } from "./NovaEmpresa";

// Cadastro de empresas do portal. Todo logado LÊ; só o admin inclui e exclui
// (actions.ts, com a service role depois de ehAdmin()). O Y570 só aceita PDF de
// empresa cadastrada aqui (0010).
export default async function CadastrosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: empresas } = await supabase
    .from("empresas")
    .select("cnpj,apelido,razao_social,regime,situacao,fonte,grupo_id")
    .order("apelido");
  const { data: grupos } = await supabase.from("grupos").select("id,nome");
  const grupoNome = (id: number | null) => grupos?.find((g) => g.id === id)?.nome ?? "—";
  const admin = await ehAdmin();

  return (
    <div className="min-h-screen bg-slate-50">
      <ModuloTopbar titulo="Cadastros · Empresas" userEmail={user.email ?? ""} />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-xl font-semibold text-slate-800">Cadastro Central de Empresas</h1>
        <p className="mt-1 text-sm text-slate-500">
          As empresas deste portal. O Tributos e o Y570 só aceitam empresa cadastrada aqui
          {admin ? "." : " — peça ao administrador para incluir uma empresa nova."}
        </p>

        {admin && <NovaEmpresa />}

        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Grupo</th>
                <th className="px-4 py-2 font-medium">Apelido</th>
                <th className="px-4 py-2 font-medium">Razão Social</th>
                <th className="px-4 py-2 font-medium">CNPJ</th>
                <th className="px-4 py-2 font-medium">Regime</th>
                <th className="px-4 py-2 font-medium">Situação</th>
                {admin && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody>
              {(empresas ?? []).map((e) => (
                <tr key={e.cnpj} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 text-slate-500">{grupoNome(e.grupo_id)}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-700">{e.apelido}</td>
                  <td className="px-4 py-2.5 text-slate-600">{e.razao_social}</td>
                  <td className="px-4 py-2.5 text-slate-600">{e.cnpj}</td>
                  <td className="px-4 py-2.5 text-slate-600">{e.regime ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-600">{e.situacao ?? "—"}</td>
                  {admin && <td className="px-4 py-2.5 text-right"><BotaoExcluir cnpj={e.cnpj} nome={e.razao_social || e.apelido || e.cnpj} /></td>}
                </tr>
              ))}
              {(empresas ?? []).length === 0 && (
                <tr>
                  <td colSpan={admin ? 7 : 6} className="px-4 py-8 text-center text-slate-400">
                    Nenhuma empresa cadastrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
