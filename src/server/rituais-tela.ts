import "server-only";
import {
  buscarPendenciasFlorida, mudarPendenciaFlorida,
  type MudancaPend, type ResultadoPend, type PendenciasFlorida,
} from "@/lib/fechamento-florida/pendencias-florida";
import { nomesDaFlorida } from "@/lib/fechamento-florida/cronograma-florida";
import { aplicarAcaoRitual, lerPendencias, pendenciaDaTela, temRituaisLocal } from "@/server/rituais";
import { pessoasEEmpresas } from "@/app/(portal)/api/fechamento-core/pessoas";
import { hojeYmd } from "@/lib/hoje";
import { createClient } from "@/lib/supabase/server";

// A tela dos Rituais e a sua action, nas duas fases da mudança de casa
// (decisão dela de 09/11/2026, a mesma do cronograma):
//   • com os Rituais GRAVADOS AQUI: lê e grava neste banco (a Flórida copia);
//   • antes disso: lê e grava no Portal Flórida, pela ponte antiga.
// A troca é sozinha — basta a Flórida ter trazido o histórico.
//
// ⚠️ Arquivo IGUAL nos portais RQ, WR, Inexx e 3Clicks.

/** As pendências para a tela, no formato que <PendenciasFlorida> já desenha. */
export async function pendenciasDaTela(todas: boolean): Promise<ResultadoPend> {
  if (!(await temRituaisLocal())) return buscarPendenciasFlorida(todas);
  try {
    const [{ pessoas }, nomes] = await Promise.all([pessoasEEmpresas(), nomesDaFlorida()]);
    return { ok: true, dados: (await lerPendencias(todas, hojeYmd(), pessoas, nomes)) as PendenciasFlorida };
  } catch (e) {
    return { ok: false, erro: `Não consegui ler as pendências: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Grava a mudança feita na tela — aqui ou na Flórida, conforme a fase. */
export async function mudarPendenciaNaTela(m: MudancaPend, quem: { nome: string; email: string }): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!(await temRituaisLocal())) return mudarPendenciaFlorida(m);
  // Aqui se grava com a service role, que passa por cima da RLS: a régua de
  // quem GRAVA (editor/admin do módulo) é conferida antes, pela do banco.
  const { data: pode } = await (await createClient()).rpc("rituais_grava");
  if (pode !== true) return { ok: false, erro: "Seu acesso aos Rituais é só de leitura." };
  const autor = { email: quem.email, nome: quem.nome, origem: "portal" as const };
  const { pessoas } = await pessoasEEmpresas();
  const hoje = hojeYmd();
  let r;
  if (m.tipo === "anotar") r = await aplicarAcaoRitual({ tipo: "anotar", id: m.acaoId, texto: m.texto, autor }, hoje, pessoas);
  else if (m.tipo === "situacao") r = await aplicarAcaoRitual({ tipo: "situacao_pendencia", id: m.acaoId, situacao: m.situacao, autor }, hoje, pessoas);
  else {
    const p = await pendenciaDaTela(m.acaoId, m, pessoas);
    if ("erro" in p) return { ok: false, erro: p.erro };
    r = await aplicarAcaoRitual({ tipo: "salvar_pendencia", pendencia: p, autor }, hoje, pessoas);
  }
  return r.ok ? { ok: true } : { ok: false, erro: r.erro ?? "Não gravou." };
}
