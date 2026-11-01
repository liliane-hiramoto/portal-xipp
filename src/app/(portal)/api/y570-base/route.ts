import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Histórico da ferramenta Y570 (y570-fonte-pagadora, em /y570) no banco deste
// portal. A ferramenta chama `/api/y570-base` no MESMO endereço do portal;
// sem esta rota (ou sem a tabela) ela só gera o Excel, como antes.
//
// Tudo com a sessão de quem usa (nada de service role): a RLS decide quem lê
// (y570 read), quem grava e apaga (y570 insert/delete) e — desde a 0010 —
// guarda os PDFs no bucket privado `y570-pdfs` e só aceita empresa CADASTRADA
// no portal (`y570_raiz_cadastrada`, conferida também na política de INSERT:
// a tela que só esconde continua gravando). O proxy deixa /api passar sem
// login; por isso o 401.
//
// ⚠️ Esta rota é igual nos portais (Flórida, RQ, Affix, Headset e os do modelo
// fiscal): muda só o bloco PORTAL abaixo.

// ---------- PORTAL ----------
const SQL = "0010_y570_pdfs_e_cadastro";
const RPC_LER = "y570_is_user";
const RPC_GRAVAR = "y570_is_admin";
// -----------------------------

const BUCKET = "y570-pdfs";
const MAX_EMPRESAS = 50;
const MAX_LINHAS = 20000;
const MAX_PDF = 4 * 1024 * 1024; // o corpo de uma função da Vercel aceita ~4,5 MB

type LinhaY570 = { benef: string; fonteCnpj: string; fonteNome: string; codigo: number; codigoStr: string; rendimento: number; tributo: number };
type SB = Awaited<ReturnType<typeof createClient>>;

async function sessao() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

const falta = (o_que = SQL) => NextResponse.json({ ok: false, erro: `Falta aplicar a ${o_que} no Supabase.` }, { status: 503 });
const erro = (status: number, msg: string) => NextResponse.json({ ok: false, erro: msg }, { status });
const semTabela = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || /y570_processamentos/.test(e.message ?? ""));
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
/** Onde mora o PDF `idx` do processamento `id`: `<raiz>/<id>/<idx>.pdf`. */
const caminho = (raiz: string, id: number, idx: number) => `${raiz}/${id}/${idx}.pdf`;

async function pode(supabase: SB, rpc: string) {
  const { data, error } = await supabase.rpc(rpc);
  return { pode: !!data, semFuncao: !!error };
}

/** As empresas cadastradas no portal (raiz + nome). `null` = a 0010 ainda não
 *  foi aplicada: a ferramenta não filtra, e o banco também não. */
async function cadastradas(supabase: SB): Promise<{ raiz: string; nome: string }[] | null> {
  const { data, error } = await supabase.rpc("y570_empresas_cadastradas");
  if (error) return null;
  return (data ?? []) as { raiz: string; nome: string }[];
}

async function processamento(supabase: SB, id: number) {
  const { data } = await supabase.from("y570_processamentos").select("id, raiz, nome, arquivos").eq("id", id).maybeSingle();
  return data as { id: number; raiz: string; nome: string; arquivos: string[] } | null;
}

/** Lista o histórico (sem as linhas) e as empresas cadastradas; `?id=` traz as
 *  linhas de um; `?id=&pdf=<n>` devolve o PDF guardado. */
export async function GET(req: NextRequest) {
  const { supabase, user } = await sessao();
  if (!user) return erro(401, "Sem login.");
  const ler = await pode(supabase, RPC_LER);
  if (ler.semFuncao) return falta();
  if (!ler.pode) return erro(403, "Sem o módulo Y570.");

  const sp = req.nextUrl.searchParams;
  const id = Number(sp.get("id"));
  if (id && sp.has("pdf")) {
    const idx = Number(sp.get("pdf"));
    const p = await processamento(supabase, id);
    if (!p || !Number.isInteger(idx) || idx < 0 || idx >= p.arquivos.length) return erro(404, "Não encontrado.");
    const { data, error } = await supabase.storage.from(BUCKET).download(caminho(p.raiz, id, idx));
    if (error || !data) return erro(404, "Este PDF não foi guardado (importação anterior à guarda dos PDFs).");
    const nome = (p.arquivos[idx] || `Y570_${p.raiz}_${idx + 1}.pdf`).replace(/["\r\n]/g, "");
    return new NextResponse(await data.arrayBuffer(), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nome.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
        "Cache-Control": "no-store",
      },
    });
  }
  if (id) {
    const { data, error } = await supabase.from("y570_processamentos").select("linhas").eq("id", id).maybeSingle();
    if (error || !data) return erro(404, error?.message ?? "Não encontrado.");
    return NextResponse.json({ ok: true, linhas: data.linhas });
  }

  const { data, error } = await supabase
    .from("y570_processamentos")
    .select("id, raiz, nome, arquivos, qtd_linhas, rendimento, tributo, processado_em")
    .order("processado_em", { ascending: false })
    .limit(500);
  if (semTabela(error)) return falta();
  if (error) return erro(500, error.message);
  const [gravar, empresas] = await Promise.all([pode(supabase, RPC_GRAVAR), cadastradas(supabase)]);
  return NextResponse.json({ ok: true, podeGravar: gravar.pode, processamentos: data ?? [], empresas });
}

/** `{ empresas: [{ raiz, nome, arquivos, linhas }] }` grava um processamento por
 *  empresa e devolve os ids; `?id=&pdf=<n>` com o PDF no corpo guarda o arquivo. */
export async function POST(req: NextRequest) {
  const { supabase, user } = await sessao();
  if (!user) return erro(401, "Sem login.");
  const gravar = await pode(supabase, RPC_GRAVAR);
  if (gravar.semFuncao) return falta();
  if (!gravar.pode) return erro(403, "Seu acesso ao Y570 é só leitura.");

  const sp = req.nextUrl.searchParams;
  if (sp.has("pdf")) {
    const id = Number(sp.get("id"));
    const idx = Number(sp.get("pdf"));
    const p = id ? await processamento(supabase, id) : null;
    if (!p || !Number.isInteger(idx) || idx < 0 || idx >= p.arquivos.length) return erro(404, "Processamento não encontrado.");
    const buf = Buffer.from(await req.arrayBuffer());
    if (buf.length > MAX_PDF) return erro(413, `O PDF passa de ${MAX_PDF / 1024 / 1024} MB e não foi guardado.`);
    if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") return erro(400, "O arquivo não é um PDF.");
    const { error } = await supabase.storage.from(BUCKET)
      .upload(caminho(p.raiz, id, idx), buf, { contentType: "application/pdf", upsert: false });
    if (error && /bucket/i.test(error.message)) return falta();
    if (error && !/exists|duplicate/i.test(error.message)) return erro(500, error.message);
    return NextResponse.json({ ok: true });
  }

  const corpo = (await req.json().catch(() => null)) as { empresas?: { raiz?: string; nome?: string; arquivos?: string[]; linhas?: LinhaY570[] }[] } | null;
  const empresas = Array.isArray(corpo?.empresas) ? corpo!.empresas : [];
  if (!empresas.length) return NextResponse.json({ ok: true, gravados: 0, ids: [] });
  if (empresas.length > MAX_EMPRESAS) return erro(400, `No máximo ${MAX_EMPRESAS} empresas por vez.`);

  const cad = await cadastradas(supabase);
  const rows = [];
  for (const e of empresas) {
    const raiz = String(e.raiz ?? "").replace(/\D/g, "");
    const linhas = Array.isArray(e.linhas) ? e.linhas : [];
    if (raiz.length !== 8 || !linhas.length || linhas.length > MAX_LINHAS) return erro(400, `Empresa inválida: ${String(e.raiz ?? "")}`);
    // A mesma régua da política de INSERT; aqui só para dar a mensagem certa.
    if (cad && !cad.some((c) => c.raiz === raiz)) {
      return erro(422, `${e.nome || raiz} (raiz ${raiz}) não está cadastrada neste portal. Cadastre a empresa antes de importar o PDF.`);
    }
    rows.push({
      raiz,
      nome: String(e.nome || raiz).slice(0, 200),
      arquivos: (e.arquivos ?? []).map((a) => String(a).slice(0, 200)).slice(0, 200),
      linhas,
      qtd_linhas: linhas.length,
      rendimento: r2(linhas.reduce((a, x) => a + (Number(x.rendimento) || 0), 0)),
      tributo: r2(linhas.reduce((a, x) => a + (Number(x.tributo) || 0), 0)),
      processado_por: user.id,
    });
  }
  const { data, error } = await supabase.from("y570_processamentos").insert(rows).select("id, raiz");
  if (semTabela(error)) return falta();
  if (error?.code === "42501") return erro(403, "Recusado pelo banco: acesso só leitura ou empresa não cadastrada neste portal.");
  if (error) return erro(500, error.message);
  return NextResponse.json({ ok: true, gravados: rows.length, ids: data ?? [] });
}

/** `?id=` apaga o processamento (importou a empresa errada) e os PDFs dele. */
export async function DELETE(req: NextRequest) {
  const { supabase, user } = await sessao();
  if (!user) return erro(401, "Sem login.");
  const gravar = await pode(supabase, RPC_GRAVAR);
  if (gravar.semFuncao) return falta();
  if (!gravar.pode) return erro(403, "Seu acesso ao Y570 é só leitura.");

  const id = Number(req.nextUrl.searchParams.get("id"));
  const p = id ? await processamento(supabase, id) : null;
  if (!p) return erro(404, "Processamento não encontrado.");

  // PDFs primeiro: se a linha sumisse antes, eles ficariam órfãos no bucket.
  const caminhos = p.arquivos.map((_, i) => caminho(p.raiz, id, i));
  if (caminhos.length) {
    const { error } = await supabase.storage.from(BUCKET).remove(caminhos);
    if (error && !/bucket/i.test(error.message)) return erro(500, "Não consegui apagar os PDFs: " + error.message);
  }
  const { data, error } = await supabase.from("y570_processamentos").delete().eq("id", id).select("id");
  if (error) return erro(500, error.message);
  // A RLS recusa em silêncio (0 linhas): conta o que saiu, não o que pediu.
  if (!data?.length) return erro(403, "O banco não deixou apagar este processamento.");
  return NextResponse.json({ ok: true });
}
