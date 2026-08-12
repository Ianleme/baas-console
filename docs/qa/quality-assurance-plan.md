# Quality Assurance Plan

**Status:** specified; execution starts only after approved `tasks.md` and implementation.

**Applies to:** every release candidate of BaaS Console.

**Authority:** acceptance criteria in `.specs/features/baas-console/spec.md`, the source mapping in `docs/traceability/challenge-compliance-matrix.md`, and active decisions in `.specs/STATE.md`.

## Objective and verdict

QA must answer one binary question: is this exact candidate safe, reproducible and demonstrably aligned with the challenge? The final verdict is `APPROVED` or `BLOCKED`; “mostly passed” is not a release state.

Automated tests, manual procedures and live checks complement one another:

- automated suites prove deterministic behavior and regression resistance;
- exploratory and UAT procedures prove usability and unexpected interactions;
- `verify:live` proves current assumptions about the real Lera Box sandbox;
- the independent TLC verifier judges requirement outcomes from evidence and cannot be the same actor that authored the implementation under review.

## Entry criteria

A release candidate may enter QA only when all conditions hold:

1. It is identified by immutable Git commit and, for container QA, image digests.
2. The worktree is clean and dependencies install from the committed lockfile.
3. Database migrations apply from an empty MySQL 8.4 database with `synchronize=false`.
4. `npm run verify` has passed without skip, `.only`, lint warning or type warning.
5. No unresolved critical/high security finding or Sev-1/Sev-2 defect exists.
6. Required environment variables are documented; secrets exist only in an ignored local/CI secret store.
7. The requirement coverage matrix has no unmapped P1 requirement.
8. External live testing has explicit authorization to use the approved real e-mail and phone; absence of authorization blocks only the live gate, never justifies fabricated evidence.

## Exit criteria

The candidate is `APPROVED` only when:

- `verify:quick`, `verify`, `verify:full` and all mandatory quality thresholds pass;
- `verify:live` passes against the current sandbox for release/submission, or the report explicitly blocks the release;
- every P1 requirement has outcome evidence and every source obligation remains classified;
- required browser, responsive, accessibility, e-mail and PDF procedures pass;
- no Sev-1/Sev-2 defect is open; every accepted Sev-3/Sev-4 item has owner, rationale and expiry;
- rollback, clean setup and demo rehearsals pass;
- an independent verifier signs the final report.

Any missing artifact counts as zero evidence and blocks the affected gate.

## Environments

| Environment | Purpose | Gateway | Data policy | Required evidence |
| --- | --- | --- | --- | --- |
| Unit/component | Fast deterministic behavior | in-process fake/MSW | synthetic only | JUnit, coverage |
| Integration/contract | DB, HTTP adapter, raw webhook and concurrency | deterministic local stub | sanitized fixtures | JUnit, stub trace, MySQL version |
| E2E Compose | Production-like browser journeys | deterministic stub | seeded fictitious tenants | Playwright HTML, trace on failure, screenshots |
| Live sandbox | Confirm current external contract | real Lera Box | fake CPF/CNPJ; approved real e-mail/phone; sandbox cards only | sanitized request/response metadata and manual checklist |
| Production smoke | TLS, routes, demo and read-only controls | no destructive financial smoke | fixed demo tenant | URL/TLS/health/read-only evidence |

## Automated quality gates

| Gate | Intended command | Mandatory contents | Threshold/result |
| --- | --- | --- | --- |
| Developer | `npm run verify:quick` | format, lint, types, affected unit tests | zero warning/error/skip |
| Pull request | `npm run verify` | unit, component, integration, contract, Gherkin, coverage, build | backend 90/85 branches; critical 95/90; frontend 85/80 |
| Release | `npm run verify:full` | PR gate + Playwright browsers + mutation + Docker/release smoke | mutation >=80%, NoCoverage=0; all required flows pass |
| External | `npm run verify:live` | current OpenAPI/health, auth/profile, fees, Pix/card, wallet/statement, withdrawal, webhooks | sanitized evidence; randomness is recorded, not retried until desired outcome |

The future `scripts/validate-quality.mjs` SHALL parse reports rather than trust process exit codes alone. Its own positive and negative fixtures must prove rejection of low coverage, mutation survivors over threshold, `NoCoverage`, skipped/only tests, missing QA evidence and incomplete mappings.

## Execution order

1. Record candidate metadata and environment versions.
2. Run static/security/secret checks.
3. Run deterministic unit, component, integration, contract and Gherkin suites.
4. Run coverage and mutation gates.
5. Build production images and run clean Compose migration/smoke.
6. Execute browser/accessibility/visual/PDF procedures.
7. Execute exploratory charters and UAT.
8. Execute live sandbox procedure once authorization and credentials are available.
9. Rehearse demo, deploy and rollback.
10. Assemble the report and request independent TLC verification.

Failure stops dependent destructive/financial steps, but remaining nondependent diagnostics may continue to improve the report.

## Manual and hybrid procedures

| Procedure | Requirements | Preconditions | Actions | Pass evidence |
| --- | --- | --- | --- | --- |
| QA-001 Clean setup | OPS-01, OPS-14, OPS-15 | machine/runner without prior volumes | follow README and `.env.example`; start Compose; migrate; open web/API/docs/Mailpit | commands, health output, `/docs` screenshot, image digests |
| QA-002 PF/PJ onboarding | AUTH-01..AUTH-12 | fake gateway then authorized sandbox | validate PF and PJ forms; create one authorized live account; receive e-mail; connect; verify `/users/me` | test report plus masked receipt/profile evidence |
| QA-003 Tenant isolation | AUTH-09, SRC-CON-06 | two seeded merchants | try IDs/tokens from the other tenant across links, wallet, statement, withdrawals and webhooks | 404/denial transcript and DB constraint test |
| QA-004 Link and fee disclosure | CHK-01..CHK-12, PAY-07..PAY-10, PAY-17 | fee fixtures by brand/installment | create card link; inspect selected fee; change remote quote; attempt confirmation | screenshots, persisted snapshot assertion, changed-fee no-POST trace |
| QA-005 Pix lifecycle | PAY-01..PAY-04, PAY-13, PAY-15 | deterministic outcomes | approve, deny, expire, simulate timeout and deliver late webhook | Gherkin/E2E report and single-POST trace |
| QA-006 Card safety | PAY-05..PAY-17, QLT-15 | sandbox card fixtures only | approve/deny, trigger cooldown, inspect logs/DB/errors for sensitive values | redaction scan, attempt row, UI outcome |
| QA-007 Transactions/wallet | FIN-01..FIN-05, FIN-12..FIN-14 | local/remote match and mismatch fixtures | load balance, fail refresh, use four exact filters, reconcile remote statement | stale/current and filter screenshots; reconciliation report |
| QA-008 Withdrawal | FIN-06..FIN-11 | sandbox destinations | preview, cancel, submit once, simulate lost result, query/webhook final status | masked destination, no-retry trace, status evidence |
| QA-009 Webhook management/ingress | WHK-01..WHK-14, UI-11 | public callback route and exact HMAC fixture | create/list/reconfigure/delete all events; send valid, invalid, large, duplicate and out-of-order payloads | UI screenshots, HTTP transcript, one-transition DB evidence |
| QA-010 E-mail/receipt/PDF | DOC-01..DOC-12 | Mailpit/SMTP fake, approved payment | queue/retry/dead-letter, issue receipt, render PDF, saturate renderer, inspect content | Mailpit evidence, PDF/hash/text, redaction and 503 evidence |
| QA-011 Accessibility/responsive | UI-01..UI-11 | supported browsers/viewports | keyboard-only and screen-reader smoke; zoom 200%; mobile/desktop; color-independent statuses | axe report, manual checklist, screenshots |
| QA-012 Demo/deploy/rollback | OPS-02..OPS-15 | candidate images and deploy target | open one-click demo; attempt every mutation class; deploy digest; force failed health; rollback | 403 transcripts, TLS/smoke, previous digest restored |

## Exploratory charters

Each charter is time-boxed to 45 minutes. Record notes, data used, risks explored and defect IDs.

| Charter | Mission | Heuristics |
| --- | --- | --- |
| EXP-01 Financial ambiguity | Find any state where the UI claims success/failure while the remote outcome is unknown | timeouts, refresh, back/forward, double click, two tabs, delayed webhook |
| EXP-02 Tenant and token abuse | Cross boundaries using guessed IDs, stale sessions, public tokens and demo mode | direct API calls, ID substitution, token replay, logout/reuse |
| EXP-03 Sensitive-data leakage | Search every observable surface for credentials, PAN/CVV, PII and payloads | logs, errors, metrics, traces, DB, PDF, e-mail, browser storage/history |
| EXP-04 Fees and money | Challenge rounding, brand, installment and changed-quote behavior | min/max cents, 1x/21x, unsupported brand, stale snapshot |
| EXP-05 Async disorder | Stress duplicate, missing, corrupt and out-of-order external events | replay, concurrency, lease expiry, worker restart, dead letter |
| EXP-06 Recovery | Interrupt API, MySQL, SMTP and Chromium at critical boundaries | crash-after-send, migration failure, stale wallet, PDF saturation |

## User acceptance tests

| UAT ID | Evaluator outcome | Pass condition |
| --- | --- | --- |
| UAT-01 | Understand and enter the product | One-click demo opens read-only dashboard; private account login is documented without public password |
| UAT-02 | Create and share a charge | Link creation clearly shows value, methods, expiry and fee; e-mail arrives |
| UAT-03 | Pay by Pix | Pagador sees sandbox warning, QR/EMV and an honest pending/final state |
| UAT-04 | Pay by card | Pagador selects installments, confirms changed fee when needed and never sees invented approval |
| UAT-05 | Operate finances | Lojista sees balance timestamp, four filters, consolidated statement and withdrawal confirmation/status |
| UAT-06 | Operate integrations | Lojista can manage all three webhooks and inspect health without seeing the secret |
| UAT-07 | Produce proof | Approved transaction yields printable HTML/PDF; nonapproved transaction does not |
| UAT-08 | Reproduce the project | Evaluator follows README, opens Swagger and runs the documented verification commands |

## Browser, viewport and accessibility matrix

| Surface | Chromium | Firefox | WebKit | Viewports |
| --- | --- | --- | --- | --- |
| Login/onboarding/dashboard | PR critical + release | release | release | 1440x900, 1280x720, 390x844 |
| Link management/transactions/wallet/withdrawals/webhooks | PR critical + release | release | release | 1440x900, 390x844 |
| Public Pix/card checkout | PR critical + release | release | release | 1280x720, 390x844, 360x800 |
| Receipt HTML | PR critical + release | release | release | desktop/mobile/print |
| PDF | Playwright Chromium only by design | N/A | N/A | A4 print render |

Every interactive flow receives automated axe checks and manual keyboard/focus review. WCAG 2.2 AA failures are defects, not cosmetic notes.

## Live sandbox procedure

1. Confirm the gateway base URL and download/hash the current Swagger/OpenAPI. Record date and hash.
2. Load secrets from ignored local environment only. Enable log redaction and capture destination outside the repository if it contains sensitive metadata.
3. Obtain explicit authorization for the real e-mail and phone. Use fictitious valid CPF/CNPJ and sandbox card data only.
4. Register one PF or PJ per authorized run; do not create redundant live accounts merely to force both variants. Automated fixtures prove both shapes.
5. Record only masked evidence that the credentials arrived. Never screenshot or commit password, token, CodigoCliente, ChaveLoja, full document, phone or e-mail.
6. Login and call `/users/me`; reject a profile mismatch.
7. Query fees (including a brand), create Pix/card requests with unique external references and record the naturally returned outcomes. Never repeat until a desired random result.
8. Query wallet and statement; request one authorized sandbox withdrawal and query its status.
9. Create/list/delete all three webhook registrations; capture exact raw-body/signature behavior and sanitize fixtures.
10. Compare observed schemas with the adapter contract. Any undocumented divergence blocks fidelity until design/spec/tests are updated.
11. Rotate/revoke any exposed test secret, remove temporary callbacks and delete unsanitized evidence according to the local handling procedure.

## Defect policy

| Severity | Definition | Release rule |
| --- | --- | --- |
| Sev-1 Critical | secret/financial compromise, cross-tenant access, duplicate financial effect, data loss, unusable core flow | immediate block; no exception |
| Sev-2 High | incorrect financial state/fee, auth bypass, missing mandatory journey, unrecoverable deployment | block; no exception for submission |
| Sev-3 Medium | bounded incorrect behavior with workaround, material accessibility/compatibility defect | fix or documented risk acceptance with owner/expiry before release |
| Sev-4 Low | cosmetic/documentation issue without ambiguity or functional loss | may defer with tracked owner |

Every defect records candidate commit, environment, exact steps, expected/actual outcome, sanitized evidence, severity rationale and affected requirement IDs.

## Evidence structure

Generated runtime artifacts are not committed unless explicitly selected and sanitized. CI publishes them with retention; the report links to immutable run IDs.

```text
artifacts/qa/<release>/
  qa-report.md
  manifest.json
  junit/
  coverage/
  mutation/
  cucumber/
  playwright/
  security/
  compose/
  live-sanitized/
```

`manifest.json` SHALL contain artifact paths, SHA-256 hashes, producing command, commit SHA, image digests, timestamps and sanitization status. Secrets or raw live payloads are forbidden.

## Final report template

```markdown
# QA Report <release>

- Commit:
- Image digests:
- Environment versions:
- Executor:
- Independent verifier:
- Verdict: APPROVED | BLOCKED

## Gate results
| Gate | Result | Immutable evidence link/hash |

## Requirement coverage
| Requirement/source row | Result | Evidence |

## Live contract findings
| Assumption | Observed | Evidence | Decision |

## Defects and accepted risks
| ID | Severity | Requirement | State | Owner/expiry |

## Reproduction and rollback
| Procedure | Result | Evidence |

## Sign-off
- QA executor/date:
- Independent verifier/date:
```

The report cannot mark `APPROVED` with blank tables, broken links, unverifiable local paths, missing hashes or self-verification presented as independent evidence.
