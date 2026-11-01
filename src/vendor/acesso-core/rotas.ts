// Rotas de servidor que todo portal tem. No portal, cada uma é um arquivo de
// duas linhas:
//
//   // src/app/auth/callback/route.ts
//   import { linkDoEmail } from "@/vendor/acesso-core/rotas";
//   export async function GET(req: NextRequest) { return linkDoEmail(req); }
//
//   // src/app/logout/route.ts
//   import { sair } from "@/vendor/acesso-core/rotas";
//   export async function GET(req: NextRequest) { return sair(req); }
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { destinoSeguro } from "./senha";

function clienteComCookiesNa(request: NextRequest, resposta: NextResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) => resposta.cookies.set(name, value, options)),
      },
    },
  );
}

/**
 * GET /auth/callback — o link do e-mail "Esqueci minha senha".
 *
 * O Supabase manda de volta com `?code=` (fluxo PKCE, o padrão do
 * @supabase/ssr): troca-se o código pela sessão e a pessoa cai em
 * /trocar-senha, já logada. Sem esta rota o link caía no /login com o código
 * ignorado — era o que acontecia no 3Clicks. O `?token_hash=&type=` cobre o
 * modelo de e-mail que manda o token em vez do código.
 *
 * ⚠️ O PKCE exige abrir o link no MESMO navegador em que se pediu a senha
 * nova. Em outro, volta para o /login com o aviso de link inválido.
 */
export async function linkDoEmail(request: NextRequest): Promise<NextResponse> {
  const url = request.nextUrl;
  const destino = destinoSeguro(url.searchParams.get("next"), "/trocar-senha");
  const resposta = NextResponse.redirect(new URL(destino, url.origin));
  const supabase = clienteComCookiesNa(request, resposta);

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  let ok = false;
  if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;

  return ok ? resposta : NextResponse.redirect(new URL("/login?link=invalido", url.origin));
}

/** GET /logout — encerra a sessão e volta ao /login. */
export async function sair(request: NextRequest): Promise<NextResponse> {
  const resposta = NextResponse.redirect(new URL("/login", request.nextUrl.origin));
  await clienteComCookiesNa(request, resposta).auth.signOut();
  return resposta;
}
