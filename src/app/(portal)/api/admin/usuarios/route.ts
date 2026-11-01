import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigeAdmin, MODULOS_ACESSO, SUPER_ADMIN } from "@/lib/papel";
import { senhaProvisoria } from "@/lib/senha";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Módulo do formulário de criação (o primeiro card); os outros se dão na lista.
const MODULO = "tributos";
const PAPEIS = ["viewer", "editor", "admin"];
// Papel por módulo: o Admin distribui Tributos, Consulta CNPJ, Y570 e Consulta
// CPF, cada um com o seu papel em user_modules. `papel` (sem módulo) é o do
// Tributos, o módulo do formulário de criação.
const MODULOS = new Set(MODULOS_ACESSO.map((m) => m.key));

// Lista usuários do portal + papel em cada módulo. Admin only.
export async function GET() {
  const bloq = await exigeAdmin();
  if (bloq) return bloq;
  const sb = createAdminClient();
  const { data: authData, error } = await sb.auth.admin.listUsers();
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  const { data: mods } = await sb.from("user_modules").select("user_id,modulo,papel");
  const papeisDe = new Map<string, Record<string, string>>();
  for (const m of (mods ?? []) as { user_id: string; modulo: string; papel: string }[]) {
    if (!MODULOS.has(m.modulo)) continue;
    papeisDe.set(m.user_id, { ...(papeisDe.get(m.user_id) ?? {}), [m.modulo]: m.papel });
  }
  const agora = Date.now();
  const usuarios = (authData?.users ?? []).map((u) => {
    const ban = (u as any).banned_until as string | null;
    const papeis = papeisDe.get(u.id) ?? {};
    return {
      id: u.id,
      email: u.email ?? "",
      nome: (u.user_metadata?.nome as string) ?? "",
      papel: papeis[MODULO] ?? "", // "" = sem acesso ao Tributos
      papeis, // { tributos?: papel, cnpj?: papel, y570?: papel, cpf?: papel }
      ativo: !ban || new Date(ban).getTime() < agora,
    };
  });
  usuarios.sort((a, b) => a.email.localeCompare(b.email));
  return NextResponse.json({ usuarios });
}

// Cria usuário (email + senha) e define o papel no Tributos. Admin only.
export async function POST(req: NextRequest) {
  const bloq = await exigeAdmin();
  if (bloq) return bloq;
  const { email, senha, nome, papel } = (await req.json()) as {
    email?: string; senha?: string; nome?: string; papel?: string;
  };
  if (!email) return NextResponse.json({ erro: "e-mail obrigatório" }, { status: 400 });
  // Sem senha escolhida pelo admin: uma SORTEADA, devolvida só nesta resposta.
  // (Antes era a mesma para todos, escrita no código e no .js do navegador.)
  const pass = senha && senha.length >= 8 ? senha : senhaProvisoria();
  const p = PAPEIS.includes(papel ?? "") ? papel! : "viewer";

  const sb = createAdminClient();
  const { data, error } = await sb.auth.admin.createUser({
    email: email.trim(),
    password: pass,
    email_confirm: true,
    // A troca no 1º acesso é cobrada pelo proxy em toda rota; a marca fica no
    // app_metadata, que o usuário não grava.
    app_metadata: { senha_provisoria: true },
    ...(nome ? { user_metadata: { nome } } : {}),
  });
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  const uid = data.user?.id;
  if (uid) {
    // O login já foi criado; sem o papel ele entra sem acesso ao Tributos.
    // A senha vai junto na resposta de erro, porque não aparece de novo.
    const { error: eMod } = await sb.from("user_modules").upsert({ user_id: uid, modulo: MODULO, papel: p }, { onConflict: "user_id,modulo" });
    if (eMod) {
      return NextResponse.json(
        { erro: `Usuário criado (senha provisória: ${pass}), mas o acesso ao Tributos não foi gravado — ajuste o papel na lista: ${eMod.message}` },
        { status: 500 }
      );
    }
  }
  return NextResponse.json({ ok: true, id: uid, senha: pass });
}

// Muda o papel de um usuário num módulo ("" ou "nenhum" = remove acesso). Sem
// `modulo`, é o Tributos. Admin only.
export async function PATCH(req: NextRequest) {
  const bloq = await exigeAdmin();
  if (bloq) return bloq;
  const { user_id, papel, modulo, ativo, nome, email } = (await req.json()) as { user_id?: string; papel?: string; modulo?: string; ativo?: boolean; nome?: string; email?: string };
  if (!user_id) return NextResponse.json({ erro: "user_id obrigatório" }, { status: 400 });
  const alvoModulo = modulo ?? MODULO;
  if (!MODULOS.has(alvoModulo)) return NextResponse.json({ erro: "módulo inválido" }, { status: 400 });
  const sb = createAdminClient();

  // Editar dados do usuário (nome e/ou e-mail).
  if (nome !== undefined || email !== undefined) {
    const { data: alvo } = await sb.auth.admin.getUserById(user_id);
    // O e-mail do super-admin é a chave do acesso de bootstrap: trocá-lo tranca o Admin.
    const atual = (alvo?.user?.email ?? "").toLowerCase();
    if (email && email.trim().toLowerCase() !== atual && atual === SUPER_ADMIN) {
      return NextResponse.json({ erro: "não é possível trocar o e-mail do super-admin" }, { status: 400 });
    }
    const meta = { ...(alvo?.user?.user_metadata ?? {}) };
    if (nome !== undefined) meta.nome = nome;
    const upd: Record<string, unknown> = { user_metadata: meta };
    if (email && email.trim()) { upd.email = email.trim(); upd.email_confirm = true; }
    const { error } = await sb.auth.admin.updateUserById(user_id, upd);
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  // Inativar/ativar (ban/unban). Não permite inativar a si mesmo nem o super-admin.
  if (ativo !== undefined) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id === user_id) return NextResponse.json({ erro: "você não pode inativar a si mesmo" }, { status: 400 });
    const { data: alvo } = await sb.auth.admin.getUserById(user_id);
    if ((alvo?.user?.email ?? "").toLowerCase() === SUPER_ADMIN) return NextResponse.json({ erro: "não é possível inativar o super-admin" }, { status: 400 });
    const { error } = await sb.auth.admin.updateUserById(user_id, { ban_duration: ativo ? "none" : "876000h" });
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (!papel || papel === "nenhum") {
    const { error } = await sb.from("user_modules").delete().eq("user_id", user_id).eq("modulo", alvoModulo);
    if (error) return NextResponse.json({ erro: `Não removeu o acesso no Supabase: ${error.message}` }, { status: 500 });
  } else {
    if (!PAPEIS.includes(papel)) return NextResponse.json({ erro: "papel inválido" }, { status: 400 });
    const { error } = await sb.from("user_modules").upsert({ user_id, modulo: alvoModulo, papel }, { onConflict: "user_id,modulo" });
    if (error) return NextResponse.json({ erro: `Não gravou o papel no Supabase: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// Reseta a senha de um usuário. Admin only.
export async function PUT(req: NextRequest) {
  const bloq = await exigeAdmin();
  if (bloq) return bloq;
  const { user_id, senha } = (await req.json()) as { user_id?: string; senha?: string };
  if (!user_id) return NextResponse.json({ erro: "user_id obrigatório" }, { status: 400 });
  if (senha && senha.length < 8) return NextResponse.json({ erro: "senha de no mínimo 8 caracteres" }, { status: 400 });
  const pass = senha || senhaProvisoria();
  const sb = createAdminClient();
  const { data: alvo } = await sb.auth.admin.getUserById(user_id);
  const app = { ...(alvo?.user?.app_metadata ?? {}), senha_provisoria: true };
  // email_confirm garante que o usuário consegue logar (caso tenha ficado pendente).
  const { error } = await sb.auth.admin.updateUserById(user_id, { password: pass, email_confirm: true, app_metadata: app });
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, senha: pass });
}

// Exclui um usuário. Admin only. Não permite excluir a si mesmo nem o super-admin.
export async function DELETE(req: NextRequest) {
  const bloq = await exigeAdmin();
  if (bloq) return bloq;
  const { user_id } = (await req.json()) as { user_id?: string };
  if (!user_id) return NextResponse.json({ erro: "user_id obrigatório" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.id === user_id) return NextResponse.json({ erro: "você não pode excluir a si mesmo" }, { status: 400 });

  const sb = createAdminClient();
  const { data: alvo } = await sb.auth.admin.getUserById(user_id);
  if ((alvo?.user?.email ?? "").toLowerCase() === SUPER_ADMIN) return NextResponse.json({ erro: "não é possível excluir o super-admin" }, { status: 400 });

  const { error } = await sb.auth.admin.deleteUser(user_id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
