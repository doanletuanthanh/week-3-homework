---
phase: 1
title: "Cost baseline and reporting"
status: completed
priority: P1
effort: "1d"
dependencies: []
---

# Phase 1: Cost baseline and reporting

## Overview
Measure where the money goes before cutting anything. Add one cost query module that the CLI and the admin dashboard (phase 6) both read, and attribute eval calls to their run.

## Requirements
- Functional: cost broken down by scope, role, model, day, eval run, session (calls, tokens in/cached/out/reasoning, USD, failed-call share).
- Functional: every `scope = 'eval'` call is linked to its `eval_run`.
- Non-functional: read-only queries; no new LLM calls.

## Architecture
- `src/db/repo/cost-report.ts`: pure SQL aggregates over `llm_call` + `daily_spend`. Returns typed rows. Reused by phase 6.
- `cli/commands/cost-report.ts`: `pnpm il cost-report [--days n] [--run <id>]`. Prints a table. The window is whole UTC+7 days, today included, with the same day boundary as `src/server/cost-cap.ts`.
- Eval attribution (verified): eval calls already carry the run id as `attempt_id` with scope `eval` (`src/eval/run-episode.ts`), so no migration is needed. Original note: check whether eval calls already carry the run id (the `attemptId` column or LangSmith metadata only). If they do not, add a nullable `eval_run_id uuid` column to `llm_call` and set it in `CallScope`.

## Related Code Files
- Create: `src/db/repo/cost-report.ts`, `cli/commands/cost-report.ts`, `tests/db/cost-report.int.test.ts`
- Modify: `cli/index.ts`, `src/llm/call-model.ts` (scope → eval run id), `src/db/schema.ts` + new migration in `drizzle/` (only if the column is missing), `src/eval/run-episode.ts`

## Implementation Steps
1. Read `CallScope` and `recordCallToDb` in `src/llm/call-model.ts` and confirm how eval calls are attributed today.
2. Add `eval_run_id` if it is missing (migration through `pnpm db:generate`).
3. Write the aggregate queries: by role per scope, per session (average over finished 30-turn sessions), per eval run.
4. Add the CLI command and register it in `cli/index.ts`.
5. Record the baseline in `plans/reports/cost-baseline-261014-<slug>.md`: per-turn cost by role, per-session cost, the last quick eval run, and token growth by turn index (input tokens against `turn_index`).

## Success Criteria
- [x] `pnpm il cost-report` prints spend by scope and role. It was run against the configured DB, and `--run <id>` works.
- [x] The integration cases (mixed scopes, failed calls, ledger, eval attribution, replay exclusion, whole-day window, CLI errors) pass on the production DB, run inside one transaction that is always rolled back: 14/14 PASS on 2026-10-14, with 0 fixture rows left afterwards. The vitest file `tests/db/cost-report.int.test.ts` holds the same cases for the local stack. It has not run locally (Docker down), and it must never run against production, because `resetDatabase` truncates every table.
- [x] Read-only cross-check on the live DB (2026-10-14, inside a READ ONLY transaction): the per-role and per-day totals match the raw `llm_call` (+ `daily_spend`) sums (4.4002 USD, 1,308 calls, 1 failed); the eval run costs match the raw join (7 runs); `cost_actual_usd` of every done run matches its attributed calls; the session count matches.
- [x] A baseline report exists with measured per-session and per-eval-run numbers: `plans/reports/cost-baseline-261014-2205-llm-spend-by-role.md`.

## Risk Assessment
- The baseline must be measured with every `LLM_<ROLE>` on gemini-3.8-flash (no OpenAI key), so that phase 2 compares like with like.
- Local DB may have little real data. Mitigation: run one quick eval and one 30-turn session with real keys (~1 USD) to seed the baseline. Note this in the report.
