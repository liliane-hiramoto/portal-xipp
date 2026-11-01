"use client";

import { useEffect } from "react";

/**
 * Recupera a navegação quando o navegador recebe um pedaço de JavaScript que
 * não é JavaScript.
 *
 * O caso real (17/09/2026, Portal Flórida, tela Pessoas): a aba estava aberta desde ANTES do
 * último deploy. Clicar em "Pessoas" faz o Next buscar o pedaço de código
 * daquela rota, com o `?dpl=` do deploy velho. Quando esse arquivo não existe
 * mais, a Vercel devolve uma página de erro em HTML — e o navegador, que
 * esperava JavaScript, estoura com
 *
 *     Uncaught SyntaxError: Invalid or unexpected token
 *
 * Do lado de quem usa, o clique simplesmente não faz nada: a URL não muda e a
 * tela "não abre". Não há o que consertar no código da tela — o código nunca
 * chegou. O conserto é recarregar a página, que é o que isto faz.
 *
 * Duas travas para não virar um laço de recarga:
 *   • só age nos erros com cara de pedaço-de-código-que-não-carregou;
 *   • no máximo UMA recarga por minuto (guardado na aba, em sessionStorage).
 * Passou disso, o erro segue para a tela de erro do Portal (`src/app/error.tsx`),
 * onde aparece a mensagem em vez de sumir.
 */

const MARCA = "portal:recarga-chunk";
const JANELA_MS = 60_000;

/** Mensagens de "o arquivo de código não veio, ou veio torto". */
const PADROES = [
  "invalid or unexpected token",
  "unexpected token '<'",
  "chunkloaderror",
  "loading chunk",
  "loading css chunk",
  "failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "importing a module script failed",
  "'text/html' is not a valid javascript mime type",
];

const ehErroDeChunk = (msg: string) => {
  const m = msg.toLowerCase();
  return PADROES.some((p) => m.includes(p));
};

export default function RecuperaDeploySkew() {
  useEffect(() => {
    // sessionStorage pode estar bloqueado (janela anônima, cookies barrados):
    // sem ele a gente simplesmente não recarrega, em vez de quebrar aqui.
    const recarregouAgora = () => {
      try {
        const t = Number(window.sessionStorage.getItem(MARCA) || 0);
        return Date.now() - t < JANELA_MS;
      } catch {
        return true;
      }
    };
    const marcar = () => {
      try {
        window.sessionStorage.setItem(MARCA, String(Date.now()));
        return true;
      } catch {
        return false;
      }
    };

    const tratar = (msg: string) => {
      if (!msg || !ehErroDeChunk(msg) || recarregouAgora()) return;
      if (!marcar()) return;
      console.warn("[Portal] código da tela não carregou (deploy novo?) — recarregando.");
      window.location.reload();
    };

    const onErro = (e: ErrorEvent) => tratar(e.message || String(e.error ?? ""));
    const onRejeicao = (e: PromiseRejectionEvent) => {
      const r = e.reason as { name?: string; message?: string } | string | undefined;
      tratar(typeof r === "string" ? r : `${r?.name ?? ""} ${r?.message ?? ""}`);
    };

    window.addEventListener("error", onErro);
    window.addEventListener("unhandledrejection", onRejeicao);
    return () => {
      window.removeEventListener("error", onErro);
      window.removeEventListener("unhandledrejection", onRejeicao);
    };
  }, []);

  return null;
}
