---
phase: 10
title: "Cleanup, docs and checks"
status: done
priority: P2
effort: "1d"
dependencies: [1, 2, 3, 4, 5, 6, 7, 8, 9]
---

# Phase 10: Cleanup, docs and checks

## Overview
Remove the eval paths the gate no longer uses, update the docs to the new reality, and run every check.

## Requirements
- Remove the `full` and `reduced` profiles and the prompt-only baseline (`src/eval/baseline.ts`, `src/llm/prompts/eval-baseline.ts`), together with their tests and estimate code. Keep `quick` only if phase 4 found a use for it during prompt tuning. Otherwise remove it too. Old `eval_run` rows stay readable: the schema enum keeps the old values.
- Remove `EVAL_INTERVIEWER` and `src/eval/interviewer.ts`: the QA agent drives attacks with scripted openings and its own planned follow-ups, not with a simulated learner.
- Docs: `docs/operations.md` (lean eval, the admin console, the single-admin gate, the new config keys, cost numbers measured in phases 3–4), `docs/tech-stack.md` (deviations: the PRD is retired as authority, the admin console exists, the eval runs in the web through a job), `README.md` (the commands table: `cost-report`, `eval-calibrate`, `approve`), `docs/launch-checklist.md`.
- `.env.example`: the efforts from phase 2. Remove the vars of deleted roles.

## Related Code Files
- Delete: `src/eval/baseline.ts`, `src/llm/prompts/eval-baseline.ts`, and the related parts of `src/eval/run-eval.ts`, `tests/eval/*baseline*`
- Modify: `docs/operations.md`, `docs/tech-stack.md`, `README.md`, `docs/launch-checklist.md`, `.env.example`, `tests/config/docs-evidence.test.ts` (if it pins doc claims)

## Implementation Steps
1. Grep for every use of `full`, `reduced`, `baseline` and `EVAL_INTERVIEWER`, then remove them. Run `pnpm typecheck`.
2. Update the docs. Verify each cost claim against `pnpm il cost-report` output.
3. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:int`, `pnpm test:e2e`.
4. Write a journal entry in `plans/journals/`.

## Success Criteria
- [x] All five check commands pass.
- [x] No doc mentions the 20–40 USD full run as current practice.
- [x] `docs-evidence.test.ts` passes.

## Result (2026-10-15)
Done with 0 paid calls.
- Removed: the `quick`, `full` and `reduced` profiles (`quick` had no use after phase 4), the prompt-only baseline, the simulated learner (`EVAL_INTERVIEWER`, `LLM_EVAL_INTERVIEWER`), the episode leak judge and the episode report builder, with their tests. The rate-limit backoff the QA agent uses moved to `src/eval/rate-limit.ts`, with its own unit test.
- Kept for history: the schema enum, `EvalReport`/`EpisodeResult` types, `isEpisodeReport` and `listEpisodes`, so `adjudicate show` still prints a flag of an old full run (new integration test). The gate ignores such runs.
- `il eval` is lean only. `--profile lean` is still accepted; any other profile, `--resume`, `--turns` and `--yes` are refused. A leftover `LLM_EVAL_INTERVIEWER` in an env file is ignored (tested).
- Docs: `docs/operations.md` (lean eval, the admin console, the single-ruling gate, the two eval config keys, measured costs from phase 3 and the calibration report), `docs/tech-stack.md` (PRD retired as authority, admin console, eval as a job), `docs/launch-checklist.md`, `docs/setup.md`, `README.md`, `.env.example`. Cost claims come from the recorded measurements, not a new `cost-report` run: the local database is emptied by the tests.
- Review ([report](../reports/code-reviewer-261015-2203-phase-10-cleanup.md)): no blockers; the missing old-flag `show` test and five small doc/wording points were fixed.
- Checks: typecheck, lint, unit 1124, int 672, e2e 328, all passing.

## Risk Assessment
- Deleting the baseline loses the "engine vs prompt-only" comparison. That is accepted: it never gated publishing, and the git history keeps it.
