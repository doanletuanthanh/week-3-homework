---
title: "Phase 8: My sessions account and system states"
status: todo
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

- [ ] List of all own sessions, newest first, 20 per page, status label per §7; numbers ("Kể 3/11 · Nhận biết 4") only for `done` sessions, both on screen and in the payload.
- [ ] Opening a session lands on the screen for its state; `done` is the review, read-only, no LLM call.
- [ ] Learner B cannot read anything of learner A through any API.
- [ ] Account deletion removes every row listed in FR-66 in one operation, keeps aggregated metrics and admin log rows without ids, and signs the user out. Blocked while a session is `generating`.
- [ ] Deleting and signing in again does not reset any limit: quota counters survive in an anonymous row (user decision), and today's spend stays in the caps.
- [ ] `withdrawn` sessions show the stopped page with a read-only transcript and do not count for FR-5.
- [ ] Demo accounts: no FR-5 limit, "Bắt đầu buổi mới" on Màn 3, primary button points to the newest session.
- [ ] `seed-demo <email> --persona <id> --guess <n>` runs a prepared transcript through the real engine, stops at `revealed`, fails with the reason if the moment is not a primary candidate, is rerunnable, refuses emails outside `DEMO_ACCOUNT_EMAILS`.
- [ ] Standard loading (skeletons shaped like the content), standard error with retry and preserved input, three-failure message, sign-in expiry round trip.

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

- [ ] List + mapper + page
- [ ] Access isolation tests
- [ ] Review mode
- [ ] Withdrawn
- [ ] Delete account
- [ ] Demo account + `seed-demo`
- [ ] Skeletons and errors
- [ ] Events complete
- [ ] Header

## Success criteria

- [ ] §12.2 item 9 learner parts, item 10 and item 12 pass.
- [ ] Every status in PRD §7 opens the right screen from its URL (table-driven test).
- [ ] Publishing version 2 of a persona does not allow a second session (FR-5 test).

## Risk assessment

- **Auth user deletion outside the app transaction.** Accepted with the retry above unless the phase 1 check showed `auth.users` can be deleted in-transaction.
- **The tombstone narrows "delete everything".** It is disclosed in the notice (phase 1) and in the delete dialog; whether this satisfies Vietnamese personal-data rules belongs to the PRD §12.4 review.
- **`seed-demo` depends on live model behaviour**, so a prepared transcript may stop landing on a primary candidate after a prompt change. It fails loudly with the reason; the transcript is then adjusted.

## Security considerations

- Ownership is enforced in the repo layer by `userId`; the isolation test iterates over all learner routes so a new route without the filter fails.
- The not-found response is identical for "does not exist" and "not yours".
