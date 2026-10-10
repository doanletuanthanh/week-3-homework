---
title: "Library topic layer and app topics"
description: "Build the learner screens the design canvas has and the app lacks (Màn 2 Thư viện, Màn 2b Chủ đề, the designed home page, next-persona suggestion) and add 3 curated topics about building apps and web apps, 2 personas each."
status: in-progress
priority: P1
effort: "~11.5d"
tags: [library, topics, personas, nextjs, s2]
blockedBy: []
blocks: []
created: 2026-10-10
---

# Library topic layer and app topics

## Overview

The design canvas "InterviewLab MVP" (https://claude.ai/artifact/8HHCXH3F4iQuCkFhYFRGBx, 46 artboards, unchanged since the snapshot in `docs/design/`) was compared with the app on `main` and with `docs/launch-checklist.md`. Three groups of screens are not built. This plan builds the first (PRD slice S2, the topic layer) and adds six personas in three new topics about making apps and web apps. The other two groups stay out (user decision 2026-10-10).

Authorities: PRD `_bmad-output/planning-artifacts/prds/prd-week-3-project-2026-09-24/prd.md` (§3 S2, §4, §6.1 Màn 1/2/2b, §7, FR-4, FR-31, FR-38, FR-50, FR-51); design `docs/design/` (`Main`, `Library`, `LibraryGuest`, `Topic`, canvas note `d1`); the bootstrap plan `plans/261003-1818-interviewlab-bootstrap-s1-and-custom-topics/` and its seven invariants, which still hold.

## Gap found (canvas against the app)

| Canvas | In the app today | This plan |
|---|---|---|
| Màn 2 Thư viện (`Library`, `LibraryGuest`): role chips, topic grid, "Tạo chủ đề của bạn" card, "Chủ đề bạn tự tạo" | No route | Phase 2 |
| Màn 2b Chủ đề (`Topic`): overlap warning, persona cards with the state button, "Bạn đã luyện k/n" | No route | Phase 3 |
| Màn 1 (`Main`): "Vào thư viện", library preview of 3 topics, closing band | Home links straight to one persona (`getFirstPersonaId`); no library section | Phase 4 |
| Header "Thư viện" (§6.0) | Missing | Phase 4 |
| Màn 6 item 7, next persona (FR-31) | Always "Bạn đã luyện mọi persona" + waitlist | Phase 4 |
| Màn 3 breadcrumb Thư viện › chủ đề › persona | Trang chủ › title (not a link) › persona | Phase 3 |
| Màn 9 empty state → library (FR-43) | Links to the one persona | Phase 4 |
| `topic.role`, `topic.display_order`, `user.role_filter`; events "chọn bộ lọc vai trò", "mở chủ đề" (FR-38, FR-50) | Columns and events do not exist | Phase 1 |
| One avatar drawing for every persona | `PersonaAvatar` ignores `avatar_key` | Phase 3 |
| Library content: 14 personas | 1 topic, 1 persona | Phase 5 adds 3 topics × 2 personas |
| Màn 12 Phương pháp (`Method`) | 404 by design (FR-62) | Out |
| Review Console `C1`–`C10` | CLI only | Out |

## Decisions

- Scope is S2 only; Review Console and the method page get their own plans (user, 2026-10-10).
- New content is 3 topics × 2 personas, all role `ux` (user, 2026-10-10). BA/PM personas need the grounding pack of FR-65 (S4), which is not built.
- Routes are English like the rest of the app: `/library`, `/topics/[topicId]`.
- The library lists a persona under the rule `getPlayableScenario` already uses: published, or while `require_published` is `false`, any version not pulled. So the new drafts are playable, as chị Thu is.
- The role filter is a form posting a server action: no client state, works before hydration, and the remembered choice is known on the server at render (no flash). Guest: a cookie; signed-in: `user.role_filter`.
- The home page's reveal preview stays the skeleton placeholder until a real `seed-demo` run exists (checklist gate 12, a user task). PRD Màn 1 forbids invented numbers there.
- The three topics and six personas of phase 5 are confirmed as proposed (user, 2026-10-10). One persona per topic is written first; if the plan runs late those three ship with the screens and the other three follow.
- `ux-chi-tieu` keeps one persona; anh Dũng and bạn Vy are left for later (user, 2026-10-10).
- Unevaluated draft personas carry no label for learners (user, 2026-10-10), as chị Thu today.

## Deviations from the PRD

- **FR-50 and FR-38, narrowed:** `role_filter_selected` and `topic_opened` are written for signed-in learners only (user decision 2026-10-10). A guest's filter is remembered in a cookie and a guest's page load writes nothing, so an anonymous caller cannot fill the `event` table. Cost: BA/PM interest among guests (PRD assumption #6) is not measured.
- **Màn 2 with JavaScript off (phase 2):** the page keeps its loading skeleton, so with JavaScript switched off it shows the skeleton only; the role chips work before the script bundles load. Awaits the user's confirmation.
- **S2 content:** the PRD plans UX 2 topics × 3 personas. After this plan there are 4 UX topics with 1 + 2 + 2 + 2 personas.

## Phases

| # | Phase | Status | Depends on | Effort |
|---|-------|--------|------------|--------|
| 1 | [Topic data and library queries](./phase-01-start.md) | Done | — | 1.5d |
| 2 | [Library screen and role filter](./phase-02-library-screen-and-role-filter.md) | Done | 1 | 1.5d |
| 3 | [Topic screen and persona cards](./phase-03-topic-screen-and-persona-cards.md) | Pending | 1 | 1.5d |
| 4 | [Home, header and next persona](./phase-04-home-header-and-next-persona.md) | Pending | 2, 3 | 1.5d |
| 5 | [App and web app topics](./phase-05-app-and-web-app-topics.md) | Pending | 1 | 4.5d |
| 6 | [Tests, docs and checks](./phase-06-tests-docs-and-checks.md) | Pending | 4, 5 | 1d |

Phase 5 is content work and touches only `scenarios/`; it can run beside phases 2–4.

## Not in scope

- Review Console C1–C10, the eval worker, the method page.
- BA and PM topics, FR-64, the grounding pack.
- A second and third persona for `ux-chi-tieu` (the canvas shows anh Dũng and bạn Vy): left for later, see Decisions.
- Full evaluation and publishing of the new personas (20–40 USD per persona, needs the second adjudicator). They ship as drafts.
- Topic `status` (draft/published/archived, canvas note `d1`): a topic shows when it has a playable persona, which is all FR-4 asks; archiving is a Console action.

## User tasks the build cannot do

- Review the content of the six new personas before they are imported into the real database (phase 5).
- Approve the LLM spend of the quick evaluation runs in phase 5 before they start.
- Run `pnpm il import` for the new files against the deployed database.
- Run `pnpm il check-strings product` and `pnpm il approve-strings product` on each database: phase 2 added 13 product strings, and `il publish` refuses every persona until they are approved.

## Success criteria

- [ ] A guest goes home → "Vào thư viện" → a topic → a persona's prep screen, and back, with no sign-in.
- [ ] `/library` shows 4 curated topics; UX shows 4, BA and PM show the empty state, "Khác" shows all with its line; the choice survives a reload (guest) and a sign-in on another browser (account).
- [ ] Each persona card's button matches PRD §7 for the signed-in learner's session; a demo account also has "Bắt đầu buổi mới".
- [ ] After a `done` session the reveal offers an unpractised persona of the same topic first, then of another topic; the "đã luyện mọi persona" text shows only when the role has personas and all are practised.
- [ ] No library or topic payload contains an item's content, tag, hook or sample question: only the item count.
- [ ] Six new scenario files pass `pnpm il validate`, including the cross-persona tag rule, and import as drafts.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:int`, `pnpm test:e2e`, `pnpm build` pass.
- [ ] `docs/launch-checklist.md` and the bootstrap plan no longer say there is no library.

## Open questions

- Role filter of a learner (phase 2 review, M1): should the account be the only source once the learner has accepted the notice (the cookie then serves guests only), or should the cookie fallback stay and be cleared at sign-out? Needed before phase 4.
- Màn 2 with JavaScript off: keep the skeleton (built) or drop it so the page reads without scripts?

The three questions of the first draft were settled in validation session 1 (below).

## Validation Log

### Session 1 — 2026-10-10

7 questions asked.

| # | Question | Decision |
|---|---|---|
| 1 | Correct the six name and path mismatches found against the code? | Yes, all |
| 2 | More personas for `ux-chi-tieu`? | Later; it keeps one |
| 3 | Label unevaluated personas for learners? | No label |
| 4 | Record guests' role-filter choices as events? | Signed-in only |
| 5 | The three topics and six personas as proposed? | Yes |
| 6 | Record `topic_opened` for guests? | Signed-in only |
| 7 | If phase 5 runs late? | Ship one persona per topic first |

### Verification Results

- Tier: Full (6 phases). Claims checked: 24. Verified: 18 | Failed: 6 | Unverified: 0.
- Failures, all corrected in the phase files with the user's consent:
  - `pnpm il strings` does not exist; the command is `check-strings` (`cli/index.ts:69`).
  - chị Thu's `avatar_key` is `thu` (`scenarios/ux-chi-tieu/chi-thu.json:10`).
  - `waitlisted` is loaded in `src/app/sessions/[id]/page.tsx:124`, not in `reveal-screen.tsx`.
  - The empty "Buổi của tôi" state is in `src/app/my-sessions/page.tsx:56`, not in `session-list.tsx`.
  - Test databases are seeded from `PERSONA_FILE` in `tests/helpers/test-db.ts:11`, not from `tests/e2e/global-setup.ts`.
  - `STATE_OF` (`src/server/session-list.ts:16`), `visibleTo` and the playable predicate (`src/db/repo/sessions.ts:14,48`) are private and must be exported.
- Also confirmed: `PersonaAvatar` has four call sites; "Bắt đầu luyện" is pressed in two e2e specs; `src/proxy.ts` has no public-route list; `revalidatePath` is not used in the repo yet; `il eval --profile quick` exists.

### Session 2 — 2026-10-10, after the phase 1 code review

| # | Review item | Decision |
|---|---|---|
| 1 | Re-importing a `topic.json` without `role` wipes the stored role | The import refuses a topic file without `role` or `display_order` (same overwrite for both) |
| 2 | "Đã luyện mọi persona" shown for a role with no persona | Said only when the role has personas; otherwise a third outcome with no such line |
| 3 | Custom topic whose scenario was taken down | Left out of the library; the stopped session stays in "Buổi của tôi" |
| 4 | Name `user.role_filter` in the data notice (Màn 0)? | No: an interface preference, not identifying data |

Propagated to phase 1 (schema, queries), phase 4 (three outcomes on the reveal) and phase 5 (topic files).

### Whole-Plan Consistency Sweep

Checked `plan.md` and the six phase files for: `il strings`, events written for guests or "with the user id or null", "one row per choice/visit", the avatar key, the old wiring and seed file names, "user confirms the table", and references to the open questions. All replaced. The success criterion on the role filter in `plan.md` says nothing about events and stands. No unresolved contradiction.

<!-- slug: library-topic-layer-and-app-topics -->
