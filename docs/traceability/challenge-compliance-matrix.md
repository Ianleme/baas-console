# Challenge Compliance Matrix

**Source:** `desafio-tecnico-baas-integracao-gateway-vba-systems.md`

**Scope:** original challenge, its consolidated checklist, and the quality extensions explicitly required by the project owner.

**Documentary status:** 100% of source obligations below are classified and mapped. This proves specification coverage, not implementation completion. Runtime fidelity remains blocked by the live contract spike for response schemas, webhook payloads and HMAC encoding.

## Reading the matrix

- `Specified` means an acceptance criterion and design destination exist.
- `External gate` means the behavior is specified, but live gateway evidence is still required before the adapter can be considered faithful.
- `P1 differential` means the challenge calls it an extra, but the project owner promoted it to the first release.
- `Deferred, nonmandatory` means the route is listed in the summarized gateway contract but is absent from mandatory functional scope; the omission is deliberate and justified.
- `TBD-*` values are future task groups, not executable task IDs. They SHALL be replaced by atomic IDs when `tasks.md` is approved; no implementation starts from this matrix alone.

## Required stack and integration boundary

| Source ID | Source locator and obligation | TLC requirements | Component / design destination | Future task group | Verification and expected evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| SRC-STK-01 | §2 Backend: TypeScript + NestJS | QLT-21 | `apps/api`, Nest modules | TBD-BOOTSTRAP | Static package/config audit; build log | Specified |
| SRC-STK-02 | §2 Backend: TypeORM persistence | QLT-13, QLT-21 | TypeORM entities/migrations | TBD-DATA | MySQL integration suite; migration log | Specified |
| SRC-STK-03 | §2 Backend: `class-validator` / `class-transformer` for DTOs | QLT-21 | API DTOs, global validation pipe | TBD-API-CONTRACT | Invalid/valid request integration cases; OpenAPI schema | Specified |
| SRC-STK-04 | §2 Backend: Swagger with `@nestjs/swagger` | QLT-21, OPS-15 | API bootstrap, generated client | TBD-API-CONTRACT | `/docs` smoke and OpenAPI artifact | Specified |
| SRC-STK-05 | §2 Backend: Nest middleware for logging, correlation id and auth support | QLT-15, QLT-18, QLT-21 | Observability middleware + guards | TBD-OBSERVABILITY | Middleware/guard integration tests; redacted JSON log | Specified |
| SRC-STK-06 | §2 Backend: MySQL as the BaaS database | QLT-13, QLT-21 | MySQL 8.4, migrations | TBD-DATA | Clean migration and integration report against real MySQL | Specified |
| SRC-STK-07 | §2 Frontend: React + Vite | UI-01..UI-11, QLT-21 | `apps/web` | TBD-WEB-FOUNDATION | Production build, component and browser reports | Specified |
| SRC-STK-08 | §2 Boundary: own database; gateway only through HTTP APIs | AUTH-02, QLT-12, OPS-01 | `LeraBoxGateway`, MySQL | TBD-GATEWAY-ADAPTER | Network/architecture audit; contract stub traffic | Specified |

## Mandatory functional scope

| Source ID | Source locator and obligation | TLC requirements | Component / design destination | Future task group | Verification and expected evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| SRC-AUTH-01 | §3.1: register by `POST /api/users` for PF or PJ with real e-mail and phone | AUTH-02, AUTH-11 | GatewayAccounts + registration DTO/UI | TBD-ONBOARDING | PF/PJ validation tests plus masked live request evidence | External gate |
| SRC-AUTH-02 | §3.1: receive document, password, CodigoCliente and ChaveLoja by e-mail | AUTH-03 | Onboarding state + live QA | TBD-ONBOARDING | Masked receipt evidence; no credential in repository/artifacts | External gate |
| SRC-AUTH-03 | §3.1: login through `POST /api/auth/login` | AUTH-04, AUTH-05 | `LeraBoxGateway.login` | TBD-GATEWAY-AUTH | Contract test and masked live response evidence | External gate |
| SRC-AUTH-04 | §3.1: store Bearer token securely in BaaS backend | AUTH-05 | encrypted `gateway_accounts` | TBD-GATEWAY-AUTH | Encryption round-trip and database-at-rest inspection | Specified |
| SRC-AUTH-05 | §3.1: never expose gateway password to frontend | AUTH-04, AUTH-05, QLT-15 | Gateway connection use case + serializers | TBD-GATEWAY-AUTH | Schema/log/response negative fixture proves absence | Specified |
| SRC-CHK-01 | §3.2: own checkout link/session and reconcilable identifier | CHK-01, CHK-10, CHK-11 | CheckoutLinks | TBD-CHECKOUT-LINKS | API, persistence and browser journey with public reference | Specified |
| SRC-CHK-02 | §3.2: Pix POST and display `qrCodeBase64` and/or EMV | PAY-01..PAY-04 | Payments + public checkout | TBD-PIX | HTTP contract + Gherkin + browser screenshot | External gate |
| SRC-CHK-03 | §3.2: card fees, installments and correct `feePercent` in POST | CHK-03, PAY-07..PAY-10, PAY-17 | Fees + card payment | TBD-CARD | Fee table/brand contract cases and card journey | External gate |
| SRC-CHK-04 | §3.2: `externalReference` aligned for reconciliation | CHK-01, PAY-01, PAY-10, WHK-13 | Checkout, attempts, reconciliation | TBD-RECONCILIATION | End-to-end correlation assertion across local/remote fixtures | Specified |
| SRC-TRX-01 | §3.3: filters Success/Failure/Expired/Cancelled map to APPROVED/DENIED/EXPIRED/CANCELLED | FIN-04, FIN-13 | Transactions API and UI | TBD-TRANSACTIONS | Parameterized API/component/E2E filter cases | Specified |
| SRC-TRX-02 | §3.3: use `GET /api/wallet/transactions?status=&type=&limit=` | FIN-14, WHK-13 | Wallet adapter + reconciliation | TBD-STATEMENT | Query serialization contract test; consolidated view evidence | External gate |
| SRC-WAL-01 | §3.4: show balance from `GET /api/wallet` | FIN-01..FIN-03 | WalletModule + dashboard | TBD-WALLET | Contract/integration/browser stale/current cases | External gate |
| SRC-WAL-02 | §3.4: consolidated statement in UI | FIN-04, FIN-05, FIN-14 | transaction projection + UI | TBD-TRANSACTIONS | Local/remote/mismatch fixtures and browser table | Specified |
| SRC-WDR-01 | §3.5: request withdrawal by `POST /api/withdrawals` | FIN-06..FIN-08, FIN-10 | WithdrawalsModule + UI | TBD-WITHDRAWALS | Contract/Gherkin/E2E; unknown-result no-retry proof | External gate |
| SRC-WDR-02 | §3.5: query status by `GET /api/withdrawals/:id` | FIN-09 | Withdrawals + reconciliation | TBD-WITHDRAWALS | Status matrix contract/integration cases | External gate |
| SRC-WHK-01 | §3.6: register URLs for PAYMENT_PIX, PAYMENT_CARD and WITHDRAWAL | WHK-01, UI-11 | Webhooks module/UI | TBD-WEBHOOK-CONFIG | Three-event contract and browser management journey | External gate |
| SRC-WHK-02 | §3.6: authenticable and validatable receiver endpoints | WHK-02..WHK-07 | raw webhook ingress | TBD-WEBHOOK-INGRESS | Raw HTTP cases for 200/401/413/503 | Specified |
| SRC-WHK-03 | §3.6: validate `X-Lera-Box-Signature` when secret exists | WHK-02, WHK-03 | HMAC verifier | TBD-WEBHOOK-INGRESS | Exact raw-byte fixture, timing-safe compare and live sample | External gate |
| SRC-WHK-04 | §3.6: definitive async Pix/card outcome via webhook | PAY-03, PAY-11, PAY-12, WHK-08..WHK-12 | inbox workers + payments | TBD-WEBHOOK-PROCESSING | duplicate/out-of-order Gherkin and mutation evidence | External gate |
| SRC-WHK-05 | §3.6: update local order and checkout link | CHK-07, CHK-08, WHK-10, WHK-11 | payment attempts + checkout links | TBD-WEBHOOK-PROCESSING | Atomic transition integration test | Specified |
| SRC-FEE-01 | §3.7: query `/fees` and `?brand=` before creating card link | CHK-03 | CheckoutLinks + gateway fees | TBD-FEES | Contract call-order and brand parameter cases | External gate |
| SRC-FEE-02 | §3.7: persist and display fee applied at link creation | CHK-03, PAY-17 | fee snapshot + link/payment details | TBD-FEES | Database assertion and UI screenshot | Specified |
| SRC-FEE-03 | §3.7: reject/avoid divergent `feePercent` | PAY-08..PAY-10 | card quote/confirmation | TBD-CARD | Changed-fee Gherkin and no-POST assertion | Specified |
| SRC-FEE-04 | §3.7: all gateway money values in cents | CHK-02, PAY-01, FIN-01, FIN-07 | money value objects/DTOs | TBD-MONEY | Boundary/property/unit and contract serialization tests | Specified |

## Differentials promoted to P1

| Source ID | Source locator and obligation | TLC requirements | Component / design destination | Future task group | Verification and expected evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| SRC-EXT-01 | §4: Docker for API, frontend and MySQL with Compose | OPS-01, OPS-03, OPS-04 | Dockerfiles/Compose | TBD-CONTAINERS | Clean Compose smoke and health evidence | P1 differential |
| SRC-EXT-02 | §4: domain and simple VPS deploy with HTTPS | OPS-02, OPS-08..OPS-11 | Caddy/deploy workflows | TBD-DEPLOY | Public TLS, deploy/rollback and restore rehearsal | P1 differential |
| SRC-EXT-03 | §4: send payment link by e-mail and/or WhatsApp | DOC-01..DOC-05 | SMTP outbox; e-mail selected | TBD-EMAIL | Mailpit/SMTP integration, retry/dead-letter evidence | P1 differential |
| SRC-EXT-04 | §4: receipt as PDF or printable page after success | DOC-07..DOC-12 | receipt HTML + Playwright PDF | TBD-RECEIPTS | Approved/denied E2E, PDF text/visual/redaction evidence | P1 differential |

## Summarized gateway contract and suggested architecture

| Source ID | Source locator and obligation/classification | TLC requirements | Component / design destination | Future task group | Verification and expected evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| SRC-CON-01 | §5: protected calls use `Authorization: Bearer` | AUTH-05, QLT-12 | gateway HTTP client | TBD-GATEWAY-ADAPTER | Header contract test with redacted logs | External gate |
| SRC-CON-02 | §5: `GET /payments/:id` for own payment | PAY-03, WHK-13 | Payments/Reconciliation | TBD-RECONCILIATION | Own-account contract and cross-tenant negative case | External gate |
| SRC-CON-03 | §5: `POST/GET/DELETE /webhooks` management | WHK-01, UI-11 | Webhooks module/UI | TBD-WEBHOOK-CONFIG | Create/list/delete contract and E2E | External gate |
| SRC-CON-04 | §5: `GET /users/me` profile | AUTH-12 | GatewayAccounts | TBD-GATEWAY-AUTH | Profile-match/mismatch contract tests | External gate |
| SRC-CON-05 | §5: `POST /auth/reset-password` appears only in contract table | Out of Scope table | No first-release component | N/A | Matrix review confirms deliberate rationale | Deferred, nonmandatory |
| SRC-CON-06 | §5: every token sees only its own wallet, transactions and webhooks | AUTH-09, QLT-13 | tenancy guard, composite tenant keys | TBD-TENANCY | Two-tenant API, DB and gateway contract cases | Specified |
| SRC-ARC-01 | §6: local users/session may differ from gateway user | AUTH-01, AUTH-04..AUTH-07 | Auth vs GatewayAccounts | TBD-AUTH-LOCAL | Local login works independently of gateway secret | Specified |
| SRC-ARC-02 | §6: checkout links and suggested `orders` with status and gateway IDs | CHK-01..CHK-09, PAY-11..PAY-15 | `checkout_links` + `payment_attempts` | TBD-CHECKOUT-LINKS | Model review and state-machine integration tests | Specified |
| SRC-ARC-03 | §6: webhook event audit/idempotency and handlers/jobs | WHK-05..WHK-12 | `webhook_events` + leased worker | TBD-WEBHOOK-PROCESSING | Persistence, lease, retry and dedupe evidence | Specified |
| SRC-ARC-04 | §6: minimum suggested entities | AUTH-01, CHK-01, FIN-05, FIN-07, WHK-05 | users, gateway_accounts, links/attempts, transactions, withdrawals, webhook_events | TBD-DATA | Migration/schema audit and relationship tests | Specified |
| SRC-ARC-05 | §6: protect tokens/secrets, correlation, idempotency, never trust frontend status | AUTH-05, WHK-08, QLT-15, QLT-18 | encryption, middleware, state machines | TBD-SECURITY | Redaction, idempotency, forged-status negative cases | Specified |

## Evaluation and delivery

| Source ID | Source locator and obligation | TLC requirements | Component / design destination | Future task group | Verification and expected evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| SRC-EVAL-01 | §7.1: Nest modules, DTOs, validators and Swagger | QLT-21 | API architecture | TBD-API-CONTRACT | Static architecture audit + OpenAPI | Specified |
| SRC-EVAL-02 | §7.2: correct TypeORM and MySQL | QLT-13, QLT-21 | data layer | TBD-DATA | migrations and real-MySQL integration | Specified |
| SRC-EVAL-03 | §7.3: coherent middleware and guards | AUTH-09, QLT-18, QLT-21 | request context/auth/tenancy | TBD-TENANCY | integration and two-tenant evidence | Specified |
| SRC-EVAL-04 | §7.4: faithful auth, fees, webhooks and isolation | AUTH-02..AUTH-12, CHK-03, WHK-01..WHK-14 | gateway boundary | TBD-GATEWAY-ADAPTER | contract spike + contract/tenant suites | External gate |
| SRC-EVAL-05 | §7.5: React UX for link, balance, filters, withdrawal and webhooks | UI-01..UI-11, FIN-03, FIN-06 | web routes | TBD-WEB-JOURNEYS | component/accessibility/E2E artifacts | Specified |
| SRC-EVAL-06 | §7.6: README setup, variables and flows | OPS-14, OPS-15 | repository docs | TBD-DOCS | clean-room documentation rehearsal | Specified |
| SRC-EVAL-07 | §7.7: Docker, VPS, send link and receipt | OPS-01..OPS-11, DOC-01..DOC-12 | delivery + docs | TBD-RELEASE | Compose/deploy/e-mail/PDF evidence | P1 differential |
| SRC-DEL-01 | §8: repository containing backend and frontend | QLT-21, OPS-14 | monorepo `apps/api`, `apps/web` | TBD-BOOTSTRAP | tree/build audit | Specified |
| SRC-DEL-02 | §8: README with local setup | OPS-14, OPS-15 | `README.md` | TBD-DOCS | fresh-machine/clean-room rehearsal | Specified |
| SRC-DEL-03 | §8: BaaS Swagger URL | QLT-21, OPS-15 | API `/docs` + README | TBD-API-CONTRACT | URL smoke and documentation link | Specified |
| SRC-DEL-04 | §8: public URL and/or Docker | OPS-01, OPS-02, OPS-15 | Compose and production hosts | TBD-RELEASE | public smoke or Docker clean start | Specified |
| SRC-DEL-05 | §8: demo credentials without sharing gateway e-mail password | OPS-12..OPS-15 | demo/private handoff | TBD-DEMO | read-only demo + private credential checklist | Specified |
| SRC-SBX-01 | §9: random Pix/card/withdrawal success or failure must be handled | PAY-11..PAY-15, FIN-09, QLT-04 | fakes + live QA | TBD-LIVE-SANDBOX | deterministic branches plus annotated live run | External gate |
| SRC-SBX-02 | §9: fictitious CPF/CNPJ allowed | AUTH-11 | registration validation/live data plan | TBD-ONBOARDING | PF/PJ input fixtures | Specified |
| SRC-SBX-03 | §9: registration e-mail and phone must be valid | AUTH-11 | onboarding/live QA | TBD-ONBOARDING | format tests + masked live contact evidence | External gate |
| SRC-SBX-04 | §9: prioritize gateway Swagger on contract doubt | QLT-04, QLT-12 | contract spike policy | TBD-CONTRACT-SPIKE | dated OpenAPI snapshot/hash and decision record | External gate |

## Owner-mandated quality extensions

| Source ID | Owner obligation | TLC requirements | Component / design destination | Future task group | Verification and expected evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| SRC-USR-01 | Unit tests | QLT-01, QLT-02, QLT-05..QLT-07 | Jest/Vitest suites | TBD-TEST-FOUNDATION | JUnit and coverage reports | Specified |
| SRC-USR-02 | Gherkin tests | QLT-02, QLT-11 | Cucumber features | TBD-GHERKIN | Cucumber report with required journeys | Specified |
| SRC-USR-03 | Formal QA procedures | QLT-19, QLT-22 | QA plan/report | TBD-QA | completed release QA report | Specified |
| SRC-USR-04 | Quality metrics and validation script | QLT-05..QLT-10, QLT-16, QLT-17 | `validate-quality.mjs`, CI | TBD-QUALITY-GATE | positive/negative validator fixtures and metric artifacts | Specified |
| SRC-USR-05 | Mutation testing | QLT-03, QLT-08 | StrykerJS | TBD-MUTATION | score >=80%, NoCoverage=0 | Specified |
| SRC-USR-06 | CI/CD, logs and disciplined Git | QLT-01..QLT-04, OPS-05..OPS-10 | GitHub Actions, Pino, release | TBD-CI-CD | workflows, structured logs, atomic commit audit | Specified |

## Closure rules

1. Every `SRC-*` row SHALL retain at least one TLC requirement or an explicit nonmandatory rationale.
2. During Tasks, every `TBD-*` SHALL be replaced or cross-referenced with real atomic task IDs; `N/A` is allowed only for a classified nonrequirement.
3. During Execute, every P1 row SHALL link to a machine-readable artifact or a QA evidence entry. A test name without its result is not evidence.
4. Documentary alignment becomes implementation alignment only when every P1 requirement is verified and all `External gate` rows have sanitized live evidence.
5. Any new source revision invalidates the 100% documentary claim until this matrix is diffed and revalidated.
