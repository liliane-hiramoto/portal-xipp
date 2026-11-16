import { NextRequest, NextResponse } from "next/server";
import { chaveDaFloridaConfere } from "@/server/fechamento";
import { exportarRituais } from "@/server/rituais";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/fechamento-core/rituais/exportar?desde=<ISO>  (rituais.ts do fechamento-core)
// Quem chama é o SERVIDOR do Portal Flórida, a cada 15 min, com a chave deste
// portal (FLORIDA_FECHAMENTO_TOKEN, a mesma do cronograma). Sem `desde`, vai tudo.
export async function GET(req: NextRequest) {
  if (!chaveDaFloridaConfere(req.headers.get("authorization"))) {
    return NextResponse.json({ erro: "chave inválida" }, { status: 401 });
  }
  try {
    return NextResponse.json(await exportarRituais(req.nextUrl.searchParams.get("desde")), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
