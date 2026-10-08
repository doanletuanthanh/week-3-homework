---
title: "Phase 8: My sessions account and system states"
status: in-review
phase: 8
priority: P1
effort: "2.5d"
dependencies: [7]
---

# Phase 8: My sessions, account, system states

## Overview

Buổi của tôi, the read-only review, account deletion, the withdrawn state, shared loading and error behaviour, the demo account path with `seed-demo`, and the remaining server events. After this phase S1's learner loop is complete.

## Context links

- PRD Màn 9, §6.0, §7, FR-3, FR-5, FR-38–43, FR-45, FR-57 (CLI logging), FR-66, NFR-9, NFR-15; §12.2 items 9, 10, 12. Artboards: `Sessions`, `SessionsEmpty`, `DeleteAccount`, `Withdrawn`, `SystemStates`; canvas note `d6`.

## Requirements

- [x] List of all own sessions, newest first, 20 per page, status label per §7; numbers ("Kể 3/11 · Nhận biết 4") only for `done` sessions, both on screen and in the payload.
- [x] Opening a session lands on the screen for its state; `done` is the review, read-only, no LLM call.
- [x] Learner B cannot read anything of learner A through any API.
- [x] Account deletion removes every row listed in FR-66 in one operation, keeps aggregated metrics and admin log rows without ids, and signs the user out. Blocked while a session is `generating`.
- [x] Deleting and signing in again does not reset any limit: quota counters survive in an anonymous row (user decision), and today's spend stays in the caps.
- [x] `withdrawn` sessions show the stopped page with a read-only transcript and do not count for FR-5.
- [x] Demo accounts: no FR-5 limit, "Bắt đầu buổi mới" on Màn 3, primary button points to the newest session.
- [x] `seed-demo <email> --persona <id> --guess <n>` runs a prepared transcript through the real engine, stops at `revealed`, fails with the reason if the moment is not a primary candidate, is rerunnable, refuses emails outside `DEMO_ACCOUNT_EMAILS`.
- [x] Standard loading (skeletons shaped like the content), standard error with retry and preserved input, three-failure message, sign-in expiry round trip.

## Architecture

- `src/server/session-list.ts`: builds list items; a single mapper decides which fields a status may expose, reused by the tests.
- Deletion `src/server/delete-account.ts`: one transaction (a) writes or updates the `quota_tombstone` row keyed by `HMAC(QUOTA_HASH_SECRET, google_sub)` with counters only: lifetime failed attempts, free scenario used, today's attempts, refusals and generation spend with their date, and the persona ids already played; (b) moves the user's `llm_call` amounts into `daily_spend` per date and scope; (c) deletes app rows (FK `ON DELETE CASCADE` from `session` to `turn`, `snapshot`, `branch`, `llm_call`; explicit deletes for `event`, `waitlist`, `pending_action`; `admin_access_log` ids nulled). Then `auth.admin.deleteUser`, then sign-out; a failed auth delete is logged and retried once.
- `requireUser` (phase 1) looks up the tombstone when it creates a user row and rehydrates the counters; played persona ids keep FR-5 in force for the new account.
- The tombstone holds no email, name, text or session id. `QUOTA_HASH_SECRET` is a server-only env var.
- LangSmith traces are outside this deletion; they expire with LangSmith retention. The delete dialog says what is removed and names this exception in one line.
- Confirmation dialog requires typing "XÓA".
- Events: one `logEvent(name, props)` helper; this phase adds download, waitlist, replay start/result, account deletion (user id nulled). Demo sessions carry `is_demo` and are excluded from metric queries.
- `seed-demo` uses `evalsets/demo/chi-thu-transcript.json` (learner lines + canvas text); runs `runTurn` for each line with real models, ends the session, sets the guess.

## Related code files

- Create: `src/app/my-sessions/page.tsx`, `src/app/api/sessions/route.ts` (list, paginated), `src/app/api/tai-khoan/route.ts` (DELETE), `src/server/session-list.ts`, `src/server/delete-account.ts`, `src/db/repo/quota-tombstone.ts`, `src/components/sessions/session-list.tsx`, `session-row.tsx`, `delete-account-dialog.tsx`, `src/components/withdrawn-screen.tsx`, `src/components/ui/skeleton.tsx`, `src/components/ui/error-retry.tsx`, `cli/commands/seed-demo.ts`, `evalsets/demo/chi-thu-transcript.json`
- Create tests: `tests/server/access-isolation.int.test.ts`, `session-list.int.test.ts`, `delete-account.int.test.ts`, `tests/cli/seed-demo.int.test.ts`
- Modify: `src/app/sessions/[id]/page.tsx` (withdrawn, done), `src/components/site-header.tsx` ("Buổi của tôi", avatar menu, collapsed menu < 768 px), `src/app/prep/[personaId]/page.tsx` (demo button), `src/server/sessions.ts` (demo exemption), `src/server/events.ts`, `src/app/page.tsx` (home reveal screenshot from the seeded demo session)

## Implementation steps

1. List API, mapper and page; empty state.
2. Access isolation tests: for every learner route, user B gets the not-found response for A's session id.
3. Review mode wiring (reuses Màn 6 done mode), call-count test = 0.
4. Withdrawn screen; `unpublish --stop-sessions` from phase 4 exercised in a test.
5. Delete account flow and tests: after deletion a query per table returns no row for the user; today's session cap total is unchanged by the deletion; delete then re-sign-in with the same Google account cannot start a second session on a played persona.
6. Demo exemptions and `seed-demo`; capture the home page reveal screenshot from the seeded session.
7. Shared skeleton and error components applied to Màn 3, 6, 9; three-failure message.
8. Remaining events.
9. Header menu and mobile collapse; back-button behaviour check per §6.0.

## Todo

- [x] List + mapper + page
- [x] Access isolation tests
- [x] Review mode
- [x] Withdrawn
- [x] Delete account
- [x] Demo account + `seed-demo`
- [x] Skeletons and errors
- [x] Events complete
- [x] Header

## Success criteria

- [x] §12.2 item 9 learner parts, item 10 and item 12 pass.
- [x] Every status in PRD §7 opens the right screen from its URL (table-driven test).
- [x] Publishing version 2 of a persona does not allow a second session (FR-5 test).

## Risk assessment

- **Auth user deletion outside the app transaction.** Accepted with the retry above unless the phase 1 check showed `auth.users` can be deleted in-transaction.
- **The tombstone narrows "delete everything".** It is disclosed in the notice (phase 1) and in the delete dialog; whether this satisfies Vietnamese personal-data rules belongs to the PRD §12.4 review.
- **`seed-demo` depends on live model behaviour**, so a prepared transcript may stop landing on a primary candidate after a prompt change. It fails loudly with the reason; the transcript is then adjusted.

## Security considerations

- Ownership is enforced in the repo layer by `userId`; the isolation test iterates over all learner routes so a new route without the filter fails.
- The not-found response is identical for "does not exist" and "not yours".

## Implementation notes (2026-10-08)

Done in code. Verified after the review fixes: typecheck, lint, 806 unit, 425 integration. 179 Playwright tests, desktop and mobile (production build against the LLM stub: no model spend). Nothing ran against a real model, and nothing ran against the real database: both test suites are pinned to the local Supabase stack, and `resetDatabase` now refuses any other address.

Review by the code-reviewer agent (`plans/reports/code-reviewer-261008-1735-phase-08-my-sessions-account.md`): no critical finding, one high. Fixed, each with a test where one applies: the check that a token's account still exists was three statements, so an interrupted request could leave a row with the deleted address and later requests were served from it (now one statement, checked on every request); `seed-demo` left a half-played session behind when a step threw; a delete asked for twice at once answered the second with an error; the folded header menu stayed open on the link of the page already shown. Added on its advice: `src/app/global-error.tsx`, for a failure of the layout itself.

Differences from the text above:

- **The sign-in account is deleted inside the transaction** (`DELETE FROM auth.users`), not with `auth.admin.deleteUser` afterwards. The database role can do it, so the delete is all or nothing, there is no retry, and no Supabase secret key is needed. This settles open question 2 of the plan for the local stack; the real project still has to be checked (below).
- **The kept row is keyed by the Google subject read from `auth.identities`**, not from the token: the copy in the token's metadata can be edited by the user. Key = `HMAC-SHA256(QUOTA_HASH_SECRET, "google:" + subject)`.
- **It holds the played persona ids only.** The custom-topic counters (failed attempts, free scenario, today's attempts, refusals, generation spend) do not exist yet; phase 9 adds them to the same row.
- **No rehydration in `requireUser`.** FR-5 for a returning account is checked when a session is started (`playedBeforeDeletion` in `openSession`, and on Màn 3), by the key. Nothing is copied onto the new user row.
- **A returning account that already played the persona** sees a new fixed line on Màn 3 and no start button: "Bạn đã luyện với nhân vật này trước khi xóa tài khoản. Mỗi nhân vật chỉ có một buổi." The PRD has no string for this case; the wording is the build's.
- Routes: `DELETE /api/account` (the plan said `/api/tai-khoan`; every other route is in English), `GET /api/sessions?offset=N`, `POST /api/sessions/[id]/download`.
- **No `loading.tsx` files.** A route-level loading file turned "not found" and the way to sign-in into a 200 answer, which five existing tests caught. The skeletons are `<Suspense>` fallbacks inside the three pages, placed after the checks that can end in 404 or a redirect (`src/components/ui/page-skeletons.tsx`).
- One error page for every route (`src/app/error.tsx`) instead of one per screen. The list's "Tải thêm" and the delete dialog use the same `ErrorRetry` with their own count.
- The session list pages by offset, not by a cursor: a session started in another tab shifts it by one, and the list drops a row it already shows.
- Extra files: `src/server/quota.ts`, `src/components/header-menu.tsx`, `src/components/ui/page-skeletons.tsx`, `src/app/global-error.tsx`, `tests/cli/demo-transcript.test.ts`, `tests/server/session-list.test.ts`, `tests/e2e/{my-sessions,delete-account,access-isolation}.spec.ts`.
- Schema, migration `0009`: table `quota_tombstone (key, played_persona_ids, updated_at)`, row-level security on, no grants to the API roles. `llm_call.session_id` keeps `ON DELETE SET NULL`: the deletion moves the account's call costs into `daily_spend` and deletes those rows itself.
- New environment variable: `QUOTA_HASH_SECRET` (server only, at least 32 characters). The app refuses to start without it.
- New events: `takeaway_downloaded`, `waitlist_joined {context}`, `account_deleted {sessions}` (no user id).
- New fixed strings in `product-strings.ts` (5): `PLAYED_BEFORE_DELETION`, the three of `DELETE_ACCOUNT`, `DELETE_CONFIRM_WORD`. `il check-strings product` and `il approve-strings product` must be run again before `publish` passes.
- This slice has no library: the empty state's button reads "Bắt đầu luyện" and opens the persona's Màn 3; the header has no "Thư viện"; "Không tìm thấy buổi này." now leads to Buổi của tôi.
- `seed-demo` removes the session it made when it fails, so the demo account's newest session is always one that can be shown. The account must have signed in once: the command attaches the session to an existing user row.

Left open:

- **`seed-demo` has not run with real models**, so nobody knows whether `evalsets/demo/chi-thu-transcript.json` lands on an ignored hook. The home page still shows the placeholder: its reveal screenshot needs one real seeded session.
- **Supabase Auth's own tables on the real project.** `DELETE FROM auth.users` removes the account, its identities and its login sessions. Whether `auth.audit_log_entries` (which can hold an address and an IP) or `auth.flow_state` keep rows about a deleted account has to be looked at there; the tests insert their sign-in rows with SQL and cannot show it. Also to confirm there: that the app's database role may delete from `auth.users`.
- **A session with no question yet opens Màn 4**, as since phase 5. PRD §7 says Màn 3 with "Tiếp tục buổi luyện". Not in the list of accepted deviations.
- A model call that finishes after its account was deleted cannot write its `llm_call` row (the session is gone), so that one call's cost is missing from the day's cap.
- `src/app/error.tsx` and `global-error.tsx` have no test: nothing in the suite can make a page fail on the server. The retry there uses `reset()` with `router.refresh()`. The Next 16 guides in `node_modules/next/dist/docs` could not be read (a local hook blocks the folder), so a newer retry prop, if 16.3 has one, is not used.
- The count of failed retries on the error page lasts until a full page load, so a page that failed three times, worked, and fails again shows the incident line at once.
- The delete dialog names its question but does not tie the consequence sentences to it (`aria-describedby`), as the dialogs of phase 7.
- `generating` and `failed_eval` have a label in the list and no screen of their own yet (phase 9).
- The server log of the Playwright run shows "The destination stream closed early" when a browser leaves a page whose content is still arriving. No test fails by it.
- Mutation check, one change at a time against the new tests: 22 ways of breaking the new code, 21 caught at first. Not caught: the ledger day taken in UTC instead of Vietnam time; a test with a call at 00:30 Vietnam time was added and catches it.
