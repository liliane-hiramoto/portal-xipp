import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigeAdmin, MODULOS_ACESSO, SUPER_ADMIN } from "@/lib/papel";
import {
  listarAcessos, tratarAcao, loginsSupabase, acessosFuncoes, perfisTabelas, type PortaAcessos,
} from "@/vendor/acesso-core/acessos";

// Tela de Acessos (Pessoas · Por módulo · Perfis): a tela e as travas vêm do
// acesso-core (item 9, passo 2 — a mesma em todo portal). Daqui é só a PORTA:
// os acessos em core.acessos (a linha 'portal' = admin do portal, 0013) e os
// perfis nas tabelas da 0012.
//
// Desde a 0015 (Etapa 5 do catálogo) `user_modules` é VIEW: os acessos se
// GRAVAM pelas funções conceder_modulo / revogar_modulo / marcar_admin_portal,
// com a SESSÃO de quem está logado — a régua (só admin do portal; ninguém muda
// o próprio admin do portal) é conferida dentro delas. A leitura e os perfis
// seguem com a SERVICE ROLE, sempre DEPOIS de exigeAdmin().

async function porta(): Promise<PortaAcessos> {
  const sb = createAdminClient();
  const sessao = await createClient();
  const { data: { user } } = await sessao.auth.getUser();
  return {
    superAdmin: SUPER_ADMIN,
    modulos: MODULOS_ACESSO,
    euId: user?.id ?? null,
    logins: loginsSupabase(sb),
    acessos: acessosFuncoes(sessao, sb),
    perfis: perfisTabelas(sb),
  };
}

export async function GET() {
  const bloq = await exigeAdmin();
  if (bloq) return bloq;
  try {
    return NextResponse.json(await listarAcessos(await porta()));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const bloq = await exigeAdmin();
  if (bloq) return bloq;
  const corpo = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const r = await tratarAcao(await porta(), corpo);
  return NextResponse.json(r.corpo, { status: r.status });
}
