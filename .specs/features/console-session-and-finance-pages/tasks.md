# Console Session and Finance Pages Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design:** `.specs/features/console-session-and-finance-pages/design.md`  
**Status:** Proposed

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `docs/qa/quality-assurance-plan.md`, root `package.json`, `apps/web/vitest.config.ts`, `apps/api/package.json`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Auth entity/store/service + migration | unit + integration | All paths for persisting `fullName`, legacy null compatibility, schema migration and session-derived tenant isolation | `apps/api/test/unit/**/*.spec.ts`, `apps/api/test/integration/**/*.spec.ts` | `npm run test:unit -- --runInBand`; `npm run test:integration -- --runInBand` |
| Profile controller/module | integration | Authenticated happy path, invalid/missing token, two-tenant isolation, allowed-field response only | `apps/api/test/integration/**/*.spec.ts` | `npm run test:integration -- --runInBand` |
| API client transport | frontend unit | 1:1 recovery tests for CONSOLE-11..15, including single-flight concurrent 401 and no non-401 refresh | `apps/web/src/api-runtime.test.ts` | `npm run test:web -- --run apps/web/src/api-runtime.test.ts` |
| Web pages and shell | frontend unit/component | Every page state in ACs, accessible labels, profile unavailable, read-only settings, logout success/failure | `apps/web/src/app/*.test.tsx`, `apps/web/src/features/**/**.test.tsx` | `npm run test:web -- --run [focused files]` |
| Hash-router integration | frontend unit/component | Auth state transitions, new routes, terminal 401 and logout navigation | `apps/web/src/app/app-router.test.tsx` | `npm run test:web -- --run apps/web/src/app/app-router.test.tsx` |
| Cross-browser console journey | E2E | Authenticated sidebar identity, wallet and settings routes, logout | `tests/e2e/**/*.spec.ts` | `npm run test:e2e -- [spec]` |

## Gate Check Commands

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick web | API-client, component, shell or router task | `npm run test:web -- --run [changed-test-files]` then `npm run verify:quick` |
| API full | Entity, migration or authenticated endpoint task | `npm run test:unit -- --runInBand` and `npm run test:integration -- --runInBand` |
| Contract build | New Swagger contract task | `npm run generate:api-client:check` and `npm run typecheck` |
| Release | After the final task | `npm run verify` and relevant `npm run test:e2e -- [spec]` |

---

## Execution Plan

### Phase 1: Authenticated profile foundation

`T1 → T2`

### Phase 2: Reliable session transport

`T3 → T4`

### Phase 3: Console pages and shell

`T5 → T6 → T7`

### Phase 4: Router and browser journey

`T8 → T9`

---

## Task Breakdown

### T1: Persistir nome do titular no cadastro local ✅

**What:** Adicionar `users.full_name` compatível com contas existentes e persistir o `name` já validado no fluxo de criação do proprietário.
**Where:** `apps/api/src/modules/auth/entities/user.entity.ts`, `auth.service.ts`, `typeorm-auth.store.ts`, migration nova e testes de auth/persistência.
**Depends on:** None
**Reuses:** Transação `AuthStore.createOwner`, migration TypeORM e testes de persistência existentes.
**Requirement:** CONSOLE-19
**Tools:** MCP: filesystem; Skill: NONE
**Done when:**
- [x] Nova conta armazena o nome validado do titular.
- [x] Migração preserva contas existentes com valor nulo.
- [x] Leitura de conta legada permanece funcional.
- [x] Testes de unidade e integração cobrem criação, migração e compatibilidade; mínimo 4 novas asserções comportamentais passam.
**Tests:** unit + integration
**Gate:** API full
**Commit:** `feat(auth): persist owner full name`

### T2: Expor perfil da sessão autenticada ✅

**What:** Criar módulo/controlador de perfil atual que retorna somente identidade permitida do proprietário, negócio e conexão do gateway a partir do token verificado.
**Where:** novo `apps/api/src/modules/session-profile/`, composição da aplicação, OpenAPI gerado e testes de integração novos.
**Depends on:** T1
**Reuses:** `runtime-wallet.providers.ts`, `extract-token.ts`, `AuthService.verifyAccessToken`, Swagger pipeline.
**Requirement:** CONSOLE-01, CONSOLE-02, CONSOLE-03, CONSOLE-08, CONSOLE-10, CONSOLE-19
**Tools:** MCP: filesystem; Skill: NONE
**Done when:**
- [x] `GET /api/v1/session/profile` deriva usuário/merchant apenas do Bearer token.
- [x] Retorna somente campos allowlisted e usa e-mail para legado sem `fullName`.
- [x] Token ausente/inválido recebe 401 e tenant cruzado não pode ser solicitado pelo cliente.
- [x] Schema OpenAPI é regenerado pelo script, nunca editado manualmente.
- [x] Testes de integração cobrem caminho autenticado, 401, isolamento de dois tenants e fallback legado; mínimo 5 novas asserções comportamentais passam.
**Tests:** integration
**Gate:** API full + Contract build
**Commit:** `feat(profile): expose current session identity`

### T3: Centralizar transporte autenticado com recuperação de 401 ✅

**What:** Criar o transporte compartilhado do API client que injeta Bearer/credenciais, executa refresh single-flight no primeiro 401, repete uma vez e encerra a sessão nos casos terminais.
**Where:** `packages/api-client/src/index.ts`, `apps/web/src/api-runtime.test.ts`.
**Depends on:** T2
**Reuses:** `BaasClientOptions`, `BaasMemorySession`, contrato existente de refresh e callbacks de token.
**Requirement:** CONSOLE-11, CONSOLE-12, CONSOLE-13, CONSOLE-14, CONSOLE-15
**Tools:** MCP: filesystem; Skill: NONE
**Done when:**
- [x] Primeiro 401 inicia/aguarda uma única renovação e repete a chamada uma vez.
- [x] Refresh falho e segundo 401 removem a sessão e disparam callback terminal uma vez.
- [x] Erros não-401 não acionam refresh.
- [x] Múltiplos 401 simultâneos compartilham uma renovação.
- [x] Testes cobrem cada resultado especificado; mínimo 6 novas asserções comportamentais passam.
**Tests:** frontend unit
**Gate:** Quick web
**Commit:** `feat(api-client): recover authenticated requests once`

### T4: Migrar clientes autenticados e adicionar perfil/logout ✅

**What:** Fazer todos os clientes autenticados usarem o transporte centralizado e expor clientes tipados para perfil atual e logout com CSRF/cookies existentes.
**Where:** `packages/api-client/src/index.ts`, `apps/web/src/api-runtime.test.ts`.
**Depends on:** T3
**Reuses:** Transporte T3, schema OpenAPI de T2, `createAuthJourneyClient`.
**Requirement:** CONSOLE-01, CONSOLE-11..18
**Tools:** MCP: filesystem; Skill: NONE
**Done when:**
- [x] Clientes de links, dashboard/carteira, transações, saques, webhooks e reconciliação passam pelo transporte autenticado.
- [x] Cliente de perfil mapeia o contrato atual e logout usa o endpoint/cookies/CSRF corretos.
- [x] Nenhum cliente autenticado preserva tratamento local de 401 que contorne T3.
- [x] Testes provam que perfil/logout e clientes representativos herdam a recuperação; mínimo 4 novas asserções comportamentais passam.
**Tests:** frontend unit
**Gate:** Quick web + Contract build
**Commit:** `refactor(api-client): share authenticated request transport`

### T5: Criar página de Carteira

**What:** Implementar a página de carteira com estados atual, stale, vazio e falha segura, usando o contrato refinado de carteira.
**Where:** novo `apps/web/src/features/wallet/wallet-page.tsx` e teste co-localizado; cliente de carteira se necessário.
**Depends on:** T4
**Reuses:** Cards/Badges, formatação financeira e estados do dashboard/saques.
**Requirement:** CONSOLE-04, CONSOLE-05, CONSOLE-06, CONSOLE-07
**Tools:** MCP: filesystem; Skill: `frontend-design`
**Done when:**
- [x] Página mostra saldo, disponibilidade quando disponível, horário UTC e estado/origem de sincronização.
- [x] Snapshot stale mantém valores e mostra aviso textual explícito.
- [x] Ausência de snapshot é um estado vazio, nunca saldo zero confirmado.
- [x] Falhas são exibidas em português sem conteúdo bruto de erro.
- [x] Testes cobrem atual, stale, vazio, erro, carregamento e acessibilidade básica; mínimo 6 novas asserções comportamentais passam.
**Tests:** frontend unit/component
**Gate:** Quick web
**Commit:** `feat(wallet): add wallet console page`

### T6: Criar página de Configurações somente leitura

**What:** Implementar Configurações com os dados allowlisted do perfil atual, estados de carregamento/indisponibilidade e nenhuma mutação.
**Where:** novo `apps/web/src/features/settings/settings-page.tsx` e teste co-localizado.
**Depends on:** T4
**Reuses:** Cliente de perfil, Cards/Badges e convenções de páginas autenticadas.
**Requirement:** CONSOLE-08, CONSOLE-09, CONSOLE-10
**Tools:** MCP: filesystem; Skill: `frontend-design`
**Done when:**
- [x] Página exibe negócio, titular/e-mail e estado de conexão retornados pelo perfil.
- [x] Não possui salvar, editar, senha ou qualquer controle persistente.
- [x] Indisponibilidade não-401 usa estado em português e não mostra dados fictícios.
- [x] Testes cobrem conteúdo, ausência de mutações, carregamento e indisponibilidade; mínimo 4 novas asserções comportamentais passam.
**Tests:** frontend unit/component
**Gate:** Quick web
**Commit:** `feat(settings): add read-only profile page`

### T7: Integrar identidade e saída funcional na sidebar

**What:** Substituir o perfil de `localStorage` por estado de perfil da API e transformar Sair em ação assíncrona que encerra a sessão local mesmo se o logout remoto falhar.
**Where:** `apps/web/src/app/app-shell.tsx`, `app-shell.test.tsx`.
**Depends on:** T4
**Reuses:** Estrutura visual e responsiva existente da sidebar.
**Requirement:** CONSOLE-01, CONSOLE-02, CONSOLE-16, CONSOLE-17, CONSOLE-18
**Tools:** MCP: filesystem; Skill: `frontend-design`
**Done when:**
- [x] Sidebar exibe dados recebidos por props/estado da API, sem ler `baas_user_profile`.
- [x] Falha de perfil mostra identidade indisponível sem fallback fictício.
- [x] Sair chama callback, evita clique repetido enquanto pendente e mantém interação acessível.
- [x] Testes cobrem identidade remota, estado indisponível e ação de saída; mínimo 5 novas asserções comportamentais passam.
**Tests:** frontend unit/component
**Gate:** Quick web
**Commit:** `feat(shell): load identity and handle logout`

### T8: Orquestrar sessão, perfil e novas rotas no router ✅

**What:** Ligar transporte, perfil, logout, limpeza terminal de sessão e as rotas `#/carteira` e `#/configuracoes` no AppRouter.
**Where:** `apps/web/src/app/app-router.tsx`, `app-router.test.tsx`.
**Depends on:** T5, T6, T7
**Reuses:** Fluxo de refresh inicial e roteamento hash atual.
**Requirement:** CONSOLE-01, CONSOLE-04, CONSOLE-08, CONSOLE-11..18
**Tools:** MCP: filesystem; Skill: NONE
**Done when:**
- [x] Login/refresh bem-sucedido carrega perfil atual antes/depois da shell sem depender de localStorage.
- [x] Terminal 401 e logout removem token/perfil e apresentam autenticação.
- [x] Rotas de carteira e configurações renderizam suas páginas dentro da shell.
- [x] Testes cobrem rotas, refresh terminal, logout remoto com falha e não reutilização de token/perfil; mínimo 6 novas asserções comportamentais passam.
**Tests:** frontend unit/component
**Gate:** Quick web
**Commit:** `feat(router): coordinate console session routes`

### T9: Cobrir jornada real do console ✅

**What:** Adicionar E2E para a identidade autenticada, abertura de Carteira/Configurações e logout, com fixtures determinísticas.
**Where:** novo ou existente `tests/e2e/*console*.spec.ts`.
**Depends on:** T8
**Reuses:** Playwright config, fixtures/servidor de teste existentes.
**Requirement:** CONSOLE-01, CONSOLE-04..10, CONSOLE-16..18
**Tools:** MCP: filesystem; Skill: `webapp-testing`
**Done when:**
- [x] Jornada visualiza identidade de API, navega às duas rotas e encerra a sessão.
- [x] Fixture cobre uma carteira stale sem apresentar zero inventado.
- [x] Teste não depende de credenciais ou gateway externos.
- [x] Especificação E2E passa localmente; mínimo 3 checkpoints de comportamento passam.
**Tests:** E2E
**Gate:** Release
**Commit:** `test(console): cover session and finance navigation`

### T10: Validation follow-up — terminal recovery and logout evidence ✅

**What:** Add precise web-test evidence for CONSOLE-10..18 verifier gaps without changing application behavior.
**Status:** Complete — focused tests and typecheck pass; verify:quick remains blocked by pre-existing formatting failures.
**Commit:** `test(session): cover terminal recovery and logout`

---

## Phase Execution Map

```text
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1: T1 → T2
Phase 2: T3 → T4
Phase 3: T5 → T6 → T7
Phase 4: T8 → T9
```

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | One persistence capability | ✅ Granular |
| T2 | One authenticated endpoint/module | ✅ Granular |
| T3 | One shared request transport | ✅ Granular |
| T4 | One client migration boundary | ✅ Granular |
| T5 | One wallet page | ✅ Granular |
| T6 | One settings page | ✅ Granular |
| T7 | One shell integration | ✅ Granular |
| T8 | One router orchestration boundary | ✅ Granular |
| T9 | One E2E journey | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | None | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T4 | T5 → T6 (transitive T4) | ✅ Match |
| T7 | T4 | T6 → T7 (transitive T4) | ✅ Match |
| T8 | T5, T6, T7 | T7 → T8 | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Auth persistence | unit + integration | unit + integration | ✅ OK |
| T2 | Profile endpoint | integration | integration | ✅ OK |
| T3 | API transport | frontend unit | frontend unit | ✅ OK |
| T4 | API client | frontend unit | frontend unit | ✅ OK |
| T5 | Web page | frontend unit/component | frontend unit/component | ✅ OK |
| T6 | Web page | frontend unit/component | frontend unit/component | ✅ OK |
| T7 | Shell | frontend unit/component | frontend unit/component | ✅ OK |
| T8 | Router | frontend unit/component | frontend unit/component | ✅ OK |
| T9 | Browser journey | E2E | E2E | ✅ OK |
