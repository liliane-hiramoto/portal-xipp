import type { Marca } from "@/vendor/acesso-core/telas";
import { PORTAL } from "@/config/portal";

// A marca das telas de acesso (login, trocar senha), que vêm do acesso-core.
export const MARCA: Marca = {
  nome: PORTAL.nome,
  cor: "var(--brand)",
  logo: (
    <div style={{ display: "inline-flex", borderRadius: 6, background: "var(--brand)", padding: "12px 20px" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={PORTAL.logo} alt={PORTAL.empresa} style={{ height: 36, width: "auto" }} />
    </div>
  ),
  rodape: "O acesso é criado pelo administrador. Não há cadastro aberto.",
};
