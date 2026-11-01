import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SENHA_MINIMA } from "@/vendor/acesso-core/senha";

// O próprio usuário troca a senha. Fica no servidor (e não no navegador) porque
// apagar a marca de senha provisória exige a service role: ela mora no
// app_metadata justamente para o usuário não conseguir apagá-la sem trocar.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "faça login de novo" }, { status: 401 });
  const { senha } = (await req.json()) as { senha?: string };
  if (!senha || senha.length < SENHA_MINIMA) return NextResponse.json({ erro: `A senha deve ter no mínimo ${SENHA_MINIMA} caracteres.` }, { status: 400 });

  const sb = createAdminClient();
  const { error } = await sb.auth.admin.updateUserById(user.id, {
    password: senha,
    app_metadata: { ...(user.app_metadata ?? {}), senha_provisoria: false },
    // A marca antiga (user_metadata) também sai, para não confundir quem ler.
    user_metadata: { ...(user.user_metadata ?? {}), must_change_password: false },
  });
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
