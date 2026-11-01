// Teste da lista e da busca do seletor de categoria — vai junto no espelho.
import { listaDeGrupos, buscarCategorias } from "./categorias.ts";

const G = [
  { rotulo: "Operacional › Receita", itens: [{ valor: "r1", nome: "Receita de Serviços" }] },
  { rotulo: "Operacional › Pessoal", itens: [{ valor: "p1", nome: "Salários" }, { valor: "p2", nome: "Vale Transporte" }] },
  { rotulo: "Operacional › Tecnologia", itens: [{ valor: "t1", nome: "Software" }] },
];
const nomes = (l) => l.map((x) => (x.tipo === "grupo" ? `#${x.rotulo}` : x.nome));

export default function testeCategorias(t) {
  t.eq("ordem e cabeçalhos da estrutura", nomes(listaDeGrupos(G)),
    ["#Operacional › Receita", "Receita de Serviços", "#Operacional › Pessoal", "Salários", "Vale Transporte", "#Operacional › Tecnologia", "Software"]);
  t.eq("`apenas` não deixa cabeçalho solto", nomes(listaDeGrupos(G, { apenas: ["p2"] })), ["#Operacional › Pessoal", "Vale Transporte"]);
  t.eq("`excluir` tira a categoria", nomes(listaDeGrupos(G, { excluir: ["p1", "r1", "t1"] })), ["#Operacional › Pessoal", "Vale Transporte"]);
  t.eq("categoria apagada do cadastro NÃO some do filtro", nomes(listaDeGrupos(G, { apenas: ["t1", "velha"] })),
    ["#Operacional › Tecnologia", "Software", "#Fora da Estrutura FC", "velha"]);
  t.eq("destaque no topo, sem sair do lugar", nomes(listaDeGrupos(G, { destaque: { rotulo: "Esperadas", ids: ["t1"] } })).slice(0, 3),
    ["#Esperadas", "Software", "#Operacional › Receita"]);
  const L = listaDeGrupos(G);
  t.eq("busca pelo nome, sem acento", nomes(buscarCategorias(L, "salarios")), ["#Operacional › Pessoal", "Salários"]);
  t.eq("busca pelo grupo traz o grupo inteiro", nomes(buscarCategorias(L, "pessoal")).length, 3);
  t.eq("duas palavras estreitam", nomes(buscarCategorias(L, "pessoal vale")), ["#Operacional › Pessoal", "Vale Transporte"]);
  t.eq("a busca não reordena", nomes(buscarCategorias(L, "o")), nomes(L).filter((n) => n.startsWith("#") || /o/i.test(n)));
  t.eq("busca vazia devolve tudo", buscarCategorias(L, "  ").length, L.length);
}
