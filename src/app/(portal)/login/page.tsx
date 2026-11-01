import { TelaLogin } from "@/vendor/acesso-core/telas";
import { avisoDoLogin } from "@/vendor/acesso-core/senha";
import { MARCA } from "../marca";

// Tela do acesso-core (igual nos cinco portais), com "Esqueci minha senha".
// O `?timeout=1` do AutoLogout vira o aviso de inatividade.
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <TelaLogin marca={MARCA} aviso={avisoDoLogin(await searchParams)} />;
}
