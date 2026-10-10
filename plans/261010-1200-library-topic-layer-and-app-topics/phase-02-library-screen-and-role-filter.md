---
title: "Phase 2: Library screen and role filter"
status: done
phase: 2
priority: P1
effort: "1.5d"
dependencies: [1]
---

# Phase 2: Library screen and role filter

## Overview

Màn 2 at `/library`: role chips, the grid of curated topics, the "Tạo chủ đề của bạn" card, and for a signed-in learner the "Chủ đề bạn tự tạo" section.

## Context links

- PRD §6.1 Màn 2, §6.0, FR-1, FR-4, FR-50. Artboards `Library`, `LibraryGuest` and `theme.css` in `docs/design/`.
- Existing patterns: `src/app/my-sessions/page.tsx` (Suspense boundary after the checks, skeleton, error), `src/components/custom/custom-strip.tsx`, `src/server/actions.ts`, `src/components/ui/page-skeletons.tsx`.

## Requirements

- Functional:
  - Guests can read the page (FR-1).
  - Chips UX / BA / PM / Khác. None chosen = every topic. Pressing the chosen chip clears it. "Khác" shows every topic with the line "Chưa có chủ đề dành cho vai trò của bạn; đây là mọi chủ đề."
  - The choice is remembered: a cookie for a guest, `user.role_filter` for an account. Once a learner has accepted the notice the account is the only source: the cookie is neither read nor written for them. A guest's cookie is moved onto the account at sign-in (at Màn 0 for a new account) and removed; sign-out removes the cookie (user decision 2026-10-10).
<!-- Updated: Validation Session 3 - account is the only source for a consenting learner; cookie adopted at sign-in, cleared at sign-out --> A signed-in learner's choice writes `role_filter_selected`; a guest's choice writes nothing to the database (user decision 2026-10-10).
<!-- Updated: Validation Session 1 - guest filter choices are not recorded as events -->
  - First tile of the grid: "Không thấy chủ đề bạn cần?" with "Kiểm tra nhẹ" and the link to `/custom-topic`.
  - Topic card: role label, title, summary, "n persona", and signed-in "Đã luyện k/n". Links to `/topics/[id]`.
  - Signed-in, when the learner has any: section "Chủ đề bạn tự tạo", not filtered, newest first; each card has "Kiểm tra nhẹ" and its state. "Đang chuẩn bị" and "Chưa qua kiểm tra" link to `/sessions/[id]` (Màn 11); a playable one links to `/topics/[id]`.
  - Empty: a filter with no topic → "Chưa có chủ đề cho vai trò này." with "Xem mọi chủ đề" (clears the chip) and "Tạo chủ đề của bạn".
  - Loading: a skeleton shaped like the grid. Error: the standard error with retry.
- Non-functional:
  - Chips are form buttons: a press works before the page's script bundles have loaded. With JavaScript switched off entirely the page stays on its skeleton (see Deviations).
<!-- Updated: Phase 2 implementation - "JavaScript off" narrowed; the Suspense skeleton needs the inline swap script -->
  - Role colours always come with the text label (design README). Chips expose `aria-pressed`.
  - <768px: one column; chips wrap.

## Architecture

- `src/app/library/page.tsx` (server component): reads the user, `require_published`, the remembered filter (`user.noticeAcked ? user.roleFilter : cookie il_role`), then `listLibraryTopics` and, signed-in, `listOwnCustomTopics`. Filtering by role is done in the page over the full list (four topics; no second query).
- `src/server/actions.ts` → `selectRoleFilter(formData)`: validates the value against the closed set (anything else = clear), writes the cookie (`il_role`, `SameSite=Lax`, `HttpOnly`, 1 year, deleted when cleared), and when signed in calls `setRoleFilter` and records the event; then `revalidatePath("/library")` (not used anywhere in the repo yet: read its doc first). No redirect target is read from the request.
- Components in `src/components/library/`: `role-chips.tsx` (one `<form>`, four submit buttons with `name="role"`), `topic-card.tsx` (reused by the home page in phase 4), `create-topic-card.tsx`, `custom-topic-card.tsx`.
- Strings go in `src/strings/product-strings.ts` beside the existing ones, so `pnpm il check-strings` checks them (FR-36).
- CSS: port the classes the two artboards use from `docs/design/theme.css` into `src/app/globals.css` (`tcard`, chip classes), with the mobile rules the app adds itself.
- Before writing the page, read `node_modules/next/dist/docs/` for cookies in server actions and `revalidatePath` in this Next.js version (repo rule in `AGENTS.md`).

## Related code files

- Create: `src/app/library/page.tsx`, `src/components/library/role-chips.tsx`, `topic-card.tsx`, `create-topic-card.tsx`, `custom-topic-card.tsx`, `tests/e2e/library.spec.ts`
- Modify: `src/server/actions.ts`, `src/strings/product-strings.ts`, `src/app/globals.css`, `src/components/ui/page-skeletons.tsx` (`LibrarySkeleton`), `src/proxy.ts` only if it lists public routes

## Implementation steps

1. `src/proxy.ts` has no list of public routes (verified: one matcher for everything); each page asks for sign-in itself. So `/library` and `/topics/*` are public by not calling `requireUser`. Confirm with a guest request in the e2e spec.
2. `selectRoleFilter` action with a server test: unknown value clears; signed-in writes the column and one event; guest writes only the cookie and no row anywhere.
3. Page and components from the artboards; skeleton and error boundary as in `my-sessions`.
4. "Chủ đề bạn tự tạo" section, reusing the state labels of `custom-strip.tsx`.
5. Empty state and the "Khác" line.
6. `tests/e2e/library.spec.ts`: guest sees the grid; chip filters and survives reload; press again clears; BA shows the empty state and "Xem mọi chủ đề" restores; signed-in sees "Đã luyện 1/1" after a done session; a generating custom topic links to Màn 11; the chips work with the script bundles blocked.

## Success criteria

- [x] `/library` answers 200 for a guest and matches the `LibraryGuest` artboard's content and order.
- [x] The filter persists per the requirement; the `event` table has one row per signed-in choice and none for a guest.
- [x] `tests/e2e/hardening.spec.ts` still passes: no Content-Security-Policy refusal on `/library` (the form posts to self). The `/library` check itself is in `tests/e2e/library.spec.ts`.
- [x] The page HTML holds no string from any item of any scenario (asserted in the e2e test against chị Thu's `secret_terms`).

## Deviations and notes from the implementation

- **JavaScript off.** The plan asked for a skeleton and for the page to work with JavaScript off. A Suspense boundary sends the content in a hidden block that an inline script swaps in, so the two exclude each other. Kept: the skeleton (PRD "Tải: chuẩn"). Guaranteed and tested instead: the chips work as plain form posts before the bundles load. Confirmed by the user 2026-10-10: keep the skeleton.
- **A learner who has not accepted the data notice** is a guest for writes: cookie only, no column, no event (nothing is written before Màn 0).
- **No avatar stack and no per-topic icon on the cards:** `PersonaAvatar` ignores `avatar_key` until phase 3, and a topic has no icon field. Cards link to `/topics/[id]`, which phase 3 builds: until then the link answers 404.
- **"Đã luyện k/n"** is shown to every signed-in learner, 0/n included (PRD wording; the artboard shows it only where k > 0).
- **Stale attempts** are closed before the learner's own topics are listed, as in "Buổi của tôi"; a due attempt is not resumed from here (its card opens Màn 11, which does).
- **Strings:** 13 new product strings (`role_label.*`, `library.*`). `il publish` refuses every persona on a database until `pnpm il check-strings product` and `pnpm il approve-strings product` are run there (user task, 13 model calls).
- **Settled, from the code review (M1):** `user.roleFilter ?? cookie` could not tell "never chose" from "cleared", so a filter cleared in one browser came back from the cookie of another. Now the account is the only source for a consenting learner (`adoptRememberedRoleFilter` in `src/server/role-filter.ts`, called by the OAuth callback and by `acceptDataNotice`; `signOut` removes the cookie). Carrying a guest's choice over writes no event. The callback path cannot be driven by Playwright (Google); the Màn 0 path, the precedence and sign-out are. Review: `plans/reports/code-reviewer-261010-1600-phase-02-library-screen-and-role-filter.md`.

## Risk assessment

- **Cookie written in a cached render.** Reading cookies makes the page dynamic; that is wanted here (per-user counts). Do not add static caching to this route.
- **Guest writes.** Settled: a guest's press sets a cookie and writes no row, so the action gives an anonymous caller nothing to fill. The cost is that BA/PM interest from guests is not measured (assumption #6 of the PRD gets its signal from signed-in learners only).
- **Design drift.** The artboard has six topics across three roles; the app has four UX topics. The layout must not look broken with one role: checked in the e2e screenshot at 1280px and 390px.
