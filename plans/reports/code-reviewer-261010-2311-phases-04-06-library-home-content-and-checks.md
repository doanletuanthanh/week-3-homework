# Code review: Phases 4, 5 and 6 (home, header and next persona; app topics; tests, docs and checks)

Date: 2026-10-10. Scope: commit `037d85f` (phase 4, 31 files), commit `88f90fe` (phase 5, 14 files) and the uncommitted tree (phase 6: 12 modified files, 1 new). Read-only review; no code, doc or plan file was edited.

Ran: `pnpm exec vitest run --project unit` on `tests/config/docs-evidence.test.ts`, `tests/server/library.test.ts`, `tests/scenario/curated-scenarios.test.ts`: 116/116 pass. A scratch `tsx` probe counted the product strings. Not run (controller owns the database and reported them green): `pnpm test:int`, `pnpm test:e2e`, `pnpm build`. Every statement about what those suites prove is from reading them.

Not consulted: `node_modules/next/dist/docs/` (the hook denies the folder). No finding below rests on a Next.js API being wrong. What Playwright does with `afterAll` after a failed test is from general knowledge, marked where used.

## Overall

No High finding. The security checks of the brief hold on reading the code: the new public routes send a persona's public face and its item count only, a foreign custom topic and a missing one are one code path, a guest's or un-consenting learner's `selectRoleFilter` writes the `il_role` cookie and nothing else, and `topicOpened` writes for a consenting learner and a topic that learner can see. Two Medium items: an operator instruction in the launch checklist that does not do what it says, and e2e fixtures that leave personas behind when an import fails part-way.

## High

None.

## Medium

### M1. The checklist's approval command approves nothing, and the count is 29, not 28
`docs/launch-checklist.md:84` (gate 16); the same in `plans/261010-1200-library-topic-layer-and-app-topics/plan.md:82` and `phase-04-home-header-and-next-persona.md:72`

The checklist says `pnpm il publish` refuses every persona until the product strings are approved, by "`pnpm il check-strings product`, then `pnpm il approve-strings product`".

- `cli/commands/strings.ts:94` reads `const [name, action = "list", ...rest]`: with no action the command lists. Approving is `pnpm il approve-strings product approve --all` (or keys), as `docs/operations.md:42` has it.
- Scenario: the operator runs the two commands as written on the deployed database, then `pnpm il publish chi-hanh`; the gate still lists every unapproved product string (`cli/commands/publish.ts:21-24`). Loud, not silent, but the checklist is the document followed at launch.
- The count: the probe gives `role_label` 4 + `library` 11 + `topic` 7 + `home` 3 + `next_step` 4 = 29 keys, none of which existed at `086ee1d`. Phase 4 added 10 (`library.enter`, `library.name`, three `home.*`, four `next_step.*`, `topic.to_topic`), not 9.

Fix: write the approving form in the checklist and say 29 (or drop the number: `approve --all` does not need it). The plan lines are for the lead.

### M2. A fixture import that fails part-way leaves personas in the shared database
`tests/e2e/library-path.spec.ts:59-65`; `tests/e2e/home-and-next-persona.spec.ts:181-186, 271, 348-351`

- `library-path`: `imported` is filled after `importCuratedLibrary()` returns. If the fourth file fails `validate` (content tuning is announced for three personas), `beforeAll` throws with `imported = []`, `afterAll` removes nothing, and three personas with two topics stay.
- `home-and-next-persona`: `const extra = [await importExtraPersona(a), await importExtraPersona(b)]` stands before the `try`. If the second throws, the first is never removed.
- Consequence in both: every later spec that expects chị Thu alone (`library.spec.ts`, `my-sessions`, `publish-gate`, `responsive`, `topic`, all later in file order with `workers: 1`) fails for a reason unrelated to its subject. The next run is clean: `tests/e2e/global-setup.ts:11` resets the database (verified).
- A test failing midway is safe as far as the code shows: `afterAll` removes all six by id whatever state the sessions are in (`removePersonas` deletes sessions, scenarios, then the three topics). That Playwright runs `afterAll` before discarding the worker of a failed test, and `beforeAll` again in the new one, is assumed, not verified.

Fix: in `library-path`, set `imported` from `NEW` before importing (it does not depend on the import's result). In `home-and-next-persona`, start with `const extra: ExtraPersona[] = []` and push inside the `try`. `removePersonas` already tolerates ids that were never stored.

## Low

### L1. `topic_opened`: the check and the insert are two statements
`src/server/library.ts:99-105`, `src/db/repo/library.ts:83-97`

Two requests for one learner and topic can both read "not opened recently" and both insert. The comment "a browser that repeats the request cannot fill the table" holds for repeats in sequence (int test, including the 29/31-minute boundary) and not for a burst sent at once: a consenting learner's script gets as many rows as requests in flight, once per 30 minutes per visible topic. Own id only, bounded, so Low. Not reproduced. Fix if the number matters: take `pg_advisory_xact_lock(hashtext('topic_opened'), hashtext(user || topic))` in one transaction around the check and insert, as `insertScenarioVersion` does for imports; or soften the comment.

### L2. A result built without `next` says "you practised them all"
`src/server/session-view.ts:189`, pinned by `tests/server/sealed-page-props.test.ts` ("as before there was a library")

`next: input.next ?? { kind: "all_practised" }`. The one production caller passes `next` for all three result states (`src/app/sessions/[id]/page.tsx:122-137`, verified), so nothing is wrong today. The default is the one outcome validation session 2 ruled must only be said when true: a later caller that renders a result and forgets `next` shows "Bạn đã luyện mọi persona của vai trò này." to a learner with five personas left, and typecheck stays green. Fix: default to `none_exist` (a link to the library, no claim), or make `next` required and pass it in the five test call sites.

### L3. New learner-facing text outside `product-strings.ts`
`src/components/header-menu.tsx:8-9`, `src/components/reveal/next-step.tsx:30`, `src/app/prep/[personaId]/page.tsx:210`

Phase 4 added `LIBRARY.name = "Thư viện"` and, in the same commit, a second inline "Thư viện" as the header label; "Đang giữ {n} điều" on the suggestion card and "Buổi của tôi" on the prep button are inline too. None is in `productStrings()`, so `check-strings product`, the approval gate and the new NFR-14 test do not see them. The repo already has inline text (the phase note says home text "stays inline, as it was"), so this follows a tolerated habit, but these three are new. Fix: `DESTINATIONS.library.label = LIBRARY.name`; a `NEXT_STEP.holding` template.

### L4. `tests/config/docs-evidence.test.ts`: several assertions are weaker than their titles
- `:63` `not.toMatch(/without the library|Library screens are out|The S2 library,/)` forbids three exact old phrases. Any reworded stale claim ("there is no library yet") passes: after today it cannot fail in a way that means something.
- `:58-60` "names every curated persona under the evaluation gate" checks that `` `chi-my` `` occurs anywhere in the file, not in gate 2.
- `:52-53` `toContain("7 personas")` is a substring test ("17 personas" passes) and ties a unit test to the wording of a prose sentence: adding a persona file fails `pnpm test` until the checklist is reworded. That coupling is the purpose; say so in the test's comment so the failure is read as "update the doc".
- `:41` the package-script pattern needs a backtick directly before `pnpm`, so commands inside fenced blocks (most of `docs/setup.md`) are not checked, while the title says "every package script it gives".
- `:13, 24` a doc that cites `src/server/library.ts:99` in backticks fails `existsSync`. Strip a trailing `:\d+` before the check.
The path and command checks (`:22-35`) are sound and worth keeping; `cliCommands()` depends on the layout of `cli/index.ts` and is guarded by the "read whole" test, so a layout change fails loudly.

### L5. Tests of the real content pin numbers the announced tuning may change
`tests/cli/import-curated-library.int.test.ts:76` (`10 item, 1[5-6] fact bề mặt`), `:117` (`itemCount: 10`); `tests/e2e/library-path.spec.ts:240-247, 256` ("trong 10 điều", "1 trên 10", "Đang giữ 10 điều")

Phase 5 records that three personas need their items reworked; the schema allows 8-12 items. One changed count fails an int test and an e2e test that are not about counts. `library-path.spec.ts:134` already reads `scenario.items.length`; do the same in these places. Related: `expectNothingSealed` matches every persona's secret terms without diacritics against whole pages that also carry other personas' public text, so a new term that equals a word of a sibling's tagline fails as a "leak". Loud and rare; worth one line in the helper's comment.

### L6. The documented persona order is not the order the tests import in
`docs/setup.md:66`, `docs/operations.md:30`; `tests/helpers/curated-scenarios.ts:22-25`, `tests/helpers/test-db.ts:18-26`

The docs are right about the code: `getTopicWithPersonas` and `listCuratedPersonas` sort by first import, then id (`src/db/repo/library.ts:57-63, 115`). `importCuratedLibrary` imports by file name, so the test databases hold anh Khoa before chị Hạnh, bạn Phúc before chị My: the reverse of the order `docs/setup.md` gives and the real database has. No test of the real content asserts card order (`library-path.spec.ts:128` looks cards up by name; the int test sorts both sides at `:115`), so nothing breaks, and nothing proves the documented order either. Fix only if wanted: import in a declared order in the helper and assert `personaCards` order once.

### L7. What the keyboard test proves
`tests/e2e/responsive.spec.ts:32-63`

It is a real test: it fails when an element is skipped, reached out of DOM order, or has its outline removed. Limits to know:
- The ring check is `outline-style != none` and width > 0, which the browser's default ring satisfies. It does not detect a ring that is clipped by an ancestor's `overflow: hidden` or drawn in the background colour.
- Visitors only. A learner's folded menu, the own-topic cards, the "Đã luyện" bar and a demo account's second button are not walked.
- Flakiness: none seen on reading. A visitor's pages have no `RefreshOnShow`, so the element list kept on `window` is not replaced mid-walk.
The gate-10 wording in the checklist ("keyboard order and the two widths") matches what it does; the "mobile" project is Pixel 7 at 412px, and 390px is covered in `library.spec.ts:586`, `topic.spec.ts:156`, `home-and-next-persona.spec.ts:65, 224` and `library-path.spec.ts:145`.

### L8. Two doc sentences to tighten
- `docs/operations.md:31` "A topic the learners no longer see is one whose personas are all unpublished or pulled." With the gate off a draft, which is not published, is playable (`playableStatus`, `src/db/repo/sessions.ts:43`). Say "all pulled (`unpublish`), or, with `require_published` on, none published". The topic's own URL still answers 200 with the empty state; "no longer see" is true of the library list only.
- `docs/design/README.md:33` "Every screen in the table is built." I could not verify this for every artboard state in the table (for example each of `RevealStates`, `CustomStates`, `SystemStates`), and Màn 1's reveal preview is a placeholder by decision (plan, Decisions; checklist gate 12 open). Either scope the sentence to Màn 2 and 2b, which is what changed, or name the placeholder.

### L9. The home page now runs the whole library query for every visitor
`src/app/page.tsx:41-42`, `src/db/repo/library.ts:44-64`

Three cards cost a config read plus `listCuratedPersonas`: every playable version of every persona, three JSONB extractions and a correlated subquery per row, on a public uncached page, over the process's single connection. Nothing at seven personas. Each re-import adds a version to scan. Note for later, not a change to make now (the page read the database before, too).

### L10. Smaller test notes
- `tests/e2e/access-isolation.spec.ts` (new visitor test): proves the pages and forms write nothing for a visitor, and the cookie's name, value and `httpOnly`. It does not post the two actions by hand as a visitor; for `topicOpened` the page does not render the caller for a visitor, so the server guard is proven only by `reportTopicOpened` in `tests/server/library.int.test.ts`. `secure`, `sameSite` and `path` are not asserted anywhere I found.
- `tests/cli/publish-flow.int.test.ts:37` a 30 s limit for the whole file. Reasonable for the stated cause; it also hides a slow test in that file from now on. A per-`describe` limit on the two scenes would be narrower.
- `tests/e2e/helpers/personas.ts:11-17, 56` `CHI_TIEU` repeats `scenarios/ux-chi-tieu/topic.json`; `removePersonas` writes it back into the database. Editing the file without the constant makes `library-path` (which reads the file) disagree with the stored topic after any earlier spec's cleanup. Read the file instead.
- `tests/server/library.test.ts` NFR-14 test: sound; each rule is first shown to match a breaking text. It covers `productStrings()` only (see L3).

## Verified OK (by reading the code unless noted)

**(a) Phase criteria**
- Home leads to `/library` and `/custom-topic` whether or not a persona exists; the preview is the first three topics in library order with no progress line; closing band present (`src/app/page.tsx`).
- Header "Thư viện" for everyone, wide and narrow; marked on `/topics/*` without `aria-current`.
- Three outcomes, computed on the server: same topic first, then other topics of the role; `none_exist` when the candidate list is empty; `all_practised` only when it is not (`src/server/library.ts:207-236`). A withdrawn session does not count; a deleted account's played list does.
- Empty "Buổi của tôi" links to `/library`. `getFirstPersonaId` and `MySessionsLink` have no remaining reference in `src`, `cli` or `tests`. No `/prep/<fixed id>` link in `src`.
- Six scenario files: the folder-walking unit test passes (run).

**(b) Security**
1. Payloads: `personaColumns` names its columns and takes `jsonb_array_length` of the items; `LibraryTopic`, `PersonaCardView` and `NextPersona` are built field by field; `NextPersona`'s key list is pinned by an int test. `NextStep` is the only client component fed by the new code and receives that fixed shape. Page titles are static.
2. Custom topics: `getVisibleTopic` is one query with `visibleTo(viewer)`; unknown and foreign both return null into one `notFound()`. Custom ids match the same id pattern, so both take the database path. The library lists own topics by `ownerUserId`; curated lists require `kind = curated` and no owner. The home page and the suggestion read curated personas only.
3. `selectRoleFilter`: visitor → `getUser()` null → no transaction, cookie only. Signed-in without the notice → `chooseRoleFilter` skips the write (`user?.noticeAcked`), cookie only; the account's `user` row is touched only by the sign-in upsert every signed-in request already does. A value outside the closed set, a `File` included, parses to null: cookie removed (or, for a consenting learner, the filter cleared with one event). No redirect target is read from the request. No path found by which an anonymous caller writes to `event` or `user`: every `recordEvent` call site has a signed-in subject except `account_deleted`, which needs the account.
4. `topicOpened`: non-string, over-long or malformed ids return before any write; visitor and un-acked return first; demo accounts write nothing (`recordEvent`). Window: see L1.
5. Cookie: `httpOnly`, `sameSite: lax`, `secure` in production, path `/`, one year; removed on sign-out and when the account takes the value. XSS: all new text goes through JSX; hrefs are built from validated ids; the unit test renders hostile names and titles.

Adjacent, not in these phases: a visitor's "Bắt đầu" stores a `pending_action` row with no user (`src/server/pending-actions.ts:17-18`), so that table can be filled anonymously, one row per request for an existing persona. Bootstrap behaviour; listed because the brief asked about anonymous writes.

**(c) Touchpoints**
- The suggestion names another persona and carries its public face; the page of a `revealed` session with a held-back item is searched for that item's strings in `home-and-next-persona.spec.ts:369-385`.
- Publish gate: home, library, topic page and suggestion all pass `require_published`; a learner's own generated scenario is stored `published` (`src/db/repo/custom-topics.ts:333`), so the gate does not hide it.
- `buildSessionView` gained one optional input; see L2.

**(d) Patterns**: repo layer for the new query; strings in constants and in `productStrings()` (bar L3); no plan or phase number in code, test names or the commit messages.

**(f) Docs checked against code and found accurate**: `import` creates or overwrites the topic from `topic.json` (`upsertTopic`); refuses a topic file without one of five fields; `topic_id` must equal the topic's id; `validate` uses the database when connected (`cli/index.ts:60-62`); persona order by first import; `require_published` row (no chip: grid with the create card; a role chip: empty state with the create action); `publish` reads product-string states; quick-run costs and percentages match the phase 5 table (five leak flags); routes; the events line; the struck-through bootstrap deviation. Scenario public fields (`hook_line`, `topic_tag`, `sample_question`, persona fields, topic files) read in full: no real person, company, brand or product name. `drizzle/` holds 13 migrations; no schema, env or config key changed in these phases.

**(g) Public contracts**: no API response, schema, env var or config key changed. `NextStep`'s prop and `SessionView.reveal.next` are internal.

## Plan follow-ups (for the lead; no plan file edited)

- Phase 4: complete against its requirements and success criteria.
- Phase 5: files, tests and import done; "one hand-played session per persona" and "user approved the content" are still open, as the phase file says.
- Phase 6: M1 is a doc fix inside its own scope; "no open high-severity finding" holds. The count in `plan.md:82` and the phase 4 note (9 → 10, 28 → 29) need the same correction.
- Plan success criterion "No library or topic payload contains an item's content, tag, hook or sample question" can be ticked on the evidence above and the int and e2e searches.

## Unresolved questions

1. L2: is "all practised" as the fallback of `buildSessionView` intended, or should a missing suggestion make no claim?
2. L1: is a burst-proof `topic_opened` wanted, or is "one per visit for an ordinary browser" enough? The comment should match the answer.
3. L4: is `docs-evidence.test.ts` meant to fail `pnpm test` whenever content on disk and the checklist's wording drift? If yes, keep it and state that in the file; if not, keep only the path and command checks.
