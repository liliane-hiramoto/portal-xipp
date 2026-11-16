import { NextRequest, NextResponse } from "next/server";
import { validarAcaoRitual, type AcaoRitual } from "@/vendor/fechamento-core/rituais";
import { chaveDaFloridaConfere } from "@/server/fechamento";
import { aplicarAcaoRitual } from "@/server/rituais";
import { hojeYmd } from "@/lib/hoje";
import { pessoasEEmpresas } from "../../pessoas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/fechamento-core/rituais/acao  { AcaoRitual }
// A equipe Flórida grava daqui pela tela da Flórida (abrir o Checkpoint, os
// pontos, as pendências): o servidor de lá chama esta rota com a chave deste
// portal. É a MESMA função da tela daqui.
export async function POST(req: NextRequest) {
  if (!chaveDaFloridaConfere(req.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, erro: "chave inválida" }, { status: 401 });
  }
  let a: unknown;
  try { a = await req.json(); } catch { return NextResponse.json({ ok: false, erro: "JSON inválido" }, { status: 400 }); }
  const erro = validarAcaoRitual(a);
  if (erro) return NextResponse.json({ ok: false, erro }, { status: 400 });
  const acao = a as AcaoRitual;
  // Pela chave da Flórida, o autor é sempre da Flórida — quem diz a origem é a chave, não o pedido.
  acao.autor = { ...acao.autor, origem: "florida" };
  const { pessoas } = await pessoasEEmpresas();
  const r = await aplicarAcaoRitual(acao, hojeYmd(), pessoas);
  return NextResponse.json(r, { status: r.ok ? 200 : 422 });
}
