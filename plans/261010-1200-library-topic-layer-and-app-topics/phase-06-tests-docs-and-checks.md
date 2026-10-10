---
title: "Phase 6: Tests, docs and checks"
status: todo
phase: 6
priority: P2
effort: "1d"
dependencies: [4, 5]
---

# Phase 6: Tests, docs and checks

## Overview

The whole path with the real content in it, the documents that still say there is no library, and the checks to repeat on the deployed app.

## Context links

- `docs/launch-checklist.md`, `docs/operations.md`, `docs/setup.md`, `docs/design/README.md`, `README.md`, the bootstrap plan's "Accepted deviations" ("No library").
- PRD §12.2 item 1 (demo path with library screens), item 10 (navigation), NFR-14 (copy), NFR-15 (access).

## Requirements

- Functional:
  - One e2e spec walks the full learner path through the library with two personas of one topic, ending on the next-persona suggestion.
  - The access-isolation and hardening specs cover `/library` and `/topics/[id]`.
  - Docs state what is built now and what is still out.
- Non-functional:
  - Keyboard: chips, cards and buttons reachable in order with a visible focus ring; one `h1` per page; role labels are text.
  - 390px and 1280px: no horizontal scroll on the two new pages and the home page.

## Architecture

No new code beyond tests. Doc edits are small and go to the file that owns each fact:

| File | Change |
|---|---|
| `docs/launch-checklist.md` | D6 path gains library and topic; gate 1 drops "Library screens are out of this slice"; gate 2 lists seven personas, six of them without any evaluation; gate 10 names the new specs; "Not built in this slice" drops "The S2 library" and says which S2 content is still missing (UX 2 × 3 as the PRD planned; `ux-chi-tieu` has one persona; any new topic still at one persona); a line that role-filter and topic-open events exist for signed-in learners only |
| `docs/operations.md` | Importing a topic folder; `role` and `display_order` in `topic.json`; what turning `require_published` on does to the library |
| `docs/setup.md` | The import step imports every folder under `scenarios/` |
| `docs/design/README.md` | `Library`, `LibraryGuest`, `Topic` are built; route names |
| `README.md` | Only if it lists screens or routes |
| Bootstrap `plan.md` | Under "Accepted deviations", mark "No library (Màn 2/2b)" as replaced by this plan, with the date; do not rewrite history |

## Related code files

- Create: `tests/e2e/library-path.spec.ts`
- Modify: `tests/e2e/access-isolation.spec.ts`, `tests/e2e/hardening.spec.ts`, `tests/e2e/responsive.spec.ts`, the docs in the table

## Implementation steps

1. (Written with phase 5, 2026-10-10; it has no replay step.) `library-path.spec.ts` on the model stub: guest home → library → filter UX → topic → prep → sign-in and notice → short interview → guess → reveal → skip replay → "Luyện tiếp với …" → prep of the second persona; then the topic page shows "Bạn đã luyện 1/2" and "Xem lại kết quả" on the first card.
2. Add the two routes to the hardening spec (headers, no Content-Security-Policy refusal on a production build) and to the responsive spec.
3. Keyboard and heading check by hand on the three pages; fix what fails.
4. Re-read every new string against NFR-14 and run `pnpm il check-strings`.
5. Full run: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:int`, `pnpm build`, `pnpm test:e2e`.
6. Doc edits; then check each changed sentence against the code or a test.
7. Code review of the whole branch (new public routes; a server action a guest can call, which must write nothing but a cookie for them).
<!-- Updated: Validation Session 1 - guest action writes only a cookie; checklist records the narrowed events and one-persona topics -->

## Success criteria

- [ ] Every command in step 5 passes; failures are fixed, not skipped.
- [ ] `docs/launch-checklist.md` describes the app as it is after this plan, and a search of `docs/` and both plans for "no library" / "No library" / "one persona" finds no stale claim.
- [ ] The review has no open high-severity finding.

## Risk assessment

- **The e2e database is emptied by the tests** (bootstrap open question 6): the six personas must be re-imported by the seed in `tests/helpers/test-db.ts`, which phase 5 changes. If a spec depends on topic order, it reads `display_order`, not insertion order.
- **Deployed checks are still the user's.** D1–D9 of the launch checklist stay "not run"; this plan only widens D6.
