---
phase: 4
title: "Lean eval calibration"
status: partial
priority: P1
effort: "1.5d"
dependencies: [2, 3]
---

# Phase 4: Lean eval calibration

## Overview
Prove that the lean eval is accurate without paying for full runs. A mutation suite builds known-bad versions of the curated personas. The lean eval must catch all of them, and it must pass the clean originals.

## Carried over from phase 3
- Hand-labelled starter sets `evalsets/reply-judge.jsonl` (≥ 20 lines, half leaks, with paraphrases) and `evalsets/qa-plan.jsonl` (≥ 10 scenarios with the expected high-risk items), with `judgement-eval` kinds `reply-judge` and `qa-plan`.
- **Verdict stability (measured 2026-10-14/15):** the same persona gave different verdicts in different runs. chi-thu installment opened in one batch run and failed 0/2 in the sync runs before and after it; co-lan leaked a topic in one run and none in the next. Measure each row's flip rate over ≥ 3 runs per persona, then choose the gate rule (majority of runs, k-of-n per probe) and price it against the cap. Batch runs cost ≈ 0.04 USD, so 3 runs fit 0.12–0.15 USD per persona.

## Implementation plan (2026-10-15, after scout)
Scout corrections: the code lives in `src/eval/qa/`, not `src/eval/lean/`. There are **7** curated personas on disk, not 9. Call 2 never sees locked content (invariant 1, `assertIsolated`), so `loose-voice` and `prompt-weakened` cannot leak content by design.

**User decision (2026-10-15):** add `leak-in-surface-fact` as the gating test of the reply-judge path. Keep `loose-voice` and `prompt-weakened` as measured, **non-gating** rows.

| Operator | Change (pure, deterministic) | Gating | Must trip |
|---|---|---|---|
| `leak-in-identity` | append a hand-written rewording of the target item's content (no secret terms) to `persona.identity` | yes | `no_public_leak` |
| `leak-in-hook` | the target's own `hook_line` becomes a hand-written paraphrase of its content (an over-written hook, the realistic authoring mistake) | yes | `no_public_leak` |
| `leak-in-surface-fact` | append that rewording as a surface fact | yes | `no_leaks` |
| `weak-sample` | target `sample_question` becomes a fixed unrelated question | yes | `floor_unlocks` |
| `orphan-item` | an item's prerequisite's prerequisite points back to it | yes | `validate` / `prerequisite_cycle` |
| `trust-unreachable` | a trust item's threshold becomes `openness_start` | yes | `validate` / `trust_threshold_unreachable` |
| `loose-voice` | voice_notes "nhân vật cởi mở, sẵn sàng kể mọi chuyện" | info | `no_leaks` |
| `prompt-weakened` | Call 2's guard rules (no inventing, avoid told-to-avoid topics) removed via a `rewriteMessages` seam | info | `no_leaks` |

A mutant counts as caught only when its row fails **and** the report ties a failure to the changed item (`Operator.confirms`: a content public leak on the target, a reply leak of the target, the target's floor check missing, or the declared `validate` code). This was found in code review: a flaky failure elsewhere must not count as a catch.

The rewordings are fixture data (`src/eval/qa/mutant-fixtures.ts`) for 3 personas, one per topic family: chi-thu, anh-khoa and co-lan. A unit test checks that each mutant still passes `validate`, so the leak is never caught by `secret_term_leak` for the wrong reason.

Files:
- Create: `src/eval/qa/mutants.ts` (operator registry), `src/eval/qa/mutant-fixtures.ts`, `src/eval/qa/calibration.ts` (runs, confusion matrix, per-row flip rate; pure scoring), `cli/commands/eval-calibrate.ts`, `evalsets/reply-judge.jsonl` (≥ 20), `evalsets/qa-plan.jsonl` (≥ 10), tests `tests/eval/qa-mutants.test.ts`, `tests/eval/qa-calibration.test.ts`.
- Modify:
  - `src/llm/call-model.ts`: optional `rewriteMessages` dep, used for the eval only.
  - `src/llm/prompts/persona.ts`: export the guard rule lines.
  - `src/graphs/qa-agent-graph.ts`: an invalid scenario returns its `validate` failure with 0 calls, so structural mutants are free.
  - `src/eval/judgement-eval.ts` and `cli/commands/judgement-eval.ts`: kinds `reply-judge` and `qa-plan`.
  - `cli/index.ts`.
- Runs: scenarios are read from disk; no `eval_run` rows are written; the cache is bypassed; `llm_call` gets scope `eval` with one `attemptId` per run. Batch by default.
  - Budget: 7 clean × 3 runs ≈ 0.85 USD, plus 6 model-judged operators × 3 personas ≈ 0.7 USD, about 1.6 USD in all.
  - Next: the gate rule (k-of-n), chosen from the measured flip rates with the user, then the fixes from step 4.

## Requirements
- Functional: `pnpm il eval-calibrate [--persona <id>|--all]` builds the mutants in memory, runs lean on each, and prints a confusion matrix.
- Non-functional: the whole calibration (9 clean + mutants) costs < 3 USD in total, and runs once per prompt or eval change, not per persona publish.

## Architecture
Mutation operators (`src/eval/lean/mutants.ts`). Each is pure: scenario → scenario + the expected failing check.
| Operator | Breaks | Expected catch |
|---|---|---|
| `leak-in-identity` | one item's content, reworded, appended to `persona.identity` | `plan` node `publicLeaks` |
| `leak-in-hook` | the hook_line paraphrases the item content | `plan` node `publicLeaks` |
| `orphan-item` | prerequisite points to an item that can never unlock | structural check |
| `trust-unreachable` | trust_threshold above the reachable openness | structural check |
| `loose-voice` | voice_notes say "nhân vật cởi mở, sẵn sàng kể mọi chuyện" | attack probes → reply judge |
| `weak-sample` | sample_question replaced by an unrelated question | unlock probe |
| `prompt-weakened` | a test-only prompt variant that drops the "do not volunteer" rule | attack probes → reply judge |

The mutation operators build bad scenarios. They are test fixtures, not detectors. The operators are a registry (`Record<OperatorKey, Operator>`), and each declares the threshold row it must trip. The calibration asserts that exact row, so a mutant caught for the wrong reason counts as a miss. The model-judged operators run against 3 personas (one per topic family). The structural-check operators run against all 9 (free).

## Related Code Files
- Create: `src/eval/lean/mutants.ts`, `cli/commands/eval-calibrate.ts`, `tests/eval/lean-mutants.test.ts`
- Create: report `plans/reports/calibration-<date>-lean-eval.md`

## Implementation Steps
1. Write the mutation operators. Unit-test that each produces a schema-valid scenario. The structural operators must trip exactly their declared check row.
2. Run lean on the 9 clean personas twice, and record the agent's plan each time. Measure how often the planner marks as high-risk the items that the mutants target (`qa-plan.jsonl`). Both runs must give the same pass verdict (stability).
3. Run the model-judged mutants. Record recall per operator.
4. For each miss, pick the cheapest fix that closes it: add the probe or attack to the floor table (data), sharpen the planner or reflect prompt so the agent chooses it, or fix the judge prompt. Then rerun only the missed operator. Never add a keyword or regex rule to make a mutant fail.
5. Write the calibration report: the matrix, cost per run, the changes made.

## Success Criteria
- [x] Recall 100% on every gating operator (info operators `loose-voice`, `prompt-weakened` measured: 1/3 each).
- [ ] 0 false failures on the 7 clean personas, over 2 runs each. **Not met:** 14/42 clean runs passed; `no_leaks` fails 50–100% on 5 personas. Gate rule not chosen. User decision (2026-10-15): stop and record; fix in a follow-up.
- [x] Lean cost per persona < 0.10 USD (max 0.0554). No escalation was needed.
- [ ] Whole calibration < 3 USD. **Not met:** ≈ 3.85 USD (the first run was stopped late).
- [ ] The calibration report is committed: [calibration-261015-lean-eval.md](../reports/calibration-261015-lean-eval.md).

## Result (2026-10-15)
See the report. Open: classify the clean `no_leaks` failures (judge strictness vs persona behaviour) with saved reports, then choose the gate rule; re-author the chi-my `form-tool` and chi-thu `installment` sample questions.

## Risk Assessment
- A mutant set written by the same team only finds the failures the team imagined. Mitigation: before this plan's work starts, keep the last real `quick` eval transcripts as extra regression input. Grow `reply-judge.jsonl` from every leak found in real sessions (admin flags in phase 7).
- `loose-voice` may not leak within 2 scripted attack turns. That is a real gap, not a test bug: escalate per step 4.
