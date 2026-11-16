"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { ehAdmin } from "@/lib/papel";
import { cnpjValido, formatarDoc } from "@/vendor/cadastro-core/documento";
import { mapearReceita, respostaDaEmpresa } from "@/vendor/cadastro-core/receita";

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
  /** O JSON que a Receita devolveu no navegador (BrasilAPI / Minha Receita):
   *  o Cartão CNPJ e o QSA vão para `cadastro`/`qsa` (0017), depois de a
   *  action conferir que ele é do MESMO CNPJ — senão é ignorado. */
  receita?: Record<string, unknown> | null;
};

const txt = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export async function salvarEmpresa(e: NovaEmpresa): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!(await ehAdmin())) return { ok: false, erro: "Só o admin do portal cadastra empresa." };
  // CNPJ pelo dígito verificador (cadastro-core, item 11): aceita o CNPJ
  // alfanumérico, e um "=" no lugar do "-" não passa por ter 14 dígitos.
  if (!cnpjValido(e.cnpj)) return { ok: false, erro: "CNPJ inválido: confira os dígitos." };
  const cnpj = formatarDoc(e.cnpj);
  const sb = createAdminClient();
  const row: Record<string, unknown> = {
    cnpj,
    apelido: txt(e.apelido, 60),
    razao_social: txt(e.razao_social),
    nome_fantasia: txt(e.nome_fantasia),
    situacao: txt(e.situacao, 40),
    regime: txt(e.regime, 40),
    optante_simples: typeof e.optante_simples === "boolean" ? e.optante_simples : null,
    endereco: txt(e.endereco, 300),
  };
  const receita = e.receita && respostaDaEmpresa(cnpj, e.receita) ? mapearReceita(e.receita) : null;
  const comReceita = receita
    ? { ...row, cadastro: receita.cadastro, qsa: receita.qsa, receita_atualizado_em: new Date().toISOString() }
    : row;
  let { error } = await sb.from("empresas").upsert(comReceita, { onConflict: "cnpj" });
  // Sem a 0017 (colunas da Receita), grava o resto: a empresa não pode ficar
  // de fora do cadastro por causa do Cartão CNPJ.
  if (error && receita && /cadastro|qsa|receita_atualizado_em|schema cache/.test(error.message)) {
    ({ error } = await sb.from("empresas").upsert(row, { onConflict: "cnpj" }));
  }
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
