# Phase 1: Walking Skeleton — Test Verification Report

**Date**: 2026-10-04 16:20 | **Branch**: feat/bootstrap-interviewlab

## Test Suite Results

### Summary
- **Total tests**: 139 (unit: 63, integration: 38, e2e: 38)
- **All suites passing** in both runs (no flakiness detected)
- **Build**: Successful (14.8 s)
- **Typecheck**: Passed (6.76 s)
- **Lint**: Passed (9.80 s)

### Run 1: Initial execution
| Suite | Files | Tests | Duration | Result |
|-------|-------|-------|----------|--------|
| Unit (vitest) | 6 | 63 | 3.14 s | ✓ Pass |
| Integration (vitest) | 5 | 38 | 11.54 s | ✓ Pass |
| E2E (Playwright) | 5 | 38 | 1m 6s | ✓ Pass |

### Run 2: Flakiness check
| Suite | Files | Tests | Duration | Result |
|-------|-------|-------|----------|--------|
| Unit | 6 | 63 | 3.17 s | ✓ Pass |
| Integration | 5 | 38 | 11.86 s | ✓ Pass |
| E2E | 5 | 38 | 1m 1s | ✓ Pass |

**Flakiness**: None detected. All tests consistent across runs.

## Success Criteria → Test Mapping

### Criterion 1: Vercel deployment with sign-in, notice, turn, reply, rows saved, LangSmith trace
- **Status**: Partially verifiable locally; full validation requires Vercel deploy + real LangSmith
- **Tested locally**:
  - `tests/e2e/notice-and-start.spec.ts:79-98` — Full flow: sign-in → notice consent → session start → reply stored
  - `tests/e2e/interview.spec.ts:20-41` — Question, reply, turn/llm_call rows verified in DB
  - `tests/llm/call-model.test.ts:51-56` — LangSmith metadata (session_id, call_role, tags) attached and verified
- **Not verifiable locally**: Real Vercel deploy, LangSmith trace visibility in web UI, real model latency p50/p95
- **Assessment**: ✓ Core logic verified; deployment validation deferred to phase end

### Criterion 2: Signed-out request to `/buoi/[id]` redirects to sign-in, returns to same page
- **Tests**:
  - `tests/e2e/guest.spec.ts:23-30` — "is sent to sign-in from a session link, with the link kept as the return path" ✓
  - `tests/e2e/notice-and-start.spec.ts:34-54` — Notice blocks direct session link, writes nothing ✓
- **Assessment**: ✓ Fully covered

### Criterion 3a: Unit test — overlapping admin/demo emails throw (including case differences)
- **Tests**:
  - `tests/config/env.test.ts:28-38` — "refuses an email in both lists" + "refuses case-insensitive overlap" ✓
  - `tests/e2e/startup.spec.ts:25-36` — Server startup rejects overlap, e2e validation ✓
- **Assessment**: ✓ Fully covered

### Criterion 3b: Integration test — every public table has RLS enabled
- **Tests**:
  - `tests/db/rls.int.test.ts:6-42` — Verifies RLS on all public tables, no policies, no anon/authenticated grants ✓
- **Assessment**: ✓ Fully covered

### Criterion 4: Signed-in user without current consent is redirected to Màn 0 from writes and direct links; consent stores version + time
- **Tests**:
  - `tests/e2e/notice-and-start.spec.ts:34-54` — Direct session link blocks, POST to `/api/.../luot` returns 403 with redirect ✓
  - `tests/e2e/notice-and-start.spec.ts:79-98` — "Tôi hiểu" stores version and time, creates session ✓
  - `tests/server/auth.int.test.ts:56-77` — `acknowledgeNotice()` stores version + time, consent check on resolveUser ✓
- **Assessment**: ✓ Fully covered

### Criterion 5a: Non-Google provider rejected
- **Tests**:
  - `tests/server/auth-claims.test.ts:17-29` — "rejects provider %s" (email, github, azure, anonymous) ✓
  - `tests/e2e/notice-and-start.spec.ts:8-19` — Non-Google account treated as signed out ✓
- **Assessment**: ✓ Fully covered

### Criterion 5b: Pending action consumed once, cannot be triggered by GET
- **Tests**:
  - `tests/server/pending-actions.int.test.ts:14-21` — "is consumed once: second attempt gets nothing" ✓
  - `tests/server/pending-actions.int.test.ts:23-32` — Concurrent consumption goes to exactly one request ✓
  - `tests/e2e/notice-and-start.spec.ts:143-154` — "loading the resume page with GET never performs the action" ✓
- **Assessment**: ✓ Fully covered

### Criterion 6: Failed model call leaves `llm_call` row with `ok = false` and its cost
- **Tests**:
  - `tests/llm/call-model.test.ts:71-89` — "gives up after two retries; every failed attempt has its own row with ok = false" ✓
  - `tests/server/turns.int.test.ts:70-90` — Failed turn attempt records cost per attempt ✓
  - `tests/e2e/interview.spec.ts:80-102` — Failed model call UI, DB verification, all 3 attempts recorded ✓
- **Assessment**: ✓ Fully covered

### Criterion 7: Build checklist (`pnpm typecheck && pnpm lint && pnpm test && pnpm build`)
- **Results**: ✓ All pass
- **Assessment**: ✓ Criterion met

## Coverage Analysis: Test Files and Code Paths

### Unit Tests (tests/**/*.test.ts)
| File | Coverage | Purpose |
|------|----------|---------|
| `config/env.test.ts` | Overlap detection, role parsing, price validation | Config load safety; prevents bad deploys |
| `server/auth-claims.test.ts` | Provider verification, email validation | Auth security; rejects non-Google |
| `server/safe-next.test.ts` | Path validation, XSS prevention | Redirect safety; same-origin only |
| `llm/roles-and-pricing.test.ts` | Role spec parsing, cost calculation, pricing lookup | LLM routing and metering |
| `llm/call-model.test.ts` | Retry logic, structured output, timeout, abort handling, cost per attempt | LLM call resilience and tracing |
| `llm/skeleton-persona-prompt.test.ts` | Data block escaping, prompt injection prevention, message shape | Prompt safety; learner text cannot escape |

### Integration Tests (tests/**/*.int.test.ts)
| File | Coverage | Purpose |
|------|----------|---------|
| `db/rls.int.test.ts` | RLS enabled, no policies, no anon/authenticated grants | DB isolation; anon cannot read |
| `server/auth.int.test.ts` | User upsert, notice consent storage, version check | Auth state machine; notice re-prompt on version bump |
| `server/pending-actions.int.test.ts` | Single-use consumption, concurrent safety, expiry, ownership | Pending action atomicity; TOCTOU safe |
| `server/sessions.int.test.ts` | Session creation with turn 0, one-per-persona, demo multi-session, demo isolation | Session ownership; one learner, one session per persona |
| `server/turns.int.test.ts` | Turn storage, transcript building, text validation, race condition handling, learner text storage | Turn atomicity; concurrent submits serialized |

### E2E Tests (tests/e2e/*.spec.ts)
| File | Coverage | Purpose |
|------|----------|---------|
| `guest.spec.ts` | Unsigned home/prep/session access, 404, auth callback, OAuth flow, pending action cookie | User journey without auth |
| `notice-and-start.spec.ts` | Notice blocking, consent UI/storage, pending action post-auth, session creation | Full auth + consent flow |
| `interview.spec.ts` | Turn posting, API response shape, keyboard input, reload persistence, error UX, XSS escaping, length validation, ownership, UUID validation | Interview core UX |
| `responsive.spec.ts` | Desktop and mobile viewport fit | Layout responsive to 375px |
| `startup.spec.ts` | Config error rejection on startup | Early fail on bad env |

## Gap Analysis: Untested Paths

### Critical gaps found: None

**Tested edge cases**:
1. ✓ Text length boundary: exactly 500 chars (turn test)
2. ✓ Empty/whitespace-only questions (turn validation)
3. ✓ Concurrent turn submissions (race test; loser reports conflict)
4. ✓ Concurrent session starts (only one written, others return existing)
5. ✓ Markup in learner text (escaped, never runs)
6. ✓ Pending action expiry (tested at 15m boundary)
7. ✓ Session ownership (learner B cannot read learner A's session)
8. ✓ Invalid session UUID (404, not 500)
9. ✓ Non-UUID session ID (API rejects, no model call)
10. ✓ Demo account multi-session (different session per start)
11. ✓ LLM call timeout (abandoned, retried)
12. ✓ AbortController mid-call (no retry, attempt recorded)
13. ✓ Structured output validation (bad shape costed, retry)
14. ✓ Empty model reply (charged as failure, retry)

**Behavioral properties verified**:
- ✓ Text always stored exactly as typed (markup included)
- ✓ Session touched when turn written (updatedAt changes)
- ✓ Turn index correct across multi-turn sessions
- ✓ Transcript sent to next model call (context preserved)
- ✓ LangSmith metadata on every call (no blind calls)
- ✓ Cost recorded before DB commit (even on failure)
- ✓ Consent persists; notice version-gated

### Unverifiable locally (deferred to deployment):
- Real Vercel deploy; environment setup, secrets, ports
- Real Google OAuth round-trip (mocked in tests)
- Real LangSmith trace capture and UI visibility
- Real model latency (p50/p95); stub returns instant replies
- Actual provider rate limits during concurrent calls

## Build, Type, and Lint Status

| Check | Result | Duration | Notes |
|-------|--------|----------|-------|
| `pnpm typecheck` | ✓ Pass | 6.76 s | TypeScript strict mode, no errors |
| `pnpm lint` | ✓ Pass | 9.80 s | ESLint config-next, no warnings |
| `pnpm test` (unit) | ✓ Pass (63/63) | 3.14 s | First run |
| `pnpm test` (unit) | ✓ Pass (63/63) | 3.17 s | Second run; consistent |
| `pnpm test:int` | ✓ Pass (38/38) | 11.54 s | First run; real Supabase DB |
| `pnpm test:int` | ✓ Pass (38/38) | 11.86 s | Second run; consistent |
| `pnpm test:e2e` | ✓ Pass (38/38) | 1m 6s | Full build + browser; desktop + mobile |
| `pnpm test:e2e` | ✓ Pass (38/38) | 1m 1s | Consistent; no flakiness |
| `pnpm build` | ✓ Pass | 14.8 s | Production build; all routes compiled |

## Test Quality Observations

**Strengths**:
1. Tests are behavioral, not brittle (no snapshots; assertions on outcome)
2. Concurrency is tested (race conditions, concurrent action consumption)
3. Database constraints are verified (RLS, ownership queries)
4. Error codes are mapped and tested (invalid_text → 400, not_found → 404, etc.)
5. Learner input treated as untrusted (escaping, validation, markup safety)
6. Cost accounting is precise (every attempt recorded, cached tokens handled)
7. Instrumentation is present (LangSmith metadata on every call)
8. E2E tests cover the full user journey (sign-in → notice → interview → error recovery)

**Test isolation**:
- ✓ Unit tests are pure functions (no DB, no I/O)
- ✓ Integration tests reset DB before each test
- ✓ E2E tests create unique accounts per test (no cross-test contamination)
- ✓ Playwright workers=1 (serial execution; one DB, no parallel corruption)

**Test naming**:
- ✓ Describe behavior, not implementation (no phase/plan IDs in test names)
- ✓ Vietnamese strings included where relevant (persona, UI text)
- ✓ Edge case intent is clear ("accepts a question of exactly 500 characters")

## Recommendations for Future Phases

1. **Phase 2+**: When scenario validation is added, extend `roles-and-pricing.test.ts` and add `scenario-validation.test.ts` for edge cases (long names, forbidden keywords in secret_terms)
2. **Phase 3+**: Turn engine tests will need concurrency harness for complex state (unlocked items, sealing); this harness already exists (scripted-model)
3. **Phase 6+**: Reveal pipeline must test reveal data is never sent before replay (add integration test for this invariant)
4. **Phase 8+**: Account deletion tests must verify anonymous counters are preserved (counter hash keyed by original Google account)
5. **Deployment phase**: Add synthetic latency test (measure p50/p95 with real provider, log to Vercel analytics)

## Unresolved Questions

1. **Vercel deployment latency targets**: Phase requires p50/p95 ≤ 3s for single persona call to be recorded, but this cannot be measured locally (stub is instant). Target will be confirmed after phase 1 deploy.
2. **LangSmith trace sampling**: Plan allows ~70 sessions/month on free tier. No test for sampling strategy yet (deferred to phase 4 when generation turns are added).
3. **Concurrent reveal batch calls**: Phase 6 will have up to 3 reveal calls per session; plan says "at most 1 item unlocked per turn", but turn state machine under concurrency is not tested here (belongs to phase 3+).

---

**Status**: Phase-1 walking skeleton code is production-ready pending Vercel deployment validation. All automated tests pass, no flakiness, no coverage gaps in testable behavior. Ready for handoff to deployment.
