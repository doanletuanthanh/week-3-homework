---
phase: 6
title: "Measure, tier and ship"
status: pending
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
- [ ] Lite trial (approved, ≈ 0.11 USD) and the user's decision
- [ ] Measured cost replaces the estimates
- [ ] Curated tags imported (by the user); co-lan lean eval (approved, ≈ 0.04 USD)
- [ ] Docs updated
- [ ] All five checks pass
- [ ] Journal, statuses, cross-plan unblock asked

## Success criteria
- [ ] The decision on the Director's model is recorded with its numbers. Either the switch is approved, or Flash stays.
- [ ] `docs/operations.md` § Cost carries measured per-turn tokens and session cost.
- [ ] co-lan's lean eval result is recorded next to its calibration baseline (`no_leaks` 6/6 failed).
- [ ] The five checks pass. Paid spend for the whole plan is ≤ 0.5 USD, itemised.

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
