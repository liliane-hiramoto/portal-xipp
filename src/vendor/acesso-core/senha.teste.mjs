// Teste das regras de senha e de destino — vai junto no espelho.
import { avisoDoLogin, erroSenhaNova, senhaProvisoria, precisaTrocarSenha, liberadaComSenhaProvisoria, destinoSeguro, SENHA_MINIMA } from "./senha.ts";

export default function testeSenha(t) {
  t.eq("senha curta", erroSenhaNova("1234567", "1234567"), `A senha deve ter no mínimo ${SENHA_MINIMA} caracteres.`);
  t.eq("confirmação diferente", erroSenhaNova("12345678", "12345679"), "As senhas não conferem.");
  t.eq("senha boa", erroSenhaNova("12345678", "12345678"), null);

  const a = senhaProvisoria(), b = senhaProvisoria();
  t.ok("provisória tem 12 caracteres e muda a cada sorteio", a.length === 12 && a !== b);
  t.ok("provisória sem caractere que confunde (0 O 1 l I)", !/[0O1lI]/.test(a + b));
  t.eq("provisória com sorteio fixo é previsível", senhaProvisoria((n) => new Uint8Array(n)), "AAAAAAAAAAAA");

  t.ok("marca no app_metadata cobra a troca", precisaTrocarSenha({ app_metadata: { senha_provisoria: true } }));
  t.ok("marca só no user_metadata NÃO vale", !precisaTrocarSenha({ app_metadata: {}, user_metadata: { must_change_password: true } }));
  t.ok("sem usuário, nada a cobrar", !precisaTrocarSenha(null));

  t.eq("com senha provisória: só login, link, sair e a troca abrem",
    ["/trocar-senha", "/api/trocar-senha", "/login", "/auth/callback", "/logout", "/", "/financeiro", "/api/dados"].map(liberadaComSenhaProvisoria),
    [true, true, true, true, true, false, false, false]);

  t.eq("destino deste site passa", destinoSeguro("/financeiro?aba=1"), "/financeiro?aba=1");
  t.eq("destino para outro site vira o padrão", ["//mal.com", "https://mal.com", "/\\mal.com", "", null].map((d) => destinoSeguro(d)), ["/", "/", "/", "/", "/"]);
  t.eq("aviso do login pela URL", [{ link: "invalido" }, { timeout: "1" }, { expirado: "1" }, {}, { passe: "sem-conta" }, { passe: "invalido" }, { passe: "indisponivel" }, { passe: "outra" }].map((q) => avisoDoLogin(q) ? "sim" : "não"), ["sim", "sim", "sim", "não", "sim", "sim", "sim", "não"]);
  t.eq("padrão escolhido por quem chama", destinoSeguro(null, "/trocar-senha"), "/trocar-senha");
}
