# Full gate: Phase 1 (brand icon) + Phase 2 (retry from scratch)

Status: GATE RED. 6 stale tests fail (2 int, 4 e2e). Phase 1 green. Build green. No source edited.
Plan: `plans/261029-1521-reviewer-feedback-fixes/` (phase-01-start.md, phase-02-retry-from-scratch.md)
Run: 2026-10-29, 16:28 to about 17:00 (Asia/Saigon). Local stack only (DB 127.0.0.1:54322). E2e stub on 4010, no paid calls, no `pnpm il`.

## Results

| # | Command | Result | Counts | Time |
|---|---|---|---|---|
| 1 | `pnpm typecheck` | PASS, exit 0 | clean | 7s |
| 1 | `pnpm lint` | PASS, exit 0 | 0 warnings | 19s |
| 2 | `pnpm test` (unit) | PASS, exit 0 | 67/67 files, 1250/1250 tests | 22s |
| 3 | `pnpm test:int` | FAIL, exit 1 | 31/32 files, 673/675 tests, 2 failed | 433s |
| 3r | rerun `tests/server/session-list.int.test.ts` | FAIL, exit 1 | 15/17, same 2 failed | 17s |
| 4 | `pnpm test:e2e` (325 desktop, 6 mobile) | FAIL, exit 1 | 327 passed, 4 failed, 0 flaky (no retries set) | 986s |
| 4r | rerun the 4 failed e2e tests, once | 3 FAIL, 1 PASS | 1 of 4 passed | 76s |
| 5 | `pnpm build` (local env) | PASS, exit 0 | 0 warning lines, 26 pages | 17s |

## Integration failures (deterministic: same 2 on rerun)

File `tests/server/session-list.int.test.ts`: not in the diff, not on the Phase 2 test list. Asserts the removed FR-5 rule.
1. `a withdrawn session > unpublish --stop-sessions: ... and it no longer counts` (line 160)
   `AssertionError: expected { ok: true, session: { …(24) } } to match object { ok: true, …(1) }`
   expected `c703622c-1b6c-4e86-b0a4-19c28d1777a8`, received `86bc5fb3-a71f-404c-b224-b974af9c10d1`
2. `one session per persona across versions (FR-5) > ...whose session is done` (line 173, `done` case)
   `AssertionError: expected { ok: true, session: { …(24) } } to match object { ok: true, session: { …(2) } }`
   expected `6226eb78-61d5-488b-8b52-7324379a6ea5`, received `3a9ab924-3143-431f-853d-2b2a42ab2592`
   The `interviewing` case of the same `it.each` passes.

## E2e failures (4)

Plan list: `notice-and-start.spec.ts` is listed but was not updated. The other three are not listed.
1. `home-and-next-persona.spec.ts:278` "...then 'practised them all' with the waitlist written once" (line 333). Rerun: FAIL.
   Expected `["Vào thư viện"]`, received `["Luyện lại với chị Thu từ đầu", "Vào thư viện"]`.
2. `home-and-next-persona.spec.ts:399` "...a role with no persona is never 'all practised'" (line 424). Rerun: FAIL.
   Expected `["Vào thư viện"]`, received `["Luyện lại với chị Mai từ đầu", "Vào thư viện"]`.
   Cause for 1 and 2: the Phase 2 retry link now leads the result's next card (`reveal-screen.tsx:76`).
3. `notice-and-start.spec.ts:220` "an account the auth server holds no Google identity for cannot start a session" (line 228). Rerun: FAIL.
   Expected URL `/prep/chi-thu?blocked=error`, received `/sessions/61ac0cbb-6a1d-4b4d-a572-978450a8ef31`.
   Cause: HEAD `openSession` refused `no_identity` (`src/server/sessions.ts:47`). The new one starts; the int twin (`delete-account.int.test.ts:439`) already expects that.
4. `turn-engine.spec.ts:205` "a demo account can still start a session inside the demo reserve" (line 214). Rerun: PASS (3.8s).
   `Error: element(s) not found` for `Tôi hiểu` or `Bắt đầu`. Page snapshot shows `button "Luyện lại từ đầu"` and `link "Xem lại kết quả buổi trước"`.
   Cause: the shared demo account (`DEMO_EMAIL`) holds a finished chị Thu session from earlier specs, so Màn 3 shows the retry label. Order-dependent: isolation problem plus stale label.

## Phase coverage

- Phase 1 (F1): `hardening.spec.ts` "the brand icon" PASS (16/16 in file). `brand-mark.test.ts` is in the unit pass. `/icon` and `/apple-icon` prerender as static. PNGs are 32×32 and 180×180 (magic bytes checked). Viewed: green tile, white glyph matching the header mark. Browser-tab screenshot not taken (manual).
- Phase 2 (F3) int step-6 cases (retry after done, same id when unfinished, two presses one row, demo unchanged, cap blocks retry, custom focus kept, returning account starts, attempt=2) in `sessions`, `generation`, `delete-account` int files: PASS.
- Phase 2 e2e: `retry.spec.ts` 1/1, `delete-account.spec.ts` 8/8, `topic.spec.ts` 37/37, `my-sessions.spec.ts` 17/17, `library-path.spec.ts` 14/14, `interview-screen.spec.ts` 37/37 PASS.

## Other checks

- Migration 0016: `drizzle-kit check` clean. `drizzle-kit generate` on a scratch copy: "No schema changes" (snapshot matches `schema.ts`).
- No `.only`, `.skip` or `fixme` in `tests/`. Slowest e2e test 15.0s (`custom-topic.spec.ts:432`).
- Noise, not counted: 54 "The destination stream closed early" lines (e2e); `NOTICE truncate cascades to table "eval_run"` (int).
- Side effects: no tracked file changed. Git-ignored outputs written: `.next/`, `test-results/`, `tsconfig.tsbuildinfo`. Test runs reset the local DB only.

## Gaps (non-blocking)

1. No test asserts the result-screen retry link is absent during replay (`reveal-screen.tsx:76`).
2. Icon glyph is not pixel-tested; only type, status and headers are asserted.
3. `createSession` conflict fallback throws if the conflicting open row finishes between insert and re-read. Narrow, untested.
4. Coverage not measured: no coverage script in `package.json`.

## Next steps (prioritized)

1. Update the 6 stale cases: `session-list.int.test.ts` 139-175 (done gives a new session at turn 0, 2 rows); `home-and-next-persona.spec.ts` 333 and 424; `notice-and-start.spec.ts` 214-228 (starts a session); `turn-engine.spec.ts` 211-217 (accept "Luyện lại từ đầu" or use fresh demo state).
2. Make demo-account specs state-independent (fresh account or reset its sessions) before they assert labels.
3. Add an absent-while-replaying assertion for the result retry link (gap 1).
4. Re-run the full gate after step 1. Expect int 675/675 and e2e 331/331.

## Unresolved questions

- Should the result retry link lead the all-practised next card? Plan says yes (first card). Decides the 2 `home-and-next-persona` expectations.
- Should demo specs reset or fork their account per test? Owner call.

Status: DONE_WITH_CONCERNS
Summary: Full gate ran. Typecheck, lint, unit, build green; Phase 1 green. Int (2) and e2e (4) red: six stale tests still encode the removed FR-5, no-identity and old-label rules. No source edited.
Concerns/Blockers: Gate not green until those six tests are updated. `turn-engine.spec.ts:205` is order-dependent on shared demo state. `.env.local` read was denied by the permission classifier and not worked around. Build env was set from the e2e helper, not `.env.local`.
