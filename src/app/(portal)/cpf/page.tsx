import CpfClient from "./CpfClient";

export const dynamic = "force-dynamic";

/** Consulta CPF (0011). O acesso é conferido no layout; os dados vêm de /api/cpf. */
export default function CpfPage() {
  return <CpfClient />;
}
