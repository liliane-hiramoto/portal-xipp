"use client";

import { useEffect } from "react";

/**
 * Tela de erro do Portal inteiro (App Router: vale para toda rota que não tenha
 * um `error.tsx` mais específico).
 *
 * Por que ela existe: sem um error boundary, qualquer exceção de uma tela
 * derruba a árvore inteira e o Next mostra a página genérica
 * "Application error: a client-side exception has occurred" — que, para quem
 * está usando o sistema, é indistinguível de "a tela não abre" e não deixa nada
 * para relatar. Aqui a mensagem aparece, com o `digest` (o código que liga o
 * erro ao log do servidor) e um botão para tentar de novo sem recarregar tudo.

 */
export default function ErroDoPortal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // O console do navegador continua sendo o lugar com a pilha completa.
  useEffect(() => {
    console.error("[Portal] erro na tela:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-800">Esta tela não abriu</h1>
        <p className="mt-2 text-[14px] text-slate-600">
          Alguma coisa quebrou ao montar a página. O resto do Portal continua
          funcionando — dá para voltar e seguir por outro caminho.
        </p>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Mensagem do erro
          </div>
          <p className="mt-1 break-words font-mono text-xs text-slate-800">
            {error?.message || "(sem mensagem)"}
          </p>
          {error?.digest && (
            <p className="mt-2 font-mono text-[11px] text-slate-400">digest: {error.digest}</p>
          )}
        </div>

        <p className="mt-3 text-xs text-slate-400">
          Copie o texto acima ao relatar o problema — é ele que diz onde olhar.
        </p>

        <div className="mt-5 flex gap-2">
          <button
            onClick={reset}
            className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-[14px] text-white hover:opacity-90"
          >
            Tentar de novo
          </button>
          {/* Recarrega de verdade, em vez de navegar pelo router: quando a
              árvore quebrou, um reload limpo é mais confiável que um <Link>. */}
          <button
            onClick={() => { window.location.href = "/"; }}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-[14px] text-slate-600 hover:bg-slate-50"
          >
            Voltar ao Portal
          </button>
        </div>
      </div>
    </div>
  );
}
