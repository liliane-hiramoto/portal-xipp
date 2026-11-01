import type { NextConfig } from "next";
import { PORTAL } from "./src/config/portal";

// Módulo Tributos, Y570 e Consulta CNPJ (30/10/2026, pedido dela — replicado
// do Portal Flórida, 0204/0207/0208):
// - /tributos é a INSTÂNCIA deste portal do canônico `tributos-web` (projeto
//   próprio na Vercel, basePath /tributos), servida AQUI, no mesmo domínio e
//   login (Multi-Zones). O endereço está em `src/config/portal.ts`.
// - /y570 (Y570 da ECF, PDF → Excel) e /cnpj (Consulta CNPJ e SN) são apps
//   compartilhados entre os portais, SEM login próprio: quem os tranca é o
//   proxy (src/lib/supabase/middleware.ts) — /y570 pelo módulo `y570`,
//   /cnpj pelo módulo `cnpj` (cada um com card e papel próprios). A Consulta CNPJ guarda a base no banco DESTE
//   portal pela rota /api/cnpj-base.
const CNPJ_APP = "https://cnpj-base-web.vercel.app";
const Y570_APP = "https://y570-app.vercel.app";

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/tributos", destination: `${PORTAL.tributosApp}/tributos` },
        { source: "/tributos/:path*", destination: `${PORTAL.tributosApp}/tributos/:path*` },
        { source: "/y570", destination: `${Y570_APP}/y570` },
        { source: "/y570/:path*", destination: `${Y570_APP}/y570/:path*` },
        { source: "/cnpj", destination: `${CNPJ_APP}/cnpj` },
        { source: "/cnpj/:path*", destination: `${CNPJ_APP}/cnpj/:path*` },
      ],
    };
  },
};

export default nextConfig;
