---
phase: 2
title: "Retry a persona from scratch"
status: completed
priority: P1
effort: "1.5d"
dependencies: []
---

# Phase 2: Retry a persona from scratch

## Overview

Fix F3. Lift FR-5 (one session per persona per learner): after finishing, a learner can start the same persona again from turn 0. Keep at most one unfinished session per persona per non-demo learner. Spend is bounded by the global daily cap only (D2).

## Context

- `src/db/schema.ts:177-181`: unique index `session_user_persona_key` on `(user_id, persona_id)` WHERE `is_demo = false AND status <> 'withdrawn'`. Statuses: `generating, interviewing, revealed, replaying, done, failed_eval, withdrawn` (`schema.ts:110`).
- `src/db/repo/sessions.ts`: `findSessionForPersona` (newest non-withdrawn), `createSession` (`onConflictDoNothing`, then returns the existing row or throws).
- `src/server/sessions.ts` `openSession`: non-demo → returns the existing session; `no_identity`; `played_before` via `listPlayedPersonas`. `session_started` props hard-code `kind: "curated"`.
- Tombstone: `quota_tombstone.played_persona_ids` (`schema.ts:437`) is written by `src/server/delete-account.ts:66` (`addPlayedPersonas`) and read by `src/server/quota.ts` (`playedBeforeDeletion`), `src/server/sessions.ts:48`, `src/server/library.ts:215` (`pickNextPersona`). The custom-topic counters in the same table stay.
- UI today: `src/components/library/persona-card.tsx` (`review` → "Xem lại kết quả"; demo extra form), `src/app/prep/[personaId]/page.tsx` (one-session buttons, `PLAYED_BEFORE_DELETION`), `src/components/reveal/next-step.tsx` (no retry). Convention (persona-card comment): cards link to Màn 3, where learner sessions are started; the demo card form and the post-sign-in resume are the existing exceptions.
- Resume after sign-in: `src/server/pending-actions.ts:44` → `openSession` → `sessionEntryPath`.
- Cost: 0.031 USD (8 turns) to ~0.15 USD (30 turns) per interview + reveal (`docs/operations.md:145-154`); `session_daily_cap_usd` default 5 (`docs/operations.md:123`, checked in `src/server/cost-cap.ts`; prod may hold another value in `config`).

## Requirements

- Functional
  - Non-demo learner whose newest session with the persona is `done`, `failed_eval`, `withdrawn` or absent: the start press creates a new session (main branch, turn 0, snapshot 0) on the newest playable version.
  - An unfinished session (`generating`, `interviewing`, `revealed`, `replaying`) exists: the press opens it; never a second one, also for two presses at once.
  - Demo accounts unchanged (always new; FR-45 "Bắt đầu buổi mới").
  - Cap reached: the existing refusal on Màn 3 (`?blocked=cap`).
  - Retrying a custom persona copies `focus` from the learner's previous session with it (it orders the takeaway).
  - `session_started` props gain `attempt` (1-based count of the learner's sessions with that persona) and `kind` from `scenario.origin`. The props type is a closed union in `src/server/events.ts:8`: add `attempt: number` there.
<!-- Updated: Validation Session 1 - attempt confirmed by user; events.ts type change added -->

- Non-functional: no LLM call added; creation stays one transaction; authorization unchanged (repo `user_id` filter).

## Architecture

- New partial unique index `session_user_persona_open_key` on `(user_id, persona_id)` WHERE `is_demo = false AND status IN ('generating','interviewing','revealed','replaying')`. Strictly looser than today's, so existing rows cannot violate it. `persona_id` NULL (custom attempt still generating) never conflicts, as today.
- Repo: `findOpenSessionForPersona` (status in the open set) and `findLatestSessionForPersona` (newest non-withdrawn, today's behaviour). `createSession` conflict path reads the open one.
- `openSession`:
  ```ts
  if (!user.isDemo) {
    const open = await findOpenSessionForPersona(db, user.id, personaId);
    if (open) return { ok: true, session: open };
  }
  // playable version → cap → createSession (+ focus carry-over for origin "generated") → event { attempt, kind }
  ```
  `OpenSessionResult` reasons shrink to `not_found | cap_reached`; `sessionEntryPath` drops the other two branches.
- Tombstone: stop reading and writing `played_persona_ids`; delete `playedBeforeDeletion`, `listPlayedPersonas`, `addPlayedPersonas`. After this phase no code names the column except its schema line, so the new code works with or without it. The column itself is dropped in phase 6, in a separate commit after the deploy (old code still reads it).
- UI (all retry buttons are links to Màn 3, which starts the session):
  - Persona card, `review` state: primary link "Luyện lại từ đầu" → `/prep/{personaId}`; secondary link "Xem lại kết quả" → `/sessions/{id}`. Ribbon "Đã luyện · dd/mm" stays. Demo's extra form only while the newest session is unfinished.
  - Màn 3: `latest = findLatestSessionForPersona`. Unfinished + no question → "Tiếp tục buổi luyện" (`continueSession`); unfinished → link "Tiếp tục buổi luyện"; latest `done` → start form labelled "Luyện lại từ đầu" + link "Xem lại kết quả buổi trước"; none → "Bắt đầu". Demo's extra "Bắt đầu buổi mới" only while the latest session is unfinished (otherwise the main button already starts one). Cap/error lines whenever a start is possible. `PLAYED_BEFORE_DELETION` removed.
  - Result screen, `done` mode only: NextStep's first card gets link "Luyện lại với {persona} từ đầu" → `/prep/{personaId}` (`personaId` plumbed `session-view` → `RevealScreen` → `NextStep`). Hidden while the replay is ahead (that session is still the open one).
  - Strings (`src/strings/product-strings.ts` + `productStrings()`): `RETRY = { start: "Luyện lại từ đầu", with_persona: "Luyện lại với {persona} từ đầu", previous_result: "Xem lại kết quả buổi trước" }`; delete `PLAYED_BEFORE_DELETION`.
- Unchanged and verified: library "Bạn đã luyện k/n" (`listDonePersonaIds`), card state from the newest session (`listSessionsForPersonas`), `pickNextPersona` (minus tombstone read), Buổi của tôi lists every session.

## Related Code Files

- Modify: `src/db/schema.ts`, `src/db/repo/sessions.ts`, `src/db/repo/quota-tombstone.ts`, `src/server/sessions.ts`, `src/server/events.ts` (`session_started` props + `attempt`), `src/server/quota.ts`, `src/server/delete-account.ts`, `src/server/library.ts`, `src/server/pending-actions.ts` (types only), `src/server/session-view.ts`, `src/app/prep/[personaId]/page.tsx`, `src/components/library/persona-card.tsx`, `src/components/reveal/next-step.tsx`, `src/components/reveal/reveal-screen.tsx`, `src/strings/product-strings.ts`
- Create: `drizzle/0016_*.sql` (index swap) via `pnpm db:generate`, with its `drizzle/meta` snapshot
- Tests: `tests/server/sessions.int.test.ts`, `tests/server/delete-account.int.test.ts` (cases at lines 272, 288 `played_before` and 496 `no_identity` become "the returning account starts a session"), `tests/server/library.int.test.ts`, `tests/components/topic-screen.test.tsx`, `tests/components/next-step-and-home.test.tsx`, `tests/e2e/topic.spec.ts`, `tests/e2e/notice-and-start.spec.ts`, `tests/e2e/my-sessions.spec.ts`, `tests/e2e/delete-account.spec.ts` (lines 2, 125 expect `PLAYED_BEFORE_DELETION`); create `tests/e2e/retry.spec.ts`
<!-- Updated: Validation Session 1 - added delete-account e2e spec and the exact int-test cases found by verification -->


## Implementation Steps

1. Schema: swap the index; `pnpm db:generate` → 0016; read the SQL (DROP INDEX + CREATE UNIQUE INDEX … WHERE status IN (…)). Leave `playedPersonaIds` in the schema for now (phase 6 drops it).
2. Repo: the two finders; `createSession` conflict path.
3. `openSession`, result type, `sessionEntryPath`, `pending-actions`; focus carry-over; event props.
4. Remove tombstone persona reads/writes and helpers; `pickNextPersona` without them.
5. UI: persona card, Màn 3, NextStep (+ prop plumbing), strings.
6. Int tests (rewrite the FR-5 cases): retry after `done` → new id, turn 0 = opening line, old session untouched; unfinished → same id; `Promise.all` of two `openSession` → one row; demo unchanged; cap blocks a retry; custom retry keeps `focus`; deleted-then-returning account can start; `session_started.attempt` = 2 on a retry.
7. e2e `retry.spec.ts` (stub): finish a session → topic card shows "Luyện lại từ đầu" and "Xem lại kết quả" → Màn 3 "Luyện lại từ đầu" → interview at turn 0 → Buổi của tôi lists two rows. `delete-account.spec.ts`: the account that comes back after deletion sees "Bắt đầu" on Màn 3 and no alert.
8. `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int`.

## Todo

- [x] Migration 0016
- [x] Finders, `createSession`, `openSession`
- [x] Tombstone persona list removed
- [x] Card, Màn 3, NextStep, strings
- [x] Int + e2e tests

## Success Criteria

- [x] Steps 6–8 green
- [x] Local manual: finish chị Thu, topic page → "Luyện lại từ đầu" → opening line again; first result still opens from Buổi của tôi (automated on a production build: `tests/e2e/retry.spec.ts`)

## Risk Assessment

- One learner can use the whole day's cap (accepted, D2). Watch spend at `/admin`; lower `session_daily_cap_usd` in `/admin/config` if needed.
- Deploy order: 0016 on prod before the code ships (Vercel deploys on push; the new code needs the looser index or a retry insert conflicts and throws). Phase 6 runs it.
- `require_published = true` later: check a generated persona is still playable for its owner on retry (`playableStatus`, `src/db/repo/sessions.ts:44`); if not, add an owner exception for `origin = 'generated'` with a test.
- Rollback: revert code; restoring the old index fails once a learner has two non-withdrawn sessions with one persona, so roll back code only and keep the new index.

## Security Considerations

No new input; `startSession` still checks persona visibility; one fewer thing kept after account deletion (data minimisation).

## Implementation notes (2026-10-29)

- Review fixes, user-approved: `listAttempts` reads a problem report from any session on the generated scenario (a retry session's report reached no operator list); the result page offers "Luyện lại … từ đầu" only while a version of the persona can be started (`retryable` → `retryPersonaId`; a taken-down custom topic gave a 404 link). Màn 3 shows the cap/error lines only when a start is possible (`playable` added).
- Deviations: deleting an account that used no custom-topic limit now keeps no tombstone row at all (data minimisation), so `docs/launch-checklist.md` D8 query 5 ("one more row") needs rewording in phase 6; Màn 3 with a finished session and no playable version shows "being updated", the way back and "Xem lại kết quả buổi trước"; NextStep shows the retry as the card's main button when no other persona is offered; a guest who presses "Bắt đầu" on a persona they had finished gets a new session after sign-in.
- Docs for phase 6: `docs/prd.md` lines 187, 363, 460 say a demo card "luôn" has "Bắt đầu buổi mới"; it now shows only beside an unfinished session.
- Tests updated beyond the list above: `tests/server/session-list.int.test.ts`, `tests/server/generation.int.test.ts` (custom retry keeps focus, `require_published` on), `tests/cli/custom-command.int.test.ts`, `tests/server/replay-page-props.test.ts` (retry offer only when done and playable), `tests/e2e/{home-and-next-persona,notice-and-start,turn-engine,library-path,interview-screen}.spec.ts`.
- Known narrow race, not handled: if the unfinished session that made an insert conflict finishes before `createSession` re-reads it, the start throws and the learner sees the standard "Không kết nối được. Thử lại." on Màn 3.
