# Code review: Phase 3 "Result hints instead of secrets"

2026-10-29, 20:45 to 21:00 (Asia/Saigon). Read-only review. The only file written is this report.

## Scope
- **Source reviewed:** `seal.ts`, `replay-result.ts`, `reveal.ts` (`getRevealView`), `session-view.ts` (the `scenarioItems` line), `product-strings.ts`, `next-time-hints.tsx` (new), `told-list.tsx`, `replay-offer.tsx`, `reveal-screen.tsx`, `replay-result-card.tsx`, `replay-result.tsx`, `replay-screen.tsx`, `globals.css`, and the deleted `missed-list.tsx`.
- **Tests reviewed:** the 10 test files listed in the task.
- **Consumers traced:** `src/server/replay.ts` (lines 65, 120, 274), both replay routes, `turn-request.ts`, `reveal-computing.tsx`, and the admin pages.
- **Snapshot:** the working tree at 20:47:29. `next-time-hints.tsx` and `globals.css` changed during the review (`.hint` was renamed to `.hint-body` at 20:47). Findings refer to the newer files.
- **Checks run:**
  - `pnpm typecheck`: passes.
  - `pnpm lint`: passes.
  - `vitest --project unit`: 67 files and 1273 tests pass.
  - Not run, as instructed: the int tests, the e2e tests and the build.
  - The 360 px layout was measured in Playwright Chromium on a static page using the real `globals.css`. The probe ran from the scratchpad; it did not start the app or touch the database.

## Overall
The sealing is correct. Every field that code copies into a learner payload is now gated, and tests cover each session state and each payload route. I found no leak in the code paths.

Open problems:
- one e2e test that will certainly fail;
- one piece of copy that D3 made false and that was not changed, of the same kind the phase fixed elsewhere;
- one real layout defect on mobile;
- several comments that no longer match the code.

## High

### H1. The e2e suite will fail: the hardening spec still expects the old stop-dialog sentence
- **Where:** `tests/e2e/hardening.spec.ts:322` expects `toHaveAccessibleDescription("Điều bị giữ sẽ được mở ra.")`. Phase 3 changed that text at `src/components/replay/replay-screen.tsx:246` to "Bạn sẽ không hỏi tiếp được ở lần luyện lại này." That paragraph (`#stop-consequence`) is the dialog's `describedBy`.
- **What fails:** the test "accessibility notes of the review › the skip and the stop dialogs of a replay read out what they do" goes red in the desktop project. The plan's criterion "pnpm test:e2e green" then fails. `replay.spec.ts` was updated for the new sentence; this spec was missed.
- **Fix:** change line 322 to expect the new sentence.

## Medium

### M1. The skip flow still promises to show what was held
D3 made this copy false, and it was not changed.
- **Where:**
  - `src/components/reveal/replay-offer.tsx:59`: the button "Bỏ qua, cho tôi xem luôn".
  - `src/components/reveal/replay-offer.tsx:101`: the confirm button "Cho tôi xem luôn", with the pending label "Đang mở…".
  - `src/server/replay.ts:50`: the doc comment "nothing stays sealed".
- **What happens:** the learner presses "Bỏ qua, cho tôi xem luôn", then "Cho tôi xem luôn", and sees "Đang mở…". The page then shows "1 Vẫn giữ lại" and a hint card. The UI said it would open the item, and it does not. The implementation notes fixed two lines of the same kind (the held card and the stop dialog) but missed these.
- **Fix:** the wording is the user's call, since it comes from the PRD.
  - Option 1: reword. For example "Bỏ qua, xem kết quả luôn", "Xem kết quả luôn" and "Đang chuyển…". Then update the e2e tests that find these buttons by name: `hardening.spec.ts:267-268` and `:314`, `replay.spec.ts:364-376` and `:405-406`, and `reveal.spec.ts:166`.
  - Option 2: keep the wording and read "xem" as "see the full result". Skipping does unlock the sealed comments, the habit card and the download. If so, record that reading in the phase notes.

### M2. At 360 px the hint topic is squeezed beside its pills (custom topics are worst)
- **Where:** `src/app/globals.css:559`: `.hint-topic{flex:1;min-width:0;…}`. The flex basis is 0, so the pills never wrap under the topic. The topic only gets the width the pills leave.
- **Measured at 360 px** (Chromium with the real CSS, Segoe UI standing in for Plus Jakarta Sans):

  | Hint | Topic column |
  |---|---|
  | Custom topic (fiction pill + path pill) | 41 px wide × 180 px tall, 9 lines; "những" is broken mid-word by `overflow-wrap:anywhere` |
  | Held item on the replay card (Màn 6) and Màn 7, "Kéo về một lần cụ thể" | 84 px wide, 4 lines |
  | Library hint | 148 px wide, 2 lines |

  Nothing scrolls sideways, so the 360 px test in `reveal.spec.ts` still passes.
- **Fix:** `.hint-topic{flex:1 1 12rem;min-width:0;overflow-wrap:anywhere}`. Checked in the same probe: at 360 px the topic takes the full row (296 px in the list, 232 px on the card) and the pills wrap underneath. At 1024 px nothing changes.

### M3. Generated takeaway text can still carry untold item text
This is not a Phase 3 regression and was not on the phase's list of leak paths.
- **Where:**
  - Call 2 is given the content of every missed item: `src/engine/reveal-contexts.ts:69-71` feeds the `<dieu_bo_lo>` block in `src/llm/prompts/feedback-generator.ts:57-58`.
  - Only prompt rules keep that content out of `claim.text` and `suggestedQuestion`: line 10 (no detail beyond the transcript) and line 18 (no missed content in the suggested question).
  - `toClaim` (`src/engine/seal.ts:183-192`) sends both fields to the browser in every state.
  - Nothing in code checks them, and the leak tests only use stub text.
- **What could happen:** the model paraphrases a missed item in a "heard, not followed" comment, e.g. "…chị Thu nhắc chuyện trả góp điện thoại…". Untold text then appears on Màn 6 and on the printed sheet, which breaks invariant 2.
- **Fix:** two options, both costing no LLM call. Scope HOLD (D1) applies, so this is a user decision.
  - Add a check when the reveal is assembled: drop or flag a claim whose text or suggested question contains any `secret_terms` entry of an item that was not told. `containsTerm` in `src/scenario/text-normalize` already does the matching. Phase 4 (takeaway) is the natural owner.
  - Or record this as an accepted exception to invariant 2 in the plan.

## Low

- **L1. Comments that now describe the removed behaviour.** A maintainer could read them and restore the leak. Each needs a one-line update:
  - `src/server/replay.ts:50`: "nothing stays sealed".
  - `src/server/replay.ts:58`: "The answer carries what was held, which is now unsealed".
  - `src/app/api/sessions/[id]/replay/route.ts:12-16`: "its page shows what was held … no longer sealed".
  - `src/server/replay-outcome.ts:22-25`: "It holds the target's content…".
  - `src/engine/reveal-types.ts:139`: "nor listed as missed until the replay has ended".
  - `src/engine/reveal-types.ts:190`: `sampleItemId` "whose sample question is shown instead". The field is still written but never read.
  - `src/components/reveal/two-numbers.tsx:8-11`: `heldOpen` now means "the replay opened it".
- **L2. Dead CSS.** `.ring` and `.ring::after` (`globals.css:180-181`) were used only by the deleted `MissedList`.
- **L3. Items the learner heard in the replay are still hints, and still counted as untold.**
  - A partial replay's other item is shown on the card ("Bạn mở được một điều khác: {content}").
  - It is still `missed` in `reveal_json`. So it is counted in "Còn N điều khác … chưa kể", and if it weighs enough it is listed as "Thử hỏi về: {topic}" right under the card.
  - The same applies to any extra item a replay opened.
  - This is not a leak, but the copy contradicts itself.
  - Fix (product call): either leave out the items the replay judge confirmed as told, or keep them (the hints serve a retry from scratch, where those items are untold again) and soften `HINTS.more`.
- **L4. The replay-result hint has no fiction label.** `replay-result.tsx:33` and `:113` render `HintBody` without `fictional`. The Màn 6 list labels every hint of a custom topic, citing the PRD rule in the implementation notes. Fix: pass `custom` through `ReplayResultCard` and `ReplayScreen`; the session view already carries it.
- **L5. Accessibility.**
  - Up to four buttons on one screen are named "Xem câu hỏi gợi ý": three hints plus the replay card (`next-time-hints.tsx:71`). A screen-reader button list cannot tell them apart. Add `aria-describedby` pointing to the topic `<p>`, using `useId`.
  - There is an `<h2>` inside `<summary>` (`told-list.tsx:15-16`). This is valid HTML, and the region still gets its name. But some browser and screen-reader pairs expose `summary` as a button and drop the heading inside it, so it may not show up in heading navigation. Accept this, or move the h2 out of the summary.
- **L6. `getRevealView` loads more than it needs.** `src/server/reveal.ts:203` loads the whole replay (the branch, every replay turn and every snapshot of the session) only to read `fallbackLevel` and `result`. That is fine at the current scale; a select of those two columns would be enough.
- **L7. Copy.**
  - `HINTS.more` ends with "Luyện lại để tìm ra.". In offer mode this line sits right under "Quay lại lượt N", and that replay can only open one item. "Luyện lại" is used both for the replay and for the retry from scratch.
  - In offer mode, "Còn N điều khác … chưa kể" leaves out the held item.
  - Suggestion: "Luyện lại từ đầu để tìm ra.", and include these lines in the Phase 6 string check.
- **L8. Deploy skew.** The `outcome` shape changed in the answers of `POST /replay` (stop) and `/replay/turns`.
  - A learner on Màn 7 still running the bundle from before the deploy receives `outcome.hint`.
  - The old `HeldItem` reads `outcome.target.content`, so the client throws a TypeError. A reload fixes it.
  - To avoid it, turn on Vercel Skew Protection or deploy off-peak.
- **L9. `BrowserReveal.replay.target` has no reader.** Only `ReplayOutcome.target` is rendered. Since `replay.target` is now set only on success, it duplicates the outcome. Optional: drop it, which leaves less data to keep sealed.
- **L10. Tests.**
  - The step comments in `reveal.spec.ts:186-224` still follow the old order: "5." appears twice, and the takeaway is still "6.".
  - `NextTimeHints` has no component test. Two behaviours are covered only by e2e: the count line is hidden when 3 or fewer items are missed, and nothing renders when there are no hints.
  - Resending the turn that ended a replay without success (`replay.ts:107-121`) is covered only because it uses the same `replayOutcomeOf`.
- **Ops note (no code change).**
  - Product strings feed the publish gate of every persona (`src/server/scenario-review.ts:50-53`, rule `strings_checked`).
  - These strings stay unchecked until Phase 6's paid check:
    - the new keys `path_tip.*`, `hints.*` and `told_summary`;
    - the changed `home_sample.missed_kind` and `home_sample.missed_item`.
  - Until then, `il publish` refuses every persona version.

## Fixed during the review
- **`.hint` class collision.** In the version handed over, `HintBody` used `className="hint"`. That also matched two existing global rules: `globals.css:272` (12 px font in the outline colour) and `:365` (`align-items:center; justify-content:center; margin-top:12px`). As a result the hint rows shrank to their content (410–582 px wide) and sat centred in an 824 px list.
- The class was renamed to `.hint-body` at 20:47. None of the other new classes (`hint-*`, `hints`, `told`, `told-chev`, `rr-held`) collide with existing rules.

## Verified OK
1. **No untold text in learner payloads**, for every field that code copies:
   - **What `toBrowserReveal` sends:**
     - `toldItems` holds told items only (`seal.ts:230`).
     - Each hint holds only topic, path, sampleQuestion, hook and trustTurns, never content (`:203-211`).
     - A note's `itemContent` is set only for a told item, or for the target once the replay opened it (`:142-150`).
     - `replay.target` is set only on success (`:200`, `:228`).
     - `replay.none` carries no sample question (`:223`).
   - **Page and API agree:** the page props and `GET /reveal` both go through `toBrowserReveal` with the same `replaySucceeded` (`session-view.ts:180-187`, `reveal.ts:203-211`). The int tests assert that the page's reveal equals the route's reveal.
   - **Replay answers:** the stop answer (`replay.ts:65`), the resend (`:120`) and the ending turn (`:274`) all go through `describeReplay`.
     - A primary replay that did not succeed returns the target as a hint.
     - A partial replay's `otherItem` is an item the learner heard.
     - A fallback 1 replay returns a hint for an item that was never opened.
   - **Other learner routes:** transcripts, the session list, progress and download carry no item text.
2. **While the replay is ahead:**
   - The target's state is `held`, never `missed`, so it is neither a hint nor in the told list.
   - Its note is plain text, and `recognized` leaves it out.
   - `trustTurns` is filtered by the sealed turns.
   - `replaySucceeded` is ignored unless the session is `done` (tested).
3. **Hints:**
   - At most 3, sorted by weight (highest first) with a stable sort that keeps scenario order on ties.
   - Their keys are tested exactly; no weight and no ids are sent.
   - The count line is `missed − hints` (`next-time-hints.tsx:99`).
   - The React key `topic` is unique because duplicate tags are rejected (`validate.ts:186-196`, `topic_tag_duplicate`).
4. **Notes:** `NotesReview` already renders `.cv-item` only when the item text is present.
5. **`ReplayOutcome`:** the union matches the spec, and the success shape is unchanged.
6. **Màn 6:**
   - The section order matches D6 (`reveal-screen.tsx:57-76`).
   - The sample question sits behind a button with `aria-expanded`.
   - The told list is a `<details>`, not rendered when nothing was told; its `summary` works from the keyboard natively.
   - Icons are `aria-hidden`, and all learner and persona text is rendered as text nodes (the hostile-markup test passes).
7. **Other invariants:**
   - No new LLM call.
   - The `reveal_json` format is unchanged (`sampleItemId` is still written).
   - `describeReplay` reads the scenario, not `reveal_json`.
   - Caveat outside this phase: `/progress` already computes numbers from `reveal_json` without going through `seal.ts`.
8. **Consumers:**
   - Typecheck is clean.
   - These still work:
     - `turn-request.ts`;
     - both replay routes;
     - `ReplayScreen` (its `unlocked` narrowing);
     - the poller, which reads only `ready`;
     - the admin pages, which import neither `seal` nor `replay-result`.
   - Removed strings and classes have no references left.
   - The home-sample guard holds: `findSealed` checks topic tags, sample questions and secret terms.
9. **Implementation-note deviations:** all are reasonable.
   - Hints are the missed items only, with a count line.
   - The no-replay block is removed, and the fallback hint is hidden on the Màn 6 card. The note says that item is "almost always the first hint"; that holds whenever the heaviest untold item is still locked.
   - `getRevealView` loads the replay so that the route and the page agree.
   - The label changes are fine.
   - The list of copy fixes is incomplete (see H1 and M1).

## Recommended actions
1. Fix `hardening.spec.ts:322` (H1).
2. Decide the skip wording (M1). If it changes, update the four specs that find those buttons by name.
3. Add a flex basis to `.hint-topic` (M2).
4. Decide where M3 belongs: a code check in Phase 4, or a documented exception.
5. Update the stale comments and remove `.ring` (L1, L2).
6. Then run the full int and e2e suites.

## Metrics

| Check | Result |
|---|---|
| Typecheck | 0 errors |
| Lint | 0 issues |
| Unit tests | 67 files, 1273 tests pass |
| Int / e2e | not run (database in use, as instructed) |
| Coverage | not measured |

## Unresolved questions
1. M1: should the skip wording change, or stay with "xem" meaning "see the full result"?
2. L3: should items told in the replay be left out of the hints and the count?
3. M3: should the generated takeaway be accepted as a documented exception, or get a secret-term check in Phase 4?
4. Does iOS Safari lay out `summary.sec-h` as flex, with the heading and chevron on one line? I could not verify this here.
5. The `.hint` → `.hint-body` rename landed during the review. Does the file now reflect final intent?
