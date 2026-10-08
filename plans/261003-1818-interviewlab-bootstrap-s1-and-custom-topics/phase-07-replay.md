---
title: "Phase 7: Replay"
status: in-review
phase: 7
priority: P1
effort: "2.5d"
dependencies: [6]
---

# Phase 7: Replay

## Overview

The three-turn replay branch from the missed moment, through the same gate plus a judge after each reply, its results, unsealing, and Màn 6 in done mode.

## Context links

- PRD Màn 7, Màn 6 done mode, §9.3–9.7, FR-23–27, FR-41; §12.2 item 5. Addendum §2.6. Artboards: `Replay`, `ReplaySuccess`, `ReplayFail`, `ReplayStates`, `Review`.

## Requirements

- [x] Branch starts from a copy of the snapshot at the fork, with verdicts of turns ≤ fork; nothing after the fork and no canvas in any context.
- [x] Exactly 3 turns, each = Call 1 + Call 2 + replay judge. The verdict comes only from the judge; `prev_turn_verdict` in Call 1's output is ignored on this branch.
- [x] The target item's hook stays pickable for all 3 turns; when several items qualify, the target opens first.
- [x] Results per §9.5: success, partial, fail, stopped, skipped; fallback 1 success = 3 non-leading turns with ≥ 1 good label.
- [x] One replay per session, enforced by a unique index on `branch (session_id) where kind = replay`. Ending it by any route sets `done` and unseals.
- [x] Replay turns use the same claim, idempotent key and length limits as main turns.
- [x] Main-branch transcript, ledger, snapshots, verdicts, canvas, reveal numbers never change; only the unseal flag does.
- [x] A cost cap reached mid-replay does not stop it.

## Architecture

- `src/server/replay.ts`: `startReplay` (creates the `branch` row with fork, target, fallback level; status `replaying`), `runReplayTurn` (loads branch state through a `TurnStore` scoped to the branch; runs the turn graph with `judge: true` and `targetItemId`; one transaction per turn; after the judge decides success or the third turn completes, writes `branch.result`, sets `done`), `stopReplay`, `skipReplay` (no branch turns; result `skipped`; `done`).
- Judge failure after 2 retries: the turn still counts, the item is treated as not told, and the UI shows "Chưa kiểm được lượt này."
- Replay turn API returns `{personaText, replayTurnIndex, result?}`; `result` appears only when the branch has ended, and only then carries item content.
- Màn 7 `ReplayScreen`: the last 2 turns before the fork, link to the transcript drawer limited to the fork, "Bạn có 3 lượt", "Dừng" with confirmation, typing then "Đang kiểm tra…", result block with "Về kết quả buổi" (no auto navigation). Fallback 1 opens with "Hỏi lại từ đây, lần này không dẫn dắt."
- Màn 6 done mode: replay block replaced by the result card (result string, target item content or turn *l*, sample question, link "Xem 3 lượt luyện lại" opening the replay transcript, visually separate from the main one). The target item is not moved into "Đã kể". The canvas segment matching the target uses the FR-48a string, plus the replay-success variant. "Tải về" enabled.

## Related code files

- Create: `src/server/replay.ts`, `src/engine/replay-result.ts`, `src/app/api/sessions/[id]/replay/route.ts` (start, stop, skip), `src/app/api/sessions/[id]/replay/turns/route.ts`, `src/components/replay/replay-screen.tsx`, `replay-result.tsx`, `src/components/reveal/replay-result-card.tsx`
- Create tests: `tests/engine/replay-result.test.ts`, `tests/server/replay.int.test.ts`
- Modify: `src/graphs/turn-graph.ts` (judge node, target priority), `src/server/turn-store.ts` (branch scope), `src/engine/unlock.ts` (target priority input), `src/components/reveal/reveal-screen.tsx` (done mode), `src/components/reveal/transcript-drawer.tsx` (replay transcript, fork limit), `src/app/sessions/[id]/page.tsx`

## Implementation steps

1. `replay-result.ts`: pure decision from branch turns + judge verdicts + level.
2. Branch-scoped store and context restore; test that a context built at the fork equals the context the main branch had at that turn.
3. Judge node in the turn graph; ignore Call 1's verdict when the flag is on.
4. Services and routes for start, turn, stop, skip.
5. Màn 7 and result strings for every outcome in the PRD list.
6. Màn 6 done mode and the replay transcript.
7. Isolation test (§12.2 item 3): on every replay turn the Call 1, Call 2 and replay-judge contexts contain no content or `secret_terms` of an item still locked, nothing after the fork, and no canvas text.
8. Integration tests with scripted models: two parallel "start replay" requests create one branch; the sample question on replay turn 2 opens the target and the persona tells it at once; "Đã mở khóa" only when the judge verdict is positive; after every ending (primary success, partial, fail; fallback 1 success, fail; stop; skip; no replay) nothing stays sealed and main-branch rows are byte-identical except the unseal flag; replay log shows 3 logical calls per turn.

## Todo

- [x] `replay-result` + tests
- [x] Branch store + context restore
- [x] Judge node
- [x] Services and routes
- [x] Màn 7
- [x] Màn 6 done mode + replay transcript
- [x] Replay-judge isolation test
- [x] Integration tests for all endings

## Success criteria

- [x] Remaining §12.2 item 5 bullets pass (replay mechanics, "Đã mở khóa" condition, main data unchanged).
- [x] FR-41 matrix: eight endings, zero sealed fields afterwards.
- [x] Resuming a `replaying` session opens Màn 7 at the right replay turn.

## Risk assessment

- **Persona may not tell the target even when it opens**, making a correct follow-up look like a failure. Mitigation: Call 2's "say this now" instruction for a just-opened item; hook transmission is measured in eval.
- **Three calls per replay turn push latency past 6 s.** The PRD sets no replay latency target; the "Đang kiểm tra…" state covers the judge.

## Implementation notes (2026-10-08)

Done in code. Verified after the review fixes and the decisions below: typecheck, lint, 774 unit, 351 integration, 151 Playwright tests (production build against the LLM stub: no model spend). Nothing ran against a real model.

Review by the code-reviewer agent (`plans/reports/code-reviewer-261008-1320-phase-07-replay.md`): no critical finding. Fixed, each with a test where one applies: a replay question sent with a key a main turn already carries made three model calls and wrote nothing, without limit (now refused under the lock before any call); the claim is released on any failure after the calls; the stop event counts its turns under the lock; focus moves to "Về kết quả buổi" when the replay ends and "Đang kiểm tra…" is read out; the fallback-1 lines were then settled by the user (decisions below).

Differences from the text above:

- No branch-scoped `TurnStore`. `src/server/replay.ts` loads the branch through `loadReplayBasis` and writes through `commitReplayTurn` (`src/db/repo/replay.ts`): a replay turn writes its own verdict and may end the session, which the main commit does not. `turn-store.ts` and `unlock.ts` are unchanged (`priorityItemId` was already there). The cost is that the turn row shape is built in two places.
- Extra files: `src/server/replay-outcome.ts` (stored rows → what the learner is shown), `src/db/repo/replay.ts`.
- Replay turns are numbered on from the fork (fork + 1 …), as on the artboards. The API takes and returns the replay turn number, 1 to 3.
- The replay turn API returns `{personaText, replayTurnIndex, unchecked, outcome?}`. `unchecked` is the "Chưa kiểm được lượt này." state; `outcome` (the plan's `result`) is there only from the turn that ends the replay. The stream has one more event, `checking`, sent when the reply is complete and the judge starts; it carries nothing.
- One route for the three actions: `POST /api/sessions/[id]/replay` with `{action: "start" | "skip" | "stop"}`. The answer to a stop carries the outcome. The replay's turns for the done page: `GET …/transcript?branch=replay`, empty until the session is `done`.
- "Bỏ qua" writes a `branch` row with `result = skipped` and no turns (PRD §9.5 says no branch is created). It is what the unique index needs to make skip and start exclusive, and it keeps the skip for SM-2.
- Schema, migration `0008`: `branch.fork_after_turn`, `target_item_id`, `fallback_level`, `result`, unique index `branch_session_replay_key`; `turn.judge_label`; `llm_call.branch_id` (set for replay calls, whose turn numbers repeat those of the main interview, so calls per turn can still be counted).
- The unseal flag is the session status: nothing else of the session row changes.
- Leading-question replay: the judge also returns its own label and `introduced_span` for the learner's question (addendum §2.6). A `leading` label without a valid span becomes `open`. Success is decided by Call 1's checked labels alone; the judge's label only decides whether the fail line quotes the question. The quoted words are Call 1's span.
- Partial means: another item that this replay opened was confirmed told. An item open before the fork and told now does not count.
- "Đã mở khóa" ends the replay at once, at turn 1, 2 or 3. A leading-question replay always runs its three turns.
- Màn 6 done mode: the tally calls the target "Mở khi luyện lại" after a success and "Đã mở niêm phong" otherwise. The card's link reads "Xem N lượt luyện lại" with the real count and is absent when no turn was played. A skipped leading-question replay shows the sample question and no result line.
- New fixed strings in `product-strings.ts` (10): `CANVAS_REPLAY_OPENED` and the nine of `REPLAY_RESULT`. `il check-strings product` and `il approve-strings product` must be run again before `publish` passes.
- New events: `replay_started {level}`, `replay_result {level, result, turns}`.
- No new environment variable. The judge runs on `LLM_REPLAY_JUDGE`, which exists since phase 3.
- The LLM stub answers the replay judge and takes markers for it (`[stub:replay-judge=…]`, `[stub:fail-judge]`, `[stub:slow-judge]`).

Left open:

- **Nothing here ran against a real model.** Unknown: whether the persona tells a just-opened target in the same reply, whether the judge confirms it, and how long a three-call replay turn takes.
- A judge that fails on the very turn the persona told the target: the telling is never credited, because Call 1's later verdict is not read on this branch. The replay can end as a fail for something the learner was told.
- (Settled, see the decisions below.) A leading-question replay with grounded questions and no confirmed leading one had no line in the PRD.
- The fail line of a leading-question replay says "Lượt N" with the turn number shown on the bubble (fork + n), which on a replay from turn 1 reads like a turn of the main interview.
- `GET /reveal` of a `done` session does not carry the "opened in the replay" mark of the target's note; the session page does.
- The dialogs name their question but do not tie the consequence sentence to it (`aria-describedby`).
- The mutation check of the integration tests was not completed: two runs overlapped on the one local database and their results are void. The six unit-level mutations ran: five caught, one not (removing the blanking of the judge's question in `eval/isolation.ts` changes nothing, since the question is rendered with token numbers and cannot match a sealed string).
- `seed-demo` (PRD §12.2 item 12) and the session list are not in this phase.

## Decisions after review (user, 2026-10-08)

- **A replay question of a leading-question replay counts as leading only when Call 1 and the replay judge both label it `leading`.** A judge that failed on the turn confirmed nothing. Success = three questions, none leading in that sense, at least one with a good label by Call 1. This changes how the result of fallback 1 is decided and nothing else: unlocking and openness on the branch still read Call 1's checked label. Reason: FR-19 lets the product say "leading" only when the second check agrees, and failing a learner without being able to say why is worse than passing a little too easily. This narrows PRD §9.5 ("cả 3 lượt không `leading`").
- **One more fixed string**, for a stop with grounded questions and no confirmed leading one: "Có [k] câu bám vào lời [persona] trước khi bạn dừng." (`REPLAY_RESULT.stopped_grounded`; 11 new strings in all).
- **The line of a leading-question replay**, in this order: success → "Ba câu không dẫn dắt, có [k] câu bám vào lời [persona]."; a confirmed leading question → "Lượt [n] vẫn thêm ý của bạn: '[cụm]'."; stopped with a grounded question → the new string; anything else → "Lần này chưa có câu nào bám vào lời [persona]." The sample question is shown as before. With the new rule a replay that fails after three turns always has a confirmed leading question or no grounded one, so the last line is never untrue (a test walks every combination).
- This settles the open point above about a failed leading-question replay with grounded questions. A skipped one still shows the sample question and no line: it is not a case of the table, as Màn 7 is never reached.
