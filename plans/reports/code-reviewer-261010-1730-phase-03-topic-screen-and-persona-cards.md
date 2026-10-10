# Code review: Phase 3, Topic screen and persona cards

Date: 2026-10-10. Scope: uncommitted work on `main` (31 modified, 7 new files; 579 added lines in tracked `src` and `tests` files plus about 900 new). Read-only review.

Ran: `pnpm typecheck` clean, `pnpm lint` clean, `pnpm test` 969/969 in 49 files. Not run (controller owns the database): `pnpm test:int`, `pnpm test:e2e`. Every statement below about what those suites prove is from reading them, not from a run.

Not consulted: `node_modules/next/dist/docs/` and the Next.js source (the hook denies the folder). Statements about the router's action queue, the back/forward cache and effect timing are from general knowledge of Next.js and React and are marked "not verified" where they carry a finding.

## Overall

No Critical or High finding. Every phase-3 requirement is implemented, the 404 for an unknown and a foreign topic is one code path, the action writes only for a consenting learner and a topic that learner can see, and no sealed field reaches a prop or payload. Two Medium items, both about `topic_opened`: what one "visit" means is decided by when a client component mounts, and the test named for "coming back" does not use the back button.

## Critical

None.

## High

None.

## Medium

### M1. `topic_opened` counts component mounts, with no bound on the server
`src/components/library/topic-opened.tsx:12-15`, `src/server/actions.ts:118-120`, `src/server/library.ts:93-98`

The design is sound on the points that matter: guests, un-consenting learners, demo accounts and topics the caller cannot see write nothing (checked on the server, not only by leaving the component out); the id is validated; server actions carry the Origin check; a prefetch or `router.refresh()` writes nothing because the component keeps its identity. A render-time write would be worse (the page's own refresh would count twice), and a route handler with `sendBeacon` would need its own Origin check. So the client effect calling an action is the right shape.

What it leaves open:

- **Unbounded replays.** Each call of the action is one row. A signed-in, consenting learner can loop the POST (or a script can replay it) and write any number of rows under their own id; each call costs a user lookup, a topic lookup and an insert. Same class as the role-filter press of phase 2 (L3 there), but this one fires without a press.
- **"A visit" differs by how the page came back.** A return through the app's router (breadcrumb, or the back button inside the app) mounts the component again and counts. A page restored from the browser's back/forward cache does not run effects again, so it does not count, although `RefreshOnShow` treats that same restore as "shown again" (`src/components/sessions/refresh-on-show.tsx:14-16`). The action's comment says "once per time it is shown", which the bfcache case contradicts. Whether the page is eligible for that cache depends on the browser and the response's cache headers (not verified).
- **Missed counts.** The effect runs after hydration, and the action is dispatched right after `RefreshOnShow`'s `router.refresh()`; if the router runs those one after the other (not verified), the write waits for the refresh. A learner who closes the tab or leaves by a full page load before then is not counted. Failures are swallowed, which is right for the learner and means a deploy mismatch loses events silently.
- **Development writes two rows** (already recorded in the phase file).

Simpler and safer, keeping the current code: make the write idempotent over a short window on the server. In `reportTopicOpened`, skip the insert when this learner already has a `topic_opened` row for this topic in the last N seconds (one indexed lookup on `event(user_id, name, at)`, or a `WHERE NOT EXISTS` in the insert). That bounds replays, removes the development double, and makes the number mean "visits" rather than "mounts". It changes "a reload counts" (the e2e spec at `tests/e2e/topic.spec.ts:339-341` asserts a reload is a second row), so it is a product call: see unresolved question 1. If the definition stays "each time shown", add a `pageshow` listener with `event.persisted` to `TopicOpened` so both kinds of return agree.

### M2. The event test's "coming back" is a forward click, not the back button
`tests/e2e/topic.spec.ts:343-349`

The test title says "arriving from the library, reloading, coming back". The third step clicks the breadcrumb link on Màn 3, a new navigation. No test counts events after `page.goBack()`; the back-button test at lines 281-300 checks the card only. So acceptance (b) for history navigation is unproven in either direction: a double count from a remount plus the `pageshow` refresh, or a missed count, would both pass. Add `await page.goBack()` from `/prep/chi-thu` and from a session page, then assert the count after `networkidle`.

## Low

### L1. "Bạn đã luyện k/n" disagrees with the library for a demo account
`src/app/topics/[topicId]/page.tsx:34`

The count is cards whose button is "review", that is, personas whose newest session is done. The library counts personas with any done session (`listDonePersonaIds`, `src/db/repo/library.ts:128`). Scenario: a demo account finishes chị Thu, presses "Bắt đầu buổi mới". The library card says "Đã luyện 1/1", the topic page says "Bạn đã luyện 0/1". Only demo accounts can hold two counting sessions with one persona, so no learner sees it, but demo accounts are what gets shown to people. The phase note "as the library does" is not exact. Fix: count from `listDonePersonaIds`, or accept and reword the note.

### L2. The portrait's tone is hashed from two different strings
`src/components/interview/session-bar.tsx:26`, `src/components/persona-avatar.tsx:10-14`

The interview bar passes the capitalised name ("Chị Thu"); the card, the prep screen and "Buổi của tôi" pass the stored one ("chị Thu"). The tones agree today only because upper and lower case of the usual first letters differ by 32, a multiple of 4. A form of address starting with "đ" (U+0111 against U+0110, a difference of 1) gets one colour on the card and another above the interview. Fix: pass `displayName` to the bar's avatar, or hash the lower-cased name.

### L3. Card buttons and cards carry no persona in their accessible name
`src/components/library/persona-card.tsx:39-42, 66, 92`

With phase 5 a topic has two cards, so a screen reader's link list holds "Bắt đầu" twice, and a demo account's button list "Bắt đầu buổi mới" twice. The `article` has no name. The heading inside gives context when reading in order, so this is not a failure of the criterion, only weak. Fix: `aria-labelledby` on the article pointing at the `h2`, and a visually hidden " với [persona]" in the buttons (the interview bar already uses `.sr` this way).

### L4. An initial can be a punctuation mark
`src/scenario/persona-card.ts:36-39`

`personaInitial` takes the first code point of the last word. A generated `display_name` such as "anh Dũng (IT)" or "chị Mai." gives "(" or works by luck. Authored names are slugs-checked prose; generated ones are model output. Fix: take the first letter (`\p{L}`) of the last word that has one. No test covers it.

### L5. Màn 3 still sends a learner "Về trang chủ" where the PRD now has a topic to return to
`src/app/prep/[personaId]/page.tsx:208-210`

PRD Màn 3: a pulled persona with no session shows "Nhân vật này đang được cập nhật." "kèm nút về chủ đề". The topic page exists as of this phase, and the breadcrumb was updated, but this button still goes to `/`. Not in the phase's requirement list; phase 4 rewrites the home links and is the natural place.

### L6. Phone layout of a demo card is untested, and the desktop button is 36px high
`src/app/globals.css:918, 934-935`, `tests/e2e/topic.spec.ts:155-169`

The phone test measures a guest's single button. The two-button foot of a demo card (a form and a link, each `flex:1`, wrapping) has no measurement. `.btn-card` is 36px high above 767px, so a touch tablet in landscape gets a target under 44px; the existing `.btn-md` has the same property, so this follows the repo.

### L7. The interview screen's persona payload has no key-list test
`src/server/session-view.ts:38, 137`

`SessionListItem` and `PersonaCardView` are pinned by `Object.keys` assertions; the interview `persona` gained `avatarKey` and no test names its keys (`tests/server/sealed-page-props.test.ts` checks sealed strings only, and is unchanged). The object is built field by field, so nothing leaks today.

### L8. Plan text behind the code
`plans/261010-1200-library-topic-layer-and-app-topics/phase-03-topic-screen-and-persona-cards.md:43, 50-51`

The Architecture line still describes a render-time write, and "Related code files" omits `topic-opened.tsx`, `tests/components/topic-screen.test.tsx`, and the server files changed (`library.ts`, `actions.ts`, `session-list.ts`, `session-view.ts`, both repo files). The deviation section is accurate. For the lead; no plan file edited.

## Test gaps (acceptance f)

- M2 above: no event count after the back button.
- Negative event checks (`topic.spec.ts:142-153, 352-370`, `guest.spec.ts`, `access-isolation.spec.ts`) wait on `networkidle` and then count. They cannot pass on an unread body, and for a guest and an un-consenting learner the component is not rendered at all, so the page-level tests prove the wiring; the server guard is proven separately by `reportTopicOpened` in `library.int.test.ts`. Adequate. The guest checks count every `topic_opened` row in the table, which is safe only while `workers: 1` holds (`playwright.config.ts:13`).
- Nothing calls the `topicOpened` action as an un-consenting or foreign learner with a hand-made request; the int test covers the function under it, and the action is three lines.
- The demo test (`topic.spec.ts:373-419`) branches on what the shared demo account already holds (`if (before)`), so which branch runs depends on test order. Both branches assert; neither is empty.
- "One row per visit" is asserted against a production build (`next build && next start`), which is what makes it meaningful; a development server would write two.
- No test for L1 (demo count), L2 (tone agreement across screens) or L4.
- The unit tests of the card assert links by regex over static markup; they would not notice a second link added outside `.actionbar`, since `links()` reads every anchor and the cases expect an exact list. Good.

## Verified OK

- Requirements (a): breadcrumb, role pill, "n persona", title, summary, "Bạn đã luyện k/n" (signed-in, cards > 0), exact FR-51 string (one constant, pinned in `library.test.ts` and e2e), label and button for `interviewing` / `revealed` / `replaying` / `done`, withdrawn gives "Bắt đầu" (`listSessionsForPersonas` leaves withdrawn out), demo form on every card with the main link on the newest session, pulled persona hidden (`playableStatus`), custom line with no role pill, empty state, prep breadcrumb for curated and custom, initial for a persona with no illustration.
- 404: unknown and foreign both end in `notFound()` from one null; the isolation spec compares status, `main` and title of the two answers for a visitor and a learner.
- Id guard: `custom-<uuid>` and every curated slug (`src/scenario/schema.ts:11`) match `TOPIC_ID`; the pattern has no nested quantifier over the same class, and the length is checked first.
- Callers (d): `getTopicWithPersonas` has one caller (the new page); `StartSessionButton` without `card` yields the same class set as before for all three prep uses; `PersonaAvatar` has five call sites, all passing both props; `toListItem` has one caller and its key list test was updated; `buildSessionView`'s interview branch adds one public field; `ROLE_STYLE` is an added export.
- Sealed data (c): the page, card and warning are server components; the client components receive a topic id, nothing, and three flags. `personaColumns` selects the item count only. `avatarKey` and `displayName` are public persona fields.
- `src/scenario/persona-card.ts` imports its schema as a type, so the client bundle of the interview bar gains one small function.
- Patterns (e): 404 check before the Suspense boundary, skeleton with one status line, strings in `TOPIC` and in `productStrings()`, kebab-case files, no plan ids or phase numbers in code or test names, comments state behaviour.
- CSS: every class the new markup uses exists; new rules are scoped to `.topic*`, `.pcard*`, `.av-tone-*` and `.avatar text`; mobile block gives the card buttons 44px and full width.

## Plan follow-ups (for the lead; no plan file edited)

- Phase 3 looks complete against its requirements and success criteria.
- Decide M1 before phase 6 documents the events; M2 is a test addition either way.
- L5 fits phase 4. L8 is a wording update of the phase file.

## Unresolved questions

1. M1: is `topic_opened` meant to count every showing (reload and each return included) or visits? If visits, a short server-side window is the smaller and safer design; if showings, the bfcache return should count too.
2. L1: should the topic page's count follow the library (any finished session) for demo accounts?
3. Did the controller's `test:int` and `test:e2e` runs pass? The "verified" items on events and 404 rest on them.
