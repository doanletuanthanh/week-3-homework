---
title: "Phase 5: Interview screen and notes canvas"
status: in-review
phase: 5
priority: P1
effort: "2.5d"
dependencies: [3]
---

# Phase 5: Interview screen and notes canvas

## Overview

Màn 3 with all its states and Màn 4 as designed: chat, turn counter, seal counter, notes canvas (fixed notepad on desktop, bottom sheet on mobile), ending the session and freezing the notes.

## Context links

- PRD Màn 3, Màn 4, §6.0, §7, FR-6–10, FR-46, FR-47 (freeze only; reveal starts in phase 6), NFR-11, NFR-15; §12.2 item 13 (canvas parts).
- Artboards: `Prep`, `CapReached`, `Interview`, `InterviewEnd`, `InterviewMobile`, `InterviewMobileNotes`, `SystemStates`.

## Requirements

- [x] `/sessions/[id]` renders the screen for the session's current state, never the last screen visited.
- [x] Nothing about labels, openness, hooks or opened items is rendered or present in any response.
- [x] Canvas: one free-text block, ≤ 5,000 characters, silent autosave, editable while the persona is typing, restored after closing the tab, frozen at end.
- [x] The persona reply appears as it is streamed (user decision 2026-10-05). The typing indicator shows until the first token; a stream that ends in an error removes the partial reply, keeps the question in the composer and shows the standard error line.
- [x] Question box: ≤ 500 characters; desktop Enter sends and Shift+Enter breaks the line; mobile uses the send button; empty cannot be sent.
- [x] "Kết thúc buổi" asks for confirmation, is disabled while a turn is being written, and freezes the canvas including text still being typed.
- [x] Usable from 360 px; the mobile notepad keeps at least the persona's last message visible and hides the composer while open.
- [x] Keyboard and screen-reader behaviour per NFR-15.

## Architecture

- `src/app/sessions/[id]/page.tsx` (server): loads the session through the repo with `userId`; not found or not owned → the same "Không tìm thấy buổi này." page; switches on state to a screen component. This phase implements `interviewing` (0 turns → Màn 3, else Màn 4); later phases add the rest.
- `InterviewScreen` (client): transcript list, composer, typing indicator "[Persona] đang gõ…" in a polite live region, error line under the composer (not a chat bubble), turn counter `Lượt n/30`, seal pill with the constant item count.
- `NotesCanvas` (client): textarea with the ruled style; debounce 800 ms → `PUT /api/sessions/[id]/notes`; a second consecutive failure shows "Ghi chú chưa lưu được, đang thử lại"; text never leaves the screen on failure. Mobile: button labelled "Ghi chú" opens a sheet; Esc, "Thu", swipe down or outside tap closes it and returns focus to the button.
- Drafts: unsent question and unsaved canvas text are mirrored to `localStorage` keyed by session id (try/catch), so an expired sign-in returns to the same page with the text intact.
- End: `POST /api/sessions/[id]/end` with the current canvas text → one transaction under the session row lock (the same lock the turn commit takes) sets `ended_at` if not set, `canvas_text`, `canvas_tokens`, `canvas_frozen_at`. Rejected while a live turn claim exists. The canvas PUT is rejected once frozen. Canvas length is checked on the server in both routes.
- Turn 30: the turn response reports the session ended; the client immediately sends the end request with the notes as typed. Server fallback: if a session has `ended_at` but no `canvas_frozen_at` after 60 s, or on the next page load, the last autosaved text is frozen. Reveal (phase 6) starts from the freeze, not from turn 30.
- Three consecutive turn failures switch the error line to the "đã được lưu ở lượt [n]" message.
- `device_class` (mobile < 768 px, else desktop) is sent once at session start as a header and stored on the session; no browser analytics SDK.

## Related code files

- Create: `src/components/interview/interview-screen.tsx`, `transcript-list.tsx`, `composer.tsx`, `notes-canvas.tsx`, `notes-sheet.tsx`, `end-session-dialog.tsx`, `session-bar.tsx`, `src/components/ui/dialog.tsx`, `src/hooks/use-local-draft.ts`, `src/hooks/use-autosave.ts`
- Create: `src/app/api/sessions/[id]/notes/route.ts`, `src/app/api/sessions/[id]/end/route.ts`, `src/server/canvas.ts`
- Create tests: `tests/server/canvas.int.test.ts`, `tests/components/notes-canvas.test.tsx`, `tests/components/composer.test.tsx`
- Modify: `src/app/sessions/[id]/page.tsx`, `src/app/prep/[personaId]/page.tsx` (button by state, cap-reached and withdrawn-persona states), `src/app/globals.css` (mobile rules for `sbar`, `notepad`, sheet)

## Implementation steps

1. State switch in the session page and the not-found page.
2. Màn 3 states: no session → "Bắt đầu"; unfinished → "Tiếp tục buổi luyện"; done → "Xem lại kết quả"; cap reached message; create-session error leaves no half session.
3. Interview screen from `Interview.dc.html`; wire to the turn API with `expectedIndex`.
4. Canvas autosave API and component; freeze check on the server.
5. Mobile layout from the two mobile artboards; sheet behaviour and focus return.
6. End dialog, end API, turn-30 auto end path showing the next state.
7. Drafts in `localStorage`; sign-in expiry round trip.
8. Tests: autosave restores after reload; PUT after freeze is rejected; end freezes text in flight; notes typed during turn 30 are in the frozen text; the fallback freezes an abandoned turn-30 session; end during a live turn claim is rejected; composer rules; mobile sheet closes with Esc.

## Todo

- [x] State switch + not found
- [x] Màn 3 all states
- [x] Màn 4 desktop
- [x] Canvas autosave + freeze
- [x] Mobile notes sheet
- [x] End session
- [x] Local drafts
- [x] Tests

## Success criteria

- [x] §12.2 item 13 canvas bullets that do not need reveal: autosave and restore, freeze at end, usable at 360 px without covering the composer when collapsed, auto end after turn 30 freezes.
- [x] Response bodies of the turn, canvas and end APIs contain no analysis fields (test inspects JSON keys).
- [x] Keyboard-only run through Màn 3 → Màn 4 → end dialog works.

## Risk assessment

- **Mobile keyboard and sheet interplay** differs between iOS Safari and Android Chrome. Mitigation: use `dvh` units and `visualViewport`; test on both in phase 10.
- **Canvas text lost between the last autosave and "Kết thúc".** Mitigation: the end request carries the current text.

## Implementation notes (2026-10-06)

Done in code. Verified: typecheck, lint, 468 unit, 221 integration, 114 Playwright tests (all against the LLM stub: no model spend). Review by the code-reviewer agent (`plans/reports/code-reviewer-261006-2104-phase-05-interview-screen-and-notes-canvas.md`): no critical or high finding; the three medium findings and five low ones are fixed, the rest is under "Left open".

Differences from the text above:

- `/sessions/[id]` shows Màn 4 for an interviewing session with 0 learner turns (the opening line and the composer), as it did before this phase. Màn 3 is the prep page, whose button reads "Tiếp tục buổi luyện" for it.
- Not found page: the button is "Về trang chủ". "Buổi của tôi" does not exist before phase 8.
- An ended session shows a placeholder ("Buổi luyện đã kết thúc.") until phase 6 adds Màn 5. A `withdrawn` session shows the PRD line and its read-only transcript; the artboard layout is phase 8.
- Device class: the browser sends `x-device-class` with every turn request and the first claim that has it stores it on `session.device_class`. It is on the `session_ended` event and the session row, not on `session_started` (written before any screen is known).
- New event `session_ended` `{canvas_empty, device_class}`, written by whichever call freezes the notes.
- Tables: `session.canvas_text`, `canvas_tokens`, `canvas_frozen_at`, `device_class`. Migration `0006`. No new environment variable.
- API: `PUT /api/sessions/[id]/notes` `{text}` → `{saved: true}`; `POST /api/sessions/[id]/end` `{canvasText}` → `{ended: true}`, also when the session had already ended with frozen notes. Errors: 400 `invalid_input`, 404 `not_found`, 409 `frozen` / `in_flight` / `session_ended`.
- Fallback freeze: the turn route waits 60 s after turn 30 inside `after()` (`maxDuration` 150 → 180) and freezes the last autosave if the browser sent nothing. A page load inside those 60 s does not freeze: the screen sends the end request with the notes that browser holds. After 60 s a page load freezes the last autosave.
- Drafts: the notes draft is stored with the server text it was typed over and is used on a later page load only when the server still holds that text. A draft older than the server notes is dropped.
- Files: no `tests/components/*.test.tsx`. Pure logic is tested in node (`tests/hooks/autosaver.test.ts`, `local-draft.test.ts`, `tests/components/composer-rules.test.ts`), component behaviour in Playwright (`tests/e2e/interview-screen.spec.ts`, `interview-mobile.spec.ts`). No jsdom or testing-library was added. Extra files: `turn-request.ts`, `use-is-mobile.ts`, `start-session-button.tsx`, `sessions/[id]/not-found.tsx`, `db/repo/canvas.ts`; `interview-chat.tsx` is gone.
- Error lines follow the PRD: "[Persona] chưa nghe rõ. Gửi lại câu hỏi.", "Không kết nối được. Thử lại.", and the incident line after three failures in a row. They live in the components, not in `product-strings.ts`: adding one there adds a string the operator must approve before `publish` passes.
- The cap-reached state is still shown after pressing "Bắt đầu" (`?blocked=cap`), not as a disabled button on load.
- The finished reply and "đang gõ…" are read out through one hidden polite live region; the streaming text is not announced piece by piece.

Left open:

- **A session abandoned at turn 30 is frozen by a timer inside the turn request.** If that function is killed (deploy, platform limit), nothing freezes it until the learner opens the URL again. Phase 6 starts reveal from the freeze, so it needs a sweep or must accept this.
- Real phones: the sheet with the on-screen keyboard (iOS Safari, Android Chrome), pinch zoom, and whether refocusing the composer after a reply is wanted on Android. Playwright has no on-screen keyboard. Phase 10.
- Firefox has no `field-sizing`, so the question box stays one line high there. The transcript area cannot be scrolled with the keyboard in Safari.
- Two tabs open at turn 30 can each send the end request; the first one wins, with its own notes.
- "Không kết nối được. Thử lại." is written in two files.
