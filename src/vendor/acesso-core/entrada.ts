// A outra ponta do "Entrar pelo Flórida" (ver passe.ts): a rota que recebe o
// passe neste portal e abre a sessão. No portal, um arquivo de duas linhas:
//
//   // src/app/auth/florida/route.ts
//   import { entrarComPasse } from "@/vendor/acesso-core/entrada";
//   export async function POST(req: NextRequest) { return entrarComPasse(req); }
//
// Precisa da SUPABASE_SERVICE_ROLE_KEY na Vercel do portal (a mesma do Admin):
// é com ela que se acha a conta pelo e-mail e se emite o link de entrada.
// ⚠️ NUNCA cria conta: e-mail que não existe aqui volta ao /login com o aviso.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { lerPasse, URL_CHAVE_PUBLICA } from "./passe";

// A chave pública do Flórida, guardada por 10 minutos (uma ida ao Flórida por
// entrada seria desperdício; muito tempo seguraria uma chave trocada).
let chaveEmCache: { pem: string; ate: number } | null = null;
async function chavePublica(): Promise<string> {
  if (chaveEmCache && chaveEmCache.ate > Date.now()) return chaveEmCache.pem;
  const r = await fetch(URL_CHAVE_PUBLICA, { cache: "no-store" });
  const j = (await r.json().catch(() => null)) as { chave?: string } | null;
  if (!r.ok || !j?.chave) throw new Error("o Flórida não respondeu a chave do passe");
  chaveEmCache = { pem: j.chave, ate: Date.now() + 10 * 60_000 };
  return j.chave;
}

function paraOLogin(request: NextRequest, motivo: string) {
  return NextResponse.redirect(new URL(`/login?passe=${motivo}`, request.nextUrl.origin), 303);
}

/** POST /auth/florida — recebe o passe do Flórida e abre a sessão. */
export async function entrarComPasse(request: NextRequest): Promise<NextResponse> {
  const form = await request.formData().catch(() => null);
  const token = String(form?.get("passe") ?? "");
  let pem: string;
  try {
    pem = await chavePublica();
  } catch {
    return paraOLogin(request, "indisponivel");
  }
  let leitura = lerPasse(token, pem, request.nextUrl.origin);
  // Assinatura que não confere pode ser chave trocada no Flórida: busca de novo, uma vez.
  if (!leitura.ok && leitura.motivo === "assinatura") {
    chaveEmCache = null;
    try {
      leitura = lerPasse(token, await chavePublica(), request.nextUrl.origin);
    } catch {
      return paraOLogin(request, "indisponivel");
    }
  }
  if (!leitura.ok) return paraOLogin(request, "invalido");

  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave) return paraOLogin(request, "indisponivel");
  const adm = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // A conta tem de EXISTIR aqui. O generateLink de "magiclink" criaria uma conta
  // nova para e-mail desconhecido — por isso a busca vem antes.
  let existe = false;
  for (let page = 1; page <= 20 && !existe; page++) {
    const { data, error } = await adm.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return paraOLogin(request, "indisponivel");
    existe = data.users.some((u) => (u.email ?? "").toLowerCase() === leitura.email);
    if (data.users.length < 200) break;
  }
  if (!existe) return paraOLogin(request, "sem-conta");

  const { data: link, error: eLink } = await adm.auth.admin.generateLink({ type: "magiclink", email: leitura.email });
  const hash = link?.properties?.hashed_token;
  if (eLink || !hash) return paraOLogin(request, "indisponivel");

  const resposta = NextResponse.redirect(new URL("/", request.nextUrl.origin), 303);
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cs) => cs.forEach(({ name, value, options }) => resposta.cookies.set(name, value, options)),
    },
  });
  const { error } = await supabase.auth.verifyOtp({ token_hash: hash, type: "magiclink" });
  // Conta bloqueada (ban) cai aqui: o Supabase recusa a sessão.
  return error ? paraOLogin(request, "invalido") : resposta;
}
