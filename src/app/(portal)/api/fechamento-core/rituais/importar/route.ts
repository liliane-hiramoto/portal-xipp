import { NextRequest, NextResponse } from "next/server";
import type { PacoteRituais } from "@/vendor/fechamento-core/rituais";
import { chaveDaFloridaConfere } from "@/server/fechamento";
import { importarRituais } from "@/server/rituais";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/fechamento-core/rituais/importar  { PacoteRituais }
// A mudança de casa: o Portal Flórida manda, UMA vez, os Checkpoints e as
// pendências deste cliente (com os mesmos ids). Só aceita com as tabelas
// vazias; devolve as contagens.
export async function POST(req: NextRequest) {
  if (!chaveDaFloridaConfere(req.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, erro: "chave inválida" }, { status: 401 });
  }
  let p: PacoteRituais;
  try { p = await req.json(); } catch { return NextResponse.json({ ok: false, erro: "JSON inválido" }, { status: 400 }); }
  const listas = ["reunioes", "pautas", "acoes", "responsaveis", "historico"] as const;
  if (!p || listas.some((k) => !Array.isArray(p[k]))) return NextResponse.json({ ok: false, erro: "pacote incompleto" }, { status: 400 });
  const r = await importarRituais(p);
  return NextResponse.json(r, { status: r.ok ? 200 : 422 });
}
