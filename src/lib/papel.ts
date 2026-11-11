import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Módulos que o Admin de usuários distribui (papel por módulo, em
// user_modules) — os quatro cards do portal fiscal:
// - tributos: a instância do módulo Tributos (DARFs, Situação Fiscal,
//   certidões) servida em /tributos por rewrite.
// - y570: a ferramenta Y570 da ECF (/y570), módulo próprio desde a 0009, com
//   o histórico no banco (y570_processamentos).
// - cnpj: a Consulta CNPJ e SN (base cadastral, dado público da Receita),
//   servida em /cnpj — módulo PRÓPRIO, separado do Tributos, para dar acesso
//   a um sem dar ao outro (decisão dela, 30/10/2026, replicada da Flórida).
// - cpf: a Consulta CPF (Serpro, /cpf, servida por este app) — dado pessoal e
//   consulta COBRADA: papel próprio, e só editor/admin consulta (0011).
export const MODULOS_ACESSO: { key: string; label: string }[] = [
  { key: "tributos", label: "Tributos" },
  { key: "cnpj", label: "Consulta CNPJ + Simples Nacional" },
  { key: "y570", label: "Y570 · ECF" },
  { key: "cpf", label: "Consulta CPF" },
];

// Papel do usuário logado num módulo qualquer (viewer | editor | admin), ou
// "nenhum". Admin do PORTAL vale como admin em todos — a mesma régua de
// ehAdmin() e de pode_gravar_modulo() no banco (0013).
export async function papelNoModulo(modulo: string): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "nenhum";
  const { data } = await supabase
    .from("user_modules")
    .select("papel")
    .eq("user_id", user.id) // desde a Etapa 5 o admin enxerga as linhas de todos
    .eq("modulo", modulo)
    .maybeSingle();
  if (data?.papel) return data.papel as string;
  return (await ehAdmin()) ? "admin" : "nenhum";
}

// Super-admin de bootstrap (garante acesso ao Admin mesmo sem linha 'admin').
export const SUPER_ADMIN = "liliane.hiramoto@grupoflorida.com.br";

// Admin do PORTAL = a super-admin pelo e-mail OU a linha explícita
// user_modules (modulo 'portal', papel 'admin'), ligada na tela Acessos.
// ⚠️ Desde a 0013 (11/11/2026, decisão dela: "Separar"), papel 'admin' num
// MÓDULO é admin só daquele módulo — não cria contas nem dá acesso a nada.
// Antes, admin em qualquer módulo era admin do portal inteiro, e um perfil com
// "admin" promovia a pessoa sem querer. O banco usa a mesma régua:
// public.eh_admin_portal().
export const MODULO_PORTAL = "portal";

export async function ehAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  if ((user.email ?? "").toLowerCase() === SUPER_ADMIN) return true;
  // Filtra pela própria pessoa: desde a Etapa 5 (user_modules = view sobre
  // core.acessos) o admin do portal enxerga as linhas de TODOS, e sem o filtro
  // o maybeSingle() quebraria com dois admins — e ehAdmin() diria "não".
  const { data } = await supabase.from("user_modules").select("papel").eq("user_id", user.id).eq("modulo", MODULO_PORTAL).maybeSingle();
  return (data as { papel?: string } | null)?.papel === "admin";
}

// Bloqueio para rotas de administração de usuários.
export async function exigeAdmin(): Promise<NextResponse | null> {
  return (await ehAdmin()) ? null : NextResponse.json({ erro: "apenas administradores" }, { status: 403 });
}
