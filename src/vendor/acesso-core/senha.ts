// Senha: as regras que todo portal usa — uma conta só.
//
// Puro (sem React, sem Supabase): roda no navegador, no servidor e no teste.

export const SENHA_MINIMA = 8;

/** Mensagem de erro da senha nova, ou null se estiver boa. */
export function erroSenhaNova(senha: string, confirmacao: string): string | null {
  if (senha.length < SENHA_MINIMA) return `A senha deve ter no mínimo ${SENHA_MINIMA} caracteres.`;
  if (senha !== confirmacao) return "As senhas não conferem.";
  return null;
}

/**
 * Senha provisória legível: 12 caracteres sem os que se confundem (0/O, 1/l/I).
 * SORTEADA no servidor e mostrada uma vez ao admin — nunca uma senha fixa no
 * código (o 3Clicks tinha uma, pública no .js do site, até 18/10/2026).
 */
export function senhaProvisoria(
  aleatorio: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n)),
): string {
  const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(aleatorio(12), (b) => ALFABETO[b % ALFABETO.length]).join("");
}

/**
 * Marca "tem de trocar a senha". Só a do `app_metadata` vale: o
 * `user_metadata` o próprio usuário grava pela API, então quem entrasse com a
 * senha provisória podia apagar a marca e seguir.
 */
export function precisaTrocarSenha(user: { app_metadata?: Record<string, unknown> } | null): boolean {
  return user?.app_metadata?.senha_provisoria === true;
}

/** Rotas que quem está com senha provisória ainda pode abrir. */
export function liberadaComSenhaProvisoria(path: string): boolean {
  return path === "/trocar-senha" || path === "/api/trocar-senha" || path === "/logout" ||
    path.startsWith("/login") || path.startsWith("/auth");
}

/**
 * Para onde mandar depois do login ou do link do e-mail. Só caminho DESTE
 * site: "//outro.com" e "https://…" viram "/" — senão o link do e-mail
 * vira um redirecionador aberto para qualquer endereço.
 */
export function destinoSeguro(destino: string | null | undefined, padrao = "/"): string {
  if (!destino || !destino.startsWith("/") || destino.startsWith("//") || destino.startsWith("/\\")) return padrao;
  return destino;
}

/**
 * O aviso do topo do login, a partir da URL (`?timeout=1`, `?expirado=1`,
 * `?link=invalido`). Mora aqui, e não em telas.tsx, porque quem chama é a
 * PÁGINA (servidor), e função de arquivo "use client" não roda no servidor.
 */
export function avisoDoLogin(q: Record<string, string | string[] | undefined>): string | undefined {
  if (q.link === "invalido") return "O link expirou ou foi aberto em outro navegador. Peça um novo em “Esqueci minha senha”.";
  if (q.timeout || q.expirado) return "Sua sessão foi encerrada por inatividade. Entre de novo.";
  // "Entrar pelo Flórida" (passe.ts / entrada.ts).
  if (q.passe === "sem-conta") return "Você ainda não tem conta neste portal. Peça o acesso ao administrador dele e depois entre de novo pelo Flórida.";
  if (q.passe === "invalido") return "Não deu para entrar pelo Flórida (o atalho vale 1 minuto). Volte ao Flórida e clique de novo, ou entre com e-mail e senha.";
  if (q.passe === "indisponivel") return "A entrada pelo Flórida não está disponível agora. Entre com e-mail e senha.";
  return undefined;
}
