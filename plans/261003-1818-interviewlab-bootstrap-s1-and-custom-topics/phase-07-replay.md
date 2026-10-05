---
title: "Phase 7: Replay"
status: todo
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

- [ ] Branch starts from a copy of the snapshot at the fork, with verdicts of turns ≤ fork; nothing after the fork and no canvas in any context.
- [ ] Exactly 3 turns, each = Call 1 + Call 2 + replay judge. The verdict comes only from the judge; `prev_turn_verdict` in Call 1's output is ignored on this branch.
- [ ] The target item's hook stays pickable for all 3 turns; when several items qualify, the target opens first.
- [ ] Results per §9.5: success, partial, fail, stopped, skipped; fallback 1 success = 3 non-leading turns with ≥ 1 good label.
- [ ] One replay per session, enforced by a unique index on `branch (session_id) where kind = replay`. Ending it by any route sets `done` and unseals.
- [ ] Replay turns use the same claim, idempotent key and length limits as main turns.
- [ ] Main-branch transcript, ledger, snapshots, verdicts, canvas, reveal numbers never change; only the unseal flag does.
- [ ] A cost cap reached mid-replay does not stop it.

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

- [ ] `replay-result` + tests
- [ ] Branch store + context restore
- [ ] Judge node
- [ ] Services and routes
- [ ] Màn 7
- [ ] Màn 6 done mode + replay transcript
- [ ] Replay-judge isolation test
- [ ] Integration tests for all endings

## Success criteria

- [ ] Remaining §12.2 item 5 bullets pass (replay mechanics, "Đã mở khóa" condition, main data unchanged).
- [ ] FR-41 matrix: eight endings, zero sealed fields afterwards.
- [ ] Resuming a `replaying` session opens Màn 7 at the right replay turn.

## Risk assessment

- **Persona may not tell the target even when it opens**, making a correct follow-up look like a failure. Mitigation: Call 2's "say this now" instruction for a just-opened item; hook transmission is measured in eval.
- **Three calls per replay turn push latency past 6 s.** The PRD sets no replay latency target; the "Đang kiểm tra…" state covers the judge.
