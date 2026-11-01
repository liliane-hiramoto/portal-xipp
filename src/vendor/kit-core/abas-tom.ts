// O TOM DA ABA — puro, para ter teste (o `.tsx` tem JSX e não roda no Node).
// Vindo da Headset (`lib/tom-aba.ts`), estilo "Pasta", escolhido pela usuária
// em 20/10/2026 para os cinco portais.
//
// O tom vale para a aba FECHADA. A aberta é uma só na tira e é sempre a mesma
// em toda tela: é assim que se sabe onde se está sem reaprender a cada tela.
//
//   · `padrao`   — uma aba comum;
//   · `destaque` — a que precisa ser achada na fila (o Consolidado entre as
//     conferências; a conta VIVA entre as contas);
//   · `apagada`  — histórico: ainda se consulta, não se espera mais nada dela.
//
// As cores são do portal (`--brand`, `--ink-3`…), com reserva escrita na
// classe. O risco embaixo da aberta e a bolinha dela têm variável própria
// (`--aba-risco`, `--aba-contador`): a Headset as aponta para o `--accent`
// dela; nos outros portais o `--accent` quer dizer outra coisa, então a
// reserva é o `--brand-2`.
export type TomAba = "padrao" | "destaque" | "apagada";

/**
 * As quatro escolhas, UMA classe cada. Duas classes na mesma propriedade
 * brigam, e quem ganha é a ordem do CSS gerado — não a do atributo.
 */
export function classesDaAba(args: { ativa: boolean; tom: TomAba; filha: boolean }) {
  const { ativa, tom, filha } = args;
  return {
    fundo: ativa
      ? "bg-[var(--bg-2,#f8fafc)] shadow-[inset_0_-3px_0_var(--aba-risco,var(--brand-2,#2563eb))]"
      : "bg-[var(--paper,#fff)]",
    // A encerrada não volta a se anunciar ao ser aberta — escurece, e segue
    // sendo a selecionada.
    cor: ativa
      ? (tom === "apagada" ? "text-[var(--ink-2,#475569)]" : "text-[var(--brand,#0f172a)]")
      : tom === "destaque" ? "text-[var(--brand,#0f172a)]" : "text-[var(--ink-3,#94a3b8)]",
    tamanho: filha ? "text-[12px]" : "text-[13px]",
    // O PESO MUDA JUNTO COM A COR na apagada: quem distingue mal duas cores
    // não veria diferença nenhuma só pelo tom.
    peso: filha ? "font-medium" : tom === "apagada" ? "font-normal" : "font-semibold",
  };
}
