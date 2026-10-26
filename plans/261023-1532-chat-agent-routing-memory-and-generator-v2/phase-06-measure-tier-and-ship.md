---
phase: 6
title: "Measure, tier and ship"
status: done
priority: P1
effort: "1.5d"
dependencies: [3, 4, 5]
---

# Phase 6: Measure, tier and ship

## Overview
Decide the Director's model from measurements, and replace the plan's cost estimates with measured numbers. Bring the curated tag edits into the database, check one persona with the lean eval, update the docs, and run every check. Each paid run, and the model switch, waits for the user's approval.

## Context links
- `plans/reports/model-tiering-261014-2250-judgement-sets.md` (the 3/3 rule; REPLAY_JUDGE already passes `turn-verdict` on Lite with the same `VERDICT_RULES`)
- `.env.example:30` (`LLM_ANALYSIS`), `docs/operations.md` § Cost and § judgement-eval, `README.md` commands table
- `plans/reports/calibration-261015-lean-eval.md` (`no_leaks` failure rates per persona; co-lan 6/6)
- Every earlier phase's recorded numbers

## Key insights
- The ANALYSIS role serves four jobs: live routing and labels, the guide check (`docs/operations.md:109`), the sample-question labels of the string check (`src/eval/string-check.ts:91`), and, from phase 5, the generator's routing check. A model switch must pass the sets of all of them that exist: `topic-route`, `label-classifier`, `guide-check`.
- Call 1's verdict part uses the same `VERDICT_RULES` as the turn judge, which passes `turn-verdict` 3/3 on Lite. That is evidence, not proof, so `turn-verdict` is not re-run here, to stay within budget.
- Changing the engine's prompts changes `probePromptFingerprint` (`src/eval/qa/tools.ts:119-138`), so the lean eval cache misses on purpose. Old approvals stay tied to their runs. With `require_published` off (the default), learners are not affected.

## Requirements
- Functional:
  - Lite trial, approved, ≈ 0.11 USD. Override `LLM_ANALYSIS=google:gemini-3.5-flash-lite:low` for the runs only, with batch mode:
    - `topic-route` on all three sets × 3 runs;
    - `label-classifier` × 1;
    - `guide-check` × 1.
    Lite qualifies when, in each of the 3 runs, the three `topic-route` sets pooled hold wrong-direct ≤ 1 line and missed-direct ≤ 20%; `label-classifier` is ≥ 94.4% with 0 leading false positives; and `guide-check` passes. No Call 1 may come near its 1,024-token output cap through reasoning tokens. The result goes to the user. Only on their approval does `.env.example` change, and the user sets the same value in `.env.local` and on Vercel. Otherwise ANALYSIS stays on 3.8 Flash.
  - Measured cost: from `llm_call` rows of phase 4's `transcript-run`, compute input and output tokens per turn for Call 1 and Call 2, and re-derive the 8-turn and 30-turn session cost for Flash, and for Lite if switched. Replace the estimate table in `plan.md` and update `docs/operations.md` § Cost.
  - Curated tags: the user imports each persona whose tags changed in phase 2 (`pnpm il import <file>`; this writes new versions to the configured DB). Then, **only if the running total leaves room**, one lean eval on co-lan, batch, ≈ 0.04 USD. Record `no_leaks` and `floor_unlocks` against the calibration report. chị Thu as well, only if the running total allows it.
  - Docs:
    - `docs/operations.md`: the judgement-eval `--batch`/`--concurrency` flags and the `topic-route` kind; `transcript-run`; the generator's repair and routing check; the cost section.
    - `README.md`: the commands table.
    - grep `docs/` for statements that went stale: whole transcript per call, "lan man", `topic_tags`. Update only what is about current behaviour. The presentation script `docs/loi-thoai-thuyet-trinh-interviewlab.md` is the user's own untracked file; list what went stale in it and leave it unedited.
  - Checks: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:int`, `pnpm test:e2e`. The int and e2e suites need Docker and the local Supabase stack, never the production DB.
  - A journal entry in `plans/journals/`. Phase statuses go through `ak plan check`. Ask the user whether to remove `blockedBy` from plan 261014.
- Non-functional:
  - Paid spend for the whole plan ≤ 0.5 USD, with each run recorded in its phase file. Before each run, compare the plan's spend so far (`pnpm il cost-report`) against the cap.

## Related code files
- Modify: `.env.example` (only after the user approves a switch), `docs/operations.md`, `README.md`, `plans/261023-1532-chat-agent-routing-memory-and-generator-v2/plan.md` (measured cost table), `scenarios/**/*.json` (already edited in phase 2; imported here by the user)
- Create: `plans/journals/<date>-chat-agent-routing-memory-and-generator-v2.md`, `plans/reports/` entries for the measured runs

## Implementation steps
1. Sum the plan's spend so far, and ask before the Lite trial.
2. Run the Lite trial, record the table here, and present it. Apply the user's choice.
3. Compute the measured cost and update `plan.md` and `docs/operations.md`.
4. Ask the user to import the changed curated personas. Then, after approval, run the co-lan lean eval and record it.
5. Docs sweep.
6. Run the five checks and fix regressions; tests are not weakened.
7. Journal; phase and plan status updates.

## Todo list
- [x] Lite trial (approved; stopped after run 1, 0.0307 USD): Lite fails, Flash stays
- [x] Measured cost replaces the estimates
- [x] Curated tags imported (chi-hanh v3, on the user's approval); co-lan lean eval (approved; 0.0468 USD)
- [x] Docs updated
- [x] All five checks pass
- [x] Journal, statuses, cross-plan unblock asked

## Success criteria
- [x] The decision on the Director's model is recorded with its numbers. Either the switch is approved, or Flash stays.
- [x] `docs/operations.md` § Cost carries measured per-turn tokens and session cost.
- [x] co-lan's lean eval result is recorded next to its calibration baseline (`no_leaks` 6/6 failed).
- [x] The five checks pass. Paid spend for the whole plan is ≤ 0.5 USD, itemised.

## Results (2026-10-26)
- **Spend before the runs**: ≈ 0.343 USD. `cost-report` read the DB first (it was up).
- **Lite trial**: `LLM_ANALYSIS=google:gemini-3.5-flash-lite:low`, batch, `topic-route` run 1 of 3. Cost 0.0307 USD, 56 calls, 0 reasoning tokens.

  | | Flash (phase 2) | Lite, run 1 | Gate |
  |---|---|---|---|
  | Wrong-direct | 1/56 (0/56 after the tag edit) | **7/56 (12.5%)** | ≤ 1 line |
  | Missed-direct | 0/36 | 1/36 (2.8%) | ≤ 20% |
  | General questions that open nothing | 19/20 | 13/20 | — |

  - Six of the seven errors are general questions that Lite routed to one topic (`broad` → an item), on all three personas. The seventh is co-lan's `why-no-deposit` going to no topic.
  - Lite has to pass all three runs, and run 1 already fails, so runs 2–3, `label-classifier` and `guide-check` were not run. That saved ≈ 0.08 USD.
  - **Decision: ANALYSIS stays on 3.8 Flash.** `.env.example` is unchanged.
- **Measured cost** (17-turn production session on Flash, 2026-10-25; also in `docs/operations.md` § Cost):
  - Call 1 input went from 2938 to 4018 tokens (turn 1 to 17), with 93–178 output tokens.
  - Call 2 input went from 1062 to 2112 tokens, with 15–107 output tokens.
  - Both calls cost 0.0034 USD at turn 1 and 0.0053 USD at turn 17. An 8-turn interview costs 0.031 USD; 30 turns are ≈ 0.15 USD, extrapolated.
  - No cache hits.
  - Input still grows after turn 5, by the gists and claims of older exchanges, against the plan's estimate that it would stop growing.
- **Curated import**: `chi-hanh.json` (the only scenario whose tags changed in this plan) was imported to the configured DB as version 3, a draft. It shows as unapproved in the admin console until its own lean eval and approval.
- **co-lan lean eval** (run `81e79f44`, batch): 0.0468 USD, 41 calls.

  | | Calibration 2026-10-15 | Now |
  |---|---|---|
  | `no_leaks` | failed 6/6 | **passed** |
  | `floor_unlocks` | 0 failed | passed |
  | Every threshold | 0/6 runs | passed |

  - This is one run, not a rate. It is consistent with Call 2 now hearing only the item a turn is about.
  - Note from the run: a paraphrase of `why-no-deposit`'s question did not open it, because its prerequisite was still locked. That is correct behaviour.
- **Docs**:
  - `docs/operations.md` § Cost now carries the measured session and generation numbers. The generator line was written in phase 5.
  - The judgement-eval flags, the `topic-route` kind and `transcript-run` were already documented, and so was the `README.md` commands table. A grep for stale statements found none.
  - Stale in the user's presentation script `docs/loi-thoai-thuyet-trinh-interviewlab.md` (not edited):
    - line 127 and Q&A line 332: Call 1 may now name no topic, and must quote the words that show the topic.
    - line 137: Call 1 sees only the last 5 exchanges word for word, plus gists of older ones.
    - line 139: Call 2 gets at most one item to tell, plus a reply-length direction, not every open item.
    - line 273: a failed check now repairs only the broken part, and a routing check follows.
- **Spend after the runs**: ≈ 0.421 USD of 0.5.
- **Checks** (`plans/reports/tester-261026-1802-phase-06-final-checks.md`): typecheck and lint pass; unit 1245/1245; int 675/675; e2e 329/329. The e2e server log has "destination stream closed early" lines during passing tests. They already appeared in phase 5 and come from streams the browser closes; not a failure.
- **Journal**: `plans/journals/261026-chat-agent-phases-04-06-replies-generator-ship.md`.

## Risk assessment
- Lite passes the sets but routes worse on real learner phrasing. Mitigation: the switch is an env change, so rollback means setting `LLM_ANALYSIS` back. `llm_call` and `pnpm il trace` show routing per turn.
- The budget runs out before co-lan's lean eval. Mitigation: it is last on the list. If it is skipped, say so; it is not silently dropped.
- Importing new curated versions changes what the admin console lists as unapproved. That is expected; the user re-runs the lean eval per persona when the budget allows.

## Security considerations
- Imports and env changes touch production. Only the user does them, or they are done on explicit approval.
- No new data leaves the app. LangSmith tracing is unchanged.

## Next steps
- Plan 261014 phase 4 can choose its gate rule on post-change persona behaviour.
- A possible follow-up, outside this plan: cross-session learner memory, and Call 2 on Lite.
