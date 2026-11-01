// A sessão do Supabase no proxy (Next 16: `src/proxy.ts`).
//
// O encanamento dos cookies era igual nos cinco portais, linha por linha; o
// que muda de um para outro (rotas públicas, quem entra em qual módulo) fica
// no portal. Uso:
//
//   const { resposta, user, supabase } = await atualizarSessao(request);
//   if (!user && !publica(path)) return redirecionar(request, "/login");
//   ...regra do portal...
//   return resposta;
//
// ⚠️ Devolva a `resposta` (ou uma cópia dos cookies dela): é nela que o
// Supabase grava o token renovado. Devolver um NextResponse novo perde a sessão.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { precisaTrocarSenha, liberadaComSenhaProvisoria } from "./senha";

export async function atualizarSessao(request: NextRequest) {
  let resposta = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          resposta = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => resposta.cookies.set(name, value, options));
        },
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();
  return { resposta, user, supabase };
}

/** Redireciona para outro caminho deste site. */
export function redirecionar(request: NextRequest, caminho: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = caminho;
  url.search = "";
  return NextResponse.redirect(url);
}

/** Rotas de login, do link do e-mail e de sair: abertas sem sessão em todo portal. */
export function rotaDeAcesso(path: string): boolean {
  return path.startsWith("/login") || path.startsWith("/auth") || path === "/logout";
}

/**
 * Senha provisória: só a troca de senha abre. Devolve a resposta que barra
 * (tela → /trocar-senha, /api → 403) ou null se a rota pode seguir.
 */
export function cobrarTrocaDeSenha(
  request: NextRequest,
  user: { app_metadata?: Record<string, unknown> } | null,
): NextResponse | null {
  const path = request.nextUrl.pathname;
  if (!user || !precisaTrocarSenha(user) || liberadaComSenhaProvisoria(path)) return null;
  if (path.startsWith("/api")) {
    return NextResponse.json({ erro: "troque a senha provisória antes de continuar" }, { status: 403 });
  }
  return redirecionar(request, "/trocar-senha");
}
