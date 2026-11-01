import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hojeYmd } from "@/lib/hoje";
import { cpfValido, lerRespostaCpf, mensagemStatus, nascimentoParaSerpro, soDigitos } from "@/lib/serpro/cpf";
import { consultarSerpro, serproConfigurado } from "@/lib/serpro/cpf-cliente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Consulta CPF (Serpro v3) — 0011. Tudo com a sessão de quem usa: a RLS de
// cpf_consultas decide quem lê (cpf_is_user: módulo `cpf`) e quem grava
// (cpf_is_admin: papel editor/admin).
// Consultar é COBRADO, então a rota confere o papel ANTES de chamar o Serpro —
// senão a pessoa só de leitura gastaria uma consulta que nem seria gravada.

async function sessao() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

async function podeConsultar(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.rpc("cpf_is_admin");
  return !!data;
}

/** Histórico (as 300 mais recentes) e o que a tela precisa saber. */
export async function GET() {
  const { supabase, user } = await sessao();
  if (!user) return NextResponse.json({ ok: false, erro: "Sem login." }, { status: 401 });
  const { data: tem } = await supabase.rpc("cpf_is_user");
  if (!tem) return NextResponse.json({ ok: false, erro: "Sem o módulo Consulta CPF." }, { status: 403 });

  const { data, error } = await supabase
    .from("cpf_consultas")
    .select("id, cpf, nascimento_informado, http_status, nome, nome_social, nascimento, situacao_codigo, situacao_descricao, data_inscricao, data_atualizacao, consultado_em")
    .order("consultado_em", { ascending: false })
    .limit(300);
  if (error) {
    const falta = error.code === "42P01" || error.code === "PGRST205";
    return NextResponse.json({ ok: false, erro: falta ? "Falta aplicar a 0011 no Supabase." : error.message }, { status: falta ? 503 : 500 });
  }
  return NextResponse.json({
    ok: true,
    podeConsultar: await podeConsultar(supabase),
    configurado: serproConfigurado(),
    consultas: data ?? [],
  });
}

/** Consulta um CPF no Serpro e grava no histórico. */
export async function POST(req: NextRequest) {
  const { supabase, user } = await sessao();
  if (!user) return NextResponse.json({ ok: false, erro: "Sem login." }, { status: 401 });
  if (!(await podeConsultar(supabase))) {
    return NextResponse.json({ ok: false, erro: "Seu acesso à Consulta CPF é só leitura." }, { status: 403 });
  }
  if (!serproConfigurado()) {
    return NextResponse.json({ ok: false, erro: "As chaves do Serpro ainda não foram colocadas na Vercel (SERPRO_CONSUMER_KEY e SERPRO_CONSUMER_SECRET)." }, { status: 503 });
  }

  const corpo = (await req.json().catch(() => null)) as { cpf?: string; nascimento?: string } | null;
  const cpf = soDigitos(corpo?.cpf);
  if (!cpfValido(cpf)) return NextResponse.json({ ok: false, erro: "CPF inválido (confira os dígitos)." }, { status: 400 });
  const nasc = nascimentoParaSerpro(String(corpo?.nascimento ?? ""), hojeYmd());
  if (!nasc) return NextResponse.json({ ok: false, erro: "Data de nascimento inválida." }, { status: 400 });

  let status: number;
  let resposta: Record<string, unknown> | null;
  try {
    ({ status, corpo: resposta } = await consultarSerpro(cpf, nasc));
  } catch (e) {
    const st = (e as { status?: number }).status;
    return NextResponse.json({ ok: false, erro: st ? mensagemStatus(st) : "Não consegui falar com o Serpro. Tente de novo em alguns minutos." }, { status: 502 });
  }

  // Só 200/206/404 são consulta de verdade (e cobrada): essas vão ao histórico.
  if (![200, 206, 404].includes(status)) {
    return NextResponse.json({ ok: false, erro: mensagemStatus(status) }, { status: 502 });
  }
  const lido = status === 404 || !resposta ? null : lerRespostaCpf(resposta, cpf);
  const linha = {
    cpf,
    nascimento_informado: String(corpo?.nascimento),
    http_status: status,
    nome: lido?.nome ?? null,
    nome_social: lido?.nome_social ?? null,
    nascimento: lido?.nascimento ?? null,
    situacao_codigo: lido?.situacao_codigo ?? null,
    situacao_descricao: lido?.situacao_descricao ?? null,
    data_inscricao: lido?.data_inscricao ?? null,
    data_atualizacao: lido?.data_atualizacao ?? null,
    resposta,
    consultado_por: user.id,
  };
  const { data: gravada, error } = await supabase.from("cpf_consultas").insert(linha).select("id, consultado_em").single();
  return NextResponse.json({
    ok: true,
    mensagem: mensagemStatus(status),
    consulta: { ...linha, resposta: undefined, id: gravada?.id ?? null, consultado_em: gravada?.consultado_em ?? new Date().toISOString() },
    avisoGravacao: error ? `A consulta foi feita, mas não entrou no histórico: ${error.message}` : null,
  });
}
