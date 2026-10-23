---
phase: 1
title: "Routing test set, batch judgement runs and baseline"
status: in-progress
priority: P1
effort: "1.5d"
dependencies: []
---

# Phase 1: Routing test set, batch judgement runs and baseline

## Overview
Measure the critical weakness before changing anything. Add a `topic-route` judgement kind with three hand-labelled sets. Let judgement runs go through Gemini Batch at half price. Record today's wrong-route rate. Add label cases that ground on far-back turns, for phase 3's window. Add a CLI that plays a fixed question list through the real turn graph, so replies can be read and compared before and after.

## Context links
- `src/eval/judgement-eval.ts` (set kinds, runners, scoring), `cli/commands/judgement-eval.ts`, `cli/index.ts:55-63` (batch collector), `src/llm/gemini-batch.ts:304` (`batchLlmDeps`)
- `src/eval/qa/calibration.ts:168` and `src/graphs/qa-agent-graph.ts:148` (the worker-pool pattern)
- `src/server/in-memory-turn-store.ts`, `src/graphs/turn-graph.ts` (`runTurnGraph`)
- `evalsets/label-classifier.jsonl`, `evalsets/demo/chi-thu-transcript.json`

## Key insights
- No set measures question → item. `label-classifier` scores the label only (`src/eval/judgement-eval.ts:30`).
- Code acts on `planTurn(...).analysis.tag_item_id`, the first resolved tag (`src/engine/check-analysis.ts:50`). Scoring that field measures what learners get, and it keeps working after phase 2 changes the raw schema.
- The set runners await each case in turn (`src/eval/judgement-eval.ts:369`, `:387`). With the batch collector's 2 s debounce, every call would become its own batch job, so cases must run through a pool.
- One Call 1 line costs about 0.0024 USD synchronous and 0.0012 USD batch (Flash, ~2.4k tokens in, ~150 out).

## Requirements
- Functional:
  - Kind `topic-route`, with case schema `{ id, unlocked?: string[], told?: string[], transcript, question, expected: <item id> | "broad" | "none", note? }`. It runs the production Call 1 and `planTurn`, and reads `analysis.tag_item_id`.
  - Scores:
    - `wrong_direct`: a predicted item ≠ the expected one, including any item predicted for `broad`/`none`.
    - `missed_direct`: an expected item with no item predicted.
    - The confusion pairs (expected → predicted), printed for tag rewrites.
  - The CLI prints counts and rates per set. **The gate is decided on the three sets pooled (≥ 48 lines) for each run:** wrong-direct ≤ 1 line (≈ 2%) and missed-direct ≤ 20%. A single set of 14–20 lines would allow no error at all, and Call 1 is not deterministic, so a per-set gate would fail on noise. <!-- Red team #1 -->
  - Set: **one file**, `evalsets/topic-route.jsonl`, 56 lines: chị Thu 21, cô Lan 17, chị Hạnh 18. Each line names its own `scenario` file, as `qa-plan` lines do, so the pooled gate is decided in one run. This replaces the three files first planned.
    - The mix holds over the pooled set: 25% `broad`, 10.7% `none`, 4 cases about an already open item, and 36 direct cases, most with a plausible sibling tag.
    - Per persona the mix is close but not exact. For example, chị Thu has 23.8% `broad`. <!-- Updated: implementation 2026-10-23 - one pooled file -->
  - `judgement-eval --batch [--concurrency N]`. Default stays synchronous with concurrency 1, which is today's behaviour. Pooled runners for `topic-route`, `label-classifier`, `turn-verdict` and `guide-check`. `runGuideSet` loops one case at a time (`src/eval/guide-check-set.ts:71`), so under batch each case would be its own job, and phase 6's Lite trial would take over an hour. The other kinds are untouched. <!-- Red team #2 -->
  - `evalsets/label-classifier.jsonl`: +6 cases whose good label grounds on a persona turn ≥ 6 exchanges back, each with a transcript ≥ 8 exchanges long.
  - `il transcript-run <scenario file> [--questions <json file>] [--turns n] [--yes]`. It plays the questions through `runTurnGraph` on `inMemoryTurnStore`; when `--turns` exceeds the list, it repeats the questions from the start, as `measure-latency` does. For each turn it prints:
    - the question and the reply;
    - the words and sentences in the reply;
    - the opened item and the label;
    - for Call 1 and Call 2: input, output and reasoning tokens, cost, and latency.
    From phase 3 on it also prints whether a gist was asked for and whether it came back non-empty. At the end it prints medians and the gist fill rate.
    Without `--yes` it prints the estimate and stops. It writes no session rows; `llm_call` rows are scope `eval`. It defaults to the questions of `evalsets/demo/chi-thu-transcript.json`. <!-- Red team #5 -->
- Non-functional:
  - Tests use scripted models and spend 0.
  - Each paid run here needs the user's approval. Planned: 0.06 + 0.01 + 0.04 USD. Actual: see Results.

## Architecture
- `src/eval/topic-route-set.ts` follows `src/eval/guide-check-set.ts`. It holds the schema, `runTopicRouteSet(scenario, cases, options)` and the pure `scoreTopicRouteSet(rows)`. It builds state the way `runLabelSet` does, with `unlocked`/`told` marked open at turn 1.
- `src/eval/pool.ts`: `mapPooled<T, R>(items, concurrency, run)`; the name avoids a clash with the QA graph's local `runPool`. The new runners use it, and the two existing copies of the same worker-pool loop switch to it with no change in behaviour, except one: calibration rows now print in spec order instead of completion order.
- `cli/commands/judgement-eval.ts` gets the batch collector the way `cli/commands/eval.ts:80-86` does.
- `cli/commands/transcript-run.ts`: a sequential loop of `store.loadState()` → `runTurnGraph` → `store.commitTurn`. It has no streaming (`onPersonaDelta` unset), so a batch transport could work, but it stays synchronous: turns depend on each other.

## Related code files
- Create:
  - Code: `src/eval/topic-route-set.ts`, `src/eval/pool.ts`, `cli/commands/transcript-run.ts`
  - Data: `evalsets/topic-route.jsonl`
  - Tests: `tests/eval/topic-route-set.test.ts`, `tests/eval/pool.test.ts`, `tests/cli/transcript-run.test.ts`
- Modify:
  - Eval: `src/eval/judgement-eval.ts` (`SET_KINDS`, pooled `runLabelSet`/`runVerdictSet`), `src/eval/guide-check-set.ts` (pooled `runGuideSet`)
  - CLI: `cli/commands/judgement-eval.ts`, `cli/index.ts`
  - Pool call sites: `src/eval/qa/calibration.ts`, `src/graphs/qa-agent-graph.ts` (use `mapPooled`)
  - Data: `evalsets/label-classifier.jsonl`
  - Tests: `tests/eval/judgement-eval.test.ts`, `tests/graphs/qa-agent-graph.test.ts` (the tool-cache test gets a 15 s timeout; user decision 2026-10-23, after a timeout under full-suite load)
  - Docs: `docs/operations.md` (judgement-eval flags, the new set, `transcript-run`), `README.md` (commands table)

## Implementation steps
1. Write `runPool`. Replace the two existing pool loops, then run `pnpm test`: `qa-agent-graph` and `qa-calibration` must pass unchanged.
2. Write the `topic-route` kind. The scoring is pure and unit-tested with hand-made rows: wrong, missed, broad-as-item, none-as-item. Register it in `SET_KINDS` and the CLI.
3. Add `--batch`/`--concurrency` to `judgement-eval`. Pool `runLabelSet`, `runVerdictSet` and `runGuideSet`. A test with a scripted model checks that the same score comes out at concurrency 1 and 8.
4. Write the three sets. Every line carries a `note` saying why its expected answer is right, and why the closest wrong tag is wrong. The user spot-checks 10 lines before the baseline run; these lines are the ground truth for the critical metric.
5. Add the 6 far-reference `label-classifier` lines.
6. Write `transcript-run`, with a unit test on a scripted model: replies printed, medians computed, no spend without `--yes`.
7. Paid, after approval: run the baseline `topic-route` on all three sets (Flash, batch) and the new `label-classifier` lines. Record wrong/missed counts (pooled and per set) and confusion pairs in this file. Then run `transcript-run --turns 10 --yes` on chị Thu and keep its output as the "before" transcript in `plans/reports/`. Phase 4's "after" run uses the same 10 turns, so the two compare like with like. <!-- Red team #6 -->

## Todo list
- [x] `mapPooled` and both call sites
- [x] `topic-route` kind, scoring and tests
- [x] `judgement-eval --batch --concurrency`
- [x] `topic-route` set (one pooled file), 10 lines spot-checked by the user
- [x] +6 far-reference label lines
- [x] `il transcript-run` and its test
- [x] Baseline `topic-route` recorded (approved; 0.0514 USD)
- [ ] Baseline transcript, 10 turns: waits for the Supabase restore (approved, ≈ 0.04 USD)

## Success criteria
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test` pass, with 0 paid calls in tests. The tester also ran int 672/672 and e2e 328/328.
- [x] The baseline wrong-direct and missed-direct rates for the current Call 1 are written here, with the confusion pairs.
- [ ] The 10-turn "before" transcript, with its word, sentence, token and latency medians, is saved under `plans/reports/`.

## Results (2026-10-23)
- **Baseline routing** (today's Call 1, 3.8 Flash, batch; `plans/reports/baseline-261023-topic-route.md`):
  - Wrong-direct is **16.1% (9/56)** against the 2.1% gate. Missed-direct is 0% (0/36).
  - Per persona: chị Thu 3/21 wrong, cô Lan 2/17, chị Hạnh 4/18.
  - All 9 errors are broad questions forced onto one tag:
    - `tried-methods` ×3 (ct-14, ct-16, ct-17);
    - `private-notebook` ×3 (ch-11, ch-12, ch-15);
    - `empty-hours-loss` (cl-12), `paper-ledger` (cl-14), `stuck-signal` (ch-13).
  - There are 0 sibling confusions among direct questions. The weakness is the forced choice, which is what phase 2 removes.
- **How it was scored:** the CLI crashed writing `llm_call`, because the configured Supabase DB is unreachable ("tenant/user not found", likely a paused free project; the user will restore it). The finished batch job was scored offline from its stored responses with the same code. Response i matches case i because requests are enqueued in case order.
- **Spend:** 0.0514 USD for the batch, plus 0.0021 USD lost on a transcript run that crashed at its first `llm_call` write. **Phase 1 total ≈ 0.054 USD.**
- The `label-classifier` baseline was skipped (user decision 2026-10-23). Phase 2's run, which still has the full transcript, serves as the baseline for phase 3's window.
- **Review** (8/10, no critical; `plans/reports/code-reviewer-261023-phase-01.md`): approved as-is by the user. The warnings W1–W7 and suggestions S1–S11 stay open as follow-ups.
  - W1 flags three arguable lines (ch-15, cl-12, ct-11). Two of them are among the 9 baseline errors; without them the rate is 13%, so the conclusion is the same.
  - S8 (the batch wiring now exists in 3 copies) is noted for a later change.
- **Tests:** `plans/reports/tester-261023-phase-01.md`.

## Risk assessment
- The sets reflect the author's own view of "direct". Mitigation: a `note` on every line, the user's spot-check, and the lines kept in the repo so later runs compare like with like.
- Batch jobs can take minutes. That is acceptable for measurement, and `--batch` stays opt-in.
- The cost estimate can be low: the old estimator ran 21–28% under. Mitigation: the running-total rule in `plan.md`.

## Security considerations
- The sets use curated scenarios only and contain no learner data. `transcript-run` writes no session data.

## Next steps
- Phase 2 reruns the same sets on the new Director prompt.
