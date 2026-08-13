# BaaS Console Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the per-task cycle, atomic commits, sub-agent delegation, adequacy review, independent Verifier and discrimination sensor.

**If the skill cannot be activated, STOP and tell the user. Do not execute without it.**

**Design**: `.specs/features/baas-console/design.md`

**Status**: In Progress

**Planning baseline**: commit `c64d904`; challenge SHA-256 `E409D659A2762556CB2CCBC854B7A55497A7F471286D99F3659C74EA8AD63B98`.

## Test Coverage Matrix

> Generated from project instructions, `.specs/features/baas-console/spec.md`, `.specs/features/baas-console/design.md`, `docs/qa/quality-assurance-plan.md` and `docs/traceability/challenge-compliance-matrix.md`. No application code or tests exist yet; the approved strong project defaults therefore define the target.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Domain services, state machines, money, fees, tokens and masking | unit | Every branch; 1:1 to mapped acceptance criteria; every listed edge case | `apps/api/src/**/*.spec.ts` | `npm run test:unit` |
| Controllers, guards, middleware and public/auth APIs | integration | Every route: happy, validation, auth/tenant, conflict and dependency failure paths | `apps/api/test/integration/**/*.spec.ts` | `npm run test:integration` |
| TypeORM entities, migrations, constraints, locks and workers | integration with real MySQL | Key query/lock paths, constraint failures, concurrency and restart recovery | `apps/api/test/integration/**/*.spec.ts` | `npm run test:integration` |
| Lera Box HTTP adapter | contract | Every used endpoint, request serialization, conclusive/error/timeout response and redaction | `apps/api/test/contract/**/*.spec.ts` | `npm run test:contract` |
| React routes/components/forms | component | User-visible state, validation, keyboard/focus, axe and API error mapping | `apps/web/src/**/*.test.tsx` | `npm run test:web` |
| Business journeys | Gherkin | Every required feature in design with success, failure and unknown/duplicate cases | `tests/gherkin/**/*.feature` + step files | `npm run test:gherkin` |
| Critical browser journeys | E2E | Chromium on PR; Chromium/Firefox/WebKit on full; desktop/mobile; no accepted flake | `tests/e2e/**/*.spec.ts` | `npm run test:e2e` |
| Receipt HTML/PDF | integration + E2E | Approved-only, deterministic text/layout, saturation/timeout and sensitive-data exclusion | `packages/receipt-template/**/*.test.tsx`, `tests/e2e/receipt*.spec.ts` | `npm run test:pdf` |
| Quality validator and release scripts | unit + smoke | Positive fixture plus one negative fixture per enforced rule; success and rollback paths | `scripts/**/*.test.mjs`, `tests/smoke/**/*` | `npm run test:quality` |
| Container, workflow and static configuration | smoke/static | Clean build/start, health, least privilege, pinned actions/images and documented variables | `tests/smoke/**/*`, `.github/workflows/**/*` | `npm run test:smoke` |
| Generated API client, declarations and migrations | none | Build/schema gate only; behavior tested at producer/consumer boundaries | generated paths and `apps/api/src/migrations/**` | `npm run build` |

Coverage thresholds are non-negotiable: backend global 90% lines/statements/functions and 85% branches; critical backend 95/90; frontend 85/80; Stryker critical score >=80% and `NoCoverage=0`. Skips, `.only`, lint/type warnings and accepted flakiness are zero.

## Gate Check Commands

> Commands are authoritative design targets and become executable in T001/T002. No command may be weakened later to make a task pass.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Unit/component-only task | `npm run verify:quick` |
| Full | API, DB, contract, worker, Gherkin or E2E task | `npm run verify` |
| Release | Container, mutation, browser matrix or release task | `npm run verify:full` |
| Live | Explicit real-sandbox contract validation | `npm run verify:live` |
| Build | Config/generated/schema-only task | `npm run build` |

## Global task rules

- Tasks and phases execute strictly in order. `Depends on` names the immediate predecessor; earlier requirements are transitive.
- Tests are written with the behavior they verify, never as a later cleanup task.
- Each task ends with its declared gate passing and one conventional atomic commit.
- Test counts below are minimum **new behavioral cases**; the total existing suite must never decrease.
- `SPEC_DEVIATION`, weakened assertions, removed tests or fabricated gateway fields stop the task.
- Default tools: `apply_patch` for edits and PowerShell/Node/npm/Docker/Git for verification. MCP is `NONE` unless explicitly selected before Execute.

## Execution Progress

| Task | Status | Commit |
| --- | --- | --- |
| T001 | Complete | `f4e5354` |
| T002 | Complete | `37e0d20` |
| T003 | Complete | `cfe9991` |
| T004 | Complete | `8e859f1` |
| T005 | Complete | `27e5b14` |
| T006 | Complete | `06313e6` |
| T007 | Complete | `2a26fdd`, corrected by `b5b2ac9` |
| T008 | Complete | `26c2e3b` |
| T009 | Complete | `5786f99` |
| T010 | Complete | `63357fb` |
| T011 | Complete | `883d68e` |
| T012 | Complete | `071966c` |
| T013 | Complete | `74c70e7` |
| T014 | Complete | `d023772` |
| T015 | Complete | `e9de430` |
| T016 | Complete | `20e2970` |
| T017 | Complete | `d388cff` |
| T018 | Complete | `3d2377b` |
| T019 | Complete | `bdd9ceb` |
| T020 | Complete | `a9b2b89` |
| T021 | Complete | `e8aeb4d` |
| T022 | Complete | `db377b8` |
| T023 | Complete | `f4eec4d` |
| T024 | Complete | `559858b` |
| T025 | Complete | `ce83265` |
| T026 | Complete | `64f323c` |
| T027 | Complete | `2324c64` |
| T028 | Complete | `f05eeec` |
| T029 | Complete | `49edfab` |
| T030 | Complete | `8e80308` |
| T031 | Complete | `92049f3` |
| T032-T042 | Pending | — |
| T043 | Complete | `7b7f12c`, remediation `pending` |
| T044 | Complete | `9b55800` |
| T045 | Complete | `pending` |
| T046 | Complete | `28c2896` |
| T047 | Complete | pending |
| T048 | Pending | — |
| T049-T053 | Pending | — |

## Execution Plan

### Phase 1: Reproducible platform foundation

```text
T001 -> T002 -> T003 -> T004 -> T005 -> T006 -> T007 -> T008 -> T009 -> T010
```

### Phase 2: Gateway contract, identity and onboarding

```text
T010 -> T011 -> T012 -> T013 -> T014 -> T015 -> T016 -> T017
```

### Phase 3: Checkout links and payment methods

```text
T017 -> T018 -> T019 -> T020 -> T021 -> T022 -> T023 -> T024
```

### Phase 4: Webhooks and reconciliation

```text
T024 -> T025 -> T026 -> T027 -> T028 -> T029 -> T030
```

### Phase 5: Wallet, transactions and withdrawals

```text
T030 -> T031 -> T032 -> T033 -> T034 -> T035 -> T036
```

### Phase 6: E-mail and receipts

```text
T036 -> T037 -> T038 -> T039 -> T040 -> T041 -> T042
```

### Phase 7: Demo, operability and release evidence

```text
T042 -> T043 -> T044 -> T045 -> T046 -> T047 -> T048 -> T049 -> T050 -> T051
```

### Phase 8: P2 observability and sizing evidence

```text
T051 -> T052 -> T053
```

## Task Breakdown

### T001: Bootstrap the reproducible npm workspace

**What**: Create the Node 24/npm monorepo manifests, strict TypeScript/lint/format/build scripts and committed lockfile.
**Where**: root `package.json`, workspace configs, `apps/`, `packages/`, `tests/`, `scripts/` skeletons.
**Depends on**: None
**Reuses**: AD-001, AD-003, AD-017.
**Requirement**: QLT-01, QLT-02, QLT-09, QLT-21; OPS-14.
**Tools**: MCP `NONE`; Skill `tlc-spec-driven`.
**Done when**: Node/npm versions are enforced; strict build/lint/format commands exist; `npm ci` is reproducible; `npm run build` succeeds without warning.
**Tests**: none (configuration/build layer).
**Gate**: `npm run build`.
**Commit**: `build(repo): bootstrap npm workspace`

### T002: Implement the quality validation executable

**What**: Implement `scripts/validate-quality.mjs` and its fixture-driven tests for coverage, mutation, skips, mappings and QA evidence.
**Where**: `scripts/validate-quality.mjs`, `scripts/validate-quality.test.mjs`, root scripts/config.
**Depends on**: T001
**Reuses**: QLT thresholds and QA artifact manifest contract.
**Requirement**: QLT-01..QLT-10, QLT-19, QLT-22.
**Tools**: MCP `NONE`; Skill `tlc-spec-driven`.
**Done when**: valid fixtures pass; every configured violation fails with a stable diagnostic; `verify:quick`, `verify`, `verify:full`, `verify:live` orchestration is defined without silently ignoring missing reports.
**Tests**: unit; minimum 14 new cases.
**Gate**: `npm run verify:quick`.
**Commit**: `test(quality): add enforceable validation gates`

### T003: Bootstrap the NestJS API platform boundary

**What**: Create the Nest Express application with global DTO validation, Swagger `/docs`, request context/Pino, RFC 9457 filter and health endpoints.
**Where**: `apps/api/src/platform/**`, `apps/api/src/main.ts`, API tests/config.
**Depends on**: T002
**Reuses**: Nest primitives; AD-015; design error/health matrices.
**Requirement**: QLT-15..QLT-18, QLT-21; OPS-15.
**Tools**: MCP `NONE`; Skills `tlc-spec-driven`.
**Done when**: `/docs`, `/health/live`, `/health/ready` and problem responses match design; correlation/log allowlists exclude malicious input; OpenAPI is exportable.
**Tests**: integration; minimum 14 new cases.
**Gate**: `npm run verify`.
**Commit**: `feat(api): establish validated observable platform`

### T004: Bootstrap the React/Vite application shell

**What**: Create routing surfaces for `app` and `pay`, approved theme tokens, accessible layout primitives and authenticated/public shells.
**Where**: `apps/web/src/app/**`, `apps/web/src/pay/**`, Vite/Vitest config.
**Depends on**: T003
**Reuses**: approved visual references and AD-020/AD-022.
**Requirement**: UI-06..UI-10; QLT-07, QLT-21.
**Tools**: MCP `NONE`; Skills `tlc-spec-driven`, `frontend-design`.
**Done when**: both surfaces build as isolated chunks; keyboard/focus/contrast baseline passes; sandbox banner/badge and responsive navigation render.
**Tests**: component; minimum 10 new cases including axe.
**Gate**: `npm run verify:quick`.
**Commit**: `feat(web): create accessible application shells`

### T005: Generate and enforce the internal OpenAPI client

**What**: Generate `packages/api-client` from the BaaS OpenAPI and make it the only feature-level HTTP client used by React.
**Where**: `packages/api-client/**`, generation/check scripts.
**Depends on**: T004
**Reuses**: Swagger artifact from T003.
**Requirement**: QLT-12, QLT-21; OPS-15.
**Tools**: MCP `NONE`; Skill `tlc-spec-driven`.
**Done when**: generation is deterministic; CI detects drift; a consumer smoke test compiles; no handwritten duplicate API DTO exists.
**Tests**: contract/build; minimum 3 drift/consumer cases.
**Gate**: `npm run verify`.
**Commit**: `build(api-client): generate client from OpenAPI`

### T006: Create tenant, user, session and gateway-account persistence

**What**: Add the first migration/entity slice for merchants, users, auth sessions and encrypted gateway accounts with tenant constraints.
**Where**: `apps/api/src/modules/auth/entities/**`, `apps/api/src/migrations/**`.
**Depends on**: T005
**Reuses**: AD-004, AD-006, AD-007; TypeORM direct repositories.
**Requirement**: AUTH-01, AUTH-05..AUTH-10; QLT-13.
**Tools**: MCP `NONE`; Skill `tlc-spec-driven`.
**Done when**: empty migration succeeds on MySQL 8.4; normalized e-mail/session/gateway-account uniques hold; cross-tenant relations and plaintext secret columns are impossible.
**Tests**: integration with real MySQL; minimum 12 new cases.
**Gate**: `npm run verify`.
**Commit**: `feat(data): add tenant and authentication schema`

### T007: Create checkout, payment and transaction persistence

**What**: Add checkout links, payment attempts, transactions and financial-event entities/migrations with money and state constraints.
**Where**: `apps/api/src/modules/{checkout-links,payments,transactions}/entities/**`, migrations.
**Depends on**: T006
**Reuses**: AD-008, AD-009, AD-011.
**Requirement**: CHK-01..CHK-09; PAY-11..PAY-17; FIN-05; QLT-13.
**Tools**: MCP `NONE`; Skill `tlc-spec-driven`.
**Done when**: cents/bps columns and tenant FKs are correct; one unresolved attempt per link is enforced under concurrency; forbidden card data has no schema field.
**Tests**: integration with real MySQL; minimum 16 new cases.
**Gate**: `npm run verify`.
**Commit**: `feat(data): add checkout and payment schema`

### T008: Create wallet and withdrawal persistence

**What**: Add wallet snapshot and withdrawal entities/migrations with staleness, masking and reconciliation fields.
**Where**: `apps/api/src/modules/{wallet,withdrawals}/entities/**`, migrations.
**Depends on**: T007
**Reuses**: AD-008, AD-009, AD-012.
**Requirement**: FIN-01..FIN-03, FIN-07..FIN-10; QLT-13.
**Tools**: MCP `NONE`; Skill `tlc-spec-driven`.
**Done when**: latest snapshot queries preserve prior balance; destination plaintext cannot persist; unique references and valid statuses are constrained.
**Tests**: integration with real MySQL; minimum 10 new cases.
**Gate**: `npm run verify`.
**Commit**: `feat(data): add wallet and withdrawal schema`

### T009: Create webhook, e-mail and audit persistence

**What**: Add webhook endpoint/event, e-mail delivery and audit-event entities/migrations with dedupe, lease and retention indexes.
**Where**: `apps/api/src/modules/{webhooks,notifications,audit}/entities/**`, migrations.
**Depends on**: T008
**Reuses**: AD-010, AD-013.
**Requirement**: WHK-05..WHK-12; DOC-01..DOC-05; QLT-13.
**Tools**: MCP `NONE`; Skill `tlc-spec-driven`.
**Done when**: endpoint/dedupe/idempotency uniques hold; leases can be atomically acquired; raw/email ciphertext retention and audit allowlists are represented.
**Tests**: integration with real MySQL; minimum 14 new cases.
**Gate**: `npm run verify`.
**Commit**: `feat(data): add asynchronous processing schema`

### T010: Provide the development Docker composition

**What**: Create non-root development images and Compose services for API, web, MySQL 8.4 and Mailpit with health checks.
**Where**: Dockerfiles, `docker-compose.yml`, development scripts.
**Depends on**: T009
**Reuses**: AD-018 and migrations from T006-T009.
**Requirement**: OPS-01, OPS-03, OPS-04.
**Tools**: MCP `NONE`; Skill `tlc-spec-driven`.
**Done when**: clean volumes start with one documented command; migration job completes before readiness; MySQL is not exposed beyond the intended development binding; app containers are non-root.
**Tests**: smoke; minimum 6 service/health/privilege cases.
**Gate**: `npm run verify:full`.
**Commit**: `build(docker): add reproducible development stack`

### T011: Execute the Lera Box contract spike

**What**: Validate the current real sandbox contract and capture only sanitized OpenAPI/response/webhook/HMAC fixtures and decisions.
**Where**: `docs/integrations/`, `packages/test-support/fixtures/lera-box/`, ignored local evidence.
**Depends on**: T010
**Reuses**: sanitized API reference and QA live procedure.
**Requirement**: AUTH-03, AUTH-11, AUTH-12; QLT-04, QLT-12; source external gates.
**Tools**: MCP `NONE`; Skills `tlc-spec-driven`, `playwright` only if Swagger inspection requires browser automation.
**Done when**: current OpenAPI hash/date are recorded; used response/error schemas and HMAC bytes/encoding are evidenced; every fixture is secret/PII scanned; uncertainty is explicit instead of invented.
**Tests**: live contract procedure; minimum 1 authorized run covering all used endpoint families.
**Gate**: `npm run verify:live`.
**Commit**: `docs(contract): record sanitized Lera Box evidence`

### T012: Implement the deterministic Lera Box stub harness

**What**: Build a local HTTP stub that serves the sanitized conclusive, error, timeout and webhook fixtures.
**Where**: `packages/test-support/src/lera-box-stub/**`.
**Depends on**: T011
**Reuses**: T011 fixtures.
**Requirement**: QLT-04, QLT-12; AUTH-02; PAY-13; WHK-02.
**Tools**: MCP `NONE`; Skill `tlc-spec-driven`.
**Done when**: scenario selection is deterministic; requests are asserted; secrets never echo; timeout/disconnect and signed webhook cases are reproducible.
**Tests**: unit/contract; minimum 12 new cases.
**Gate**: `npm run verify`.
**Commit**: `test(gateway): add deterministic Lera Box stub`

### T013: Implement gateway registration, login and profile adapter methods

**What**: Implement `registerUser`, `login` and `getCurrentUser` with secure Bearer handling and typed error mapping.
**Where**: `apps/api/src/integrations/lera-box/auth/**`.
**Depends on**: T012
**Reuses**: `LeraBoxGateway` interface and stub fixtures.
**Requirement**: AUTH-02..AUTH-05, AUTH-11, AUTH-12; QLT-12, QLT-15.
**Tools**: MCP `NONE`; Skill `tlc-spec-driven`.
**Done when**: PF/PJ requests serialize exactly; profile mismatch is detectable; password/token/header never enters logs/errors; timeout is distinct from conclusive failure.
**Tests**: contract; minimum 14 new cases.
**Gate**: `npm run verify`.
**Commit**: `feat(gateway): implement identity contract adapter`

### T014: Implement gateway fee adapter methods

**What**: Implement `/fees` and `?brand=` retrieval with exact installment/rate normalization to basis points.
**Where**: `apps/api/src/integrations/lera-box/fees/**`.
**Depends on**: T013
**Reuses**: T011 fee fixtures and AD-008.
**Requirement**: CHK-03; PAY-07..PAY-10, PAY-17; QLT-12.
**Tools**: MCP `NONE`; Skill `tlc-spec-driven`.
**Done when**: supported brands/installments normalize exactly; malformed/divergent rates fail explicitly; HTTP serialization round-trips without floating-point drift.
**Tests**: contract + unit; minimum 12 new cases.
**Gate**: `npm run verify`.
**Commit**: `feat(gateway): implement fee contract adapter`

### T015: Implement local authentication and tenant isolation

**What**: Implement owner registration transaction, Argon2id login, rotating refresh families, logout and tenant-derived guards.
**Where**: `apps/api/src/modules/{auth,merchants}/**`.
**Depends on**: T014
**Reuses**: T006 schema, Nest guards and EncryptionService boundary.
**Requirement**: AUTH-01, AUTH-06..AUTH-10; QLT-13, QLT-15.
**Tools**: MCP `NONE`; Skill `tlc-spec-driven`.
**Done when**: local tenant/user creation is atomic; refresh reuse revokes family; cross-tenant lookups return 404; rate/CSRF/session rules match spec.
**Tests**: unit + integration; minimum 24 new cases including two-tenant cases.
**Gate**: `npm run verify`.
**Commit**: `feat(auth): add isolated owner sessions`

### T016: Implement gateway onboarding and secure connection

**What**: Implement remote registration states and one-time credential connection with encrypted token/client/key and `/users/me` verification.
**Where**: `apps/api/src/modules/gateway-accounts/**`.
**Depends on**: T015
**Reuses**: T013 adapter, T006 schema, EncryptionService.
**Requirement**: AUTH-02..AUTH-05, AUTH-08, AUTH-11, AUTH-12.
**Tools**: MCP `NONE`; Skill `tlc-spec-driven`.
**Done when**: unknown registration never retries automatically; password is memory-only; active state requires matching profile; encrypted values decrypt only with correct tenant/AAD.
**Tests**: unit + integration + Gherkin; minimum 20 new cases.
**Gate**: `npm run verify`.
**Commit**: `feat(onboarding): connect merchant to gateway safely`

### T017: Implement login and onboarding user journeys

**What**: Build the approved login, PF/PJ registration, awaiting-credentials and gateway-connection screens.
**Where**: `apps/web/src/features/auth/**`, `apps/web/src/features/onboarding/**`.
**Depends on**: T016
**Reuses**: T004 shells, T005 client, approved login reference.
**Requirement**: AUTH-01..AUTH-12; UI-05..UI-10.
**Tools**: MCP `NONE`; Skills `tlc-spec-driven`, `frontend-design`, `webapp-testing`.
**Done when**: fields/states/errors are accessible and responsive; gateway password is never stored; PF/PJ and profile-mismatch flows are understandable; onboarding Gherkin journey passes.
**Tests**: component + Gherkin + E2E; minimum 18 new cases.
**Gate**: `npm run verify`.
**Commit**: `feat(web): add merchant authentication journey`

### T018: Implement checkout-link lifecycle API

**What**: Implement create/list/detail/cancel/expire link operations with fee snapshot, immutable fields and single unresolved-attempt protection.
**Where**: `apps/api/src/modules/checkout-links/**`.
**Depends on**: T017
**Reuses**: T007 schema, T014 fees, Clock/IdGenerator.
**Requirement**: CHK-01..CHK-10; PAY-07; PAY-17.
**Tools**: MCP `NONE`; Skill `tlc-spec-driven`.
**Done when**: amount/method/expiry validation and state matrix pass; unique reference/token rules hold; fee appears in create/detail data; concurrent unresolved attempts conflict.
**Tests**: unit + integration; minimum 24 new cases.
**Gate**: `npm run verify`.
**Commit**: `feat(checkout): add immutable payment links`

### T019: Implement merchant payment-link screens

**What**: Build create/list/detail/cancel/search/filter link screens following the approved dense table reference.
**Where**: `apps/web/src/features/payment-links/**`.
**Depends on**: T018
**Reuses**: T004 primitives, T005 client, approved links image.
**Requirement**: CHK-01, CHK-03..CHK-08, CHK-12; UI-05..UI-10.
**Tools**: MCP `NONE`; Skills `tlc-spec-driven`, `frontend-design`, `webapp-testing`.
**Done when**: selected fee and status are explicit; destructive cancellation confirms; empty/loading/error/responsive/keyboard states pass; screenshots match the visual direction.
**Tests**: component + E2E; minimum 18 new cases.
**Gate**: `npm run verify`.
**Commit**: `feat(web): add payment-link management`

### T020: Implement public checkout token exchange and shell

**What**: Implement one-time fragment-token exchange, short checkout session/CSRF and isolated `pay` checkout shell.
**Where**: API public-session module and `apps/web/src/pay/checkout/**`.
**Depends on**: T019
**Reuses**: T004 pay shell, T007 token fields, AD-022.
**Requirement**: CHK-10..CHK-12; UI-07, UI-08; QLT-15.
**Tools**: MCP `NONE`; Skills `tlc-spec-driven`, `frontend-design`, `webapp-testing`.
**Done when**: URL token is removed and never logged/reused; cookie/CSRF/cache/referrer/CSP policies hold; invalid/expired/paid/cancelled views reveal no internals.
**Tests**: integration + component + E2E; minimum 20 new cases.
**Gate**: `npm run verify`.
**Commit**: `feat(checkout): secure public checkout session`

### T021: Implement Pix payment backend

**What**: Implement Pix adapter request/response plus one-shot attempt service and conclusive/unknown state transitions.
**Where**: gateway Pix adapter and `apps/api/src/modules/payments/pix/**`.
**Depends on**: T020
**Reuses**: T007 schema, T012 stub, payment state matrix.
**Requirement**: PAY-01..PAY-04, PAY-11..PAY-15; CHK-07..CHK-09.
**Tools**: MCP `NONE`; Skill `tlc-spec-driven`.
**Done when**: exact cents/document/reference serialize; one POST occurs; timeout returns 202 and blocks retries; late approval is idempotent.
**Tests**: unit + contract + integration + Gherkin; minimum 24 new cases.
**Gate**: `npm run verify`.
**Commit**: `feat(payments): implement safe Pix attempts`

### T022: Implement Pix checkout experience

**What**: Display QR/EMV copy, accessible countdown and pending/final/reconciliation Pix states without creating another attempt.
**Where**: `apps/web/src/pay/pix/**`.
**Depends on**: T021
**Reuses**: T020 session shell and generated client.
**Requirement**: PAY-02..PAY-04, PAY-16; UI-04..UI-08.
**Tools**: MCP `NONE`; Skills `tlc-spec-driven`, `frontend-design`, `webapp-testing`.
**Done when**: QR has textual/copy alternative; sandbox warning is prominent; refresh/poll/webhook state never duplicates Pix; mobile/keyboard/axe checks pass.
**Tests**: component + Gherkin + E2E; minimum 16 new cases.
**Gate**: `npm run verify`.
**Commit**: `feat(web): add accessible Pix checkout`

### T023: Implement card payment backend

**What**: Implement card adapter and quote/confirm service with transient card data, fee revalidation, cooldown and one-shot POST.
**Where**: gateway card adapter and `apps/api/src/modules/payments/card/**`.
**Depends on**: T022
**Reuses**: T014 fee adapter, T007 schema, state matrix.
**Requirement**: PAY-05..PAY-17; CHK-07..CHK-09; QLT-15.
**Tools**: MCP `NONE`; Skill `tlc-spec-driven`.
**Done when**: PAN/CVV/name/expiry never persist/log; changed fee prevents POST and requires confirmation; exact installments/fee serialize; five denials enforce cooldown; timeout is reconciliation pending.
**Tests**: unit + contract + integration + Gherkin + redaction; minimum 32 new cases.
**Gate**: `npm run verify`.
**Commit**: `feat(payments): implement fee-safe card attempts`

### T024: Implement card checkout experience

**What**: Build sandbox-only card form, installment/fee summary, changed-fee reconfirmation and honest outcome states.
**Where**: `apps/web/src/pay/card/**`.
**Depends on**: T023
**Reuses**: T020 shell, T004 primitives, generated client.
**Requirement**: PAY-05, PAY-07..PAY-10, PAY-12..PAY-14, PAY-16, PAY-17; UI-05..UI-08.
**Tools**: MCP `NONE`; Skills `tlc-spec-driven`, `frontend-design`, `webapp-testing`.
**Done when**: browser autocomplete/paste works; real-card warning and fee math are clear; submitting/cooldown/reconciliation states are accessible; no sensitive value enters storage/history/error.
**Tests**: component + Gherkin + E2E; minimum 20 new cases.
**Gate**: `npm run verify`.
**Commit**: `feat(web): add card checkout journey`

### T025: Implement webhook registration management API

**What**: Implement gateway create/list/delete and BaaS configure/list/remove operations for the three mandatory event types.
**Where**: gateway webhook adapter and `apps/api/src/modules/webhooks/configuration/**`.
**Depends on**: T024
**Reuses**: T009 endpoint schema, T012 stub, EncryptionService.
**Requirement**: WHK-01; UI-11; QLT-12.
**Tools**: MCP `NONE`; Skill `tlc-spec-driven`.
**Done when**: all three events configure with opaque URL/own secret; list never reveals secret; reconfigure/delete are auditable and tenant-scoped.
**Tests**: contract + integration; minimum 16 new cases.
**Gate**: `npm run verify`.
**Commit**: `feat(webhooks): manage gateway callbacks`

### T026: Implement webhook management screen

**What**: Build create/list/status/reconfigure/remove UI for PAYMENT_PIX, PAYMENT_CARD and WITHDRAWAL.
**Where**: `apps/web/src/features/webhooks/**`.
**Depends on**: T025
**Reuses**: T004 shell/primitives and generated client.
**Requirement**: UI-05..UI-11; WHK-01.
**Tools**: MCP `NONE`; Skills `tlc-spec-driven`, `frontend-design`, `webapp-testing`.
**Done when**: three events and statuses are visible; destructive actions confirm; secret is never redisplayed; error/loading/empty/responsive/keyboard states pass.
**Tests**: component + E2E; minimum 16 new cases.
**Gate**: `npm run verify`.
**Commit**: `feat(web): add webhook management`

### T027: Implement authenticated raw webhook ingress

**What**: Implement opaque endpoints with raw-byte HMAC, timing-safe comparison, size limit and persist-before-200 semantics.
**Where**: `apps/api/src/modules/webhooks/ingress/**`, API bootstrap raw-body wiring.
**Depends on**: T026
**Reuses**: T009 inbox schema and T011 signature evidence.
**Requirement**: WHK-02..WHK-07; QLT-15, QLT-18.
**Tools**: MCP `NONE`; Skill `tlc-spec-driven`.
**Done when**: valid=200 after durable insert, invalid=401/no row, oversized=413, DB failure=503, authenticated unknown payload=200/UNPROCESSABLE; no raw payload leaks.
**Tests**: raw HTTP integration + mutation target; minimum 20 new cases.
**Gate**: `npm run verify`.
**Commit**: `feat(webhooks): authenticate durable ingress`

### T028: Implement leased webhook processing

**What**: Implement dedupe hierarchy, atomic leases, retry/dead-letter and idempotent payment/withdrawal projection handlers.
**Where**: `apps/api/src/modules/webhooks/processing/**`.
**Depends on**: T027
**Reuses**: T009 schema, T007/T008 aggregates, state matrices.
**Requirement**: WHK-08..WHK-12; PAY-15; FIN-09.
**Tools**: MCP `NONE`; Skill `tlc-spec-driven`.
**Done when**: duplicate/concurrent/out-of-order events produce one valid transition; invalid regression is reviewable; worker restart/lease expiry/retry limit are deterministic.
**Tests**: unit + real-MySQL integration + Gherkin + mutation; minimum 28 new cases.
**Gate**: `npm run verify`.
**Commit**: `feat(webhooks): process events idempotently`

### T029: Implement payment and statement reconciliation

**What**: Implement scheduled/manual reconciliation by payment ID, withdrawal ID and remote statement/externalReference without repeating effects.
**Where**: `apps/api/src/modules/reconciliation/**`.
**Depends on**: T028
**Reuses**: gateway get/list adapters, transaction projection and leases.
**Requirement**: WHK-13, WHK-14; PAY-03, PAY-13, PAY-15; FIN-08, FIN-09, FIN-11, FIN-14.
**Tools**: MCP `NONE`; Skill `tlc-spec-driven`.
**Done when**: MATCHED/MISMATCH/LOCAL_ONLY/GATEWAY_ONLY/MANUAL_REVIEW classify deterministically; manual action cannot choose status; no financial POST occurs.
**Tests**: unit + contract + integration + Gherkin; minimum 26 new cases.
**Gate**: `npm run verify`.
**Commit**: `feat(reconciliation): resolve unknown outcomes`

### T030: Expose reconciliation status and safe manual trigger

**What**: Add tenant-scoped API/UI visibility for pending/divergent operations and a verify-only manual reconciliation trigger.
**Where**: API reconciliation controller and `apps/web/src/features/reconciliation/**`.
**Depends on**: T029
**Reuses**: T029 service, T004 primitives/client.
**Requirement**: WHK-14; FIN-11, FIN-12, FIN-14; UI-05, UI-10.
**Tools**: MCP `NONE`; Skills `tlc-spec-driven`, `frontend-design`, `webapp-testing`.
**Done when**: users see honest pending/divergence state and timestamps; trigger cannot submit a status/effect; gateway outage returns translated 503 without erasing local data.
**Tests**: integration + component + E2E; minimum 16 new cases.
**Gate**: `npm run verify`.
**Commit**: `feat(reconciliation): expose safe operator controls`

### T031: Implement wallet snapshot API

**What**: Implement gateway wallet adapter, refresh service and current/stale wallet view without fabricating zero.
**Where**: gateway wallet adapter and `apps/api/src/modules/wallet/**`.
**Depends on**: T030
**Reuses**: T008 snapshots, T012 fixtures, AD-012.
**Requirement**: FIN-01..FIN-03, FIN-12; QLT-12.
**Tools**: MCP `NONE`; Skill `tlc-spec-driven`.
**Done when**: cents/timestamp serialize exactly; successful refresh persists; timeout preserves last snapshot and marks stale; tenant isolation holds.
**Tests**: unit + contract + integration; minimum 18 new cases.
**Gate**: `npm run verify`.
**Commit**: `feat(wallet): expose authoritative balance snapshot`

### T032: Implement operational dashboard

**What**: Build dashboard KPIs, accessible summaries and recent operations from real projections with timestamp/staleness.
**Where**: `apps/web/src/features/dashboard/**`.
**Depends on**: T031
**Reuses**: approved dashboard reference, T004 primitives, wallet/transaction APIs.
**Requirement**: UI-01..UI-10; FIN-03.
**Tools**: MCP `NONE`; Skills `tlc-spec-driven`, `frontend-design`, `webapp-testing`.
**Done when**: approved/denied denominator formulas are documented; graphs have textual/table alternatives; empty/stale/error/mobile/keyboard states pass; screenshot matches approved direction.
**Tests**: component + E2E + visual/accessibility; minimum 22 new cases.
**Gate**: `npm run verify`.
**Commit**: `feat(web): add accessible financial dashboard`

### T033: Implement consolidated transaction statement API

**What**: Implement remote statement adapter, local projection merge and tenant filters for status/type/period/reference.
**Where**: gateway statement adapter and `apps/api/src/modules/transactions/**`.
**Depends on**: T032
**Reuses**: T007 transactions, T029 reconciliation, T012 fixtures.
**Requirement**: FIN-04, FIN-05, FIN-12..FIN-14; QLT-12.
**Tools**: MCP `NONE`; Skill `tlc-spec-driven`.
**Done when**: four UI statuses map exactly; remote query serializes status/type/limit; origin/sync/divergence are explicit; pagination and two-tenant filters cannot leak.
**Tests**: unit + contract + integration; minimum 24 new cases.
**Gate**: `npm run verify`.
**Commit**: `feat(transactions): consolidate gateway statement`

### T034: Implement transaction screens and exact filters

**What**: Build transaction list/detail with Success/Failure/Expired/Cancelled mappings, other filters and divergence/staleness indicators.
**Where**: `apps/web/src/features/transactions/**`.
**Depends on**: T033
**Reuses**: approved table patterns and generated client.
**Requirement**: FIN-03..FIN-05, FIN-13, FIN-14; UI-04..UI-10.
**Tools**: MCP `NONE`; Skills `tlc-spec-driven`, `frontend-design`, `webapp-testing`.
**Done when**: each Portuguese filter sends expected gateway/local status; URL state/pagination/error/empty/responsive/accessibility pass; fee details are shown without sensitive data.
**Tests**: component + E2E; minimum 18 new cases.
**Gate**: `npm run verify`.
**Commit**: `feat(web): add consolidated transaction views`

### T035: Implement withdrawal backend

**What**: Implement withdrawal create/status adapter and preview/submit/reconcile service with one POST and destination minimization.
**Where**: gateway withdrawal adapter and `apps/api/src/modules/withdrawals/**`.
**Depends on**: T034
**Reuses**: T008 schema, T012 fixtures, T029 reconciliation.
**Requirement**: FIN-06..FIN-12.
**Tools**: MCP `NONE`; Skill `tlc-spec-driven`.
**Done when**: preview masks destination; submit serializes cents/key/document/reference once; timeout blocks retry; GET/webhook transitions validate; plaintext destination disappears.
**Tests**: unit + contract + integration + Gherkin; minimum 28 new cases.
**Gate**: `npm run verify`.
**Commit**: `feat(withdrawals): implement reconciled payouts`

### T036: Implement withdrawal user journey

**What**: Build withdrawal preview/irreversibility confirmation, submission and pending/final status screens.
**Where**: `apps/web/src/features/withdrawals/**`.
**Depends on**: T035
**Reuses**: T004 primitives, generated client.
**Requirement**: FIN-06..FIN-12; UI-05..UI-10.
**Tools**: MCP `NONE`; Skills `tlc-spec-driven`, `frontend-design`, `webapp-testing`.
**Done when**: masked destination/value are confirmed; double submit is impossible; reconciliation and 503 are honest; responsive/keyboard/axe journey passes.
**Tests**: component + Gherkin + E2E; minimum 18 new cases.
**Gate**: `npm run verify`.
**Commit**: `feat(web): add withdrawal journey`

### T037: Implement the durable SMTP e-mail outbox

**What**: Implement SMTP adapter and leased delivery worker with idempotency, approved retry schedule and dead letter.
**Where**: `apps/api/src/modules/notifications/**`.
**Depends on**: T036
**Reuses**: T009 schema, Mailpit, AD-013.
**Requirement**: DOC-01..DOC-05; QLT-15.
**Tools**: MCP `NONE`; Skill `tlc-spec-driven`.
**Done when**: queue returns before SMTP; immediate/1/5/15/60 schedule holds; duplicate key sends once; crash/retry/dead-letter and masked logs are evidenced.
**Tests**: unit + integration + Gherkin; minimum 24 new cases.
**Gate**: `npm run verify`.
**Commit**: `feat(email): add durable SMTP delivery`

### T038: Implement payment-link e-mail action

**What**: Add tenant-scoped API/UI action to queue a checkout link to a validated e-mail address.
**Where**: checkout notification endpoint and payment-link UI action.
**Depends on**: T037
**Reuses**: T019 link screen and T037 outbox.
**Requirement**: DOC-01..DOC-05; UI-05, UI-10.
**Tools**: MCP `NONE`; Skills `tlc-spec-driven`, `frontend-design`, `webapp-testing`.
**Done when**: valid e-mail queues and appears in Mailpit; duplicate submit is idempotent; recipient is masked in UI/log/audit; failure/dead-letter is visible for manual retry.
**Tests**: integration + component + E2E; minimum 14 new cases.
**Gate**: `npm run verify`.
**Commit**: `feat(email): send checkout links`

### T039: Create the shared printable receipt template

**What**: Create strict allowlisted ReceiptViewModel, static React HTML and screen/print CSS in the shared package.
**Where**: `packages/receipt-template/**`.
**Depends on**: T038
**Reuses**: AD-014, approved visual language.
**Requirement**: DOC-09, DOC-12; UI-04, UI-06, UI-09.
**Tools**: MCP `NONE`; Skills `tlc-spec-driven`, `frontend-design`.
**Done when**: approved fields render deterministically; print/mobile layouts are accessible; forbidden secrets/IDs/merchant fee cannot be represented by the view model.
**Tests**: component/unit; minimum 12 new cases.
**Gate**: `npm run verify:quick`.
**Commit**: `feat(receipts): add shared printable template`

### T040: Implement receipt authorization and HTML view

**What**: Implement approved-only issuance, 30-day hashed/revocable token and public read-only receipt HTML.
**Where**: `apps/api/src/modules/receipts/**`, `apps/web/src/pay/receipt/**`.
**Depends on**: T039
**Reuses**: T007 receipt fields, T039 template, token/session patterns.
**Requirement**: DOC-06..DOC-09, DOC-12.
**Tools**: MCP `NONE`; Skills `tlc-spec-driven`, `frontend-design`, `webapp-testing`.
**Done when**: nonapproved=domain error; token lookup/expiry/revocation/versioning pass; view is no-store/read-only and contains only masked public data.
**Tests**: unit + integration + component + E2E; minimum 20 new cases.
**Gate**: `npm run verify`.
**Commit**: `feat(receipts): expose approved HTML receipt`

### T041: Implement Playwright PDF rendering

**What**: Implement sandboxed Chromium rendering of the shared receipt template with no network/JS, bounded queue, timeout and cleanup.
**Where**: `apps/api/src/modules/receipts/pdf/**`, container runtime dependencies.
**Depends on**: T040
**Reuses**: T039 template, AD-014, ReceiptPdfRenderer interface.
**Requirement**: DOC-07, DOC-09..DOC-12.
**Tools**: MCP `NONE`; Skills `tlc-spec-driven`, `playwright`, `pdf` for inspection only.
**Done when**: PDF text/layout is deterministic; no file persists; network/JS are blocked; capacity/timeout returns 503+Retry-After; every page/context closes; redaction scan passes.
**Tests**: integration + PDF E2E + Gherkin; minimum 18 new cases.
**Gate**: `npm run verify:full`.
**Commit**: `feat(receipts): render sandboxed PDF`

### T042: Send approved-payment receipt e-mail

**What**: Queue exactly one approved-payment confirmation with independent receipt link when payer e-mail exists.
**Where**: payment outcome handler and notification templates.
**Depends on**: T041
**Reuses**: T037 outbox, T040 receipt tokens.
**Requirement**: DOC-05..DOC-12.
**Tools**: MCP `NONE`; Skill `tlc-spec-driven`.
**Done when**: approval queues once; denial/pending/error queues none; manual versioned resend is auditable; e-mail/HTML/PDF agree and redact sensitive data.
**Tests**: unit + integration + Gherkin + E2E; minimum 16 new cases.
**Gate**: `npm run verify`.
**Commit**: `feat(email): deliver approved receipt`

### T043: Implement one-click read-only demo

**What**: Implement fixed demo tenant seed, feature-flagged short session and server-side mutation deny-by-default guard.
**Where**: `apps/api/src/modules/demo/**`, deterministic seed, web demo entry.
**Depends on**: T042
**Reuses**: T015 sessions/tenant guard and AD-021.
**Requirement**: OPS-12, OPS-13; AUTH-08, AUTH-09; UI-01; QLT-15.
**Tools**: MCP `NONE`; Skills `tlc-spec-driven`, `webapp-testing`.
**Done when**: demo opens without public password; every nonallowlisted mutation returns 403; no gateway/SMTP/PDF effect occurs; rate limit and two-tenant isolation pass.
**Tests**: unit + integration + Gherkin + E2E; minimum 20 new cases.
**Gate**: `npm run verify`.
**Commit**: `feat(demo): add server-enforced read-only tour`

### T044: Complete metrics, dependency health and audit signals

**What**: Implement low-cardinality metrics, private dependency health and allowlisted audit events for sensitive operations.
**Where**: `apps/api/src/modules/{observability,audit}/**`.
**Depends on**: T043
**Reuses**: T003 platform, T009 audit schema, AD-015.
**Requirement**: QLT-15..QLT-18; P2-02 partially.
**Tools**: MCP `NONE`; Skill `tlc-spec-driven`.
**Done when**: labels contain no high-cardinality/PII values; dependencies are private and do not control basic readiness; every required sensitive action emits an allowlisted audit event.
**Tests**: unit + integration; minimum 18 new cases.
**Gate**: `npm run verify`.
**Commit**: `feat(observability): add safe operational signals`

### T045: Enforce application security invariants

**What**: Complete headers/CORS/CSRF/rate limits/encryption/blind-index/redaction/tenant negative cases across all public and financial boundaries.
**Where**: shared security platform and affected module configurations.
**Depends on**: T044
**Reuses**: T003, T015, T020, T027 and security design.
**Requirement**: AUTH-08, AUTH-09; CHK-10; PAY-06, PAY-14, PAY-16; WHK-02..WHK-04; FIN-10; DOC-12; QLT-15, QLT-16.
**Tools**: MCP `NONE`; Skills `tlc-spec-driven`, `codex-security:security-scan`.
**Done when**: abuse matrix passes; secret/PII fixtures are absent from logs/errors/metrics/storage; tenant/public/demo boundaries resist direct API bypass; scan has no unhandled reportable finding.
**Tests**: unit + integration + security negative suite + mutation; minimum 28 new cases.
**Gate**: `npm run verify:full`.
**Commit**: `security(app): enforce boundary invariants`

### T046: Implement CI quality and security workflows

**What**: Add SHA-pinned minimal-permission PR/main workflows for verify, mutation, CodeQL, dependency review, secrets and image/IaC scanning.
**Where**: `.github/workflows/{ci,mutation,security}.yml`, Dependabot config.
**Depends on**: T045
**Reuses**: T002 quality commands and AD-019.
**Requirement**: QLT-01..QLT-10, QLT-19, QLT-21, QLT-22; OPS-05, OPS-07.
**Tools**: MCP `NONE`; Skill `tlc-spec-driven`.
**Done when**: fork path receives no secrets; no `pull_request_target`; actions use full SHA/minimal permissions; all reports feed quality validator; failing fixtures prove gates block.
**Tests**: static/workflow + quality fixture smoke; minimum 12 new cases.
**Gate**: `npm run verify:full`.
**Commit**: `ci: enforce quality and security gates`

### T047: Build production containers and HTTPS edge

**What**: Create digest-pinnable multi-stage non-root API/web images, production Compose and Caddy routing for app/pay/api.
**Where**: production Dockerfiles, `docker-compose.prod.yml`, Caddy/Nginx configs.
**Depends on**: T046
**Reuses**: T010 dev stack and AD-018/AD-022.
**Requirement**: OPS-02..OPS-04; OPS-06; DOC-10, DOC-11.
**Tools**: MCP `NONE`; Skill `tlc-spec-driven`.
**Done when**: HTTPS host routing/CORS/CSP pass; MySQL/internal endpoints are private; containers are non-root/no-new-privileges/cap-drop/resource-limited; Chromium sandbox works without `--no-sandbox`.
**Tests**: container/security smoke; minimum 16 new cases.
**Gate**: `npm run verify:full`.
**Commit**: `build(prod): add hardened HTTPS stack`

### T048: Implement immutable image publishing

**What**: Add protected publish workflow for SHA/semver images with SBOM, provenance, scan and GHCR digest outputs.
**Where**: `.github/workflows/publish.yml`, release metadata scripts.
**Depends on**: T047
**Reuses**: T046 workflow security rules and AD-019.
**Requirement**: OPS-05..OPS-07.
**Tools**: MCP `NONE`; Skill `tlc-spec-driven`.
**Done when**: `latest` is absent; digest/SBOM/provenance are generated; high/critical policy blocks; permissions/actions are least-privileged/SHA-pinned.
**Tests**: workflow/static + dry-run smoke; minimum 8 new cases.
**Gate**: `npm run verify:full`.
**Commit**: `ci(release): publish immutable images`

### T049: Implement approved deploy, smoke and rollback

**What**: Add manual GitHub Environment deploy using restricted SSH/preflight/migration/health/smoke and previous-digest rollback.
**Where**: `.github/workflows/deploy.yml`, `scripts/deploy/**`, operations docs.
**Depends on**: T048
**Reuses**: T047 production stack and T048 digests.
**Requirement**: OPS-08..OPS-11.
**Tools**: MCP `NONE`; Skill `tlc-spec-driven`.
**Done when**: deploys serialize and require approval; known_hosts/restricted command are enforced; failed health restores previous digest; no down migration; backup/restore procedure is explicitly gated by VPS selection.
**Tests**: deployment smoke + rollback simulation; minimum 12 new cases.
**Gate**: `npm run verify:full`.
**Commit**: `ci(deploy): add approved rollback-safe delivery`

### T050: Publish reproducible evaluator documentation

**What**: Create README, `.env.example`, `DEMO.md`, architecture/flow/setup/test/security/limitations/Swagger/deploy instructions and private credential handoff checklist.
**Where**: repository root and `docs/`.
**Depends on**: T049
**Reuses**: implemented commands, QA plan and architecture docs.
**Requirement**: OPS-01, OPS-11, OPS-14, OPS-15; QLT-04.
**Tools**: MCP `NONE`; Skills `tlc-spec-driven`, `doc-coauthoring`.
**Done when**: clean-room local setup succeeds from docs; quick 3-minute and full 10-15-minute tours work; no secret/public password exists; Swagger/public/Docker paths are exact.
**Tests**: documentation rehearsal + secret/static checks; minimum 1 clean-room run and 8 automated link/command/secret checks.
**Gate**: `npm run verify:full`.
**Commit**: `docs: add reproducible evaluator handoff`

### T051: Produce release-candidate QA evidence

**What**: Execute the complete deterministic/live-authorized QA plan, generate hashed artifact manifest/report and close every P1/source mapping.
**Where**: `artifacts/qa/<release>/` in CI retention, committed report index/validation inputs only when sanitized.
**Depends on**: T050
**Reuses**: all co-located tests, QA plan, compliance matrix, T002 validator.
**Requirement**: QLT-03..QLT-20, QLT-22; all 129 P1 requirements; OPS-10..OPS-15.
**Tools**: MCP `NONE`; Skills `tlc-spec-driven`, `webapp-testing`, `playwright`.
**Done when**: `verify:full` passes with thresholds; authorized `verify:live` resolves all external gates; browser/axe/UAT/exploratory/deploy/rollback evidence is hashed; QA verdict is APPROVED with no Sev-1/2.
**Tests**: system acceptance/QA; all suites, 12 manual procedures and 8 UAT cases.
**Gate**: `npm run verify:full` and `npm run verify:live`.
**Commit**: `test(qa): record release candidate evidence`

### T052: Add optional Prometheus/Grafana profile

**What**: Add private opt-in observability Compose profile and dashboards for approved low-cardinality metrics.
**Where**: observability Compose/profile and dashboards.
**Depends on**: T051
**Reuses**: T044 metrics and T047 private networks.
**Requirement**: P2-01, P2-02.
**Tools**: MCP `NONE`; Skill `tlc-spec-driven`.
**Done when**: profile is disabled by default; Prometheus/Grafana are not public; dashboards cover HTTP/gateway/webhook/reconciliation/e-mail/PDF without forbidden labels.
**Tests**: container/network smoke; minimum 8 new cases.
**Gate**: `npm run verify:full`.
**Commit**: `feat(observability): add private dashboards`

### T053: Produce reproducible performance and VPS sizing evidence

**What**: Add production-image benchmark harness and document measured capacity/latency/resource results and VPS recommendation.
**Where**: `tests/performance/**`, `docs/operations/performance.md`, raw CI artifacts.
**Depends on**: T052
**Reuses**: T047 images, T052 metrics, QA artifact manifest.
**Requirement**: P2-03, P2-04; OPS-11.
**Tools**: MCP `NONE`; Skill `tlc-spec-driven`.
**Done when**: command/mass/version/hardware/raw results are reproducible; no fabricated p95; PDF concurrency and MySQL/API memory are measured; recommendation cites evidence.
**Tests**: benchmark reproducibility smoke; minimum 3 repeated runs within documented tolerance.
**Gate**: `npm run verify:full`.
**Commit**: `perf: document measured VPS sizing`

## Requirement-to-Task Coverage

| Requirement range | Owning tasks | Verification layers |
| --- | --- | --- |
| AUTH-01..AUTH-12 | T006, T013, T015-T017, T043, T045 | unit, contract, integration, Gherkin, E2E, live |
| CHK-01..CHK-12 | T007, T014, T018-T020, T045 | unit, integration, component, E2E, concurrency |
| PAY-01..PAY-17 | T007, T014, T021-T024, T028-T030, T045 | unit, contract, integration, Gherkin, E2E, mutation |
| WHK-01..WHK-14 | T009, T025-T030, T045 | contract, raw HTTP, MySQL, Gherkin, mutation |
| FIN-01..FIN-14 | T008, T028-T036 | unit, contract, integration, component, Gherkin, E2E |
| DOC-01..DOC-12 | T009, T037-T042, T045, T047 | unit, SMTP/MySQL integration, PDF, Gherkin, E2E, redaction |
| UI-01..UI-11 | T004, T017, T019-T020, T022, T024, T026, T030, T032, T034, T036, T038-T040 | component, axe, visual, responsive, E2E |
| QLT-01..QLT-22 | T001-T005, T010-T017, T021, T023, T027-T029, T031, T033, T041, T044-T051 | validator, all automated layers, workflows, QA, Verifier |
| OPS-01..OPS-15 | T001, T003, T010, T043, T046-T051, T053 | smoke, policy/static, deploy/rollback, clean-room docs |
| P2-01..P2-04 | T044, T052, T053 | network smoke, dashboards, reproducible benchmark |

**Coverage**: 133/133 TLC requirements assigned; 69/69 challenge source rows cross-referenced to real task IDs; 0 unmapped.

## Phase Execution Map

```text
Phase 1: T001 -> T002 -> T003 -> T004 -> T005 -> T006 -> T007 -> T008 -> T009 -> T010
Phase 2: T010 -> T011 -> T012 -> T013 -> T014 -> T015 -> T016 -> T017
Phase 3: T017 -> T018 -> T019 -> T020 -> T021 -> T022 -> T023 -> T024
Phase 4: T024 -> T025 -> T026 -> T027 -> T028 -> T029 -> T030
Phase 5: T030 -> T031 -> T032 -> T033 -> T034 -> T035 -> T036
Phase 6: T036 -> T037 -> T038 -> T039 -> T040 -> T041 -> T042
Phase 7: T042 -> T043 -> T044 -> T045 -> T046 -> T047 -> T048 -> T049 -> T050 -> T051
Phase 8: T051 -> T052 -> T053
```

Execution is strictly sequential. Before Execute, 53 tasks pack into eight whole-phase batches (10/7/7/6/6/6/9/2); TLC requires offering sequential batch workers, never parallel financial implementation.

## Task Granularity Check

| Tasks | Atomic outcome | Status |
| --- | --- | --- |
| T001-T005 | One platform/tooling boundary per task | PASS |
| T006-T009 | One cohesive schema slice per task | PASS |
| T010-T017 | One environment, adapter or onboarding capability per task | PASS |
| T018-T024 | One checkout/payment API or UI capability per task | PASS |
| T025-T030 | One webhook/reconciliation capability per task | PASS |
| T031-T036 | One finance API or UI capability per task | PASS |
| T037-T042 | One delivery/receipt capability per task | PASS |
| T043-T051 | One demo/operability/release artifact per task | PASS |
| T052-T053 | One optional operational artifact per task | PASS |

Schema/platform tasks touch a small cohesive file set because splitting entity plus migration or bootstrap plus its executable configuration would create uncompilable, untestable commits. No task combines independent business journeys.

## Diagram-Definition Cross-Check

| Task | Depends On | Diagram Shows | Status |
| --- | --- | --- | --- |
| T001 | None | phase start | PASS |
| T002-T010 | immediate previous task | T001 -> ... -> T010 | PASS |
| T011-T017 | immediate previous task | T010 -> ... -> T017 | PASS |
| T018-T024 | immediate previous task | T017 -> ... -> T024 | PASS |
| T025-T030 | immediate previous task | T024 -> ... -> T030 | PASS |
| T031-T036 | immediate previous task | T030 -> ... -> T036 | PASS |
| T037-T042 | immediate previous task | T036 -> ... -> T042 | PASS |
| T043-T051 | immediate previous task | T042 -> ... -> T051 | PASS |
| T052-T053 | immediate previous task | T051 -> T052 -> T053 | PASS |

The range rows are valid because every task definition names only its immediate predecessor; the diagrams show every corresponding edge and no forward dependency.

## Test Co-location Validation

| Task | Layer | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T001 | config | none/build | none/build | PASS |
| T002 | quality script | unit | unit | PASS |
| T003 | middleware/controller | integration | integration | PASS |
| T004 | React shell | component | component | PASS |
| T005 | generated contract | build/contract | build/contract | PASS |
| T006 | auth data | integration MySQL | integration MySQL | PASS |
| T007 | payment data | integration MySQL | integration MySQL | PASS |
| T008 | wallet data | integration MySQL | integration MySQL | PASS |
| T009 | async data | integration MySQL | integration MySQL | PASS |
| T010 | containers | smoke | smoke | PASS |
| T011 | live gateway | live | live | PASS |
| T012 | HTTP stub | unit/contract | unit/contract | PASS |
| T013 | gateway auth adapter | contract | contract | PASS |
| T014 | gateway fees adapter | contract/unit | contract/unit | PASS |
| T015 | auth domain/API | unit/integration | unit/integration | PASS |
| T016 | onboarding domain/API | unit/integration/Gherkin | unit/integration/Gherkin | PASS |
| T017 | auth UI journey | component/Gherkin/E2E | component/Gherkin/E2E | PASS |
| T018 | link domain/API | unit/integration | unit/integration | PASS |
| T019 | link UI | component/E2E | component/E2E | PASS |
| T020 | public session/API/UI | integration/component/E2E | integration/component/E2E | PASS |
| T021 | Pix domain/adapter | unit/contract/integration/Gherkin | same | PASS |
| T022 | Pix UI | component/Gherkin/E2E | same | PASS |
| T023 | card domain/adapter | unit/contract/integration/Gherkin | same | PASS |
| T024 | card UI | component/Gherkin/E2E | same | PASS |
| T025 | webhook config API/adapter | contract/integration | same | PASS |
| T026 | webhook UI | component/E2E | same | PASS |
| T027 | webhook ingress | raw integration/mutation | same | PASS |
| T028 | webhook worker | unit/MySQL/Gherkin/mutation | same | PASS |
| T029 | reconciliation | unit/contract/integration/Gherkin | same | PASS |
| T030 | reconciliation API/UI | integration/component/E2E | same | PASS |
| T031 | wallet domain/adapter | unit/contract/integration | same | PASS |
| T032 | dashboard UI | component/E2E/visual/axe | same | PASS |
| T033 | statement domain/adapter | unit/contract/integration | same | PASS |
| T034 | transaction UI | component/E2E | same | PASS |
| T035 | withdrawal domain/adapter | unit/contract/integration/Gherkin | same | PASS |
| T036 | withdrawal UI | component/Gherkin/E2E | same | PASS |
| T037 | e-mail worker | unit/integration/Gherkin | same | PASS |
| T038 | e-mail API/UI | integration/component/E2E | same | PASS |
| T039 | receipt template | component/unit | same | PASS |
| T040 | receipt API/UI | unit/integration/component/E2E | same | PASS |
| T041 | PDF renderer | integration/PDF E2E/Gherkin | same | PASS |
| T042 | receipt notification | unit/integration/Gherkin/E2E | same | PASS |
| T043 | demo guard/UI | unit/integration/Gherkin/E2E | same | PASS |
| T044 | metrics/audit | unit/integration | same | PASS |
| T045 | security boundaries | unit/integration/security/mutation | same | PASS |
| T046 | CI workflows | static/quality smoke | same | PASS |
| T047 | production containers | container/security smoke | same | PASS |
| T048 | publish workflow | static/dry-run smoke | same | PASS |
| T049 | deploy/rollback | deployment smoke | same | PASS |
| T050 | evaluator docs | rehearsal/static | same | PASS |
| T051 | QA release evidence | system acceptance/all suites | same | PASS |
| T052 | dashboards | container/network smoke | same | PASS |
| T053 | benchmark | reproducibility smoke | same | PASS |

**Validation result**: task granularity PASS; diagram-definition cross-check PASS; test co-location 53/53 PASS. No implementation is authorized until the user approves this file and confirms tool assignments.

## Proposed tools for Execute

- All tasks: `tlc-spec-driven`, `apply_patch`, local shell/test runners and atomic Git commits.
- UI tasks T004, T017, T019, T020, T022, T024, T026, T030, T032, T034, T036, T038-T040: `frontend-design`; browser-facing verification uses `webapp-testing`/`playwright`.
- T011: real HTTP/Swagger inspection only after explicit live-secret authorization; never web-search fabricated schemas.
- T041: `playwright` for generation and `pdf` only for inspection/verification.
- T045: `codex-security:security-scan` after implementation-level negative tests.
- T050: `doc-coauthoring` for the authoritative evaluator handoff.
- T051: fresh TLC Verifier is automatic after the final task; author cannot self-verify.

Before Execute, the user must approve these tool assignments or specify replacements.
