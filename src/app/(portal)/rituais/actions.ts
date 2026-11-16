"use server";

import { redirect } from "next/navigation";
import { mudancaDoForm } from "@/lib/fechamento-florida/pendencias-florida";
import { mudarPendenciaNaTela } from "@/server/rituais-tela";
import { quemPodeRituais } from "./acesso";

// Anotar, mudar a situação, criar e editar uma pendência. A action é um
// endpoint público: confere o acesso de novo aqui, não só na página — e quem
// GRAVA (editor/admin) é conferido dentro de mudarPendenciaNaTela.
export async function mudarPendencia(fd: FormData): Promise<void> {
  const quem = await quemPodeRituais();
  if (!quem) redirect("/");
  const todas = fd.get("todas") === "1" ? "todas=1&" : "";
  const m = mudancaDoForm(fd, quem.nome);
  if (!m) redirect(`/rituais?${todas}erro=${encodeURIComponent("Preencha o campo antes de enviar.")}`);
  const r = await mudarPendenciaNaTela(m, quem);
  if (r.ok) redirect(`/rituais?${todas}ok=${m.tipo === "anotar" ? "anotada" : m.tipo === "situacao" ? "situacao" : "salva"}`);
  // Salvar que falhou volta com o formulário aberto.
  const reabre = m.tipo === "salvar" ? (m.acaoId ? `editar=${m.acaoId}&` : "nova=1&") : "";
  redirect(`/rituais?${todas}${reabre}erro=${encodeURIComponent(r.erro)}`);
}
