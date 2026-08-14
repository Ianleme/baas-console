# BaaS Console — Payment Links Pagination and Remote Search Validation

**Date**: 2026-08-14  
**Spec**: `.specs/features/baas-console/spec.md`  
**Diff range**: `5c6c75d^..453a02e`  
**Verifier**: independent TLC sub-agent (author != verifier)  
**Scope**: server-side Payment Links pagination (10 per page), remote filters with `total` and `summary`, 350 ms debounce for Payment Links and Transactions searches, OpenAPI and API client

---

## Verdict

**Overall**: PASS — all scoped outcomes have implementation and assertion evidence, focused gates are green, and the behavior-level debounce mutation was killed.

The approved `spec.md` contains the related CHK, FIN, UI, and QLT requirements, but does not state the task-specific constants and envelope semantics verbatim. The explicit implementation task supplied those Done-when outcomes. This is retained as a minor documentation/traceability gap, not a functional failure.

---

## Spec-Anchored and Done-When Evidence

| Criterion | Expected outcome | `file:line` + assertion evidence | Result |
| --- | --- | --- | --- |
| CHK-06 — bulk expiry precedes list totals and summary | Overdue `ACTIVE` links become `EXPIRED`; active summary is updated | `apps/api/test/unit/checkout-link.service.spec.ts:256` — list after overdue creation; `:264` — `summary: { totalCount: 1, activeCount: 0 }` and item `EXPIRED` | PASS |
| FIN-04 — remote filters execute inside the authenticated tenant | Search/status/method filtering returns only the matching tenant row | `apps/api/test/integration/checkout-payments-runtime.spec.ts:151` — focused HTTP/MySQL case; `:163` — exact `runtime-page-b`/`CARD` item; `:164` — exact filtered `totalCount`, `activeCount`, `paidCount`, and `paidAmountCents` | PASS |
| UI-03 — conversion excludes active links from the denominator | Paid / finalized, with the denominator explained accessibly | `apps/web/src/features/payment-links/payment-links.test.tsx:130` — exact `100%` for one active plus one paid; `:131` — visible `Pagos ÷ links finalizados`; implementation at `payment-links.tsx:209-211` | PASS |
| UI-07 — pagination remains usable and preserves financial information | 10 rows/page, correct offsets and boundary controls | `apps/web/src/features/payment-links/payment-links.test.tsx:381` — 21-row scenario; `:394` previous disabled; `:398` offset 10; `:403` offset 20; `:406` next disabled on page 3 | PASS |
| QLT-20 — independent verifier applies a discrimination sensor | A behavior-level fault must be detected outside the real worktree | Mutation `delayMs` to `delayMs + 1` in scratch; `apps/web/src/hooks/use-debounced-value.test.tsx:18` failed at the exact 350 ms assertion | PASS |
| Task Done-when — exactly 350 ms, latest value wins | No publish at 349 ms; publish at 350 ms; superseded input never publishes | `apps/web/src/hooks/use-debounced-value.test.tsx:15-18` and `:21-26` | PASS |
| Task Done-when — both remote text searches use the verified hook | Payment Links and Transactions apply 350 ms before remote query construction | `apps/web/src/features/payment-links/payment-links.tsx:143` and `apps/web/src/features/transactions/transactions-page.tsx:110` — `useDebouncedValue(..., 350)` | PASS |
| Task Done-when — OpenAPI/client expose typed pagination contract | Seven query fields plus typed `items`, `total`, `summary` response | `scripts/generate-api-client.test.mjs:21-30` — exact document assertions; generated response at `packages/api-client/src/generated/schema.ts:639` and `:777` | PASS |

**Spec-anchored status**: all related precise spec outcomes in this diff pass.  
**Done-when status**: 7/7 scoped outcomes pass.  
**Spec-precision note**: the 10-item constant, 350 ms interval, and summary-status semantics should be copied into a future spec/task traceability update.

---

## Implementation and Edge-Case Evidence

| Behavior | Evidence | Result |
| --- | --- | --- |
| Default page size | `apps/api/src/modules/checkout-links/checkout-link.controller.ts:84` — `limit = 10` | PASS |
| Server pagination | `apps/api/src/modules/checkout-links/typeorm-checkout-link.store.ts:33-34` — database `skip(offset)` and `take(limit)` | PASS |
| Deterministic order | Store orders by `createdAt DESC`, then `id DESC`, before pagination | PASS |
| Filtered summary semantics | `typeorm-checkout-link.store.ts:36-38` preserves search/method/date filters and deliberately removes only status for cross-status KPI/tab summary | PASS |
| Filtered summary values | HTTP/MySQL assertion proves exact zero paid values for the matching active CARD link | PASS |
| Bulk expiration | Service expires tenant-scoped active rows before list/summary query; unit assertion proves totals see the new state | PASS |
| Page boundaries | 21 rows prove 10/10/1, offsets 0/10/20, and disabled previous/next at boundaries | PASS |
| Zero finalized links | Formula guards division by zero with `finalizedCount === 0 ? 0` | PASS statically |
| OpenAPI response envelope | Controller DTO at `checkout-link.controller.ts:120`; response decorator at `:144`; generated `application/json` schema is no longer `content?: never` | PASS |

---

## Focused Gates

Results supplied by the implementation runner and accepted as current focused evidence for `453a02e`:

| Gate | Result |
| --- | --- |
| Web focused suite | 42/42 passed |
| API unit focused suite | 47/47 passed |
| OpenAPI generation/contract suite | 6/6 passed |
| Web typecheck | Passed |
| API build/typecheck | Passed |
| New HTTP/MySQL pagination/filter integration case | Passed |

No global suite was rerun, per verifier instruction. The prior global result remains 188/201 with 13 failures outside this diff surface: authentication/checkout cookies, demo behavior, and timeouts. Those failures are a repository-level release-gate concern but provide no evidence of a regression in `5c6c75d^..453a02e`.

---

## Discrimination Sensor

**Scratch**: detached temporary worktree at `453a02e`; real worktree was never mutated.  
**Depth**: lightweight, one highest-signal behavior mutation.  
**Baseline**: hook test included in the green 42/42 focused web suite.

| Mutation | File:line | Expected discriminator | Result |
| --- | --- | --- | --- |
| `setTimeout(..., delayMs)` → `setTimeout(..., delayMs + 1)` | `apps/web/src/hooks/use-debounced-value.ts:7-9` | At 350 ms the latest value must already be visible | KILLED — focused test exited 1 at `use-debounced-value.test.tsx:18`, expected `first`, received `initial` |

**Sensor result**: 1 injected, 1 killed, 0 survived — PASS.

The first launch attempt did not reach test collection because the scratch lacked the workspace-local `@vitejs/plugin-react` resolution. It is not counted as a mutation result. After adding only the permitted `apps/web/node_modules` junction, the same mutation ran, failed on the intended assertion, and the mutated file was restored. Final scratch Git status was clean.

---

## Code Quality

| Principle | Result |
| --- | --- |
| Surgical changes | PASS — corrections stay within checkout-link contract, UI, generated client, and focused tests |
| No unnecessary architecture | PASS — one reusable generic hook and response DTOs required by Swagger |
| Server-side pagination/filtering | PASS — no client-side slicing of an incomplete result set |
| Tenant boundary retained | PASS — all store queries originate from the authenticated `merchantId` predicate |
| Stable page ordering | PASS |
| Input bounds | PASS — bounded search, enums, date strings, `limit` 1..100, non-negative offset |
| Accessible formula explanation | PASS |
| Test integrity | PASS — tests were strengthened; none were weakened, skipped, or deleted |
| Contract drift prevention | PASS — document shape and generated output are both asserted |

---

## Ranked Gaps

1. **Minor — formal spec precision**: add the 10-row page size, 350 ms debounce, paginated response envelope, and summary/status semantics to the canonical spec or task traceability document. Current behavior is outcome-proven but these constants are only explicit in the implementation task and tests.
2. **External — repository global gate**: separately resolve the 13 pre-existing/external cookie, demo, and timeout failures before claiming the whole repository satisfies QLT-02. They do not block this scoped PASS.

No functional or discrimination gap remains in the verified commit range. No project lesson was recorded because validation found no surviving mutant, failed scoped AC, or code deviation; the documentation precision note is already captured here, and this verifier was authorized to modify only this report.

---

## Summary

**Overall**: PASS  
**Spec/Done-when**: 7/7 scoped outcomes matched  
**Focused gates**: web 42/42; API unit 47/47; OpenAPI 6/6; typechecks/build passed; HTTP/MySQL focused case passed  
**Sensor**: 1/1 killed  
**Remaining scoped defects**: none  
**Non-blocking notes**: formal spec precision and unrelated global-suite failures
