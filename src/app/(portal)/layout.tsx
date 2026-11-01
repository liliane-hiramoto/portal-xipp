import type { Metadata } from "next";
import "./globals.css";
import AutoLogout from "@/components/AutoLogout";
import RecuperaDeploySkew from "@/components/RecuperaDeploySkew";
import { PORTAL } from "@/config/portal";

export const metadata: Metadata = {
  title: PORTAL.nome,
  description: `${PORTAL.nome} — Tributos, Y570, Consulta CNPJ e Consulta CPF · ${PORTAL.empresa}`,
  icons: { icon: PORTAL.favicon },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <AutoLogout />
        <RecuperaDeploySkew />
        {children}
      </body>
    </html>
  );
}
