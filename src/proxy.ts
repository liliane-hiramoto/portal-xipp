import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16: o antigo "middleware" agora se chama "proxy" (runtime Node.js).
// Mantém a sessão Supabase nos cookies e protege as rotas (sem login → /login).
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // `tributos/_next`, `y570/_next` e `cnpj/_next` são os arquivos do Next dos
    // apps servidos por rewrite (next.config.ts): não precisam da sessão.
    "/((?!_next/static|_next/image|tributos/_next|y570/_next|cnpj/_next|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
