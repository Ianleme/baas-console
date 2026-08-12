# Challenge Compliance Matrix

**Source:** `desafio-tecnico-baas-integracao-gateway-vba-systems.md`

**Source SHA-256:** `E409D659A2762556CB2CCBC854B7A55497A7F471286D99F3659C74EA8AD63B98`

**Scope:** original challenge, its consolidated checklist, and the quality extensions explicitly required by the project owner.

**Documentary status:** 100% of source obligations below are classified and mapped. This proves specification coverage, not implementation completion. Runtime fidelity remains blocked by the live contract spike for response schemas, webhook payloads and HMAC encoding.

## Reading the matrix

- `Specified` means an acceptance criterion and design destination exist.
- `External gate` means the behavior is specified, but live gateway evidence is still required before the adapter can be considered faithful.
- `P1 differential` means the challenge calls it an extra, but the project owner promoted it to the first release.
- `Deferred, nonmandatory` means the route is listed in the summarized gateway contract but is absent from mandatory functional scope; the omission is deliberate and justified.
- `T###` values reference the concrete draft tasks in `.specs/features/baas-console/tasks.md`; they become authoritative when that file is approved. No implementation starts from this matrix alone.

## Required stack and integration boundary

| Source ID | Source locator and obligation | TLC requirements | Component / design destination | Future task group | Verification and expected evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| SRC-STK-01 | §2 Backend: TypeScript + NestJS | QLT-21 | `apps/api`, Nest modules | T001, T003, T004 | Static package/config audit; build log | Specified |
| SRC-STK-02 | §2 Backend: TypeORM persistence | QLT-13, QLT-21 | TypeORM entities/migrations | T006-T009 | MySQL integration suite; migration log | Specified |
| SRC-STK-03 | §2 Backend: `class-validator` / `class-transformer` for DTOs | QLT-21 | API DTOs, global validation pipe | T003, T005 | Invalid/valid request integration cases; OpenAPI schema | Specified |
| SRC-STK-04 | §2 Backend: Swagger with `@nestjs/swagger` | QLT-21, OPS-15 | API bootstrap, generated client | T003, T005 | `/docs` smoke and OpenAPI artifact | Specified |
| SRC-STK-05 | §2 Backend: Nest middleware for logging, correlation id and auth support | QLT-15, QLT-18, QLT-21 | Observability middleware + guards | T003, T044, T052 | Middleware/guard integration tests; redacted JSON log | Specified |
| SRC-STK-06 | §2 Backend: MySQL as the BaaS database | QLT-13, QLT-21 | MySQL 8.4, migrations | T006-T009 | Clean migration and integration report against real MySQL | Specified |
| SRC-STK-07 | §2 Frontend: React + Vite | UI-01..UI-11, QLT-21 | `apps/web` | T004, T005 | Production build, component and browser reports | Specified |
| SRC-STK-08 | §2 Boundary: own database; gateway only through HTTP APIs | AUTH-02, QLT-12, OPS-01 | `LeraBoxGateway`, MySQL | T012-T014, T021, T023, T025, T031, T033, T035 | Network/architecture audit; contract stub traffic | Specified |

## Mandatory functional scope

| Source ID | Source locator and obligation | TLC requirements | Component / design destination | Future task group | Verification and expected evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| SRC-AUTH-01 | §3.1: register by `POST /api/users` for PF or PJ with real e-mail and phone | AUTH-02, AUTH-11 | GatewayAccounts + registration DTO/UI | T011, T016, T017 | PF/PJ validation tests plus masked live request evidence | External gate |
| SRC-AUTH-02 | §3.1: receive document, password, CodigoCliente and ChaveLoja by e-mail | AUTH-03 | Onboarding state + live QA | T011, T016, T017 | Masked receipt evidence; no credential in repository/artifacts | External gate |
| SRC-AUTH-03 | §3.1: login through `POST /api/auth/login` | AUTH-04, AUTH-05 | `LeraBoxGateway.login` | T013, T016 | Contract test and masked live response evidence | External gate |
| SRC-AUTH-04 | §3.1: store Bearer token securely in BaaS backend | AUTH-05 | encrypted `gateway_accounts` | T013, T016 | Encryption round-trip and database-at-rest inspection | Specified |
| SRC-AUTH-05 | §3.1: never expose gateway password to frontend | AUTH-04, AUTH-05, QLT-15 | Gateway connection use case + serializers | T013, T016 | Schema/log/response negative fixture proves absence | Specified |
| SRC-CHK-01 | §3.2: own checkout link/session and reconcilable identifier | CHK-01, CHK-10, CHK-11 | CheckoutLinks | T018-T020 | API, persistence and browser journey with public reference | Specified |
| SRC-CHK-02 | §3.2: Pix POST and display `qrCodeBase64` and/or EMV | PAY-01..PAY-04 | Payments + public checkout | T021, T022 | HTTP contract + Gherkin + browser screenshot | External gate |
| SRC-CHK-03 | §3.2: card fees, installments and correct `feePercent` in POST | CHK-03, PAY-07..PAY-10, PAY-17 | Fees + card payment | T023, T024 | Fee table/brand contract cases and card journey | External gate |
| SRC-CHK-04 | §3.2: `externalReference` aligned for reconciliation | CHK-01, PAY-01, PAY-10, WHK-13 | Checkout, attempts, reconciliation | T029, T030 | End-to-end correlation assertion across local/remote fixtures | Specified |
| SRC-TRX-01 | §3.3: filters Success/Failure/Expired/Cancelled map to APPROVED/DENIED/EXPIRED/CANCELLED | FIN-04, FIN-13 | Transactions API and UI | T007, T029, T033, T034 | Parameterized API/component/E2E filter cases | Specified |
| SRC-TRX-02 | §3.3: use `GET /api/wallet/transactions?status=&type=&limit=` | FIN-14, WHK-13 | Wallet adapter + reconciliation | T029, T033 | Query serialization contract test; consolidated view evidence | External gate |
| SRC-WAL-01 | §3.4: show balance from `GET /api/wallet` | FIN-01..FIN-03 | WalletModule + dashboard | T031, T032 | Contract/integration/browser stale/current cases | External gate |
| SRC-WAL-02 | §3.4: consolidated statement in UI | FIN-04, FIN-05, FIN-14 | transaction projection + UI | T007, T029, T033, T034 | Local/remote/mismatch fixtures and browser table | Specified |
| SRC-WDR-01 | §3.5: request withdrawal by `POST /api/withdrawals` | FIN-06..FIN-08, FIN-10 | WithdrawalsModule + UI | T008, T028, T029, T035, T036 | Contract/Gherkin/E2E; unknown-result no-retry proof | External gate |
| SRC-WDR-02 | §3.5: query status by `GET /api/withdrawals/:id` | FIN-09 | Withdrawals + reconciliation | T008, T028, T029, T035, T036 | Status matrix contract/integration cases | External gate |
| SRC-WHK-01 | §3.6: register URLs for PAYMENT_PIX, PAYMENT_CARD and WITHDRAWAL | WHK-01, UI-11 | Webhooks module/UI | T025, T026 | Three-event contract and browser management journey | External gate |
| SRC-WHK-02 | §3.6: authenticable and validatable receiver endpoints | WHK-02..WHK-07 | raw webhook ingress | T027 | Raw HTTP cases for 200/401/413/503 | Specified |
| SRC-WHK-03 | §3.6: validate `X-Lera-Box-Signature` when secret exists | WHK-02, WHK-03 | HMAC verifier | T027 | Exact raw-byte fixture, timing-safe compare and live sample | External gate |
| SRC-WHK-04 | §3.6: definitive async Pix/card outcome via webhook | PAY-03, PAY-11, PAY-12, WHK-08..WHK-12 | inbox workers + payments | T028 | duplicate/out-of-order Gherkin and mutation evidence | External gate |
| SRC-WHK-05 | §3.6: update local order and checkout link | CHK-07, CHK-08, WHK-10, WHK-11 | payment attempts + checkout links | T028 | Atomic transition integration test | Specified |
| SRC-FEE-01 | §3.7: query `/fees` and `?brand=` before creating card link | CHK-03 | CheckoutLinks + gateway fees | T014, T018, T023, T024 | Contract call-order and brand parameter cases | External gate |
| SRC-FEE-02 | §3.7: persist and display fee applied at link creation | CHK-03, PAY-17 | fee snapshot + link/payment details | T014, T018, T023, T024 | Database assertion and UI screenshot | Specified |
| SRC-FEE-03 | §3.7: reject/avoid divergent `feePercent` | PAY-08..PAY-10 | card quote/confirmation | T023, T024 | Changed-fee Gherkin and no-POST assertion | Specified |
| SRC-FEE-04 | §3.7: all gateway money values in cents | CHK-02, PAY-01, FIN-01, FIN-07 | money value objects/DTOs | T007, T014, T018, T021, T023, T031, T033, T035 | Boundary/property/unit and contract serialization tests | Specified |

## Differentials promoted to P1

| Source ID | Source locator and obligation | TLC requirements | Component / design destination | Future task group | Verification and expected evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| SRC-EXT-01 | §4: Docker for API, frontend and MySQL with Compose | OPS-01, OPS-03, OPS-04 | Dockerfiles/Compose | T010, T047 | Clean Compose smoke and health evidence | P1 differential |
| SRC-EXT-02 | §4: domain and simple VPS deploy with HTTPS | OPS-02, OPS-08..OPS-11 | Caddy/deploy workflows | T047-T049 | Public TLS, deploy/rollback and restore rehearsal | P1 differential |
| SRC-EXT-03 | §4: send payment link by e-mail and/or WhatsApp | DOC-01..DOC-05 | SMTP outbox; e-mail selected | T037, T038, T042 | Mailpit/SMTP integration, retry/dead-letter evidence | P1 differential |
| SRC-EXT-04 | §4: receipt as PDF or printable page after success | DOC-07..DOC-12 | receipt HTML + Playwright PDF | T039-T042 | Approved/denied E2E, PDF text/visual/redaction evidence | P1 differential |

## Summarized gateway contract and suggested architecture

| Source ID | Source locator and obligation/classification | TLC requirements | Component / design destination | Future task group | Verification and expected evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| SRC-CON-01 | §5: protected calls use `Authorization: Bearer` | AUTH-05, QLT-12 | gateway HTTP client | T012-T014, T021, T023, T025, T031, T033, T035 | Header contract test with redacted logs | External gate |
| SRC-CON-02 | §5: `GET /payments/:id` for own payment | PAY-03, WHK-13 | Payments/Reconciliation | T029, T030 | Own-account contract and cross-tenant negative case | External gate |
| SRC-CON-03 | §5: `POST/GET/DELETE /webhooks` management | WHK-01, UI-11 | Webhooks module/UI | T025, T026 | Create/list/delete contract and E2E | External gate |
| SRC-CON-04 | §5: `GET /users/me` profile | AUTH-12 | GatewayAccounts | T013, T016 | Profile-match/mismatch contract tests | External gate |
| SRC-CON-05 | §5: `POST /auth/reset-password` appears only in contract table | Out of Scope table | No first-release component | N/A | Matrix review confirms deliberate rationale | Deferred, nonmandatory |
| SRC-CON-06 | §5: every token sees only its own wallet, transactions and webhooks | AUTH-09, QLT-13 | tenancy guard, composite tenant keys | T006, T015, T043, T045 | Two-tenant API, DB and gateway contract cases | Specified |
| SRC-ARC-01 | §6: local users/session may differ from gateway user | AUTH-01, AUTH-04..AUTH-07 | Auth vs GatewayAccounts | T015, T017 | Local login works independently of gateway secret | Specified |
| SRC-ARC-02 | §6: checkout links and suggested `orders` with status and gateway IDs | CHK-01..CHK-09, PAY-11..PAY-15 | `checkout_links` + `payment_attempts` | T018-T020 | Model review and state-machine integration tests | Specified |
| SRC-ARC-03 | §6: webhook event audit/idempotency and handlers/jobs | WHK-05..WHK-12 | `webhook_events` + leased worker | T028 | Persistence, lease, retry and dedupe evidence | Specified |
| SRC-ARC-04 | §6: minimum suggested entities | AUTH-01, CHK-01, FIN-05, FIN-07, WHK-05 | users, gateway_accounts, links/attempts, transactions, withdrawals, webhook_events | T006-T009 | Migration/schema audit and relationship tests | Specified |
| SRC-ARC-05 | §6: protect tokens/secrets, correlation, idempotency, never trust frontend status | AUTH-05, WHK-08, QLT-15, QLT-18 | encryption, middleware, state machines | T003, T006, T015, T020, T027, T043, T045 | Redaction, idempotency, forged-status negative cases | Specified |

## Evaluation and delivery

| Source ID | Source locator and obligation | TLC requirements | Component / design destination | Future task group | Verification and expected evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| SRC-EVAL-01 | §7.1: Nest modules, DTOs, validators and Swagger | QLT-21 | API architecture | T003, T005 | Static architecture audit + OpenAPI | Specified |
| SRC-EVAL-02 | §7.2: correct TypeORM and MySQL | QLT-13, QLT-21 | data layer | T006-T009 | migrations and real-MySQL integration | Specified |
| SRC-EVAL-03 | §7.3: coherent middleware and guards | AUTH-09, QLT-18, QLT-21 | request context/auth/tenancy | T006, T015, T043, T045 | integration and two-tenant evidence | Specified |
| SRC-EVAL-04 | §7.4: faithful auth, fees, webhooks and isolation | AUTH-02..AUTH-12, CHK-03, WHK-01..WHK-14 | gateway boundary | T012-T014, T021, T023, T025, T031, T033, T035 | contract spike + contract/tenant suites | External gate |
| SRC-EVAL-05 | §7.5: React UX for link, balance, filters, withdrawal and webhooks | UI-01..UI-11, FIN-03, FIN-06 | web routes | T017, T019, T020, T022, T024, T026, T030, T032, T034, T036, T038, T040 | component/accessibility/E2E artifacts | Specified |
| SRC-EVAL-06 | §7.6: README setup, variables and flows | OPS-14, OPS-15 | repository docs | T050 | clean-room documentation rehearsal | Specified |
| SRC-EVAL-07 | §7.7: Docker, VPS, send link and receipt | OPS-01..OPS-11, DOC-01..DOC-12 | delivery + docs | T046-T051 | Compose/deploy/e-mail/PDF evidence | P1 differential |
| SRC-DEL-01 | §8: repository containing backend and frontend | QLT-21, OPS-14 | monorepo `apps/api`, `apps/web` | T001, T003, T004 | tree/build audit | Specified |
| SRC-DEL-02 | §8: README with local setup | OPS-14, OPS-15 | `README.md` | T050 | fresh-machine/clean-room rehearsal | Specified |
| SRC-DEL-03 | §8: BaaS Swagger URL | QLT-21, OPS-15 | API `/docs` + README | T003, T005 | URL smoke and documentation link | Specified |
| SRC-DEL-04 | §8: public URL and/or Docker | OPS-01, OPS-02, OPS-15 | Compose and production hosts | T046-T051 | public smoke or Docker clean start | Specified |
| SRC-DEL-05 | §8: demo credentials without sharing gateway e-mail password | OPS-12..OPS-15 | demo/private handoff | T043, T050 | read-only demo + private credential checklist | Specified |
| SRC-SBX-01 | §9: random Pix/card/withdrawal success or failure must be handled | PAY-11..PAY-15, FIN-09, QLT-04 | fakes + live QA | T011, T051 | deterministic branches plus annotated live run | External gate |
| SRC-SBX-02 | §9: fictitious CPF/CNPJ allowed | AUTH-11 | registration validation/live data plan | T011, T016, T017 | PF/PJ input fixtures | Specified |
| SRC-SBX-03 | §9: registration e-mail and phone must be valid | AUTH-11 | onboarding/live QA | T011, T016, T017 | format tests + masked live contact evidence | External gate |
| SRC-SBX-04 | §9: prioritize gateway Swagger on contract doubt | QLT-04, QLT-12 | contract spike policy | T011 | dated OpenAPI snapshot/hash and decision record | External gate |

## Owner-mandated quality extensions

| Source ID | Owner obligation | TLC requirements | Component / design destination | Future task group | Verification and expected evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| SRC-USR-01 | Unit tests | QLT-01, QLT-02, QLT-05..QLT-07 | Jest/Vitest suites | T001, T002 | JUnit and coverage reports | Specified |
| SRC-USR-02 | Gherkin tests | QLT-02, QLT-11 | Cucumber features | T016, T017, T021-T024, T028, T029, T035-T037, T041-T043 | Cucumber report with required journeys | Specified |
| SRC-USR-03 | Formal QA procedures | QLT-19, QLT-22 | QA plan/report | T051 | completed release QA report | Specified |
| SRC-USR-04 | Quality metrics and validation script | QLT-05..QLT-10, QLT-16, QLT-17 | `validate-quality.mjs`, CI | T002, T046, T051 | positive/negative validator fixtures and metric artifacts | Specified |
| SRC-USR-05 | Mutation testing | QLT-03, QLT-08 | StrykerJS | T002, T027, T028, T045, T046 | score >=80%, NoCoverage=0 | Specified |
| SRC-USR-06 | CI/CD, logs and disciplined Git | QLT-01..QLT-04, OPS-05..OPS-10 | GitHub Actions, Pino, release | T046, T048, T049 | workflows, structured logs, atomic commit audit | Specified |

## Closure rules

1. Every `SRC-*` row SHALL retain at least one TLC requirement or an explicit nonmandatory rationale.
2. Every source row SHALL retain a real task ID; `N/A` is allowed only for a classified nonrequirement.
3. During Execute, every P1 row SHALL link to a machine-readable artifact or a QA evidence entry. A test name without its result is not evidence.
4. Documentary alignment becomes implementation alignment only when every P1 requirement is verified and all `External gate` rows have sanitized live evidence.
5. Any new source revision invalidates the 100% documentary claim until this matrix is diffed and revalidated.
