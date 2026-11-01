import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigeAdmin, MODULOS_ACESSO, SUPER_ADMIN } from "@/lib/papel";
import { senhaProvisoria } from "@/lib/senha";

// Tela de Acessos (src/app/(portal)/acessos) — o modelo do Portal Flórida
// (pedido dela, 01/11/2026): Pessoas, Por módulo e Perfis de acesso. Aqui a
// "pessoa" é o próprio login (o portal fiscal não tem cadastro de RH).
//
// Tudo com a SERVICE ROLE, e por isso só DEPOIS de exigeAdmin(): `user_modules`
// e os perfis (0012) não têm política de gravação para o navegador.

const PAPEIS = ["viewer", "editor", "admin"];
const MODULOS = new Set(MODULOS_ACESSO.map((m) => m.key));
const erro = (status: number, error: string) => NextResponse.json({ error }, { status });
type Body = Record<string, unknown>;

export async function GET() {
  const bloq = await exigeAdmin();
  if (bloq) return bloq;
  const sb = createAdminClient();
  const [{ data: auth, error }, { data: mods }, { data: perfis }, { data: itens }] = await Promise.all([
    sb.auth.admin.listUsers({ perPage: 1000 }),
    sb.from("user_modules").select("user_id,modulo,papel"),
    sb.from("perfis_acesso").select("id,nome,descricao,ordem,ativo").order("ordem"),
    sb.from("perfil_acesso_itens").select("perfil_id,modulo,papel"),
  ]);
  if (error) return erro(500, error.message);
  const agora = Date.now();
  const usuarios = (auth?.users ?? []).map((u) => {
    const ban = (u as { banned_until?: string | null }).banned_until;
    return {
      id: u.id,
      email: u.email ?? "",
      nome: (u.user_metadata?.nome as string) ?? "",
      ultimo_acesso: u.last_sign_in_at ?? null,
      ativo: !ban || new Date(ban).getTime() < agora,
      super_admin: (u.email ?? "").toLowerCase() === SUPER_ADMIN,
      acessos: ((mods ?? []) as { user_id: string; modulo: string; papel: string }[])
        .filter((m) => m.user_id === u.id && MODULOS.has(m.modulo))
        .map((m) => ({ modulo: m.modulo, papel: m.papel })),
    };
  });
  usuarios.sort((a, b) => (a.nome || a.email).localeCompare(b.nome || b.email, "pt-BR"));
  return NextResponse.json({
    usuarios,
    modulos: MODULOS_ACESSO,
    // Sem a 0012 aplicada, as tabelas não existem: a aba Perfis avisa.
    perfis: perfis
      ? (perfis as { id: number; nome: string; descricao: string | null; ordem: number; ativo: boolean }[]).map((p) => ({
          ...p,
          itens: ((itens ?? []) as { perfil_id: number; modulo: string; papel: string }[])
            .filter((i) => i.perfil_id === p.id)
            .map(({ modulo, papel }) => ({ modulo, papel })),
        }))
      : null,
  });
}

export async function POST(req: NextRequest) {
  const bloq = await exigeAdmin();
  if (bloq) return bloq;
  const body = ((await req.json().catch(() => null)) ?? {}) as Body;
  const sb = createAdminClient();
  const supabase = await createClient();
  const { data: { user: eu } } = await supabase.auth.getUser();
  const uid = String(body.user_id ?? "");

  /** O super-admin é a chave de bootstrap: não se inativa, exclui nem troca o e-mail. */
  async function ehSuperAdmin(id: string) {
    const { data } = await sb.auth.admin.getUserById(id);
    return (data?.user?.email ?? "").toLowerCase() === SUPER_ADMIN;
  }

  switch (body.acao) {
    case "criar_usuario": {
      const email = String(body.email ?? "").trim();
      if (!email) return erro(400, "e-mail obrigatório");
      const senha = String(body.senha ?? "");
      // Sem senha escolhida: uma SORTEADA, devolvida só nesta resposta.
      const pass = senha.length >= 8 ? senha : senhaProvisoria();
      const nome = String(body.nome ?? "").trim();
      const { data, error } = await sb.auth.admin.createUser({
        email,
        password: pass,
        email_confirm: true,
        app_metadata: { senha_provisoria: true }, // o proxy cobra a troca no 1º acesso
        ...(nome ? { user_metadata: { nome } } : {}),
      });
      if (error) return erro(400, error.message);
      return NextResponse.json({ ok: true, id: data.user?.id, senha: pass });
    }

    case "editar_usuario": {
      if (!uid) return erro(400, "user_id obrigatório");
      const { data: alvo } = await sb.auth.admin.getUserById(uid);
      const atual = (alvo?.user?.email ?? "").toLowerCase();
      const email = String(body.email ?? "").trim();
      if (email && email.toLowerCase() !== atual && atual === SUPER_ADMIN) return erro(400, "não é possível trocar o e-mail do super-admin");
      const meta = { ...(alvo?.user?.user_metadata ?? {}), nome: String(body.nome ?? "") };
      const upd: Record<string, unknown> = { user_metadata: meta };
      if (email) { upd.email = email; upd.email_confirm = true; }
      const { error } = await sb.auth.admin.updateUserById(uid, upd);
      if (error) return erro(400, error.message);
      return NextResponse.json({ ok: true });
    }

    case "ativo": {
      if (!uid) return erro(400, "user_id obrigatório");
      if (eu?.id === uid) return erro(400, "você não pode inativar a si mesmo");
      if (await ehSuperAdmin(uid)) return erro(400, "não é possível inativar o super-admin");
      const { error } = await sb.auth.admin.updateUserById(uid, { ban_duration: body.valor ? "none" : "876000h" });
      if (error) return erro(400, error.message);
      return NextResponse.json({ ok: true });
    }

    case "trocar_senha": {
      if (!uid) return erro(400, "user_id obrigatório");
      const senha = String(body.senha ?? "");
      if (senha && senha.length < 8) return erro(400, "senha de no mínimo 8 caracteres");
      const pass = senha || senhaProvisoria();
      const { data: alvo } = await sb.auth.admin.getUserById(uid);
      const app = { ...(alvo?.user?.app_metadata ?? {}), senha_provisoria: true };
      const { error } = await sb.auth.admin.updateUserById(uid, { password: pass, email_confirm: true, app_metadata: app });
      if (error) return erro(400, error.message);
      return NextResponse.json({ ok: true, senha: pass });
    }

    case "excluir_usuario": {
      if (!uid) return erro(400, "user_id obrigatório");
      if (eu?.id === uid) return erro(400, "você não pode excluir a si mesmo");
      if (await ehSuperAdmin(uid)) return erro(400, "não é possível excluir o super-admin");
      const { error } = await sb.auth.admin.deleteUser(uid);
      if (error) return erro(400, error.message);
      return NextResponse.json({ ok: true });
    }

    case "conceder_acesso": {
      const modulo = String(body.modulo ?? "");
      const papel = String(body.papel ?? "");
      if (!uid || !MODULOS.has(modulo) || !PAPEIS.includes(papel)) return erro(400, "usuário, módulo ou papel inválido");
      const { error } = await sb.from("user_modules").upsert({ user_id: uid, modulo, papel }, { onConflict: "user_id,modulo" });
      if (error) return erro(500, `Não gravou o acesso: ${error.message}`);
      return NextResponse.json({ ok: true });
    }

    case "revogar_acesso": {
      const modulo = String(body.modulo ?? "");
      if (!uid || !MODULOS.has(modulo)) return erro(400, "usuário ou módulo inválido");
      const { error } = await sb.from("user_modules").delete().eq("user_id", uid).eq("modulo", modulo);
      if (error) return erro(500, `Não tirou o acesso: ${error.message}`);
      return NextResponse.json({ ok: true });
    }

    case "aplicar_perfil": {
      const perfil = Number(body.perfil_id);
      if (!uid || !perfil) return erro(400, "user_id e perfil_id obrigatórios");
      const { data: itens, error: e } = await sb.from("perfil_acesso_itens").select("modulo,papel").eq("perfil_id", perfil);
      if (e) return erro(400, e.message);
      const linhas = ((itens ?? []) as { modulo: string; papel: string }[])
        .filter((i) => MODULOS.has(i.modulo))
        .map((i) => ({ user_id: uid, modulo: i.modulo, papel: i.papel }));
      if (!linhas.length) return erro(400, "o perfil não tem módulos");
      const { error } = await sb.from("user_modules").upsert(linhas, { onConflict: "user_id,modulo" });
      if (error) return erro(500, error.message);
      return NextResponse.json({ ok: true, aplicados: linhas.length });
    }

    case "salvar_perfil": {
      const nome = String(body.nome ?? "").trim();
      if (!nome) return erro(400, "nome do perfil obrigatório");
      const registro = {
        nome,
        descricao: body.descricao ? String(body.descricao) : null,
        ordem: Number.isFinite(Number(body.ordem)) ? Number(body.ordem) : 0,
        ativo: body.ativo !== false,
      };
      let id = Number(body.id) || 0;
      if (id) {
        const { error } = await sb.from("perfis_acesso").update(registro).eq("id", id);
        if (error) return erro(400, error.message);
      } else {
        const { data, error } = await sb.from("perfis_acesso").insert(registro).select("id").single();
        if (error) return erro(400, error.message);
        id = data.id as number;
      }
      // Substitui os itens (só módulo e papel válidos).
      const itens = (Array.isArray(body.itens) ? body.itens : [])
        .map((i) => i as { modulo?: string; papel?: string })
        .filter((i) => MODULOS.has(String(i.modulo)) && PAPEIS.includes(String(i.papel)))
        .map((i) => ({ perfil_id: id, modulo: String(i.modulo), papel: String(i.papel) }));
      const { error: eDel } = await sb.from("perfil_acesso_itens").delete().eq("perfil_id", id);
      if (eDel) return erro(400, eDel.message);
      if (itens.length) {
        const { error } = await sb.from("perfil_acesso_itens").insert(itens);
        if (error) return erro(400, error.message);
      }
      return NextResponse.json({ ok: true, id });
    }

    case "excluir_perfil": {
      const id = Number(body.id);
      if (!id) return erro(400, "id obrigatório");
      const { error } = await sb.from("perfis_acesso").delete().eq("id", id); // itens caem por cascade
      if (error) return erro(400, error.message);
      return NextResponse.json({ ok: true });
    }

    default:
      return erro(400, "ação desconhecida");
  }
}
