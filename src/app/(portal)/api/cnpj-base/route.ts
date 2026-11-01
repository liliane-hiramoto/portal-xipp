import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { papelNoModulo } from "@/lib/papel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Base da ferramenta "Consulta CNPJ e SN" (cnpj-base-web, servida em /cnpj por
// rewrite) no banco DESTE portal — réplica do Portal Flórida (0207/0208,
// 30/10/2026, pedido dela: "cada portal guarda a SUA base no SEU banco"). A
// ferramenta chama `/api/cnpj-base` no MESMO endereço do portal; sem esta rota
// (ou sem a tabela) ela segue salvando no navegador, como antes.
//
// ⚠️ Tudo com a sessão de quem está usando (cliente com cookies, nada de
// service role): quem decide ler/gravar é a RLS de `trib_cnpj_base`
// (cnpj_is_user lê; cnpj_is_admin = editor/admin grava) — a mesma régua do
// módulo `cnpj` em user_modules que papelNoModulo() lê. O proxy deixa /api
// passar sem login; por isso o 401 aqui.

type Linha = { cnpj: string; estado: "pendente" | "ok" | "erro"; erro?: string | null; registro?: unknown };

const ESTADOS = new Set(["pendente", "ok", "erro"]);
const MAX_LINHAS = 5000;
const LEITORES = ["viewer", "editor", "admin"];
const EDITORES = ["editor", "admin"];
const SEM_TABELA = "Falta aplicar o SQL da base de CNPJ (supabase/migrations) no Supabase.";

function semTabela(e: { code?: string; message?: string } | null) {
  return !!e && (e.code === "42P01" || e.code === "PGRST205" || /trib_cnpj_base/.test(e.message ?? ""));
}

async function sessao() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, temModulo: false, podeGravar: false };
  const papel = await papelNoModulo("cnpj");
  return { supabase, user, temModulo: LEITORES.includes(papel), podeGravar: EDITORES.includes(papel) };
}

/** Lista a base. `podeGravar` diz à ferramenta se avisa "só leitura". */
export async function GET() {
  const { supabase, user, temModulo, podeGravar } = await sessao();
  if (!user) return NextResponse.json({ ok: false, erro: "Sem login." }, { status: 401 });
  if (!temModulo) return NextResponse.json({ ok: false, erro: "Sem o módulo Consulta CNPJ." }, { status: 403 });

  const { data, error } = await supabase
    .from("trib_cnpj_base")
    .select("cnpj, estado, erro, registro")
    .order("criado_em", { ascending: true });
  if (semTabela(error)) return NextResponse.json({ ok: false, erro: SEM_TABELA }, { status: 503 });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, podeGravar, linhas: data ?? [] });
}

/** Grava (insere ou atualiza) as linhas recebidas. */
export async function POST(req: NextRequest) {
  const { supabase, user, temModulo, podeGravar } = await sessao();
  if (!user) return NextResponse.json({ ok: false, erro: "Sem login." }, { status: 401 });
  if (!temModulo) return NextResponse.json({ ok: false, erro: "Sem o módulo Consulta CNPJ." }, { status: 403 });
  if (!podeGravar) return NextResponse.json({ ok: false, erro: "Seu acesso à Consulta CNPJ é só leitura." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as { linhas?: Linha[] } | null;
  const linhas = Array.isArray(corpo?.linhas) ? corpo!.linhas : [];
  if (!linhas.length) return NextResponse.json({ ok: true, gravadas: 0 });
  if (linhas.length > MAX_LINHAS) return NextResponse.json({ ok: false, erro: `No máximo ${MAX_LINHAS} por vez.` }, { status: 400 });

  const agora = new Date().toISOString();
  const rows = [];
  for (const l of linhas) {
    const cnpj = String(l?.cnpj ?? "").replace(/\D/g, "");
    if (cnpj.length !== 14 || !ESTADOS.has(l.estado)) {
      return NextResponse.json({ ok: false, erro: `Linha inválida: ${String(l?.cnpj ?? "")}` }, { status: 400 });
    }
    const registro = l.registro && typeof l.registro === "object" ? l.registro : null;
    const razao = registro && typeof (registro as { razao_social?: unknown }).razao_social === "string"
      ? (registro as { razao_social: string }).razao_social : null;
    rows.push({ cnpj, estado: l.estado, erro: l.erro ?? null, registro, razao_social: razao, atualizado_em: agora, atualizado_por: user.id });
  }

  const { error } = await supabase.from("trib_cnpj_base").upsert(rows, { onConflict: "cnpj" });
  if (semTabela(error)) return NextResponse.json({ ok: false, erro: SEM_TABELA }, { status: 503 });
  // A RLS recusa quem só tem leitura (código 42501): a ferramenta avisa.
  if (error) return NextResponse.json({ ok: false, erro: error.code === "42501" ? "Seu acesso à Consulta CNPJ é só leitura." : error.message }, { status: error.code === "42501" ? 403 : 500 });
  return NextResponse.json({ ok: true, gravadas: rows.length });
}

/** Tira CNPJs da base: `{ cnpjs: [...] }` ou `{ todos: true }` (apaga para TODOS do portal). */
export async function DELETE(req: NextRequest) {
  const { supabase, user, temModulo, podeGravar } = await sessao();
  if (!user) return NextResponse.json({ ok: false, erro: "Sem login." }, { status: 401 });
  if (!temModulo) return NextResponse.json({ ok: false, erro: "Sem o módulo Consulta CNPJ." }, { status: 403 });
  if (!podeGravar) return NextResponse.json({ ok: false, erro: "Seu acesso à Consulta CNPJ é só leitura." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as { cnpjs?: string[]; todos?: boolean } | null;
  let q = supabase.from("trib_cnpj_base").delete();
  if (corpo?.todos === true) q = q.gte("cnpj", "");
  else {
    const cnpjs = (corpo?.cnpjs ?? []).map((c) => String(c).replace(/\D/g, "")).filter((c) => c.length === 14);
    if (!cnpjs.length) return NextResponse.json({ ok: true, removidas: 0 });
    q = q.in("cnpj", cnpjs);
  }
  const { error } = await q;
  if (semTabela(error)) return NextResponse.json({ ok: false, erro: SEM_TABELA }, { status: 503 });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
