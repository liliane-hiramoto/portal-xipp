# Backlog — Portal fiscal (modelo)

> O que vale para TODOS os portais que saem deste modelo. Cada portal tem o seu
> BACKLOG com o que é só dele.

## Aberto
- **Consulta CPF — primeiro teste real.** Os nomes dos campos da resposta do
  Serpro v3 vieram da documentação; o leitor (`src/lib/serpro/cpf.ts`) aceita
  as variações conhecidas, mas só a primeira consulta de verdade confirma.
  Depende do contrato e das chaves (`SERPRO_CONSUMER_KEY/SECRET` na Vercel).
- **Y570 — primeiro teste com PDF real** num portal deste modelo (guarda do
  PDF, aba por empresa, exclusão).
- **Cadastro de empresas**: só incluir e excluir. Editar uma empresa = excluir
  e incluir de novo. Grupo econômico não se escolhe na tela.
- **Lint**: 1 erro antigo no `AdminUsuarios.tsx` (setState dentro de efeito),
  herdado do modelo Conta Azul. O lint é só aviso no CI.

## Concluído
- ✅ 01/11/2026 — Modelo criado: login (acesso-core), Admin por módulo
  (Tributos, CNPJ, Y570, CPF), Cadastro com inclusão pela Receita, os quatro
  cards e o `SETUP-COMPLETO.sql` num arquivo só.
