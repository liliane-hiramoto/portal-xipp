import "server-only";
import { createClient as criarAdmin } from "@supabase/supabase-js";
import { empresasDoCadastroPortal, usuariosDestePortal } from "@/lib/fechamento-florida/cronograma-florida";
import type { Pessoa } from "@/server/fechamento";

/** Os usuários (quem pode ser responsável) e as empresas do Cadastro Geral deste portal. */
export async function pessoasEEmpresas(): Promise<{ pessoas: Pessoa[]; empresas: { cnpj: string; nome: string }[] }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const admin = url && chave ? criarAdmin(url, chave, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  const [usuarios, empresas] = await Promise.all([
    usuariosDestePortal(admin as unknown as Parameters<typeof usuariosDestePortal>[0]),
    empresasDoCadastroPortal(admin as unknown as Parameters<typeof empresasDoCadastroPortal>[0]),
  ]);
  return { pessoas: usuarios.filter((u) => u.email).map((u) => ({ email: u.email.toLowerCase(), nome: u.nome })), empresas };
}
