// "Entrar pelo Flórida" (09/11/2026, pedido dela: "temos opção de logar apenas
// no Portal Flórida, sem precisar logar nos demais portais novamente?").
//
// Quem está logado no Flórida clica no atalho de outro portal; o Flórida
// ASSINA um passe curto (60 s, só para aquele endereço, com o e-mail de quem
// clicou) e o entrega ao portal; o portal confere a assinatura com a chave
// PÚBLICA do Flórida e abre a sessão da conta de MESMO e-mail que já existe lá.
//
// Por que assinatura e não uma senha combinada: com chave pública, só o Flórida
// consegue emitir o passe (a privada mora no banco dele, sem política nenhuma),
// e os portais não guardam segredo nenhum — conferem com a pública, que o
// próprio Flórida publica em /api/passe/chave.
//
// ⚠️ O passe NÃO dá acesso: dispensa a senha de quem já tem conta no portal. O
// que a pessoa vê lá continua decidido no Admin daquele portal.
//
// Puro (só node:crypto): roda nas rotas de servidor e no teste.
import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from "node:crypto";

/** O endereço oficial do Flórida (decisão dela, 18/10/2026). */
export const FLORIDA = "https://portal-florida.vercel.app";
/** Onde os portais buscam a chave pública do passe. */
export const URL_CHAVE_PUBLICA = `${FLORIDA}/api/passe/chave`;
/** Quanto tempo o passe vale. Curto: ele só atravessa de uma aba para a outra. */
export const VALIDADE_PASSE_S = 60;

export interface Passe {
  v: 1;
  email: string;
  /** O endereço (origem) do portal a que o passe se destina. */
  para: string;
  emitido: number;
  vence: number;
  n: string;
}

const b64u = (b: Buffer) => b.toString("base64url");

/** Origem normalizada ("https://portal-rq.vercel.app"), ou null se não for https. */
export function origemDe(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
}

/** Par novo de chaves Ed25519, em PEM. Só o Flórida gera (e guarda a privada). */
export function gerarParDeChaves(): { privada: string; publica: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privada: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publica: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

/** A pública que corresponde à privada (o Flórida publica esta). */
export function publicaDe(privadaPem: string): string {
  return createPublicKey(createPrivateKey(privadaPem)).export({ type: "spki", format: "pem" }).toString();
}

/** Assina o passe de `email` para o portal em `para`. */
export function assinarPasse(
  email: string, para: string, privadaPem: string, agora: number = Date.now(),
): string {
  const destino = origemDe(para);
  if (!destino) throw new Error("endereço do portal inválido (precisa ser https)");
  const e = email.trim().toLowerCase();
  if (!e.includes("@")) throw new Error("e-mail inválido");
  const emitido = Math.floor(agora / 1000);
  const passe: Passe = { v: 1, email: e, para: destino, emitido, vence: emitido + VALIDADE_PASSE_S, n: b64u(randomBytes(9)) };
  const corpo = b64u(Buffer.from(JSON.stringify(passe)));
  const assinatura = sign(null, Buffer.from(corpo), createPrivateKey(privadaPem));
  return `${corpo}.${b64u(assinatura)}`;
}

export type LeituraPasse = { ok: true; email: string } | { ok: false; motivo: "formato" | "assinatura" | "destino" | "vencido" };

/**
 * Confere o passe: assinatura do Flórida, endereço deste portal e validade.
 * `aqui` é a origem que recebeu o passe (request.nextUrl.origin).
 */
export function lerPasse(
  token: string, publicaPem: string, aqui: string, agora: number = Date.now(),
): LeituraPasse {
  const partes = (token ?? "").split(".");
  if (partes.length !== 2 || !partes[0] || !partes[1]) return { ok: false, motivo: "formato" };
  let valida = false;
  try {
    valida = verify(null, Buffer.from(partes[0]), createPublicKey(publicaPem), Buffer.from(partes[1], "base64url"));
  } catch {
    valida = false;
  }
  if (!valida) return { ok: false, motivo: "assinatura" };
  let p: Passe;
  try {
    p = JSON.parse(Buffer.from(partes[0], "base64url").toString("utf8"));
  } catch {
    return { ok: false, motivo: "formato" };
  }
  if (p?.v !== 1 || typeof p.email !== "string" || typeof p.vence !== "number") return { ok: false, motivo: "formato" };
  if (p.para !== origemDe(aqui)) return { ok: false, motivo: "destino" };
  const s = Math.floor(agora / 1000);
  // 5 s de folga para o relógio de um servidor estar um pouco atrás do outro.
  if (s > p.vence || s + 5 < p.emitido) return { ok: false, motivo: "vencido" };
  return { ok: true, email: p.email };
}

/**
 * A página que leva o passe: um formulário que se envia sozinho (POST), para o
 * passe não ficar no endereço — histórico do navegador e log de servidor
 * guardam URL, não corpo de formulário.
 */
export function paginaDeEntrega(para: string, passe: string, nomePortal: string): string {
  const destino = origemDe(para);
  if (!destino) throw new Error("endereço do portal inválido");
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Abrindo ${esc(nomePortal)}…</title><meta name="referrer" content="no-referrer"></head>`
    + `<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;color:#334155">`
    + `<form id="f" method="post" action="${esc(destino)}/auth/florida"><input type="hidden" name="passe" value="${esc(passe)}">`
    + `<p>Abrindo ${esc(nomePortal)}…</p><noscript><button type="submit">Continuar</button></noscript></form>`
    + `<script>document.getElementById("f").submit()</script></body></html>`;
}
