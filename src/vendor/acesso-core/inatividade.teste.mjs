// Teste da saída por inatividade — vai junto no espelho.
import { minutosDaRota, expirou, ultimaAtividade, naRota } from "./inatividade.ts";

export default function testeInatividade(t) {
  const regra = { curto: 3, longo: 15, longas: ["/", "/intranet", "/timesheet"] };
  t.eq("rota longa vale para ela e para baixo",
    ["/intranet", "/intranet/vagas", "/timesheet/lancar"].map((p) => minutosDaRota(p, regra)), [15, 15, 15]);
  t.eq("o resto fica com o curto — rota nova esquecida nasce segura",
    ["/financeiro", "/backup-omie", "/rota-nova"].map((p) => minutosDaRota(p, regra)), [3, 3, 3]);
  t.eq('"/" é só a home, não o portal inteiro', [minutosDaRota("/", regra), minutosDaRota("/financeiro", regra)], [15, 3]);
  t.ok("prefixo parecido não conta (/intranetx não é /intranet)", !naRota("/intranetx", "/intranet"));

  const min = 60_000;
  t.ok("2 min parado com limite de 3: fica", !expirou(0, 2 * min, 3));
  t.ok("3 min parado com limite de 3: sai", expirou(0, 3 * min, 3));
  t.ok("14 min parado no Timesheet (15): fica", !expirou(0, 14 * min, 15));

  t.eq("a atividade de outra aba, mais nova, vale", ultimaAtividade(1000, "5000"), 5000);
  t.eq("a desta aba, mais nova, vale", ultimaAtividade(9000, "5000"), 9000);
  t.eq("storage vazio ou com lixo não conta", [ultimaAtividade(1000, null), ultimaAtividade(1000, "abc")], [1000, 1000]);
}
