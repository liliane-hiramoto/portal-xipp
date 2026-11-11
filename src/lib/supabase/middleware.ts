import { type NextRequest } from "next/server";
import { atualizarSessao, cobrarTrocaDeSenha, redirecionar, rotaDeAcesso } from "@/vendor/acesso-core/sessao";
import { SUPER_ADMIN } from "@/lib/papel";
import { lerAcessos, type Busca } from "@/lib/modulos-db";

// Apps servidos por OUTRO projeto da Vercel (rewrites do next.config.ts) e o
// módulo de `user_modules` que cada um exige. Eles NÃO têm login próprio: sem
// esta trava, qualquer login abriria as ferramentas. /cnpj e /y570 têm módulo
// próprio, separado do `tributos`: quem vê um não precisa ver o outro.
// Replicado do Portal Flórida (0208, 0212).
const ZONAS_MODULO: [string, string][] = [
  ["/tributos", "tributos"],
  ["/y570", "y570"], // card próprio desde a 0009 (era do Tributos)
  ["/cnpj", "cnpj"],
];

/**
 * Mantém a sessão do Supabase atualizada nos cookies a cada requisição e
 * protege as rotas: quem não está logado é mandado para /login. A sessão e a
 * cobrança da senha provisória são do acesso-core (iguais nos cinco portais).
 */
export async function updateSession(request: NextRequest) {
  const { resposta, user, supabase } = await atualizarSessao(request);

  const path = request.nextUrl.pathname;
  // Rotas de API cuidam da própria autenticação (respondem 401 sem login) —
  // não redirecionar para /login: a ferramenta precisa da resposta em JSON.
  if (!user && !rotaDeAcesso(path) && !path.startsWith("/api")) return redirecionar(request, "/login");

  // Zonas de outro app: só quem tem o módulo (ou é admin do portal / super-admin).
  // O proxy protege a TELA; o DADO dessas ferramentas segue a RLS (tabelas
  // trib_* e trib_cnpj_base) com as mesmas funções do banco.
  const zona = user ? ZONAS_MODULO.find(([p]) => path === p || path.startsWith(p + "/")) : undefined;
  if (zona && user) {
    const superAdmin = (user.email ?? "").toLowerCase() === SUPER_ADMIN;
    if (!superAdmin) {
      // core.acessos pela view (0014); sem ela, o user_modules de sempre.
      const buscar: Busca = async (tabela, colunas, filtro) => {
        let q = supabase.from(tabela).select(colunas);
        if (filtro) q = q.eq(filtro.coluna, filtro.valor);
        const { data, error } = await q;
        return { data: data as unknown[] | null, error };
      };
      const linhas = await lerAcessos(buscar, user.id);
      const pode = linhas.some((r) => r.modulo === zona[1] || (r.modulo === "portal" && r.papel === "admin")); // 0013: admin do PORTAL, não de outro módulo
      if (!pode) return redirecionar(request, "/");
    }
  }

  // Senha provisória: só a troca de senha abre. Vale para TODA rota — antes só
  // o Portal e o Financeiro cobravam, e o resto funcionava com a senha padrão.
  return cobrarTrocaDeSenha(request, user) ?? resposta;
}
