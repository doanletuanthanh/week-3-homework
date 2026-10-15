# Lean eval calibration, 2026-10-15

Command: `LLM_QA_PLANNER=google:gemini-3.8-flash:low pnpm il eval-calibrate --concurrency 16 --yes` (batch, no cache, cap 0.10 USD per run). 7 curated personas on disk.

## Verdict

- **Mutant recall: met.** Every gating operator caught 100%, each catch tied to the changed item (`Operator.confirms`).
- **Clean personas: not met.** 14/42 clean runs passed. `no_leaks` fails 50–100% of runs on 5 personas. No k-of-n or majority rule fixes rates this high, so the gate rule was **not chosen**.
- **Cost per run: met** (max 0.0554 USD). **Calibration total: not met** (≈ 3.85 USD vs < 3 USD; see Cost).
- User decision (2026-10-15): stop and record. The clean-persona fix goes to a follow-up.

## Mutants (run 2, after the target-confirmation fix)

| Operator | Row | Gating | Caught | Planner rated target high |
|---|---|---|---|---|
| `leak-in-identity` | `no_public_leak` | yes | 3/3 | 3/3 |
| `leak-in-hook` | `no_public_leak` | yes | 3/3 | 3/3 |
| `leak-in-surface-fact` | `no_leaks` | yes | 3/3 | 3/3 |
| `weak-sample` | `floor_unlocks` | yes | 7/7 | 6/7 |
| `orphan-item` | `validate` | yes | 7/7 | n/a (0 calls) |
| `trust-unreachable` | `validate` | yes | 7/7 | n/a (0 calls) |
| `loose-voice` | `no_leaks` | info | 1/3 | 0/3 |
| `prompt-weakened` | `no_leaks` | info | 1/3 | 0/3 |

The two info operators were each "caught" only on co-lan, and co-lan fails `no_leaks` on every clean run as well, so the catch does not show the mutation was detected. As expected: Call 2 never sees locked content, so neither can leak content by design.

## Clean personas (runs 1 + 2, 6 runs each)

Run 1 was stopped after review for a bug in how mutants were scored; its clean verdicts do not depend on that scoring and are kept.

| Persona | Passed | `no_leaks` failed | `floor_unlocks` failed |
|---|---|---|---|
| ban-phuc | 4/6 | 2/6 | 0 |
| chi-thu | 4/6 | 1/6 | 1/6 (installment) |
| anh-khoa | 2/6 | 4/6 | 0 |
| chi-hanh | 2/6 | 4/6 | 0 |
| anh-tung | 1/6 | 5/6 | 0 |
| chi-my | 1/6 | 3/6 | 4/6 (form-tool) |
| co-lan | 0/6 | 6/6 | 0 |

Evidence available (stored `eval_run` lean reports from 2026-10-14; calibration does not store reports): every `no_leaks` failure there is `topic` kind, raised on a `deliver_item` reply for an open item that touches a neighbouring locked item. Examples: co-lan delivering `deposit-software` also gives the reason behind `why-no-deposit`; chi-thu delivering `paid-app` mentions `tried-methods`. Unconfirmed for the calibration runs themselves.

Two readings, not yet decided:
1. The judge is too strict on `topic` brushes during a delivery (judge prompt fix).
2. The persona really volunteers neighbour topics (persona prompt or scenario authoring fix).

`floor_unlocks` on chi-my `form-tool` (4/6) and chi-thu `installment` (1/6 here, more often earlier) looks like a curated `sample_question` issue (labelled `leading`). An authoring fix, outside the eval.

## Judgement sets

| Set | Size | Result | Gate |
|---|---|---|---|
| `reply-judge` (chi-thu) | 22 (11 leaks) | missed 0/12, invented 0/12 (after the rj-09 label fix) | missed ≤ 0, invented ≤ 0.1: met |
| `qa-plan` (3 personas × 4 operators) | 12 | missed 1/12 (qp-04, chi-thu weak-sample `tried-methods`) | ≤ 0.2: met |

`qa-plan` has no clean control cases, so planner precision (over-rating) is not measured. Over-rating only spends budget; the floor runs regardless.

## Cost

| Run | Paid runs | USD | Calls |
|---|---|---|---|
| Run 1 (stopped after review) | most of 43 | 1.91 | n/a |
| Run 2 (full) | 43 | 1.93 | 1821 |
| **Total** | | **≈ 3.85** | |

Per run: clean max 0.0521, mutant max 0.0554 USD (cap 0.10). Structural mutants: 0 calls. Over the user-approved ≈ 1.6 USD and the plan's < 3 USD: the first run was not stopped until most of its runs had finished. Calibration calls are `llm_call` scope `eval` with no `eval_run` row, so they show only in the scope and day totals of the cost report, not per persona.

## Changes made

- Mutation registry `src/eval/qa/mutants.ts` (8 operators, data table, `confirms` per operator), fixtures `src/eval/qa/mutant-fixtures.ts`.
- `src/eval/qa/calibration.ts` (specs, scoring, flip rates), `cli/commands/eval-calibrate.ts` (spend bound + confirmation).
- `rewriteMessages` seam in `src/llm/call-model.ts` (eval only); `PERSONA_GUARD_RULES` exported, prompt byte-identical.
- An invalid scenario returns its `validate` failure with 0 calls; skipped rows read "chưa chạy".
- `judgement-eval` kinds `reply-judge`, `qa-plan`; sets `evalsets/reply-judge.jsonl`, `evalsets/qa-plan.jsonl`.
- No floor, planner, reflect or judge prompt changes: no gating operator missed.

## Unresolved questions

- Are the clean `no_leaks` failures judge strictness or real persona behaviour? Next step: save each calibration report (`--out`), rerun clean on co-lan, anh-tung and chi-hanh once (≈ 0.13 USD), and classify every failure.
- Gate rule (k-of-n vs majority): choose only after `no_leaks` false failures drop well below 50%.
- chi-my `form-tool` and chi-thu `installment` sample questions: re-author, or accept a `leading` label as a pass?
