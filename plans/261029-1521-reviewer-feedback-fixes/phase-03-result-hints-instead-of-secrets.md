---
phase: 3
title: "Result hints instead of secrets"
status: completed
priority: P1
effort: "2d"
dependencies: [2]
---

# Phase 3: Result hints instead of secrets

## Overview

Fix F4. The result screen (Màn 6) stops listing every untold item. It shows what the learner heard, up to three hints for next time, and one count line for the rest. Untold item text never leaves the server, so a retry (phase 2) still has something to find.

## Context

- Reviewer p.2–3: "Đã kể 2" + "Bỏ lỡ 9" with full item texts and path pills. Three reasons: too much at once; a list gives no value; it spoils the scenario for the next run.
- Path: `src/server/session-view.ts:170-205` → `toBrowserReveal` (`src/engine/seal.ts`) → `RevealScreen` (client component: every prop lands in the page payload).
- Untold text reaches the browser in five places today:
  1. `missedItems[].content` (+ `sampleQuestion`) → `MissedList`.
  2. `notes[].match.itemContent` for `unconfirmed` / `unrevealed` → `NotesReview` `.cv-item`.
  3. `replay.target.content` in `done` mode (seal; no component reads it, the payload still carries it).
  4. `ReplayOutcome.target` (`content`, `sampleQuestion`) of a primary replay that did not open it (`describeReplay`, `src/engine/replay-result.ts`) → `ReplayResult` `HeldItem`. Built by `replayOutcomeOf` and sent from three places in `src/server/replay.ts`: `stopReplay` (line 65, the "Dừng" answer of `POST /api/sessions/[id]/replay`, `route.ts:31`), line 120, and the third-turn answer (line 274, `POST /api/sessions/[id]/replay/turns`); and on Màn 6 `done` via `session-view.ts:172`.
  5. `replay.sampleQuestion` when there is no replay → `ReplayOffer` "Câu hỏi mẫu"; `ReplayOutcome.sampleQuestion` for fallback1.
<!-- Updated: Validation Session 1 - verification found the stop route and replay.ts call sites -->

- Hint data lives in the scenario, not in `reveal_json`: `topic_tag`, `weight`, `path`, `sample_question` (`src/scenario/schema.ts:20-28`). `RevealItem` has `id, content, path, state, toldTurn, sampleQuestion, hook, trustTurns`. The session view has `scenario.content` of the session's own version, so old reveals work unchanged.
- Topic tags are short noun phrases (71 curated items), e.g. "lần ghi chi tiêu gần nhất", "cảm giác khi xem lại số đã chi", "tiền gửi về nhà".
- Admin session pages read `reveal_json` directly: unaffected.
- Home sample (`src/components/home/sample-result.tsx`, `HOME_SAMPLE`) draws the old "Bỏ lỡ" card.

## Requirements

- Functional
  - No learner payload, in any session state, contains the text of an item not told in the main interview. Exception: the replay target once the replay opened it (the learner heard it).
  - `hints`: up to 3 untold items, by `weight` desc then scenario order. Untold = `missed`, plus the replay target once the session is `done` and the replay left it closed. Each: `{ topic, path, hook, trustTurns, sampleQuestion }`. `hiddenMore` = untold count − hints.
  - While the replay is ahead (`offer`), the target stays out of hints; sealed turns are filtered as today.
  - Notes review keeps its four labels; `itemContent` only for `told`.
  - Replay result (Màn 7 end, Màn 6 card): success unchanged; otherwise the target as a hint, never its text. Fallback1 / no replay: the most important untold item as a hint instead of a bare sample question.
  - Order and density on Màn 6: numbers → replay → Mang về → Gợi ý cho lần luyện sau → Đã khai thác (collapsed, count in the summary) → Ghi chú → Bước tiếp theo.
  - The persona-specific sample question shows only after "Xem câu hỏi gợi ý" is pressed.
<!-- Updated: Validation Session 1 - user confirmed the new order and the tap-to-show sample question -->

- Non-functional: no LLM call; `reveal_json` format unchanged; disclosure widgets keyboard-usable with `aria-expanded`; learner/persona text as text nodes only.

## Architecture

```
session-view: itemMeta = Map(id → { topic: topic_tag, weight, path, sampleQuestion }) from scenario.content.items
toBrowserReveal({ status, guess, canvasText, reveal, replaySucceeded, itemMeta })
  ├─ toldItems            text kept (heard)
  ├─ hints[≤3], hiddenMore no text
  ├─ notes                itemContent only for told
  └─ replay none          { level: "none", hint: BrowserHint | null }
describeReplay (pure)     primary: success → target { content, sampleQuestion }
                                   else    → target { hint: BrowserHint }
                          fallback1        → hint: BrowserHint | null (was sampleQuestion)
```

```ts
type BrowserHint = {
  topic: string;          // topic_tag
  path: UnlockPath;
  sampleQuestion: string; // shown only after "Xem câu hỏi gợi ý"
  hook: { turn: number; personaText: string; next: { turn: number; learnerText: string } | null } | null;
  trustTurns: number[];
};
```

Strings (`src/strings/product-strings.ts` + `productStrings()`):
- `HINTS = { title: "Gợi ý cho lần luyện sau", ask_about: "Thử hỏi về: {topic}", show_question: "Xem câu hỏi gợi ý", hinted: "Lượt {turn}, {persona} đã gợi:", asked_next: "Bạn hỏi sang:", more: "Còn {count} điều khác {persona} chưa kể. Luyện lại để tìm ra." }`
- `PATH_TIP`: follow_up "{Persona} sẽ gợi mở trước. Hỏi tiếp ngay vào câu đó."; past_story "Kéo {persona} về một lần cụ thể đã xảy ra."; trust "{Persona} chỉ kể khi đủ tin bạn. Tránh câu phán xét hay dẫn dắt."; surface "Hỏi thẳng vào chuyện này là {persona} kể."
- `TOLD_SUMMARY = "Bạn đã khai thác được {count} điều"`.
- `HOME_SAMPLE.missed_kind` → "Gợi ý · Hỏi tiếp chi tiết"; `missed_item` → a fictional ask, e.g. "Thử hỏi về: cách giữ mức tiêu mỗi tuần". No test guards this today (`tests/components/next-step-and-home.test.tsx` only checks the strings are registered): add an assertion that it equals no library `topic_tag` and contains no library `secret_terms`.
<!-- Updated: Validation Session 1 - corrected a false claim about an existing secret-terms test -->

- Delete `REPLAY_RESULT.held_back` / `opening_question` if unused after the change.

## Related Code Files

- Modify: `src/engine/seal.ts`, `src/engine/replay-result.ts`, `src/server/session-view.ts`, `src/server/reveal.ts` (`getRevealView`, line ~201, behind `GET /api/sessions/[id]/reveal`: pass `itemMeta`), `src/server/replay.ts` and `src/app/api/sessions/[id]/replay/route.ts` + `src/app/api/sessions/[id]/replay/turns/route.ts` (outcome types only; they inherit the new shape from `describeReplay`), `src/components/reveal/reveal-screen.tsx`, `src/components/reveal/told-list.tsx`, `src/components/reveal/notes-review.tsx`, `src/components/reveal/replay-offer.tsx`, `src/components/replay/replay-result.tsx`, `src/components/home/sample-result.tsx`, `src/strings/product-strings.ts`, `src/app/globals.css` (hint styles reuse `.li`, `.exp`, `.ctx`, `.msg`)
- Create: `src/components/reveal/next-time-hints.tsx` (exports `HintBody` for reuse in replay result and no-replay block)
- Delete: `src/components/reveal/missed-list.tsx`
- Tests: `tests/engine/seal.test.ts`, `tests/engine/replay-result.test.ts`, `tests/server/sealed-payloads.int.test.ts`, `tests/server/replay-page-props.test.ts`, `tests/e2e/reveal.spec.ts`, `tests/e2e/replay.spec.ts`, `tests/components/next-step-and-home.test.tsx`

## Implementation Steps

1. Seal: build `hints`/`hiddenMore` from `reveal.items` + `itemMeta`; drop `missedItems`; null `itemContent` unless `told`; `replay.none` carries `hint`; drop `replay.target` text unless `replaySucceeded`.
2. `describeReplay`: non-success primary → `target.hint`; fallback1 → `hint`. Types follow in `src/server/replay.ts`, both replay routes, `ReplayScreen` and `src/components/interview/turn-request.ts`.
3. Plumb `itemMeta` into both callers of `toBrowserReveal`: `session-view.ts` (has `scenario.content`) and `server/reveal.ts` `getRevealView` (load the session's scenario version if it does not already).
4. Components: `NextTimeHints` (≤3 rows: "Thử hỏi về: {topic}", path pill, `PATH_TIP`, hook bubbles, trust line, "Xem câu hỏi gợi ý" toggle; footer `HINTS.more`; not rendered when nothing is untold); `ToldList` as `<details>`; `NotesReview` `.cv-item` only when present; `HeldItem` → `HintBody`; `ReplayOffer` none-case → `HintBody`; `RevealScreen` new order.
5. Home sample strings and card wording.
6. Read all 71 curated tags in "Thử hỏi về: {topic}" once; adjust the template, not the tags (tags drive routing and eval).
7. Tests:
   - `seal.test.ts`: for `offer` and `done`, `JSON.stringify(payload)` contains no `content` of any untold item (pattern of `sealedStringsOf`); hints ≤ 3, sorted by weight; `hiddenMore`; notes `itemContent` only for told; target text only with `replaySucceeded`.
   - `replay-result.test.ts`: fail/partial/stopped/skipped primary outcome has no target text.
   - `sealed-payloads.int.test.ts`, `replay-page-props.test.ts`: same checks on page props and API answers, including the "Dừng" answer (`stopReplay`) and the third-turn answer of a primary replay that failed.
   - `next-step-and-home.test.tsx`: the new `HOME_SAMPLE` guard above.
   - e2e `reveal.spec.ts`: payload key list (line ~320) updated; "Gợi ý cho lần luyện sau" ≤ 3 items, toggle shows the sample question, count line; told list opens from its summary. `replay.spec.ts`: a failed replay shows a hint, not the item text.
8. `pnpm test && pnpm test:int && pnpm test:e2e`.

## Todo

- [x] Seal + `describeReplay` reshaped
- [x] `itemMeta` plumbing (as `scenarioItems`)
- [x] `NextTimeHints`, collapsed told list, notes, replay result, no-replay block, order
- [x] Home sample
- [x] Tag wording check (all 71 read in "Thử hỏi về: {topic}"; template kept)
- [x] Unit, int, e2e tests

## Success Criteria

- [x] Leak tests green for every session state and every payload route: page props, `GET /api/sessions/[id]/reveal`, the replay "Dừng" answer and the third-turn answer
- [x] Màn 6 of the reviewer's scenario (2 told, 9 missed) shows 3 hints + "Còn 6 điều khác…" and no untold text (manual on local build, stub)

## Risk Assessment

- Some tags point hard at their secret ("vay mượn và nợ"); accepted under D3. Trust items still need openness to open.
- Surface items get easy once their topic is known; weight 1 mostly, so usually outside the top 3.
- Learners who liked the full list lose it; the takeaway and hints carry the lesson. Revisit only with learner evidence.
- Notes labels "Chưa xác nhận" / "Chưa từng lộ ra" still confirm a guess matched something hidden, without its text. Accepted: the note is the learner's own.

## Security Considerations

Strictly less sealed data reaches browsers. Keep `seal.ts` the only path; payload leak tests are the guard.

## Implementation notes (2026-10-29)

Deviations, each to show one item once and keep "≤ 3 hints" true:
- The hint list is the missed items only, never the replay target: after the replay the target is the replay card's hint (Màn 6) or the end of Màn 7, so it is not listed twice. `hiddenMore` is not sent; the screen counts `missed − hints`.
- No-replay block removed (`replay.none` is `{ level: "none" }`): its item, the heaviest locked one, is almost always the first hint. A leading-question replay's hint shows on Màn 7 but not on the Màn 6 card (`ReplayResult resultCard`), for the same reason.
- `getRevealView` loads the replay of a `done` session to pass `replaySucceeded`, so `GET /api/sessions/[id]/reveal` and the page send the same reveal (it never knew; under D3 it would have withheld text the page shows).
- Copy made false by D3, changed in components (not product strings): held card "Mở ra sau khi bạn luyện lại hoặc bỏ qua." → "Luyện lại để thử mở nó."; stop dialog "Điều bị giữ sẽ được mở ra." → "Bạn sẽ không hỏi tiếp được ở lần luyện lại này."; tally and Màn 7 pill "Đã mở niêm phong" → "Vẫn giữ lại" (lock icon) when the replay did not open the target.
- Hint labels follow the old message layout (turn link on the right): `hints.hinted` "{Persona} đã gợi", `hints.asked_next` "Bạn hỏi ngay sau" ("Bạn hỏi sang" assumed a change of topic, often untrue). Removed: `trust_missed.not_enough` (`path_tip.trust` says it), `replay_result.opening_question`.
- Told list: `<details>`, not rendered when nothing was told. Hints of a custom topic carry "chi tiết hư cấu" (PRD: every reveal item of a custom topic is labelled).
- Home sample guard: `tests/components/next-step-and-home.test.tsx` "gives away nothing a persona of the library holds" already runs `findSealed` (topic tags, sample questions, secret terms) on the rendered sample; the new wording passes it, so no new test.

Review (`plans/reports/code-reviewer-261029-2045-phase-03-result-hints.md`) follow-ups:
- Fixed: stale stop-dialog text in `tests/e2e/hardening.spec.ts`; `.hint` collided with two existing global rules (renamed `.hint-body`); hint topic squeezed at 360 px (`flex:1 1 12rem`); stale comments; dead `.ring`; question buttons described by their topic (`aria-describedby`); count line names the retry ("Luyện lại từ đầu để tìm ra.", the replay only targets one item).
- User decision 2026-10-30: skip wording → "Bỏ qua, xem kết quả luôn" / "Xem kết quả luôn" (a skip shows the result with a hint, not the held item).
- User decision 2026-10-30: the takeaway generator still receives untold item text (`reveal-contexts.ts` `missedItems`), so a comment can repeat it. Fixed in phase 4 (topic tags instead of item text, plus a code check that drops a claim containing a secret term of an untold item).
- Left as is (low): an item heard in a partial replay can still show as a hint; the replay card's hint carries no fiction label on a custom topic (it had none before); a Màn 7 page loaded before the deploy breaks on the new outcome shape until reloaded (deploy at a quiet hour); `BrowserReveal.replay.target` has no reader (kept per plan).

For phase 6:
- Strings to check (paid): `path_tip.*`, `hints.*`, `told_summary`, `home_sample.missed_kind`, `home_sample.missed_item`.
- Docs: the PRD (`_bmad-output/.../prd.md`) still describes the missed list, the no-replay sample question and the stop dialog's "mở ra"; the design artboards (`docs/design/artboards/Reveal*`, `ReplayFail`, `ReplayStates`, `Main`) show the old copy. Both are design records: note them, do not redraw.

Gate 2026-10-30: typecheck, lint, unit 1273/1273, int 677/677, e2e 331/331 (after folding the told list in `library-path.spec.ts` and `my-sessions.spec.ts`), build green. Manual check on a local build with the stub: 3 hints + "Còn 5 điều khác…", question shown on tap, held item as a hint in the replay card, layout fine at 360 px.
