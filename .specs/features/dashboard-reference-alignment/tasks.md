# Dashboard Reference Alignment Tasks

## Execution Protocol

Executar com `tlc-spec-driven`, um componente por tarefa, teste e commit atômico.

**Status:** Approved

## Test Coverage Matrix

| Layer | Test | Expectation | Command |
| --- | --- | --- | --- |
| Dashboard component | Vitest + Testing Library | Estrutura, dados, estados e acessibilidade de cada bloco | `npm run test:web -- --run src/features/dashboard/dashboard.test.tsx` |
| Responsive visual integration | Playwright | Desktop e mobile sem overflow, screenshot de evidência | `npm run test:e2e -- tests/e2e/dashboard-reference.spec.ts` |

## Gate Check Commands

| Gate | Command |
| --- | --- |
| Component | `npm run test:web -- --run src/features/dashboard/dashboard.test.tsx` |
| Type | `npm run typecheck` |
| Visual | `npm run test:e2e -- tests/e2e/dashboard-reference.spec.ts` |

## Execution Plan

`T1 → T2 → T3 → T4 → T5 → T6 → T7`

## Task Breakdown

### T1: Alinhar cabeçalho e filtros

**What:** Reproduzir hierarquia, espaçamento, ações e chips da referência, sem sino.
**Where:** `apps/web/src/features/dashboard/dashboard.tsx`, teste co-localizado.
**Requirement:** DASH-REF-01, DASH-REF-02
**Done when:** Cabeçalho compacto, ações alinhadas, chips contornados e seleção lima com `aria-pressed`.
**Commit:** `feat(dashboard): align header and period filters`

### T2: Construir rail conectado de KPIs

**What:** Substituir quatro cards independentes pelo rail conectado e responsivo.
**Where:** `apps/web/src/features/dashboard/dashboard.tsx`, teste co-localizado.
**Depends on:** T1
**Requirement:** DASH-REF-03, DASH-REF-04, DASH-REF-05
**Done when:** Rail único no desktop, saldo verde sem textura, divisores e anel à direita; estados preservados.
**Commit:** `feat(dashboard): build connected KPI rail`

### T3: Alinhar composição dos recebimentos

**What:** Reproduzir subtítulo, barra proporcional e linhas densas Pix/cartão.
**Where:** `apps/web/src/features/dashboard/dashboard.tsx`, teste co-localizado.
**Depends on:** T2
**Requirement:** DASH-REF-06, DASH-REF-07
**Commit:** `feat(dashboard): align receipt composition card`

### T4: Alinhar gráfico de movimentação

**What:** Reproduzir subtítulo, legenda, grades, linhas e pontos mantendo estado vazio.
**Where:** `apps/web/src/features/dashboard/dashboard.tsx`, teste co-localizado.
**Depends on:** T3
**Requirement:** DASH-REF-06, DASH-REF-08
**Commit:** `feat(dashboard): align financial movement chart`

### T5: Alinhar card de operação

**What:** Adicionar separadores, alinhamento de valores e rodapé conforme referência.
**Where:** `apps/web/src/features/dashboard/dashboard.tsx`, teste co-localizado.
**Depends on:** T4
**Requirement:** DASH-REF-06, DASH-REF-09
**Commit:** `feat(dashboard): align operation status card`

### T6: Alinhar transações recentes

**What:** Ajustar cabeçalho, densidade, divisores e badges preservando tabela e vazio.
**Where:** `apps/web/src/features/dashboard/dashboard.tsx`, teste co-localizado.
**Depends on:** T5
**Requirement:** DASH-REF-10, DASH-REF-12
**Commit:** `feat(dashboard): align recent transactions table`

### T7: Integrar responsividade e validar visualmente

**What:** Ajustar breakpoints, criar E2E visual desktop/mobile e registrar screenshots.
**Where:** dashboard e novo `tests/e2e/dashboard-reference.spec.ts`.
**Depends on:** T6
**Requirement:** DASH-REF-11, DASH-REF-12
**Done when:** Desktop alinhado à referência; mobile sem overflow destrutivo; testes e typecheck verdes.
**Commit:** `test(dashboard): verify reference layout responsively`

## Granularity Check

| Task | Unit | Status |
| --- | --- | --- |
| T1 | Header + filtros coesos | ✅ Done |
| T2 | Rail de KPIs | ✅ Done |
| T3 | Composição | ✅ Done |
| T4 | Gráfico | OK |
| T5 | Operação | OK |
| T6 | Tabela | OK |
| T7 | Integração responsiva | OK |
