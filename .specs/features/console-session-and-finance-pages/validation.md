# Console Session and Finance Pages Validation

**Date**: 2026-08-13  
**Spec**: `.specs/features/console-session-and-finance-pages/spec.md`  
**Diff range**: `91d145f..56cbba5`  
**Verifier**: fresh independent TLC verifier, revalidation iteration 1

## Verdict

**FAIL ❌ — implementation evidence is substantially complete, but validation is not clean.**
The focused corrected gates pass and T10 resolves the former CONSOLE-10..18 evidence gaps, but `verify:quick` fails formatting and one required mutation survived. The surviving signal means terminal retry behavior is not discriminated by the current test set.

## Task Completion

| Task | Status | Evidence |
|---|---|---|
| T1–T9 | ✅ Done | Marked complete in `tasks.md`; implementation and focused tests covered below. |
| T10 | ✅ Evidence added | `apps/web/src/api-runtime.test.ts:164-171,183-192` and `apps/web/src/app/app-router.test.tsx:65-128` explicitly cover refresh failure, repeated 401, logout success/failure, cleanup, and token non-reuse for CONSOLE-10..18. |

## Acceptance Matrix

| AC | Exact file:line assertion evidence | Spec outcome mapping | Result |
|---|---|---|---|
| CONSOLE-01 | `apps/web/src/app/app-shell.test.tsx:19-20`; `apps/api/test/integration/session-profile.spec.ts:55-60` | API profile identity is rendered in sidebar and allowlisted response is returned. | ✅ |
| CONSOLE-02 | `apps/web/src/app/app-shell.test.tsx:24-27` | Non-401/unavailable identity keeps shell navigation and shows no fictitious fallback. | ✅ |
| CONSOLE-03 | `apps/api/test/integration/session-profile.spec.ts:78-85` | Merchant/owner derive from verified token; client tenant selector is ignored. | ✅ |
| CONSOLE-04 | `apps/web/src/features/wallet/wallet-page.test.tsx:28-32`; `tests/e2e/console-session.spec.ts:45-49` | Wallet shows balance, availability, UTC time, source, and sync state. | ✅ |
| CONSOLE-05 | `apps/web/src/features/wallet/wallet-page.test.tsx:48-51`; `tests/e2e/console-session.spec.ts:47-50` | Stale values remain visible, stale state is explicit, and zero is not fabricated. | ✅ |
| CONSOLE-06 | `apps/web/src/features/wallet/wallet-page.test.tsx:60-62` | Missing snapshot is an explicit empty state, not confirmed zero. | ✅ |
| CONSOLE-07 | `apps/web/src/features/wallet/wallet-page.test.tsx:75-78` | Wallet failure is safe Portuguese UI without dependency payload. | ✅ |
| CONSOLE-08 | `apps/web/src/features/settings/settings-page.test.tsx:13-17` | Settings renders allowlisted business, owner, email, and connection data read-only. | ✅ |
| CONSOLE-09 | `apps/web/src/features/settings/settings-page.test.tsx:23-25` | No edit, save, credential, textbox, or mutation control is offered. | ✅ |
| CONSOLE-10 | `apps/web/src/features/settings/settings-page.test.tsx:43-46,59-62` | Profile unavailability, including explicit status 503, is communicated safely in Portuguese. | ✅ |
| CONSOLE-11 | `apps/web/src/api-runtime.test.ts:155-160` | First 401 causes exactly one `/auth/refresh` and exactly two original calls, with retry after refresh. | ✅ |
| CONSOLE-12 | `apps/web/src/api-runtime.test.ts:155-157` | Successful refresh/retry returns the normal mapped result. | ✅ |
| CONSOLE-13 | `apps/web/src/api-runtime.test.ts:164-192`; `apps/web/src/app/app-router.test.tsx:74-79` | Refresh failure and repeated 401 clear session, notify once, avoid another refresh, and return to auth. | ✅ test evidence; ⚠️ mutation signal below |
| CONSOLE-14 | `apps/web/src/api-runtime.test.ts:177-179` | Non-401 failure is preserved and does not refresh. | ✅ |
| CONSOLE-15 | `apps/web/src/api-runtime.test.ts:195-200` | Concurrent 401s use one refresh and each original request is retried once. | ✅ |
| CONSOLE-16 | `apps/web/src/app/app-router.test.tsx:90-103`; `tests/e2e/console-session.spec.ts:57-59` | Logout endpoint is called, local token/profile state is cleared, and auth journey appears. | ✅ |
| CONSOLE-17 | `apps/web/src/app/app-router.test.tsx:105-128` | Remote 503 logout still clears local state and returns to authentication. | ✅ |
| CONSOLE-18 | `apps/web/src/app/app-router.test.tsx:118-128` | After logout, old token/profile are absent and token is not reused. | ✅ |
| CONSOLE-19 | `apps/api/test/integration/auth-persistence.spec.ts:139-161`; `apps/api/test/integration/session-profile.spec.ts:99-100` | Registration name persists and legacy null safely falls back to email. | ✅ |

**AC result: 19/19 have direct assertion evidence.** T10 closes the prior CONSOLE-10..18 report gaps. This does not override the failed gate/mutation verdict.

## Required Gates

| Gate | Exact result |
|---|---|
| Focused unit auth: `npm run test:unit -- --runInBand apps/api/test/unit/auth.service.spec.ts` | ✅ 1 suite, 31 passed. |
| Focused integration auth persistence + session profile (correct workspace-relative invocation) | ✅ 2 suites, 24 passed. Command: `npm run test:integration --workspace @baas/api -- --runInBand test/integration/auth-persistence.spec.ts test/integration/session-profile.spec.ts`. |
| Focused web API/router/shell/wallet/settings (correct workspace-relative invocation) | ✅ 5 files, 34 passed. |
| `npm run test:e2e -- tests/e2e/console-session.spec.ts` | ✅ 1 passed (11.0s); port 4173 was free. |
| `npm run verify:quick` | ❌ format stage exited 1. Prettier reported 9 files: migration, auth-persistence, session-profile, api-runtime, app-router test, app-router, api-client index, `scripts/run-mysql-integration.mjs`, and E2E feature file. These feature-file failures were examined and are not dismissed as unrelated; several are changed feature files. |

The first root-relative focused API/web invocations produced “no tests found” because workspace scripts resolve paths from `apps/api`/`apps/web`; they were rerun with workspace-relative paths and passed.

## Mutation / Discrimination Sensor

Three temporary-copy mutations were injected and discarded; the real worktree was restored after each:

| Mutation | Gate | Result |
|---|---|---|
| Terminal retry condition changed from `retry.status === 401` to `retry.status !== 401` in `packages/api-client/src/index.ts` | `api-runtime.test.ts` | ⚠️ **Survived**: 10 tests passed, exit 0. Required terminal retry assertion does not kill this mutation. |
| Session-profile user lookup changed from `principal.userId` to `"attacker-selected"` | session-profile integration | ✅ Killed: 3 failed tests, exit 1. |
| Wallet stale branches disabled (`snapshot.stale &&` → `false &&`) | wallet unit | ✅ Killed: 1 failed test, exit 1. |

## Ranked Fixes

1. **Blocker — transport discrimination / CONSOLE-13:** make a focused test assert the repeated-401 terminal callback and session clear in a way that fails when the retry status condition is inverted; assert the exact request sequence and terminal transition.
2. **Major — `verify:quick`:** format the nine reported files, while separately reviewing the listed pre-existing script file and preserving unrelated local worktree changes.
3. **Minor — rerun all gates after fixes:** retain exact workspace-relative focused commands and mutation sensor evidence.

## Worktree Safety

Only this `validation.md` report was changed by this verification. No code, test, task, or spec files were changed; no commit was created. Temporary mutation copies were discarded.
