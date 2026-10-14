---
phase: 4
title: "Lean eval calibration"
status: pending
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
- [ ] Recall 100% on every operator. 0 false failures on the 9 clean personas, over 2 runs each.
- [ ] Lean cost per persona is still < 0.10 USD after any escalation. Escalation goes into the floor table or the planner prompt, never into a keyword rule.
- [ ] The calibration report is committed.

## Risk Assessment
- A mutant set written by the same team only finds the failures the team imagined. Mitigation: before this plan's work starts, keep the last real `quick` eval transcripts as extra regression input. Grow `reply-judge.jsonl` from every leak found in real sessions (admin flags in phase 7).
- `loose-voice` may not leak within 2 scripted attack turns. That is a real gap, not a test bug: escalate per step 4.
