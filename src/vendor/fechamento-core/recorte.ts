// Fechamento › Portais dos clientes: QUAIS empresas um portal enxerga.
//
// Pedido dela (04/11/2026): escolher o grupo econômico e, dentro dele, as
// empresas. A regra, por grupo marcado:
//   • nenhuma empresa dele escolhida → o grupo INTEIRO, inclusive as empresas
//     cadastradas depois (o comportamento da 0159, que continua valendo);
//   • alguma escolhida → só as escolhidas.
// Empresa escolhida fora de grupo marcado (ou sem grupo) entra sozinha.
//
// Puro e sem imports: o servidor (montarPayload) e a tela usam a MESMA conta,
// e o teste roda em node puro (supabase/testes/fechamento-recorte.mjs).

export interface EmpresaDoRecorte { id: number; grupoId: number | null }

export function empresasDoPortal(
  empresas: EmpresaDoRecorte[], grupoIds: number[], empresaIds: number[],
): number[] {
  const grupos = new Set(grupoIds);
  const escolhidas = new Set(empresaIds);
  // Grupos marcados que têm empresa escolhida: viram "só as escolhidas".
  const comEscolha = new Set(
    empresas.filter((e) => e.grupoId != null && grupos.has(e.grupoId) && escolhidas.has(e.id)).map((e) => e.grupoId as number),
  );
  return empresas
    .filter((e) => escolhidas.has(e.id)
      || (e.grupoId != null && grupos.has(e.grupoId) && !comEscolha.has(e.grupoId)))
    .map((e) => e.id);
}
