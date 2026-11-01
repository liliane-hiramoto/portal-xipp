// Teste da formatação pt-BR — vai junto no espelho.
import { fmtMoney, fmtMoneyCompact, fmtNum, fmtDate, fmtPct } from "./formato.ts";

const sp = (s) => s.replace(/ /g, " "); // o Intl põe espaço não separável depois do "R$"

export default function testeFormato(t) {
  t.eq("dinheiro com milhar e centavos", sp(fmtMoney(1234.5)), "R$ 1.234,50");
  t.eq("dinheiro negativo", sp(fmtMoney(-10)), "-R$ 10,00");
  t.eq("dinheiro vazio vira travessão", [fmtMoney(null), fmtMoney(undefined), fmtMoney(NaN)], ["—", "—", "—"]);
  t.eq("compacto", [fmtMoneyCompact(1234), fmtMoneyCompact(-3_400_000)].map(sp), ["R$ 1.2 mil", "-R$ 3.4 mi"]);
  t.eq("número com casas", fmtNum(1234.567, 2), "1.234,57");
  t.eq("data de calendário", fmtDate("2026-01-13"), "13/01/2026");
  t.eq("data com hora junto: só o dia", fmtDate("2026-01-13T23:30:00"), "13/01/2026");
  t.eq("data vazia", fmtDate(""), "—");
  t.eq("porcentagem", fmtPct(0.125), "12.5%");
  t.eq("divisão por zero não vira NaN%", [fmtPct(NaN), fmtPct(Infinity)], ["—", "—"]);
}
