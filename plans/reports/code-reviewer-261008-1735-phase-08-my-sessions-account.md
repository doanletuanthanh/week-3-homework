# Code review: phase 8 (My sessions, account, system states)

Date: 2026-10-08. Scope: uncommitted working tree on `main` (38 modified, 27 new files).
Ran: `pnpm typecheck` clean, `pnpm lint` clean, `pnpm test` (unit) 38 files / 806 tests pass.
Not run (shared DB in use): integration, e2e, CLI, migrations. Findings about DB behaviour are from reading code, not from execution.

## Overall

Sealing, ownership and the deletion transaction are sound. No critical defect. The weak spots are the token-outlives-account path (not atomic), the page-level error handling (no global boundary, counter never resets, old retry API), `seed-demo` cleanup on thrown errors, and a few phase requirements that are not met as written.

## High

### H1. Stale-token guard is not atomic and only covers the request that created the row
`src/server/auth.ts:34-38`, `src/db/repo/users.ts:11-18,39-42`

`resolveUser` runs three separate statements: upsert, `authAccountExists`, `deleteUserRow`. The check runs only when `created` is true.

- If the request dies between the upsert and the delete (function timeout, connection drop, `authAccountExists` throwing), a `user` row with the email of a deleted account stays for good. Nothing cleans it up. That is personal data surviving FR-66.
- Every later request with the same token then sees `created = false` and is accepted as signed in for the rest of the token's life. In that state `findGoogleSubject` returns null, so `playedBeforeDeletion` is false (`src/server/quota.ts:22-25`): the learner can accept the notice and start a second session with a played persona. FR-5 and the tombstone are bypassed, and the spend is real.
- Two parallel requests with a stale token: the second one sees the first one's row, gets `created = false`, and runs as a valid user until the first deletes the row.

Likelihood is low, consequence is exactly what this phase exists to prevent, and no test covers it (the three tests in `tests/server/delete-account.int.test.ts:377-414` are sequential).

Fix (pick one):
1. Foreign key `user.id -> auth.users(id) ON DELETE CASCADE`; treat error 23503 from the upsert as "signed out". This removes the `xmax` trick, `authAccountExists`, the `deleteUserRow` call in `resolveUser`, and the window.
2. One statement: `INSERT INTO "user" ... SELECT ... WHERE EXISTS (SELECT 1 FROM auth.users WHERE id = $1) ON CONFLICT ... RETURNING`; no row returned means signed out.

Also make `playedBeforeDeletion` / `openSession` fail closed for a non-demo user with no Google identity (refuse to start), since sign-in is Google only.

## Medium

### M1. No `global-error.tsx`; the most likely outage never reaches the standard error
`src/app/layout.tsx:25`, `src/app/error.tsx`

`SiteHeader` in the root layout calls `getUser()` (auth + DB). `app/error.tsx` does not wrap the root layout, so a DB or auth outage renders Next's built-in 500 page, not "Không kết nối được. Thử lại". Add `src/app/global-error.tsx` (own `<html>`/`<body>`, same `ErrorRetry`), or make the header tolerate a failed `getUser()`.

### M2. Page-level retry counter is never cleared after a success
`src/app/error.tsx:9,27,35`

`retriesAsked` is a module-level map keyed by pathname and only grows. After three retries on a path in one tab (even if each succeeded), the next failure on that path shows the incident line with no retry button at once. Fix: store the time of the last retry and start over when the boundary mounts more than a few seconds after it, or key by `error.digest` plus time.

### M3. `error.tsx` uses `reset()` + `router.refresh()`; Next 16.3 has a stable `retry` prop
`src/app/error.tsx:16,28-31`

Next docs (version history: `retry` stable in v16.3.0; repo is on 16.3.8) say to use `retry()`, which re-fetches and re-renders the segment; `reset()` is for re-render without re-fetch. Replace the pair with `retry()` inside the transition. The comment at `error.tsx:12-14` also overstates: the boundary replaces the page, so React state (a typed question) is unmounted; only text persisted in the browser survives.

### M4. `seed-demo` leaves a half-played session when a step throws
`cli/commands/seed-demo.ts:86-111`

`fail()` removes the session only for returned failures. A thrown error from `runTurn`, `endSession`, `runReveal`, `submitGuess` or the DB (and Ctrl-C) skips it. The demo account's newest session is then a broken one, and the prep screen's main button points at it (FR-45). The doc comment at lines 56-58 promises otherwise. Fix: wrap lines 92-111 in `try/catch` that calls `deleteSession` and rethrows. The test at `tests/cli/seed-demo.int.test.ts:146` covers only the returned-failure path.

### M5. Phase requirements not met as written
- **PRD §7, "interviewing, 0 learner turns" opens Màn 3.** `buildSessionView` (`src/server/session-view.ts:111-121`) opens Màn 4, and `tests/e2e/my-sessions.spec.ts:97-101` asserts Màn 4. If this was decided in phase 5, record it under accepted deviations.
- **"Every status in §7 opens the right screen (table-driven test)".** There is one linear e2e walk, not a table. `generating` and `failed_eval` fall to `SessionEnded` ("Buổi luyện đã kết thúc. Ghi chú của bạn đã được đóng băng."), which is wrong text for them. Harmless until phase 9 creates those states; say so in the plan.
- **Home page reveal screenshot from the seeded session** (`src/app/page.tsx`, plan step 6): not done. Needs a real-model `seed-demo` run.
- Plan text is stale against the code: route is `api/account` (plan: `api/tai-khoan`), auth deletion is in-transaction (plan: `auth.admin.deleteUser` with retry), FR-5 is checked at start (plan: rehydrate in `requireUser`), tombstone holds persona ids only. For the lead to update.

### M6. What Supabase Auth itself keeps after `DELETE FROM auth.users` is not checked
`src/db/repo/users.ts:45-47`

The cascade covers identities, sessions and refresh tokens. `auth.audit_log_entries` (payload carries the actor's email and IP when DB audit logging is on) and `auth.flow_state` (no FK to users; holds provider tokens) are not touched. The "nothing personal is left" tests (`delete-account.int.test.ts:98-112`, `delete-account.spec.ts:100`) read app tables only, and their auth rows are inserted by SQL, so GoTrue never wrote an audit entry. Check on the real project after one real Google sign-in and deletion; if rows remain, delete them in the same transaction or disable DB audit logging.

### M7. A model call that finishes after the deletion loses its cost
`src/llm/call-model.ts:50,179`, `src/db/repo/llm-calls.ts:17-28`

`recordCallToDb` inserts with the `session_id` of a session that no longer exists: FK violation, no row, so the cap under-counts that call. Narrow (delete in one tab during a turn or reveal in another). Fix: on 23503 insert again with `sessionId`/`branchId` null. Related and benign: a turn transaction and `deleteAccount` can deadlock (turn holds the session row and wants a key-share lock on the user for the event; deletion holds the user and wants the session). Postgres aborts one; nothing is half-deleted; the dialog's retry recovers.

## Low

- `src/app/api/account/route.ts:24`: `not_found` answers 401 without `redirectTo`; the dialog treats it as a lost connection and counts retries to the incident line. Send `redirectTo` or answer as deleted.
- `src/server/quota.ts:13`: reads `process.env.QUOTA_HASH_SECRET` directly, skipping the validated `getEnv()` (min 32). The CLI never validates env, so a short secret would be used silently. Also: the variable is now required at boot; it must be set in Vercel before deploy and added to the setup docs.
- `src/components/sessions/session-list.tsx:17`: list state comes from `useState(initialItems)`. After finishing a session and pressing back, the restored page still says "Đang làm dở" with no numbers. `:32,42`: a 200 with a non-JSON body gives `page = {}` and throws in the state updater. Validate `Array.isArray(body.items)`.
- `src/components/sessions/session-list.tsx:55-69`: rows added by "Tải thêm" are not announced; consider a polite live region with the new count.
- `src/components/header-menu.tsx:38-40`: the menu stays open when the learner picks the link of the page they are on (pathname does not change). Close on click of a link inside.
- `src/components/site-header.tsx:58`: `aria-label="Tài khoản: mở menu"` replaces the email as the accessible name and says "mở" when open (older code, moved here).
- `src/components/sessions/delete-account-dialog.tsx:73`: `role="alertdialog"` without `aria-describedby` pointing at the two paragraphs. `:27`: `mustWait` copies `blocked` once and ignores later prop changes.
- `src/components/ui/page-skeletons.tsx:12`: `aria-label` on a `div` with no role is not announced; add `role="status"`.
- `src/components/withdrawn-screen.tsx:59-75`: re-implements the transcript markup the page used to take from `TranscriptList`; a third copy next to the drawer. Heading text "Transcript" is English.
- `src/server/reveal.ts:208-213` + download route: one event per press with no limit; a script can fill `event`. Acceptable for now; note for phase 10.
- `src/db/repo/users.ts:17`: `xmax = 0` is an undocumented Postgres detail. Goes away with H1 fix 1 or 2.
- `src/db/repo/llm-calls.ts:17-28`: deleting the rows is more than privacy needs (`ON DELETE SET NULL` already leaves them anonymous and counted) and drops the deleted learner's sessions from per-session cost figures (NFR-3). It matches the plan; noting the simpler option only.
- `cli/commands/seed-demo.ts:121`: `usage` omits `--guess`, which is required.
- `src/server/session-list.ts:63-66`: rows and count come from two snapshots; `nextOffset` can be off by one under concurrent inserts. The client dedupe hides it.

## Test quality

Good: deletion tests prove setup is non-empty before asserting zeros; rollback is forced with a real trigger; ledger test checks day and scope with a pre-existing row; sealing is asserted on the serialized payload for every non-done status, unit and e2e.

Gaps:
- No concurrent or interrupted stale-token test (H1).
- No test for `src/app/error.tsx` at all: retry, three-failure line, count after a success.
- No test for an outage in the root layout (M1).
- `seed-demo` thrown-error path (M4).
- Deletion during an in-flight turn or reveal runner (M7).
- `tests/server/access-isolation.int.test.ts:100-114`: the route-to-service table is declared by hand; it proves a route file is listed, not that the handler calls those services. The e2e spec covers HTTP, so keep both. `STATES` has no `withdrawn` session.
- `delete-account.int.test.ts:251-253`: the five parallel `openSession` calls cannot fail differently from the single call above them; harmless.
- By title, no test that an un-acked user can delete through the route, though the route comment claims it.

## Checked and found fine

- **Sealing (invariants 5, 6):** `listSessionRows` returns `reveal_json` only for `done` (SQL `CASE`), `toBrowserResult` re-checks the status, `toListItem` is the only mapper, `/api/sessions` and the page props carry `id, personaName, topicTitle, date, state, result` only; `revealed`/`replaying` map to `in_progress` with `result: null`.
- **Invariant 7:** withdrawn transcript renders learner text as React text; e2e at `my-sessions.spec.ts:203`.
- **Ownership:** every new route goes through `getUser`/`requireAckedApiUser`; download uses `getSession(db, user.id, id)`; list and count filter by `userId`; not-found is identical for missing and foreign ids.
- **DELETE route CSRF:** cross-origin `DELETE` needs a preflight that the app never grants; a form cannot send it. Body word is not a secret, by design.
- **Deletion transaction:** `FOR UPDATE` on the user row blocks concurrent session creation (FK key-share lock) and a second deletion; a failure rolls back tombstone, ledger, event and auth delete together. Cascades cover `session -> turn/snapshot/branch/event`, `pending_action`, `waitlist`; `admin_access_log` ids go null and `action` holds no id. `eval_*`, `string_approval`, `config` hold operator emails and synthetic data only.
- **Tombstone:** keyed from `auth.identities`, not token metadata; merge is safe under the user-row lock; demo and withdrawn sessions excluded; a different Google account with the same email is not blocked.
- **`moveSpendToLedger`:** `created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'` on a `timestamptz` gives the UTC+7 date, the same boundary `sessionSpendToday` uses; grouped per day and scope, so `ON CONFLICT` cannot hit the same key twice; total before equals total after.
- **Pagination:** stable order (`started_at desc, id desc`), offset validated by regex, `no-store`.
- **Callers:** `startSession`, `resumePendingAction` and `sessionEntryPath` handle `played_before`; `joinWaitlist` has one caller, now in a transaction with its event; `recordEvent` callers unchanged; auth callback calls `resolveUser` without the existence check, which is right for a fresh sign-in.
- **Prep states:** guest, learner with/without session, cap, pulled persona, played-before, demo with/without session, demo with unplayable persona all resolve to one coherent button set.
- **Suspense placement:** gating (`requireAckedUser`, `notFound`) runs before the boundary in all three pages, so 404 and redirects keep their status; `loadSession` is `cache`d, so the second call is free.
- **Contracts changed (all consistent with callers):** `OpenSessionResult` adds `played_before`; `joinWaitlist` returns boolean; `upsertUser` adds `created`; `recordEvent` subject ids nullable; `SessionView` withdrawn adds `topicTitle, date, turnCount`; `Takeaway` requires `sessionId`; `sendJson` accepts `DELETE`; new env `QUOTA_HASH_SECRET`; new table `quota_tombstone` with RLS on and grants revoked.

## Unresolved questions

1. Is "0-turn session opens Màn 4" an accepted deviation from PRD §7? It is not in the plan's list.
2. Does the production Supabase project write `auth.audit_log_entries` to the database, and does `auth.flow_state` keep rows after sign-in (M6)?
3. Should a non-demo account with no Google identity be refused a session (fail closed) instead of allowed?
4. Is the home page screenshot deferred to the real-model run, and where is that tracked?
