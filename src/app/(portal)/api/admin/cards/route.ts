import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exigeAdmin } from "@/lib/papel";
import { validarCard } from "@/lib/cards-menu";

// Admin › Cards do menu (Etapa 3 do catálogo, 11/11/2026). Só admin do portal
// (exigeAdmin) — e grava com a SESSÃO de quem está logado, não com a service
// role: quem decide de verdade é a RLS do catálogo (`core.eh_admin_portal()`) e o
// UPDATE só nas seis colunas que a 0016 liberou na view.

export async function GET() {
  const bloq = await exigeAdmin();
  if (bloq) return bloq;
  const sb = await createClient();
  const { data, error } = await sb.from("modulos").select("key,label,descricao,emoji,href,grupo,ordem,oculto,ativo").order("ordem");
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ cards: data ?? [] });
}

export async function POST(req: NextRequest) {
  const bloq = await exigeAdmin();
  if (bloq) return bloq;
  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const key = typeof corpo?.key === "string" ? corpo.key : "";
  if (!key) return NextResponse.json({ erro: "Faltou o card." }, { status: 400 });
  const sb = await createClient();
  const { data: atual } = await sb.from("modulos").select("grupo").eq("key", key).maybeSingle();
  if (!atual) return NextResponse.json({ erro: `Card desconhecido: ${key}.` }, { status: 404 });
  const v = validarCard(corpo ?? {}, (atual as { grupo: string | null }).grupo);
  if (!v.ok) return NextResponse.json({ erro: v.erro }, { status: 400 });
  const { data, error } = await sb.from("modulos").update(v.mudanca).eq("key", key).select("key");
  if (error) {
    const falta = /permission denied/i.test(error.message);
    return NextResponse.json({ erro: falta ? "Falta rodar a migração 0016 no SQL Editor do Supabase para editar os cards." : error.message }, { status: 500 });
  }
  // A RLS recusa em SILÊNCIO (zero linhas, sem erro): dizer, em vez de "salvo".
  if (!data?.length) return NextResponse.json({ erro: "O banco não aceitou a mudança (nenhuma linha gravada)." }, { status: 403 });
  return NextResponse.json({ ok: true });
}
