// Depois da senha aceita, a tela sai por navegação COMPLETA — vai junto no espelho.
//
// O `router.push` + `router.refresh` deixava o botão em "Entrando…" para sempre
// quando a página seguinte demorava ou falhava (print de 19/10/2026). Este teste
// lê o código das telas e barra a volta dele: a tela é .tsx e do navegador, não
// dá para importar aqui, então a conferência é pelo texto.
import { readFileSync } from "node:fs";

export default function testeNavegacao(t) {
  const telas = readFileSync(new URL("./telas.tsx", import.meta.url), "utf8");
  const codigo = telas.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  t.ok("as telas não navegam pelo router do Next", !/\buseRouter\b|\brouter\.(push|replace|refresh)\b/.test(codigo));
  t.ok("a saída é uma navegação completa (window.location.assign)", /window\.location\.assign\(/.test(codigo));
  t.eq("entrar e trocar a senha saem pelo mesmo caminho", (codigo.match(/irPara\(destinoSeguro\(destino\)\)/g) ?? []).length, 2);
}
