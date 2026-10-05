---
title: "Phase 5: Interview screen and notes canvas"
status: todo
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

- [ ] `/sessions/[id]` renders the screen for the session's current state, never the last screen visited.
- [ ] Nothing about labels, openness, hooks or opened items is rendered or present in any response.
- [ ] Canvas: one free-text block, ≤ 5,000 characters, silent autosave, editable while the persona is typing, restored after closing the tab, frozen at end.
- [ ] The persona reply appears as it is streamed (user decision 2026-10-05). The typing indicator shows until the first token; a stream that ends in an error removes the partial reply, keeps the question in the composer and shows the standard error line.
- [ ] Question box: ≤ 500 characters; desktop Enter sends and Shift+Enter breaks the line; mobile uses the send button; empty cannot be sent.
- [ ] "Kết thúc buổi" asks for confirmation, is disabled while a turn is being written, and freezes the canvas including text still being typed.
- [ ] Usable from 360 px; the mobile notepad keeps at least the persona's last message visible and hides the composer while open.
- [ ] Keyboard and screen-reader behaviour per NFR-15.

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

- [ ] State switch + not found
- [ ] Màn 3 all states
- [ ] Màn 4 desktop
- [ ] Canvas autosave + freeze
- [ ] Mobile notes sheet
- [ ] End session
- [ ] Local drafts
- [ ] Tests

## Success criteria

- [ ] §12.2 item 13 canvas bullets that do not need reveal: autosave and restore, freeze at end, usable at 360 px without covering the composer when collapsed, auto end after turn 30 freezes.
- [ ] Response bodies of the turn, canvas and end APIs contain no analysis fields (test inspects JSON keys).
- [ ] Keyboard-only run through Màn 3 → Màn 4 → end dialog works.

## Risk assessment

- **Mobile keyboard and sheet interplay** differs between iOS Safari and Android Chrome. Mitigation: use `dvh` units and `visualViewport`; test on both in phase 10.
- **Canvas text lost between the last autosave and "Kết thúc".** Mitigation: the end request carries the current text.
