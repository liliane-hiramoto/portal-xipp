import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigeAdmin, MODULOS_ACESSO, SUPER_ADMIN } from "@/lib/papel";
import {
  listarAcessos, tratarAcao, loginsSupabase, acessosUserModules, perfisTabelas, type PortaAcessos,
} from "@/vendor/acesso-core/acessos";

// Tela de Acessos (Pessoas · Por módulo · Perfis): a tela e as travas vêm do
// acesso-core (item 9, passo 2 — a mesma em todo portal). Daqui é só a PORTA:
// os acessos na tabela `user_modules` (a linha 'portal' = admin do portal,
// 0013) e os perfis nas tabelas da 0012.
//
// Tudo com a SERVICE ROLE, e por isso só DEPOIS de exigeAdmin() (admin do
// PORTAL): `user_modules` e os perfis não têm política de gravação.

async function porta(): Promise<PortaAcessos> {
  const sb = createAdminClient();
  const { data: { user } } = await (await createClient()).auth.getUser();
  return {
    superAdmin: SUPER_ADMIN,
    modulos: MODULOS_ACESSO,
    euId: user?.id ?? null,
    logins: loginsSupabase(sb),
    acessos: acessosUserModules(sb),
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
