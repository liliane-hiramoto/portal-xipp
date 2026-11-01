import { redirect } from "next/navigation";

// O antigo "Admin de usuários" virou a tela de Acessos (modelo do Portal
// Flórida, 01/11/2026). Endereço velho guardado em favoritos cai lá.
export default function AdminPage() {
  redirect("/acessos");
}
