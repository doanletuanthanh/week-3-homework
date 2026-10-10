# Code review: Phase 2, Library screen and role filter

Date: 2026-10-10. Scope: uncommitted work on `main` (9 modified, 7 new files, about 300 changed lines in tracked files plus about 800 new). Read-only review.

Ran: `pnpm typecheck` clean, `pnpm lint` clean, `pnpm test` 941/941 in 48 files. Not run (controller owns the database): `pnpm test:int`, `pnpm test:e2e`. Every statement below about what those suites prove is from reading them, not from a run.

Not consulted: `node_modules/next/dist/docs/` (the scout-block hook denies it and I did not work around it). Next.js claims were checked against nextjs.org docs for 16.4.0 instead (`revalidatePath`, data-security guide), one minor version ahead of the installed 16.3.8.

## Overall

No Critical or High finding. The action parses a closed set, reads no redirect target, writes nothing for an anonymous or unconsenting caller, and nothing sealed is rendered. Four Medium items: one design gap in the filter precedence, one missing sweep, one release step, one loose test.

## Critical

None.

## High

None.

## Medium

### M1. A filter cleared on the account comes back from an old cookie in another browser
`src/app/library/page.tsx:29`, `src/server/role-filter.ts:13-17`, `src/server/actions.ts:105-109`

`user.roleFilter ?? cookie` cannot tell "never chose" from "cleared": both are null. The action writes the cookie for signed-in learners too, so every browser they used keeps a copy.

Scenario: browser A, signed in, press BA (column `ba`, cookie A `ba`). Browser B, same account, press BA again to clear (column null, cookie B deleted). Back on A: column null, falls back to cookie A, the library shows BA and its empty state again. Pressing there to clear writes a second `{role: null}` event.

Same root, two more effects:
- After sign-out the cookie stays, so the next guest or account on that browser sees the previous learner's role (the `signOut` action at `src/server/actions.ts:45` does not touch it).
- The library can show a filter the account does not hold (guest choice kept after sign-in, asserted at `tests/e2e/library.spec.ts:287-297`). Phase 4's `pickNextPersona` reads `roleFilter` from the account, so the two screens will disagree.

This follows the plan's architecture line literally; the gap is in the plan. Options:
1. For a consenting learner the account is the only source: read `user?.noticeAcked ? user.roleFilter : cookie`, and have the action delete the cookie instead of setting it for them. Cost: a guest's choice no longer shows after sign-in (the test at line 287 changes).
2. Keep the fallback, delete `il_role` in `signOut`, and accept the cross-browser case.
Needs a product decision; see unresolved questions.

### M2. The library never closes a dead generation attempt, so a card can say "Đang chuẩn bị" for nothing
`src/app/library/page.tsx:30-33`

`/my-sessions` calls `sweepStaleAttempts` before listing (`src/server/session-list.ts:71`) precisely so that "the list never shows Đang chuẩn bị for something nobody is preparing", and continues a due attempt with `after(runGeneration)`. The library lists `listOwnCustomTopics` without either. A learner whose runner died sees a spinner on the card until they open the session or "Buổi của tôi"; the two lists disagree meanwhile.

Fix: `if (user) await sweepStaleAttempts(db, user.id)` before the queries (one statement, signed-in only). Whether the library should also resume a due attempt is a scope call; the card already links to Màn 11, which does.

### M3. Thirteen new product strings block `il publish` for every persona until checked and approved
`src/strings/product-strings.ts:180-193, 231-232`; `cli/commands/publish.ts:21-24`

Answer to the touchpoint question: existing approvals are untouched (rows are keyed by key and text hash, and no existing text changed). The 4 `role_label.*` and 9 `library.*` keys start as "chưa kiểm", and `checkPublishGate` reads every product string, so `pnpm il publish <persona>` fails for all personas on each database until `pnpm il check-strings product` (13 model calls) and `pnpm il approve-strings product` are run there. Personas already published stay published and nothing at runtime reads approvals, so the strings also ship unapproved if nobody runs it: CI (`.github/workflows`) has no string step, and PRD line 332 ("Chuỗi cấp sản phẩm đổi thì phải duyệt lại trước khi deploy") is process only.

Action: add the two commands to the plan's user tasks (phase 6 or the deploy step). Minor: sending "UX", "BA", "PM", "Khác" through a real-user-claim model check costs four calls for no information; acceptable if the rule is "every string in that file".

### M4. The sealed-content test passes when it reads nothing
`tests/e2e/library.spec.ts:97-108`

`sent.push(await response.text().catch(() => ""))`: a body that cannot be read becomes `""`, which contains no sealed string. If every read failed the test would still pass with four empty bodies. The handler is also async, so a body still streaming when the loop runs is not checked at all (the `>= 3` of 4 expected leaves that room on purpose, but silently).

Fix: drop the `.catch`, collect the promises and `await Promise.all` before asserting, and assert each body contains the topic title so an empty body fails.

## Low

### L1. The action re-renders in place instead of redirecting; before hydration this is a POST page
`src/server/actions.ts:105-109`

Every other action in the file ends in `redirect`. Here a native submit (the pre-hydration path the e2e test proves) answers the POST with the page itself: reload asks to resubmit the form and the history entry is a POST result. The spec sidesteps it with `page.goto("/library")` at line 235 rather than `reload()`. A constant `redirect("/library", RedirectType.replace)` would give post-redirect-get; check that it does not add a history entry per press with scripts on before adopting it.

### L2. `RefreshOnShow` renders the public page twice per visit
`src/app/library/page.tsx:40`, `src/components/sessions/refresh-on-show.tsx:13`

It calls `router.refresh()` on mount, so each view runs `getUser` and all queries twice, now also for guests. For a guest nothing on the page changes between visits. Suggest `{user && <RefreshOnShow />}`.

### L3. A press that changes nothing still writes an event
`src/server/library.ts:77-83`

A repeated POST with the same role (double click, replay, a script) writes one `role_filter_selected` row each time, unbounded for a signed-in consenting learner. Same posture as other per-press events in the repo, so not a regression. Skipping the write when `role === user.roleFilter` keeps the metric to real changes.

### L4. State labels copied a third time; visible strings outside the check
`src/components/library/custom-topic-card.tsx:14,18,20`

"Đang chuẩn bị" and "Chưa qua kiểm tra" now exist in `session-row.tsx`, `sessions/[id]/page.tsx` and here; the plan said to reuse. Also inline and unchecked: "Thư viện", "{n} chủ đề", "1 persona", "tạo …", "Lọc theo vai trò", "Đang tải Thư viện". This matches the repo's habit for interface chrome, so only the duplication is worth acting on.

### L5. `toOwnTopicCard` turns a withdrawn session into a playable card
`src/server/library.ts:101-113`

`STATE_OF.withdrawn` is neither "preparing" nor "failed_eval", so it maps to `playable` with a `/topics/…` link. Unreachable today because `listOwnCustomTopics` filters withdrawn rows; the type allows it and no test pins it. Narrow the input type or handle it.

### L6. Smaller test gaps
- `tests/e2e/library.spec.ts:206`: "reached and pressed with the keyboard alone" uses `.focus()`, which proves activation, not that Tab reaches the chips.
- `tests/server/library.int.test.ts`: "together or not at all" (the transaction) and the call with `db` already a transaction are claimed in the comment and untested.
- The spec assumes exactly one curated topic ("1 chủ đề", two tiles, "Đã luyện 0/1", BA and PM empty). Fine while the test database is seeded from chị Thu alone; it breaks the day phase 5 content reaches the seed.
- No test for M1's cross-browser case or for sign-out.

### L7. No topics and no chip: the grid is the create tile under "0 chủ đề"
`src/app/library/page.tsx:36`. Pinned by the publish-gate test. PRD is silent; noting it as a product call.

## Judgement on the listed implementer choices

- Unconsenting signed-in learner treated as a guest for writes: agree. It matches "nothing written before Màn 0", is tested at both levels, and the cookie is a functional first-party preference.
- Skeleton kept, "works with JavaScript off" narrowed to "works before the bundles load": agree. Any Suspense boundary (including `loading.tsx`) needs the inline swap script, so the two plan lines contradict each other. No cheap robust way to have both: dropping the boundary loses the PRD's standard loading state; a `<noscript>` style that reveals React's hidden stream segment depends on React's internal markup and shows the content outside `main`. Recommend amending the plan line and listing it under deviations. The test's name is honest about what it proves.
- "Đã luyện 0/n" for every signed-in learner: fine, follows the PRD wording.

## Verified OK

- Closed-set parse: `parseRoleFilter` returns null for files, objects, wrong case, padded values; hand-written cookie values are ignored on read.
- No open redirect: the action reads no path from the request.
- CSRF: server actions are POST only with an Origin against Host / X-Forwarded-Host check (nextjs.org data-security guide); worst case of a forged request is a changed filter.
- Cookie flags match `il_pending` and `il_entered`: httpOnly, SameSite=Lax, Secure in production, path `/`, one year.
- Anonymous caller writes no row: `chooseRoleFilter` writes only under `user?.noticeAcked`; database write precedes the cookie, so a failed write leaves no cookie.
- Sealed data: all library components are server components; only rendered text reaches the payload. `listCuratedPersonas` selects the item count, never items.
- Custom titles go through React text nodes (the `<b>` test at spec line 392); `listOwnCustomTopics` filters on `ownerUserId`.
- Stale `getUser()` after the action: the learner test at spec lines 252-259 would fail on a memoised user (PM to UX, then UX cleared), so a passing e2e run proves it.
- Nested transaction: drizzle opens a savepoint when `db` is a transaction; `Executor` types both.
- Demo account: column written, event skipped by `recordEvent`.
- `clockOf`: UTC+7, h23, midnight "00:00", same formatter style as `dayOf`.
- Public contracts: additions only (`chooseRoleFilter`, `toOwnTopicCard`, `OwnTopicCard`, `clockOf`, `ROLE_LABEL`, `LIBRARY`, `LibrarySkeleton`, `PlusIcon`, `selectRoleFilter`, cookie `il_role`). No schema, env or API response change.
- CSS: `.fchip`, `.tcard`, `.mk-tile`, `.lib-*` are used only by the library; the new rules add hover, focus and mobile height and override nothing in use. The duplicate `.steps` and `.hint` rules are older and untouched. `.chips` is shared with the custom-topic form and unchanged.
- Accessibility: `aria-pressed` on each chip, named group, h1 then h2 then h3, focus rings added, every role colour beside its label, reduced motion covered for the spinner.
- `revalidatePath("/library")` with a literal path needs no type argument; in a server function it updates the page being viewed. It also marks previously visited pages for refresh, harmless here.
- Success criteria: guest 200 and artboard order, persistence, events per signed-in choice, sealed check and CSP are each covered by a test in `library.spec.ts` (CSP there rather than in `hardening.spec.ts`).

## Plan follow-ups (for the lead; no plan file edited)

- Phase 2 looks complete against its requirements, with the JavaScript-off line to be reworded as a recorded deviation.
- Add the string check and approval commands to the user tasks (M3).
- Decide M1 before phase 4 builds on `user.roleFilter`.

## Unresolved questions

1. M1: should the account be the only source for a consenting learner, or should the cookie fallback stay with the cookie cleared on sign-out?
2. M2: should the library also resume a due generation attempt, or only close dead ones?
3. Did the controller's `test:int` and `test:e2e` runs pass? Several "verified" items rest on them.
