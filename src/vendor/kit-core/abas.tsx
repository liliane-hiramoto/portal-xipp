"use client";

import type { ReactNode } from "react";
import { classesDaAba, type TomAba } from "./abas-tom";

export type { TomAba };

// A ABA — estilo "Pasta", o mesmo nos cinco portais (escolha da usuária,
// 20/10/2026). Vinda da Headset, onde já tinha juntado SEIS cópias.
//
// Dois contadores, e eles não são sinônimos: `n` é QUANTOS SÃO (bolinha cinza)
// e `alerta` é QUANTOS FALTAM RESOLVER (bolinha vermelha, some no zero). Nunca
// escreva o número dentro do rótulo.
//
// Não defina a aba dentro do render da tela: a identidade da função muda a
// cada render e o React remonta a subárvore inteira.

/**
 * A TIRA de abas. `trilho` fecha a base com um risco: a aba não tem borda de
 * baixo (ela se abre para o painel). Quando o que vem abaixo é um painel
 * colado, ele mesmo fecha; quando são blocos soltos, sem o trilho as abas
 * ficam com o pé aberto no ar.
 */
export function TiraAbas({ children, trilho = false, className = "" }: {
  children: ReactNode;
  trilho?: boolean;
  /** O recuo da tela onde ela vive (`mx-6`, por exemplo). */
  className?: string;
}) {
  return (
    <div className={`mt-3.5 flex flex-wrap gap-1.5 ${trilho ? "border-b border-[var(--line,#e2e8f0)]" : ""} ${className}`}>
      {children}
    </div>
  );
}

/** Uma aba. */
export function Aba({
  ativa, label, n, alerta, dica, tom = "padrao", filha = false, expandida, aoExpandir, onClick,
}: {
  ativa: boolean;
  label: string;
  /** QUANTOS SÃO — a bolinha cinza. Omitido, o número não aparece. */
  n?: number;
  /**
   * QUANTOS FALTAM RESOLVER — a bolinha vermelha. Some no zero. Não é
   * contagem: "126 fornecedores" aqui pintaria 126 cadastros como problemas.
   */
  alerta?: number;
  /** A dica do `title`, quando o rótulo não cabe o que a aba significa. */
  dica?: string;
  tom?: TomAba;
  /** ABA FILHA (a conta pendurada na empresa): recuada e menor. */
  filha?: boolean;
  /** Com `aoExpandir`: as filhas estão abertas? Troca o `+` pelo `−`. */
  expandida?: boolean;
  /**
   * O (+) QUE ABRE AS FILHAS. Fica FORA do botão da aba: botão dentro de botão
   * é HTML inválido, e abrir as contas trocaria de aba junto.
   */
  aoExpandir?: () => void;
  onClick: () => void;
}) {
  const { fundo, cor, tamanho, peso } = classesDaAba({ ativa, tom, filha });
  const bolinha = "ml-1.5 inline-block rounded-full px-[7px] py-px text-[11px]";
  const moldura = `rounded-t-[10px] border border-b-0 border-[var(--line,#e2e8f0)] ${fundo} ${filha ? "ml-3" : ""}`;
  const miolo = (
    <>
      {filha && <span className="mr-1 text-[var(--ink-3,#94a3b8)]">↳</span>}
      {label}
      {n !== undefined && (
        <span className={`${bolinha} ${ativa
          ? "bg-[var(--aba-contador,#e0e7ff)] text-[var(--brand,#0f172a)]"
          : "bg-[var(--line-2,#f1f5f9)] text-[var(--ink-3,#94a3b8)]"}`}>
          {n}
        </span>
      )}
      {alerta ? (
        <span className={`${bolinha} bg-[var(--neg-bg,#fef2f2)] font-bold text-[var(--red,#dc2626)]`}>{alerta}</span>
      ) : null}
    </>
  );

  if (!aoExpandir) {
    return (
      <button type="button" onClick={onClick} title={dica} aria-pressed={ativa}
        className={`cursor-pointer px-3.5 py-[9px] ${moldura} ${tamanho} ${peso} ${cor}`}>
        {miolo}
      </button>
    );
  }
  return (
    <span className={`inline-flex items-center ${moldura}`}>
      <button type="button" onClick={aoExpandir}
        title={expandida ? "Fechar o que está pendurado nesta aba" : "Abrir o que está pendurado nesta aba"}
        className="cursor-pointer py-[9px] pl-2 text-[11px] text-[var(--ink-3,#94a3b8)] hover:text-[var(--brand,#0f172a)]">
        {expandida ? "−" : "+"}
      </button>
      <button type="button" onClick={onClick} title={dica} aria-pressed={ativa}
        className={`cursor-pointer py-[9px] pl-1.5 pr-3.5 ${tamanho} ${peso} ${cor}`}>
        {miolo}
      </button>
    </span>
  );
}
