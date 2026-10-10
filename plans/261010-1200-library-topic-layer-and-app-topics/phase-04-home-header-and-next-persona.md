---
title: "Phase 4: Home, header and next persona"
status: done
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
- `NextStep` props become `{ waitlisted: boolean; next: NextStep }`, the three-outcome value of `pickNextPersona` (as built; the first draft had `next | null`). `waitlisted` is loaded in `src/app/sessions/[id]/page.tsx` (line 124, verified) and passed through `reveal-screen.tsx` to `NextStep`: call `pickNextPersona` there with the learner's `roleFilter` and pass `next` the same way.
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

- [x] The end-to-end path of launch-checklist D6 passes locally with the library in it: home → library → topic → prep → … → reveal → "Luyện tiếp với …" → prep of the next persona.
- [x] With every persona practised, the reveal shows the old text and the waitlist; pressing twice writes one row.
- [x] No link in the app points at a persona by a hard-coded id.

## Deviations and notes from the implementation

- **The suggestion card follows the `Reveal` artboard**, which has its own text: an eyebrow "Cùng chủ đề", the persona's name, "Đang giữ N điều", the button "Luyện tiếp với [display_name]". For another topic the eyebrow is "Một chủ đề khác" and the topic's title is shown under the name. The second link is "Về thư viện" (the artboard says "Thư viện"). `NextPersona` gained `name`, `avatarKey` and `itemCount` for it; a test fixes its key list.
- **`NextStep` takes the whole outcome** (`next: NextStep` from `src/server/library.ts`), not `next | null`: there are three outcomes and `null` cannot tell two of them apart.
- **`all_practised` and `none_exist` link to the library** ("Vào thư viện"), where the old card linked to the home page.
- **The suggestion is computed for a result only** (`revealed`, `replaying`, `done`); `buildSessionView` takes it as an optional input and says "all practised" without one, which is what the callers that build no result get.
- **A visitor on a phone has no folded menu:** the header shows the one link "Thư viện" beside "Đăng nhập". A learner's folded menu has both links.
- **The library link is marked, without `aria-current`, on `/topics/*`**: a topic's page is inside the library.
- **Màn 3 of a persona that cannot be started** (pulled, or played before the account was deleted) now leads back to its topic ("Về chủ đề"), as the PRD says; for a topic of the learner's own, to "Buổi của tôi". It was "Về trang chủ". Carried over from the phase 3 review.
- **The home page's library section is left out when no topic can be played** (publish gate on with drafts only); the buttons stay.
- **`getFirstPersonaId` is deleted.** `tests/e2e/helpers/personas.ts` imports extra personas for a test and removes them after: the other specs expect chị Thu to be the one persona.
- **Strings:** 10 more product strings (first counted as 9; corrected in the review of 2026-10-10) (`home.*`, `next_step.*`, `library.enter`, `library.name`, `topic.to_topic`), 29 since phase 2 began. Text that was already on the home page before this plan stays inline, as it was.
- **No code review yet:** by the user's decision (2026-10-10) phases 4 to 6 are reviewed together after phase 6.

## Risk assessment

- **Many e2e specs start from the home button.** Changing it breaks them at once. Mitigation: add a helper `openPrep(page, personaId)` in `tests/e2e/helpers/` first and switch specs to it; only `guest.spec.ts` and the new library/topic specs walk the full path.
- **Suggestion to a persona the learner cannot start** (session cap reached, or played before deletion). The prep screen already explains both; `pickNextPersona` excludes the tombstone's played list (phase 1). The cap is not checked here.
- **Home page becomes dynamic** because it reads topics. It already reads the database today; no change in caching.
