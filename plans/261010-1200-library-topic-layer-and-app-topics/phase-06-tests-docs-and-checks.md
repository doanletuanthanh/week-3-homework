---
title: "Phase 6: Tests, docs and checks"
status: done
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

- [x] Every command in step 5 passes; failures are fixed, not skipped.
- [x] `docs/launch-checklist.md` describes the app as it is after this plan, and a search of `docs/` and both plans for "no library" / "No library" / "one persona" finds no stale claim.
- [x] The review has no open high-severity finding.

## Results

State on 2026-10-10. Steps 1 to 6 are done.

| Command | Result |
|---|---|
| `pnpm typecheck`, `pnpm lint` | pass |
| `pnpm test` | 1074 tests, 52 files |
| `pnpm test:int` | 601 tests, 26 files |
| `pnpm test:e2e` | 316 tests, production build, desktop and Pixel 7 |
| `pnpm build` | pass |

What was added:

- `tests/e2e/hardening.spec.ts`: the security headers on `/library`, `/topics/[id]` (a guest, a learner, the data of a client navigation, a topic that is not there); the walk that must break nothing of the Content-Security-Policy now goes home → library → a role chip → topic → prep by the links, and reads the library and the topic as a learner.
- `tests/e2e/responsive.spec.ts` (1280px and Pixel 7): `/library` and its two filtered states have no sideways scroll; the home page, the library and a topic have one `h1`, and Tab reaches every link and button in page order with an outline on each.
- `tests/e2e/access-isolation.spec.ts`: a learner's own topic is in nobody else's library (the page and its data for a client navigation); a visitor's presses on the role filter and visits to a topic leave the accounts, the two events and the pending actions as they were, and one `il_role` cookie the page's scripts cannot read.
- `tests/config/docs-evidence.test.ts` (unit): every file, `pnpm il` command and package script the docs name exists; the launch checklist counts the topics and personas on disk, names each persona and each one-persona topic, cites the library specs and no longer says the library is out.
- `tests/server/library.test.ts` (unit): no fixed string says "feedback", promises "tự tin", or leaves "phỏng vấn" on its own (NFR-14).

## Deviations and notes from the implementation

- **Step 3 is a test, not a check by hand:** the keyboard and heading rule is in `responsive.spec.ts`. Nothing failed, so no component changed.
- **Step 4, the model part of `check-strings`, did not run.** It calls a model and stores its result in the database it is pointed at; it stays a user task (`plan.md`). The wording rule that needs no model is the unit test above.
- **`tests/cli/publish-flow.int.test.ts` has a 30 s limit.** Its scenes check and approve every fixed string one write after another; with the 29 strings of phases 2 to 4 two of its tests took about 3.3 s alone and passed the default 5 s in a full run.
- **No migration.** Phases 4 to 6 add none; the real database has all 13 applied (read on 2026-10-10).
- **The first full Playwright run was stopped by the machine running out of memory** after 177 tests; the second ran all 316.
- The docs changes follow the table in "Architecture"; `README.md` gained one sentence and the `scenarios` row.

## Review

Phases 4, 5 and 6 were reviewed together on 2026-10-10: `plans/reports/code-reviewer-261010-2311-phases-04-06-library-home-content-and-checks.md`. No high finding; two medium, ten low. The security checks of the new public routes, of `selectRoleFilter` and of `topicOpened` held on reading the code.

Fixed after it:

- The launch checklist and `plan.md` gave `pnpm il approve-strings product`, which only lists; they now give `... approve --all`. The library screens added 29 product strings, not 28 (phase 4 added 10).
- A fixture import that stops part-way left personas in the shared e2e database: `library-path.spec.ts` names what it removes before it imports, and `home-and-next-persona.spec.ts` imports inside its `try`.
- Tests of the real content read the number of items from the file instead of the number 10, so tuning a persona does not break them.
- `docs/operations.md` on when a topic leaves the library, and `docs/design/README.md`, which claimed every screen of its table is built.
- `docs-evidence.test.ts` also reads the commands inside command blocks.

After the fixes: typecheck, lint, 1074 unit tests, the changed integration file (22) and the two changed Playwright specs (30) pass. The full integration and Playwright runs in "Results" are from before these test-only and docs-only fixes.

The four questions the review left, as the user settled them (2026-10-11):

1. **`buildSessionView` takes the suggestion from every caller.** `next` is required (`NextStep`, or `null` from a caller that shows no result) and there is no fallback: a result asked for without it throws. Before, a missing one read as "all practised".
2. **`topic_opened` keeps its check-then-insert.** Requests sent at the same instant may write a few rows too many; these are counts for analytics and no lock is added. The comment in `src/server/library.ts` says so.
3. **The three texts are in `product-strings.ts`:** the header's "Thư viện" (`LIBRARY.name`) and "Buổi của tôi" (`MY_SESSIONS_NAME`, also on the prep screen), and "Đang giữ {count} điều" (`NEXT_STEP.holding`). Two keys are new to the string check.
4. **A visitor's `pending_action` rows already have a lifetime, so nothing was added.** A row expires 15 minutes after it is written (`PENDING_ACTION_TTL_MS`) and every new row first deletes all expired ones (`src/db/repo/pending-actions.ts`, covered by `tests/server/pending-actions.int.test.ts`). The table holds at most what 15 minutes of requests wrote. The user asked for removal after 24 hours or a reasonable time; 15 minutes is what stands. There is no limit on how fast a visitor may write rows inside that window.

## After the review: the home page's sample and the "Kiểm tra nhẹ" tag (2026-10-10, user request)

- The skeleton under the hero is replaced by the sample result of the `Main` artboard (`src/components/home/sample-result.tsx`), labelled "buổi mẫu". One line differs from the artboard, because "tự đặt" is a secret term of cô Lan; see `plan.md`, Deviations.
- The "Kiểm tra nhẹ" tag is off the home page's closing band and the library's create tile. It stays on Màn 10 and on everything generated.
- 16 strings of the sample are new to the string check, with the two above: 18 since the review, 47 since phase 2. The sample's topic line is the title of the curated topic, quoted, and is left out: the check read it as a claim about real people.
- On the real database (2026-10-11, user instruction): `pnpm il check-strings product` passes all 123 strings and `pnpm il approve-strings product approve --all` leaves 123 of 123 approved.

Checks on the final tree: typecheck, lint, 1083 unit, 601 integration, 316 Playwright on a production build.

## Risk assessment

- **The e2e database is emptied by the tests** (bootstrap open question 6): the six personas must be re-imported by the seed in `tests/helpers/test-db.ts`, which phase 5 changes. If a spec depends on topic order, it reads `display_order`, not insertion order.
- **Deployed checks are still the user's.** D1–D9 of the launch checklist stay "not run"; this plan only widens D6.
