import type { NextRequest } from "next/server";
import { entrarComPasse } from "@/vendor/acesso-core/entrada";

// "Entrar pelo Flórida" (09/11/2026): o atalho do Portal Flórida entrega aqui
// um passe assinado e a pessoa entra sem digitar a senha — só se já tiver conta
// neste portal com o mesmo e-mail. Ver src/vendor/acesso-core/passe.ts.
export async function POST(req: NextRequest) {
  return entrarComPasse(req);
}
