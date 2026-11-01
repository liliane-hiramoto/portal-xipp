import type { NextRequest } from "next/server";
import { linkDoEmail } from "@/vendor/acesso-core/rotas";

// O link do e-mail "Esqueci minha senha" volta aqui (acesso-core).
export async function GET(request: NextRequest) {
  return linkDoEmail(request);
}
