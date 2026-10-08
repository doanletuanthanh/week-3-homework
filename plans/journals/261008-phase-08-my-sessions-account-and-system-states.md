# 2026-10-08 · Phase 8: My sessions, account, system states

Work history, not product authority. Decisions live in the phase file and `plan.md`.

## What shipped

Commits `84e89f0` (code and tests) and `92e79c8` (plan notes, review report).

- Buổi của tôi (`/my-sessions`): own sessions, newest first, 20 per page, numbers only for a finished session.
- Account deletion: one transaction removes the app rows and the sign-in account.
- Limits survive deletion: played personas kept under a keyed hash of the Google account; model spend moved to the daily ledger.
- Withdrawn page, header link and folded menu, demo account's "Bắt đầu buổi mới", shared skeleton and error components.
- Events: download, waitlist, account deletion.
- `il seed-demo`, with a prepared transcript for chị Thu.

Verified: typecheck, lint, 806 unit, 425 integration, 179 Playwright (desktop and mobile, LLM stub). No real model, no real database.

## What went wrong, and what it taught

- **Route-level `loading.tsx` changed HTTP answers.** With it, "not found" and the redirect to sign-in came back as 200 with the skeleton, and the real answer arrived inside the stream. Five existing tests assert a 404. Fix: no `loading.tsx`; each page runs its checks first, then wraps the slow part in `<Suspense>`. Lesson: a loading boundary above an auth or ownership check moves that check after the status line.
- **The first guard against a token that outlives its account was three statements.** Upsert, check, delete. An interrupted request left a user row with the deleted address, and later requests were served from it. The review caught it. Fix: one `INSERT … SELECT … WHERE EXISTS (auth.users)` on every request.
- **A test fixture made the auth server fail.** An `auth.identities` row inserted with null timestamps broke the next password sign-in ("Database error querying schema"). Rows written into the auth schema by hand need the columns the server reads.
- **`getByLabel("Menu")` matched "Tài khoản: mở menu".** Label matching is a case-insensitive substring unless `exact` is set.
- **A wrong expectation of mine, not a bug:** `--guess -1` is read as a value, since only `--` starts an option.
- **The machine ran out of memory during the last full run**, which the harness stopped. It was repeated later, one suite at a time, before the commit.

## Decisions taken along the way

- Delete the sign-in account inside the transaction (`DELETE FROM auth.users`), not through the admin API: all or nothing, no secret key. Still to confirm on the real project.
- Key the kept row by the Google subject from `auth.identities`; the copy in the token can be edited by the user.
- Check the one-session rule for a returning account at session start, not by copying counters onto the new user row.
- User, after the review: keep the block and its line for a returning account; open a session with no question yet on Màn 3 (PRD §7); refuse a session to a non-demo account with no Google identity.

## Mutation check

22 breaks of the new code, one at a time. 21 caught at first. Missed: the ledger day computed in UTC. A test with a call at 00:30 Vietnam time now catches it.

## Still open

- `seed-demo` has never run with real models; the home page screenshot waits for it.
- What Supabase Auth keeps about a deleted account in its own audit tables (checklist goes to phase 10).
- The Next 16 guides in `node_modules` could not be read at first (a local hook blocks the folder).

AgentWiki publishing: skipped (not asked for).
