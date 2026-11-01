import type { NextRequest } from "next/server";
import { sair } from "@/vendor/acesso-core/rotas";

export async function GET(request: NextRequest) {
  return sair(request);
}
