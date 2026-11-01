"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { ehAdmin } from "@/lib/papel";

// Cadastro de empresas do portal. A tabela `empresas` só tem política de
// LEITURA (0002): quem grava é o servidor, com a service role, DEPOIS de
// conferir que quem pede é admin do portal — a tela que esconde o botão não
// basta (a action é chamável direto). O Y570 só aceita empresa daqui
// (y570_raiz_cadastrada, 0010), por isso o cadastro precisa existir.

export type NovaEmpresa = {
  cnpj: string;
  apelido?: string | null;
  razao_social?: string | null;
  nome_fantasia?: string | null;
  situacao?: string | null;
  regime?: string | null;
  optante_simples?: boolean | null;
  endereco?: string | null;
};

const soDigitos = (s: string) => s.replace(/\D/g, "");
const fmtCnpj = (d: string) => `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
const txt = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export async function salvarEmpresa(e: NovaEmpresa): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!(await ehAdmin())) return { ok: false, erro: "Só o admin do portal cadastra empresa." };
  const d = soDigitos(e.cnpj ?? "");
  if (d.length !== 14) return { ok: false, erro: "CNPJ com 14 dígitos." };
  const sb = createAdminClient();
  const { error } = await sb.from("empresas").upsert(
    {
      cnpj: fmtCnpj(d),
      apelido: txt(e.apelido, 60),
      razao_social: txt(e.razao_social),
      nome_fantasia: txt(e.nome_fantasia),
      situacao: txt(e.situacao, 40),
      regime: txt(e.regime, 40),
      optante_simples: typeof e.optante_simples === "boolean" ? e.optante_simples : null,
      endereco: txt(e.endereco, 300),
    },
    { onConflict: "cnpj" },
  );
  if (error) return { ok: false, erro: error.message };
  revalidatePath("/cadastros");
  return { ok: true };
}

export async function excluirEmpresa(cnpj: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!(await ehAdmin())) return { ok: false, erro: "Só o admin do portal exclui empresa." };
  const sb = createAdminClient();
  const { error } = await sb.from("empresas").delete().eq("cnpj", cnpj);
  if (error) return { ok: false, erro: error.message };
  revalidatePath("/cadastros");
  return { ok: true };
}
