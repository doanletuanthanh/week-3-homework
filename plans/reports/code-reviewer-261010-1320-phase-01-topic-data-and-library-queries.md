# Code review: Topic data and library queries (phase 1)

Branch `feat/library-topic-layer`, uncommitted tree, 2026-10-10. Review only; nothing edited.

## Scope

- New: `src/db/repo/library.ts`, `src/server/library.ts`, `tests/server/library.int.test.ts`, `drizzle/0012_topic-role-and-order.sql`, `drizzle/meta/0012_snapshot.json`
- Changed: `src/db/schema.ts`, `src/scenario/schema.ts`, `src/db/repo/{scenarios,sessions,users}.ts`, `src/server/{auth,events,session-list}.ts`, `cli/commands/seed-demo.ts`, `scenarios/ux-chi-tieu/topic.json`, five test files
- Checks run: `pnpm typecheck` clean, `pnpm lint` clean, `pnpm vitest run --project int tests/server/library.int.test.ts` 19/19 passed. Full int and e2e suites not run (controller's job).

## Overall

No critical or high finding. The security invariant and the access rule hold. Three medium findings (one ordering bug, two test gaps), the rest low. Safe to continue to the screen phases once M1 is decided.

## Acceptance criteria

| | Result |
|---|---|
| (a) Requirements | Met, with three differences from the phase file listed under "Differences from the phase file" |
| (b) Sealed content | Holds. `personaColumns` (`library.ts:10-21`) reads `persona.name`, `research_goal` and `jsonb_array_length(items)` only; no query in the two new files selects `content` whole. The test (`library.int.test.ts:119-131`) serialises the whole return value and checks every item string, so it would catch a whole-`content` select. Gaps: M3 |
| (c) Access | Holds. `getTopicWithPersonas` checks `visibleTo` before reading personas; `listCuratedPersonas` requires `kind = 'curated' AND owner_user_id IS NULL`; `listSessionsForPersonas` and `listOwnCustomTopics` are scoped by user id. Tested for another learner and for a guest |
| (d) No regression | `playableStatus` is a pure extraction, same predicate. Every `AppUser` literal has `roleFilter` (typecheck clean; `actions.ts:88` spreads). `STATE_OF` export is harmless. `upsertTopic`: see L1 |
| (e) Migration | Safe on a database with data: two nullable columns and one `NOT NULL DEFAULT 0` (no table rewrite on PG 11+). Backfill correct and also sets `display_order = 10`, matching `topic.json`. Journal tag `0012_topic-role-and-order` matches the file; `0012_snapshot.prevId` equals the id of `0011`; the three columns are in the snapshot with the right types. No CHECK constraint on `role` / `role_filter`, which matches the repo (no migration has one) |
| (f) SQL | `DISTINCT ON (persona_id) ... WHERE playable ORDER BY persona_id, version DESC` picks the newest playable version, as `getPlayableScenario` does. A persona cannot change topic between versions (`scenarios.ts:50-54`), so the topic page and the library count agree. Ordering: M1 |
| (g) Patterns | Follows the repo's comment style and repo/server split. Small leftovers: L4, L5 |
| (h) Deviation | Agree, see below |

## Medium

### M1. A persona's place in its topic moves when it gets a new version (CONFIRMED)

`library.ts:20` selects `scenarios.createdAt` of the version `DISTINCT ON` chose, and `library.ts:55-61` and `:85` sort by it. `insertScenarioVersion` (`scenarios.ts:56-68`) inserts a new row per version, so `created_at` is the time of the newest playable import, not of the persona.

Failure: topic has A (imported first) and B. The operator fixes a typo in A and imports it again as version 2. A now sorts after B on the topic screen, and `pickNextPersona` (`server/library.ts:89`, first match in that order) offers B where it offered A before. Phase 5 writes six personas and will re-import them while editing, so the order of every topic becomes the order of the last edits. The comment at `library.ts:39-40` says "in the order they were written", and `getFirstPersonaId` (`sessions.ts:64-71`) already orders by the first import.

Fix: sort by the persona's first import, for example

```ts
firstImportedAt: sql`(SELECT min(s.created_at) FROM scenario s WHERE s.persona_id = ${scenarios.personaId})`.mapWith(scenarios.createdAt),
```

(`mapWith` is needed: a raw `sql<Date>` comes back as a string and `getTime()` would throw.) Add a test that re-imports the first persona and expects the order unchanged. If the order should instead be set by the author, that is a persona `display_order` field and a product decision.

### M2. The choosing rule of `listOwnCustomTopics` is not exercised (CONFIRMED)

`library.ts:137` replaces the kept row only when a topic has more than one attempt and an older one is playable. The only test (`library.int.test.ts:178-191`) builds two topics with one attempt each, so the condition is always false after the first row; deleting the second half of the `if` leaves the suite green. Topics with several attempts are real: a retry reuses the topic (`custom-topic.ts:103`, `custom-topics.ts:177-180`).

Add two cases in one topic: failed then a passing retry (expect the passing session), and a playable session with a newer `failed_eval` or `generating` attempt (expect the playable one; reachable for a demo account or after a refund, by retrying an old failed session of a topic that later passed).

### M3. The sealed-content test covers one of the two list paths and one key name (CONFIRMED, test strength only)

- `listCuratedPersonas` is exported and feeds `listLibraryTopics` and `pickNextPersona`, but no test serialises its rows. Today it shares `personaColumns`, so nothing leaks; a later edit that adds a column to its own select (it already spreads four topic columns in) has no guard. One assertion over `JSON.stringify(await listCuratedPersonas(...))` closes it.
- The phase file asks for "no key from `itemSchema`"; the test checks the name `secret_terms` only. Values of `secret_terms` are not checked either: `findSealed(sent, chiThu)` from `tests/helpers/sealed-strings.ts` does both strings and terms and is the helper the repo already has. A key allow-list (`Object.keys(persona)` equals the eleven card keys) is the stronger form.

## Low

### L1. Re-importing a `topic.json` without `role` clears the role and moves the topic first (CONFIRMED, behaviour by design)

`scenarios.ts:10` writes `role: topic.role ?? null` and `displayOrder: topic.display_order` (zod default 0) on conflict. My view: this is right. The file is the source of truth, as for title and summary, and it is the only way an author can remove a role. The surprise is operational: an import from an older checkout or a hand-made folder silently drops the topic out of its role filter and puts it at the top (order 0 sorts before 10). `tests/cli/publish-flow.int.test.ts:386` already does exactly this to `ux-chi-tieu`. Suggested: have `il import` print the role and order it wrote, and say in `docs/operations.md` that both come from `topic.json` on every import. No code change needed in `upsertTopic`.

### L2. Wrong error text for a bad role or order in `topic.json` (CONFIRMED)

`cli/commands/import-scenario.ts:21` reports any `topicSchema` failure as "cần id, title và summary". With the new fields, `"role": "UX"`, `"role": "other"` or a negative `display_order` produces that message, which sends the author to the wrong fields. Phase 5 writes three new topic files. Fix: name the failing path from the zod issue, or extend the text to the five fields.

### L3. A curated topic with no playable persona still answers by id (PLAUSIBLE, depends on product intent)

`getTopicWithPersonas` (`library.ts:75-86`) returns the topic with `personas: []` when the topic exists. That is the PRD's "Chủ đề này đang được cập nhật" state. Once `require_published` is on, it also means the title and summary of a topic whose personas are all drafts can be read at `/topics/<slug>` by anyone who guesses the slug. Title and summary are not sealed content; flag only.

### L4. Redundant sort in `listOwnCustomTopics` (CONFIRMED)

`library.ts:139` re-sorts by `createdAt` rows that the query already ordered (`:132`); a `Map` keeps insertion order when a value is replaced. The sort also drops the `asc(topics.id)` tie-break, though stable sort keeps it. Return `[...byTopic.values()]`.

### L5. `listSessionsForPersonas` has no tie-break (PLAUSIBLE)

`library.ts:98` orders by `started_at` only; `listSessionRows` (`sessions.ts:192`) adds `desc(sessions.id)`. Only a demo account can have two counting sessions with one persona, and equal timestamps are unlikely. Add the same tie-break for a stable "newest".

### L6. `doneCount` and the card button can disagree for a demo account (PLAUSIBLE)

`doneCount` counts a persona when any session is `done` (`library.ts:103-108`); the button uses the newest session. A demo account with an old `done` session and a new one in progress shows "Đã luyện 1/1" next to "Tiếp tục buổi luyện". Demo only; acceptable, note for the screen phase.

## Differences from the phase file (not bugs)

- `listSessionsForPersonas` returns no `endedAt`. §7 buttons do not need it; fine under YAGNI unless the topic screen wants it.
- `pickNextPersona` takes `topicRole` and `requirePublished` and no `currentPersonaId`. The current persona is excluded through its own counting session, which holds for demo accounts too.
- `tests/server/next-persona.int.test.ts` was not created; its cases are in `library.int.test.ts`. The phase file's success criterion names both files.
- `filterTopics` and `parseRoleFilter` are screen-phase helpers that landed here; they have no caller yet outside the test.
- `listLibraryTopics` lives in `src/server/library.ts`, not the repo module; the repo exposes `listCuratedPersonas`.

## On the deliberate deviation (h)

I agree with no cross-role fallback. FR-31 says same topic, then another topic of the same role, then the "đã luyện mọi persona" text; Màn 6 item 7 words that text as "của vai trò này". A cross-role offer would contradict the string. The phase file's architecture line ("else any curated topic") and the plan's success criterion ("only when none is left") should be reworded by whoever owns the plan so they do not read as unmet.

One place where the literal reading bites, for the screen phase: a learner whose saved filter is `ba` or `pm` finishes a custom topic. `pickNextPersona` returns null (`server/library.ts:87-90`, tested at `library.int.test.ts:250`) and the reveal would say they practised every persona of the role when they practised none, because no BA/PM topic exists yet. With all content being UX, that is every learner who pressed BA or PM once. The fix belongs in the wording or the caller, not here.

Edge cases checked and correct: demo accounts (any counting session excludes the persona), a pulled persona or topic (not in `listCuratedPersonas`), the tombstone list (merged into `practised`, matches what `openSession` would refuse), a withdrawn session (offered again), a curated topic with no role (treated like a custom one).

Note for the caller of `pickNextPersona`: it calls `quotaKeyOf`, which throws when `QUOTA_HASH_SECRET` is unset and reads `auth.identities`. That is a new dependency of the reveal page render.

## Recommended actions

1. Decide M1 (first-import order or an authored persona order) before phase 5 starts re-importing personas.
2. Add the two `listOwnCustomTopics` cases (M2) and the `listCuratedPersonas` / `findSealed` assertions (M3).
3. Fix the import error text (L2) before the new topic files are written.
4. Drop the redundant sort (L4), add the tie-break (L5).
5. Plan owner: reword the phase file where it differs (fallback order, the second test file).

## Unresolved questions

1. Persona order inside a topic: order of first import, or a field the author sets?
2. A custom topic whose only session is `withdrawn` (scenario taken down) is still returned by `listOwnCustomTopics` with status `withdrawn`. §7 says "(persona không hiện)" for the persona card but is silent on the custom topic card. Show it, or leave it out?
3. Should a topic with no playable persona be "not found" for learners while `require_published` is on (L3)?
4. `user.role_filter` is a new stored attribute of the account: does the data notice or the privacy text need to list it?
