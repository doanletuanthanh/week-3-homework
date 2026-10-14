---
phase: 10
title: "Cleanup, docs and checks"
status: pending
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
- [ ] All five check commands pass.
- [ ] No doc mentions the 20–40 USD full run as current practice.
- [ ] `docs-evidence.test.ts` passes.

## Risk Assessment
- Deleting the baseline loses the "engine vs prompt-only" comparison. That is accepted: it never gated publishing, and the git history keeps it.
