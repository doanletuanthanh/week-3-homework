# Code review: Phase 5, interview screen and notes canvas

Date: 2026-10-06. Reviewer: code-reviewer. Read-only review of the uncommitted working tree on `main`.

## Scope

- Files: schema + migration 0006, `src/db/repo/{canvas,turns}.ts`, `src/server/{canvas,turns,events,sessions,actions}.ts`, routes `notes`, `end`, `turns`, pages `sessions/[id]` (+ not-found), `prep/[personaId]`, `src/components/interview/*`, `ui/dialog.tsx`, `start-session-button.tsx`, hooks `use-autosave`, `use-local-draft`, `use-is-mobile`, `globals.css` interview blocks, new and edited tests.
- Ran: `pnpm typecheck` clean, `pnpm lint` clean, `pnpm test` (unit) 25 files / 466 tests pass.
- Not run (per constraint): `test:int`, `test:e2e`, build, dev server. Every statement about integration and Playwright behaviour is from reading the code and tests, not from a run.
- Not readable: `node_modules/next/dist/docs` (blocked by the scout hook), so `after()` and `<Link>` prefetch semantics of this Next version are not confirmed against its docs.

## Overall

No Critical or High finding. Server locking is sound, ownership and input limits are enforced on the server, invariants hold. Three Medium findings, all about notes being lost or never frozen in failure paths; the rest is Low.

## Critical

None.

## High

None.

## Medium

### M1. The 60 s fallback freeze has no margin and compares two different clocks

- `src/app/api/sessions/[id]/turns/route.ts:75-80`: `sleep(CANVAS_FREEZE_GRACE_MS)` then `freezeAbandonedCanvas(getDb(), id)` with the default grace of the same 60 000 ms.
- `src/db/repo/canvas.ts:83,87`: `now = new Date()` (app clock) against `session.endedAt`, which `commitTurn` wrote as `sql now()` (database clock, transaction start; `src/db/repo/turns.ts:142`).
- Elapsed = 60 000 + commit duration - (database clock ahead of app clock). The only slack is the commit round trip (a few ms).
- Failure: database host clock is 50 ms ahead of the function host. Timer fires, check gives 59 9xx < 60 000, returns `false`, nothing is logged. The session of a learner who closed the tab at turn 30 is never frozen and gets no `session_ended` event until they open the URL again. Phase 6 starts reveal from the freeze, so it never starts either.
- Works locally (one clock), so no test can show it; no test drives this route path at all (int tests backdate `endedAt` by 61 s).
- Fix: do the age check in SQL with the database clock (`ended_at <= now() - interval`), or have the timer call with a grace clearly below the sleep. Log when the timer call returns `false` and the notes are still not frozen.

### M2. A stale browser draft overwrites newer notes on the server, with no keystroke

- `src/components/interview/interview-screen.tsx:99-100` (`notes = notesDraft ?? autosave.saved`), `src/hooks/use-autosave.ts:124-126` (any non-null draft is pushed on mount), `src/hooks/use-local-draft.ts:13-19`.
- A draft is only removed when a save is confirmed on a live page. A save sent by the `pagehide` flush reaches the server but the page is gone, so the draft stays in `localStorage`. This is the normal way to leave the page within 800 ms of typing.
- Failure: learner types "abc" on the laptop and closes the tab (server "abc", laptop draft "abc"). Continues on the phone, notes grow to 2 000 characters. Opens the laptop again: the draft "abc" is shown and autosaved over the 2 000 characters. Silent loss of the product's core artefact.
- `tests/e2e/interview-screen.spec.ts` "notes the server never got ... saved without another keystroke" asserts the mechanism; no test covers a draft older than the server text.
- Fix (small): store the draft with the server text it was based on; on load apply it only when that base equals `initialNotes`, else drop it.

### M3. Page-load freeze with `graceMs` 0 can discard typed notes, and the end request then reports success

- `src/app/sessions/[id]/page.tsx:71-76`, `src/db/repo/canvas.ts:62` (`already_frozen`), `src/server/canvas.ts:51` (mapped to `ok`), `interview-screen.tsx:164-166` (drafts deleted on `ok`).
- After turn 30 any GET of the session URL by the same learner freezes the last autosaved text at once, ignoring the 60 s the browser was promised.
- Failure A (deterministic): network is poor at turn 30, autosaves are failing ("Ghi chú chưa lưu được, đang thử lại"), the automatic end request fails, screen says to press "Kết thúc buổi". Learner reloads instead. Server freezes the stale autosave. The unsaved notes stay in `localStorage` but the ended screen never reads or sends them. PRD Màn 4: "canvas đóng băng (gồm cả phần đang gõ dở)".
- Failure B (narrow race): second tab or reload lands between the turn-30 commit and the first tab's end request. The first tab gets `{ ended: true }`, clears its draft, and the typed text exists nowhere.
- Also: a GET that writes. If `<Link>` prefetch of `/sessions/[id]` renders the page in this Next version (not verified), the prep page link widens race B.
- The plan text does say "or on the next page load", so this is as planned; the defect is the plan's rule meeting the local draft. Fix options: on load inside the grace window render a small client step that posts `/end` with the local draft (or the saved text) before showing the ended screen; freeze server-side only when the grace has passed. Leftover `il:draft:notes:<id>` keys are also never removed on this path.

## Low

- L1. Notes textarea stays editable during the automatic end request (`notes-canvas.tsx:20-28` has no read-only state; `interview-screen.tsx:160-163`). Characters typed between the end of reply 30 and the screen change are shown, then dropped. A cut-off must exist; make it visible (`readOnly` while `ending`).
- L2. Autosave stops silently on 409/404/400 (`interview-screen.tsx:95`, `use-autosave.ts:58-61`). Session ended in another tab: this tab keeps taking notes that are never saved. If two saves had failed first, "đang thử lại" stays on screen though nothing retries. Suggest `router.refresh()` on `frozen`.
- L3. Native dialog can close without React knowing (`ui/dialog.tsx:30-38`, no `onClose` handler). Chromium closes a dialog on a second Esc when the first `cancel` was prevented and no user activation followed. While `ending`, Esc twice hides the dialog; if the end then fails, `endOpen` is still true, the error line is suppressed (`interview-screen.tsx:177`) and the bar button cannot reopen it. Fix: sync state from the `close` event.
- L4. `pagehide` flush does nothing while a save is in flight (`use-autosave.ts:51`): the newest text reaches the server only on the next visit from the same browser. iOS often fires no `pagehide` for a backgrounded tab; `visibilitychange` to hidden is the reliable signal.
- L5. "đang gõ…" is a `role="status"` node inserted together with its text (`transcript-list.tsx:54`). Screen readers often do not announce a live region that arrives already filled. NFR-15 names this state. Fix: keep one permanent polite region (the existing `announcement` paragraph can carry it).
- L6. `--vvh` follows `visualViewport.height` (`interview-screen.tsx:45-58`), which also shrinks on pinch zoom, so zooming on a phone squeezes the whole interview into the zoomed area. `offsetTop` and the `scroll` event are not handled (iOS keyboard). Minimum heights on a small phone with the keyboard up (header 64 + bar ~130 + chat 72 + sheet 160) can exceed the visible height. Not testable in Playwright; the plan defers device tests to phase 10.
- L7. Transcript scroller is not keyboard focusable (`.iv-scroll`, no `tabindex`): Safari keyboard users cannot scroll back. `field-sizing: content` is not in Firefox: the question box stays one line there.
- L8. `\u0000` in notes passes zod and fails in Postgres (`server/canvas.ts:10`): 500, client retries every 3 s forever; `/end` cannot succeed. Self-inflicted only. Reject with 400.
- L9. `request.json()` reads the whole body before the 5 000 limit applies (both new routes). Same as the existing turn route; platform body cap is the only bound.
- L10. Composer refocus after a reply (`composer.tsx:35-40`) reopens the on-screen keyboard on Android after every answer and shrinks the transcript as the reply lands. Check on devices.
- L11. Not-found page links "Về trang chủ"; PRD §6.0 says a "Buổi của tôi" button. That screen is phase 8; note it there.
- L12. `"Không kết nối được. Thử lại."` exists twice (`prep/[personaId]/page.tsx:17`, `interview-screen.tsx:26`). Keeping it out of `product-strings.ts` is the stated decision; one shared constant elsewhere would still do.
- L13. Working tree state: `interview-chat.tsx` deletion is staged, everything else is not. `src/strings/product-strings.ts` shows as modified but the diff is line endings only (index LF, worktree CRLF); content and approval hashes are unchanged.

## Answers to the explicit checks

(a) Requirements
- State switch, not-found (404 status), Màn 3 button states, cap and start-error states, withdrawn transcript: met.
- Canvas one block, 5 000 limit both sides, silent autosave, editable during reply, restore, freeze: met; caveats M2, M3.
- Streaming, typing indicator, partial reply dropped, question kept, error line under composer, three-failure line: met.
- Question box 500, Enter / Shift+Enter, IME guard, mobile send button, empty blocked: met.
- End confirm, locked during a turn, server refusal on live claim, freezes text in flight: met.
- 360 px, sheet keeps last reply, composer hidden: met by layout test without a keyboard; L6 open.
- NFR-15: met except L5, L7.
- 60 s server fallback: implemented, unreliable (M1).
- Plan-listed `tests/components/notes-canvas.test.tsx` and `composer.test.tsx` do not exist; replaced by `composer-rules.test.ts` and Playwright (stated decision).

(b) Invariants
- Canvas in no in-session call: holds. `canvasText` is referenced only in `canvas.ts` repo/server, the session page and the screen; `turn-store.ts:41-56` builds the model state from the snapshot and turns only. Int test with a marker string covers Call 1 and Call 2.
- Responses: notes `{saved:true}`, end `{ended:true}`, errors `{error}`; turn route unchanged in shape. Holds.
- Escaping: all learner text is rendered as text nodes or textarea values; no `dangerouslySetInnerHTML` in `src`. Holds.
- Claim/commit locking: only change is the `deviceClass` write inside the existing locked update (`turns.ts:69-70`). No regression.

(c) Concurrency
- `saveCanvasText`: one UPDATE with `status = interviewing AND canvas_frozen_at IS NULL`; under read committed it re-checks after waiting on the row lock, so it cannot land after a freeze. Fine.
- `endAndFreeze` / `freezeEndedCanvas` / `claimTurn` / `commitTurn` all take the same row lock. End is refused on a live claim; a claim is refused after end; a commit after end clears the claim and writes nothing. Fine.
- Turn 30: commit sets `ended_at` and clears the claim; the end request then skips the claim check and freezes. Double end is idempotent, one event. Fine.
- Page-load freeze with grace 0: M3. Timer: M1.
- Double submit: server idempotent; client guarded by `busy` / `ending` (state, not refs; safe because clicks and key presses flush between events).

(d) Client
- Autosaver: one save at a time, newest text, retry, stop; no lost update inside one page. Strict-mode double effect: second instance takes over, `saved` ref survives. Fine. Gaps: L2, L4.
- Local drafts: snapshots are primitives, server snapshot `null`, no hydration mismatch. Fine. Cross-device staleness: M2.
- Turn-30 auto end reads `notesNow` ref updated after each render: correct value at the time of the call. L1 for what is typed after.
- Focus: sheet open/close and dialog return focus correctly by reading. L3 for the dialog edge.

(e) Security
- Both routes: auth + notice, UUID check, owner in the WHERE of the write itself. `freezeEndedCanvas` takes no user id but is only reached after an ownership check (page) or a successful owned turn (route). Fine.
- Limits enforced with zod on the server in both routes. Header whitelisted against two literals. No XSS path. CSRF on `POST /end` relies on SameSite=Lax cookies, same as the turn route.

(f) Accessibility and mobile: see L5, L6, L7, L10. Rest is in line with NFR-15 (labelled notes button, Esc and "Thu" close with focus return, polite region for finished replies, modal dialog with inert page).

(g) Public contracts changed
- DB: four nullable-or-defaulted columns on `session` (additive, no CHECK on `device_class` or length). Intentional.
- `claimTurn` input and `RunTurnOptions` gain optional `deviceClass`. Intentional, backward compatible.
- `AppEvent` gains `session_ended` (device class is on this event and the session row, not on `session_started` as FR-38 words it; follows the stated decision).
- Turn route `maxDuration` 150 to 180; reads `x-device-class`. New `PUT /notes`, `POST /end`. Prep page accepts `?blocked=error`. `InterviewChat` removed. No env var change.

(h) Tests
- `canvas.int.test.ts` "freezes once when several end requests arrive together": the client pool is `max: 1`, so the four calls run one after another; it proves idempotence, not locking. The `toContain` over all four inputs cannot fail.
- `composer-rules.test.ts`: `key: "NumpadEnter"` is not a real `key` value (numpad Enter reports `"Enter"`); the case proves nothing.
- Missing: timer path of the turn route (M1); draft older than server text (M2); reload after a failed automatic end (M3); dialog closed by the browser (L3).
- Timing risk: turn-30 e2e types during a slow stub stream and asserts the exact frozen text; fails if typing outlasts the stream.

(i) Lint and types: both clean.

## Recommended actions

1. M1: database-clock age check or lower grace for the timer call; log a miss.
2. M2: tie the local draft to its base text.
3. M3: give the browser its grace on page load, and send the local draft before freezing.
4. L3, L5, L1, L2 (small, user-visible).
5. Carry L6, L7, L10 into the phase 10 device checks.

## Plan follow-ups

Phase 5 todo items all appear implemented. Recommend marking the phase "in review" with M1 to M3 open. Phase 6 depends on the freeze actually happening for abandoned sessions (M1).

## Unresolved questions

1. Does `<Link>` prefetch render `/sessions/[id]` in Next 16.3.8 without a `loading.tsx`? Decides how wide M3 race B is.
2. Should a session abandoned at turn 30 be frozen with no visit at all (needed for reveal in phase 6)? If yes, a timer inside the request is not enough even when M1 is fixed (function killed, deploy); a sweep is needed.
3. Is multi-device use of one session expected in the first release? Sets the priority of M2.
