import { redirect } from "next/navigation";
import { createClient as criarAdmin } from "@supabase/supabase-js";
import { pendenciasDaTela } from "@/server/rituais-tela";
import PendenciasFlorida from "@/lib/fechamento-florida/PendenciasFlorida";
import { empresasDoCadastroPortal, enviarEmpresasFlorida, enviarUsuariosFlorida, usuariosDestePortal } from "@/lib/fechamento-florida/cronograma-florida";
import { quemPodeRituais } from "./acesso";
import { mudarPendencia } from "./actions";
import ModuloTopbar from "@/components/ModuloTopbar";

export const dynamic = "force-dynamic";

// Rituais de Gestão (16/11/2026, pedido dela: "CTESK e Xipp add Rituais de
// Gestão (canônico)") — o módulo canônico do Portal Flórida: o Checkpoint deste
// cliente e as pendências combinadas nele. Até a Flórida "levar os Rituais"
// para cá (Fechamento › Portais dos clientes), a tela lê e grava lá pela ponte;
// depois, neste banco, e a Flórida copia (src/server/rituais-tela.ts).
//
// Na abertura, o servidor manda à Flórida os usuários e as empresas deste
// portal (quem pode ser responsável e o Cadastro, casado pelo CNPJ). Nos
// portais com Cronograma isso sai da tela do Cronograma; aqui não há uma.
export default async function RituaisPage({ searchParams }: { searchParams: Promise<{ todas?: string; ok?: string; erro?: string; editar?: string; nova?: string; filtro?: string }> }) {
  const quem = await quemPodeRituais();
  if (!quem) redirect("/");
  const { todas, ok, erro, editar, nova, filtro } = await searchParams;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sb = url && chave ? criarAdmin(url, chave, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  const [r] = await Promise.all([
    pendenciasDaTela(todas === "1"),
    empresasDoCadastroPortal(sb as unknown as Parameters<typeof empresasDoCadastroPortal>[0])
      .then(enviarEmpresasFlorida).catch(() => undefined),
    usuariosDestePortal(sb as unknown as Parameters<typeof usuariosDestePortal>[0])
      .then(enviarUsuariosFlorida).catch(() => undefined),
  ]);
  const msg = ok === "anotada" ? "Anotação registrada." : ok === "situacao" ? "Situação atualizada." : ok === "salva" ? "Pendência salva." : undefined;
  return (
    <div className="min-h-screen bg-slate-50">
      <ModuloTopbar titulo="Rituais de Gestão" userEmail={quem.email} />
      <PendenciasFlorida r={r} acao={mudarPendencia} rota="/rituais" todas={todas === "1"} msg={msg} erro={erro}
        editar={editar ? Number(editar) : undefined} nova={nova === "1"} filtro={filtro} />
    </div>
  );
}
