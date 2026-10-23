# Code simplifier: chat-agent routing eval and pooled runs

Scope: the 8 files the lead assigned. Behavior, exports, CLI output strings and exit codes are unchanged.

## Changes

- `cli/commands/judgement-eval.ts`
  - The nested ternary in the `Bộ thử …` header line is now a `SCENARIO_NOTE` lookup table, which replaces `PER_CASE_SCENARIO`. Kinds missing from the table still print `kịch bản <persona>`. The table strings match the originals byte for byte (NFC checked against HEAD).
  - `loadScenarios` now takes the cases instead of paths. This removes the `cases.map((entry) => entry.scenario)` that both the qa-plan and topic-route runners repeated.
- `cli/commands/transcript-run.ts`
  - `TURN_ESTIMATE` now uses the existing `TokenUsage` and `ZERO_USAGE` from `@/llm/pricing`. The inline `{ inputTokens; outputTokens }` type was written twice and the zero fields were spread at the call site; the estimate reduce is now one line. Same numbers, same summation order.
  - Added `usdOf(records)` next to `secondsOf`. It replaces the cost reduce + `toFixed(4) USD` that was duplicated in the per-turn line and the total line.
- `src/eval/topic-route-set.ts`: added a one-line doc to `scoreTopicRouteSet`, the only exported function in the file without one.
- `src/eval/judgement-eval.ts`: added a one-line doc to `toTranscript`, which is now exported and used from another module.

## Left as is (already clean)

`src/eval/pool.ts`, `src/eval/guide-check-set.ts`, `src/eval/qa/calibration.ts`, `src/graphs/qa-agent-graph.ts`, and the `mapPooled` use in `runLabelSet`/`runVerdictSet`.

## Verification

- `pnpm typecheck`: pass. `pnpm lint`: pass.
- `pnpm exec vitest run --project unit tests/eval tests/cli tests/graphs`: 20 files / 251 tests pass, the same as the baseline before the edits.
- CRLF line endings kept in every edited file.

## Follow-ups (outside my file boundary, not done)

- The batch-collector wiring in `judgement-eval.ts` is a near copy of `cli/commands/eval.ts` `runLean`; only the fallback hint differs. A shared helper would mean editing `eval.ts`.
- "Call 1 + `planTurn`" is repeated in `runLabelSet`, `runTopicRouteSet` and `src/eval/string-check.ts`. A shared helper is worth doing only if `string-check.ts` is included.
- The `moderation` header prints `kịch bản chi-thu` even though that set uses no scenario. This predates this change. Fixing it is a single table entry, but it changes output.
