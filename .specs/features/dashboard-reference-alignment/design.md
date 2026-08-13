# Dashboard Reference Alignment Design

**Spec:** `.specs/features/dashboard-reference-alignment/spec.md`
**Status:** Approved from reference

## Architecture Overview

O `Dashboard` continua responsável por carregar e derivar a projeção. Cada bloco visual passa a ser uma função-componente coesa no mesmo módulo, permitindo commits e testes por componente sem criar abstrações públicas desnecessárias.

```text
Dashboard
├── DashboardHeader
├── PeriodFilters
├── KpiRail
├── ReceiptCompositionCard
├── MovementChartCard
├── OperationCard
└── RecentTransactionsCard
```

## Reuse

| Existing element | Reuse |
| --- | --- |
| `DashboardData` e `DashboardApi` | Permanecem sem alteração. |
| `approvalRate`, `money`, paths do gráfico | Permanecem como fonte de cálculo. |
| `Card`, `Table`, `Badge` | Mantêm semântica e linguagem visual do projeto. |
| Tokens verde/lima/canvas/line | Definem as cores da referência. |

## Visual Decisions

| Area | Design |
| --- | --- |
| Header | Compacto; ações de 40–44 px; sem sino. |
| Filters | Retângulos suaves, borda cinza, selecionado lima. |
| KPI rail | Container único; saldo ~30%; demais segmentos flexíveis com divisores. |
| Insights | Grid desktop de 13 colunas: 4/6/3. |
| Chart | Sem preenchimento decorativo obrigatório; linhas, pontos, eixos e grades discretos. |
| Cards | Raio 12 px, borda fina, sombra mínima, padding consistente. |
| Mobile | Componentes empilhados; rail vira segmentos verticais; tabela mantém scroll horizontal. |

## Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Copiar valores da referência | Testes continuam usando fixtures e estados reais existentes. |
| Rail ilegível em mobile | Breakpoint desktop somente; abaixo dele, segmentos empilhados. |
| Regressão acessível | Preservar labels, `aria-pressed`, tabela e resumo textual. |
| Mudança global acidental | Não alterar `AppShell` nem primitivas sem evidência visual obrigatória. |
