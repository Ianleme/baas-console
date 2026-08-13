# Dashboard Reference Alignment Specification

**Status:** Approved from the supplied visual reference

**Scope tier:** Large

## Problem Statement

A Visão Geral possui os dados e estados necessários, mas sua composição, proporções, densidade e hierarquia visual divergem da referência aprovada. A página deve reproduzir de perto a referência sem transformar valores ilustrativos em dados reais.

## Goals

- [ ] Alinhar cabeçalho, filtros, KPIs, cards operacionais, gráfico e tabela à referência.
- [ ] Implementar e validar cada bloco visual separadamente.
- [ ] Preservar contratos, cálculos, estados vazios, erro e staleness existentes.
- [ ] Manter a página utilizável em desktop e mobile.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Textura no fundo do KPI de saldo | Exceção explícita do usuário; o fundo permanece limpo. |
| Sino de notificação | Exceção explícita do usuário; não será adicionado. |
| Alterações na sidebar | A solicitação trata apenas do conteúdo da Visão Geral. |
| Valores fictícios da referência | A interface deve mostrar somente a projeção recebida da API. |
| Novos endpoints ou cálculos financeiros | Os contratos e cálculos atuais já atendem ao conteúdo. |

## Assumptions & Open Questions

| Decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Fidelidade visual | Seguir composição, proporções, tipografia, bordas, cores e densidade da referência | Pedido explícito. | Yes |
| Dados exibidos | Preservar dados reais e estados vazios atuais | Evita representar a referência como operação real. | Yes |
| Responsividade | Rail de KPIs conectado no desktop e empilhado de forma legível no mobile | Mantém a linguagem da referência sem overflow. | Assumption |
| Gráfico vazio | Preservar o estado vazio atual dentro do novo card | A referência populada não autoriza inventar pontos. | Assumption |

**Open questions:** none.

## Acceptance Criteria

1. **DASH-REF-01** — WHEN a Visão Geral abre em desktop THEN o cabeçalho SHALL apresentar eyebrow, título e subtítulo compactos à esquerda e as duas ações alinhadas à direita, sem sino de notificação.
2. **DASH-REF-02** — WHEN os períodos são exibidos THEN eles SHALL usar chips contornados e o selecionado SHALL usar fundo lima claro com texto verde escuro, preservando `aria-pressed`.
3. **DASH-REF-03** — WHEN os KPIs são exibidos em desktop THEN eles SHALL formar uma única faixa conectada: saldo verde à esquerda e três segmentos brancos separados por divisores verticais.
4. **DASH-REF-04** — WHEN o KPI de saldo é exibido THEN ele SHALL usar fundo verde limpo, sem textura, e preservar saldo, disponibilidade, timestamp acessível e aviso stale.
5. **DASH-REF-05** — WHEN a taxa de aprovação é exibida THEN o anel SHALL permanecer na extremidade direita e o cálculo SHALL continuar excluindo pendências.
6. **DASH-REF-06** — WHEN a linha de insights abre em desktop THEN os cards SHALL seguir aproximadamente as proporções 31% composição, 43% movimentação e 23% operação.
7. **DASH-REF-07** — WHEN Composição dos recebimentos é exibida THEN o card SHALL mostrar subtítulo visível, barra segmentada proporcional e duas linhas densas de Pix e cartão sem valores inventados.
8. **DASH-REF-08** — WHEN Movimentação financeira é exibida THEN o card SHALL mostrar subtítulo, legenda linear, eixos/grades e linhas de entradas/saídas; sem dados SHALL manter o estado vazio.
9. **DASH-REF-09** — WHEN Operação é exibida THEN o card SHALL usar separadores entre linhas, valores alinhados e link de integrações fixado ao rodapé.
10. **DASH-REF-10** — WHEN Transações recentes possui dados THEN o card SHALL usar cabeçalho compacto e tabela densa com seis colunas, divisores e badges textuais; sem dados SHALL preservar o estado vazio.
11. **DASH-REF-11** — WHEN a largura diminui THEN ações, filtros, KPIs, cards e tabela SHALL permanecer utilizáveis sem perda de informação financeira.
12. **DASH-REF-12** — WHEN os estados loading, erro, stale ou vazio ocorrem THEN a nova composição SHALL preservar seus resultados e semântica acessível atuais.

## Success Criteria

- [ ] Screenshot desktop fica visualmente alinhado à referência, exceto textura e sino.
- [ ] Screenshot mobile não possui overflow destrutivo nem conteúdo financeiro oculto.
- [ ] Testes existentes e novos do dashboard passam sem alteração de cálculos ou dados.
