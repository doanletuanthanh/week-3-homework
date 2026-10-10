---
title: "Phase 4: Home, header and next persona"
status: todo
phase: 4
priority: P1
effort: "1.5d"
dependencies: [2, 3]
---

# Phase 4: Home, header and next persona

## Overview

Every way into and out of the library: the home page as designed, "Thư viện" in the header, the next-persona suggestion at the end of the reveal, and the empty "Buổi của tôi".

## Context links

- PRD §6.0 (header), §6.1 Màn 1, Màn 6 item 7, FR-31, FR-32, FR-43; UJ-1 step 8 ("Luyện tiếp với anh Dũng"). Artboards `Main`, `Reveal`, `Review`, `SessionsEmpty`.
- Existing: `src/app/page.tsx`, `src/components/site-header.tsx`, `src/components/header-menu.tsx`, `src/components/reveal/next-step.tsx`, `src/components/reveal/reveal-screen.tsx`, `src/app/my-sessions/page.tsx`, `getFirstPersonaId` in `src/db/repo/sessions.ts`.

## Requirements

- Functional:
  - Home: main button "Vào thư viện" → `/library`; second button "Tạo chủ đề của bạn"; section "Thư viện · Chọn một chủ đề, rồi chọn một persona" with the first three topics in display order and "Xem cả thư viện"; step 1 is titled "Chọn chủ đề và persona"; closing band "Không thấy chủ đề bạn cần?" with both buttons. The buttons no longer depend on a persona existing.
  - Header: "Thư viện" for guests and learners, on wide screens and inside the folded menu below 768px, with the current-page mark the "Buổi của tôi" link has.
  - Reveal, when the session is `done` (and wherever `NextStep` shows today): `pickNextPersona` has three outcomes. `next` → a card "Luyện tiếp với [display_name]" with the topic title, linking to `/prep/[personaId]`, and a second link "Về thư viện"; same-topic and other-topic suggestions use different lead-in lines. `all_practised` → today's "Bạn đã luyện mọi persona của vai trò này." and the waitlist button, unchanged. `none_exist` (the learner's role has no persona, e.g. a BA filter after a custom topic) → no "đã luyện mọi persona" line: a link "Vào thư viện" and the waitlist button (user decision 2026-10-10).
<!-- Updated: Phase 1 review - three outcomes of the next step -->
  - "Buổi của tôi" empty state → button "Vào thư viện" (FR-43).
- Non-functional:
  - The suggestion is computed on the server at render and never while the replay target is sealed in a way that would reveal it: it names a different persona, so it carries nothing about the current one.
  - A demo session gets the same suggestion; no event is written for it.

## Architecture

- `src/app/page.tsx`: drops `getFirstPersonaId`; calls `listLibraryTopics(db, { requirePublished, userId: null }).slice(0, 3)` and renders `TopicCard` from phase 2 without the "Đã luyện" line (the home page is the same for everyone). The reveal preview window stays as it is.
- `NextStep` props become `{ waitlisted: boolean; next: { personaId, displayName, topicTitle, sameTopic } | null }`. `waitlisted` is loaded in `src/app/sessions/[id]/page.tsx` (line 124, verified) and passed through `reveal-screen.tsx` to `NextStep`: call `pickNextPersona` there with the learner's `roleFilter` and pass `next` the same way.
<!-- Updated: Validation Session 1 - wiring point and empty-state file corrected against the code -->
- Lead-in strings (new, in `product-strings.ts`, checked by `pnpm il check-strings`): same topic "Cùng chủ đề, một người khác:"; other topic "Một chủ đề khác:". Wording to be confirmed against the `Reveal` artboard's item 7 before coding; if the artboard has its own text, use that.
- Delete `getFirstPersonaId` once nothing imports it.

## Related code files

- Modify: `src/app/page.tsx`, `src/components/site-header.tsx`, `src/components/header-menu.tsx`, `src/components/reveal/next-step.tsx`, `src/components/reveal/reveal-screen.tsx` (passes `next` through), `src/app/sessions/[id]/page.tsx` (loads it), `src/app/my-sessions/page.tsx` (the empty state and its `getFirstPersonaId` call are here), `src/db/repo/sessions.ts`, `src/strings/product-strings.ts`, `src/app/globals.css`
- Modify tests: `tests/e2e/guest.spec.ts` and `tests/e2e/my-sessions.spec.ts` (the only two specs that press "Bắt đầu luyện", verified), `tests/e2e/reveal.spec.ts`, `tests/e2e/responsive.spec.ts`, any component test of `NextStep`

## Implementation steps

1. Header link in both layouts; `responsive.spec.ts` covers the folded menu.
2. Home page sections from the `Main` artboard.
3. `NextStep` with the suggestion; server wiring; tests for: same topic, other topic, all practised (waitlist still writes once), and a role with no persona.
4. Empty "Buổi của tôi".
5. Remove `getFirstPersonaId`; `pnpm typecheck` finds leftovers.
6. Update the e2e specs that walked home → persona directly so they go home → library → topic → prep.

## Success criteria

- [ ] The end-to-end path of launch-checklist D6 passes locally with the library in it: home → library → topic → prep → … → reveal → "Luyện tiếp với …" → prep of the next persona.
- [ ] With every persona practised, the reveal shows the old text and the waitlist; pressing twice writes one row.
- [ ] No link in the app points at a persona by a hard-coded id.

## Risk assessment

- **Many e2e specs start from the home button.** Changing it breaks them at once. Mitigation: add a helper `openPrep(page, personaId)` in `tests/e2e/helpers/` first and switch specs to it; only `guest.spec.ts` and the new library/topic specs walk the full path.
- **Suggestion to a persona the learner cannot start** (session cap reached, or played before deletion). The prep screen already explains both; `pickNextPersona` excludes the tombstone's played list (phase 1). The cap is not checked here.
- **Home page becomes dynamic** because it reads topics. It already reads the database today; no change in caching.
