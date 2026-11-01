import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TelaTrocarSenha } from "@/vendor/acesso-core/telas";
import { MARCA } from "../marca";

// Quem entrou com a senha provisória, quem chegou pelo link do "Esqueci minha
// senha" ou quer trocar a própria senha. A troca passa por /api/trocar-senha:
// só o servidor apaga a marca de senha provisória (app_metadata).
export default async function TrocarSenhaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <TelaTrocarSenha marca={MARCA} rota="/api/trocar-senha" />;
}
