// Teste do passe do "Entrar pelo Flórida" — vai junto no espelho.
import { assinarPasse, lerPasse, gerarParDeChaves, publicaDe, origemDe, paginaDeEntrega, VALIDADE_PASSE_S } from "./passe.ts";

export default function testePasse(t) {
  const { privada, publica } = gerarParDeChaves();
  const outra = gerarParDeChaves();
  const RQ = "https://portal-rq.vercel.app";
  const agora = Date.UTC(2026, 10, 9, 12, 0, 0);

  t.eq("a pública sai da privada", publicaDe(privada), publica);
  const passe = assinarPasse(" Pri@Grupoflorida.com.br ", `${RQ}/qualquer/caminho`, privada, agora);
  t.eq("passe bom abre, com o e-mail em minúsculas", lerPasse(passe, publica, RQ, agora + 1000), { ok: true, email: "pri@grupoflorida.com.br" });
  t.eq("passe de outro portal não abre aqui", lerPasse(passe, publica, "https://portal-3clicks.vercel.app", agora).motivo, "destino");
  t.eq("passe vencido não abre", lerPasse(passe, publica, RQ, agora + (VALIDADE_PASSE_S + 1) * 1000).motivo, "vencido");
  t.eq("passe assinado por outra chave não abre", lerPasse(assinarPasse("a@b.c", RQ, outra.privada, agora), publica, RQ, agora).motivo, "assinatura");

  // Trocar o e-mail dentro do passe quebra a assinatura.
  const [corpo, ass] = passe.split(".");
  const p = JSON.parse(Buffer.from(corpo, "base64url").toString());
  const forjado = Buffer.from(JSON.stringify({ ...p, email: "liliane.hiramoto@grupoflorida.com.br" })).toString("base64url") + "." + ass;
  t.eq("e-mail trocado no passe não abre", lerPasse(forjado, publica, RQ, agora).motivo, "assinatura");
  t.eq("lixo não abre", ["", "x", "a.b.c", null].map((x) => lerPasse(x, publica, RQ, agora).ok), [false, false, false, false]);

  t.eq("só https vira destino", [RQ + "/x", "http://portal-rq.vercel.app", "javascript:alert(1)", "lixo"].map(origemDe), [RQ, null, null, null]);
  let erro = "";
  try { assinarPasse("a@b.c", "http://portal-rq.vercel.app", privada, agora); } catch (e) { erro = e.message; }
  t.ok("não assina passe para endereço sem https", /https/.test(erro));

  const html = paginaDeEntrega(`${RQ}/x`, passe, 'Portal "RQ"');
  t.ok("a entrega é POST para /auth/florida do portal", html.includes(`action="${RQ}/auth/florida"`) && html.includes('method="post"'));
  t.ok("a entrega escapa o nome do portal", html.includes("Portal &#34;RQ&#34;") && !html.includes('Portal "RQ"'));
}
