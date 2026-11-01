/**
 * Tela de espera do Portal.
 *
 * Toda página daqui confere a sessão e o papel no servidor antes de desenhar.
 * Sem um `loading.tsx`, o Next segura a navegação: o clique no card não muda
 * nada até a resposta chegar, e quem usa conclui que travou. Com este arquivo
 * a espera aparece na hora e a página chega por cima.
 *
 * Vale para toda rota que não tiver um loading próprio. Dentro do Financeiro a
 * troca de tela é no navegador e não passa por aqui.
 */
export default function Carregando() {
  return (
    <div className="flex min-h-screen items-center justify-center gap-3 bg-slate-50 text-sm text-slate-500" aria-busy="true">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-[var(--brand)]" aria-hidden />
      Carregando…
    </div>
  );
}
