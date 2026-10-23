# Tester report: phase 1 (topic-route set, batch judgement, baseline)

Date: 2026-10-23 | main, uncommitted phase-1 tree | Plan: plans/261023-1532-chat-agent-routing-memory-and-generator-v2/phase-01-start.md
Scope: full suites (diff-aware mode not used). No source/test/data edits, no commits, no `pnpm il`, no real LLM calls. Working tree unchanged by the run.

## Commands run (in order)
| # | Command | Result | Counts | Time |
|---|---|---|---|---|
| 1 | `pnpm typecheck` | PASS | 0 errors | 12 s |
| 2 | `pnpm lint` | PASS | 0 errors, 0 warnings | 33 s |
| 3 | `pnpm test` run 1 | FAIL | 1146 pass, 1 fail, 1147 total; 62 files | 47 s |
| 3a | isolated `tests/graphs/qa-agent-graph.test.ts` | PASS | 13/13 | 16 s |
| 3b | `pnpm test` run 2 | PASS | 1147/1147; 62 files | 47 s |
| 4 | `pnpm test:int` (local Supabase 127.0.0.1:54322) | PASS | 672/672; 32 files | 501 s |
| 5 | `pnpm test:e2e` (prod build :3100, stub :4010) | PASS | 328/328; 0 skipped, 0 flaky | 18.6 min (1122 s wall) |

Stack already up (db, auth, kong healthy). Ports 3100/4010 free. No e2e spec failed, so no rerun.

## Failures
### F1. Unit timeout, run 1 only (environmental flake; only failure)
- `tests/graphs/qa-agent-graph.test.ts:164` "tool cache > serves a second run on the same content and models from the cache, with fresh reply ids"
- Error: `Test timed out in 5000ms.` No assertion failed.
- Cause: the test runs 5 full scripted QA runs (2020 ms isolated). Run 1 had 62 workers on 12 logical CPUs with Docker running. Run 2 passed unchanged.
- Not a phase-1 regression: the test file is not in the diff, and `runPool` became `mapPooled` (src/eval/pool.ts) with the same clamp, result order and rejection behaviour. All 13 tests pass isolated and in run 2.

## Phase-1 checks
- New suites pass: pool (4), topic-route-set (9), transcript-run (6).
- Concurrency check: judgement-eval.test.ts:228 (`--concurrency 8` equals default 1).
- Evalsets: topic-route.jsonl 56/56 and label-classifier.jsonl 24/24 lines parse; every line has a `note`.
- 0 paid calls, with evidence:
  - Shell has no GOOGLE/OPENAI/LLM_* vars, and the vitest process does not load .env.local. Phase-1 tests use scripted models (`roleModels`).
  - e2e `appEnv` (tests/e2e/helpers/stack.ts) overrides all 12 roles to `openai:gpt-6-luna` at the stub.
  - Local `llm_call` after e2e: every app row is `gpt-6-luna` except one `gemini-3.8-flash`/QA_PLANNER row ($0.0123, 1000/100 tokens, 500 ms). It is a fixture written by tests/e2e/admin.spec.ts:19-21 (`recordLlmCall`), not a provider call.
  - Residual: tests/cli/import-scenario.int.test.ts spawns `tsx cli/index.ts`, which loads .env.local. Its validate/import/unknown commands reach no LLM code.

## Coverage, performance, build
- Coverage not measured: no coverage provider in devDependencies.
- Gaps: real `--batch` channel (only the "no channel" error is tested, topic-route-set.test.ts:151); `transcript-run` dispatch in cli/index.ts (only the function is tested).
- Plan gap: topic-route-co-lan.jsonl and topic-route-chi-hanh.jsonl are listed under "Create" but do not exist. No test references them.
- Timing: unit ~47 s (slowest: the tool-cache test, 2.0 s); int 501 s, 82% in DB-bound tests; e2e 18.6 min. Per-file times not captured.
- Build: `next build` ran in the e2e webServer and the prod server served the suite. No build warnings in the log. Build output not captured separately.
- 75 `[WebServer]` error lines are intentional fault injection (`test fault: page/layout`) and aborted streams. Their tests passed.

## Critical issues
- None blocking. Phase-1 criterion "typecheck, lint, test pass with 0 paid calls" is met.

## Recommendations
1. Give qa-agent-graph.test.ts:164 an explicit ~15 s timeout or lower worker load. Re-run unit 3x. Keep assertions unchanged.
2. Install a coverage provider; measure pool.ts, topic-route-set.ts, transcript-run.ts.
3. Test `transcript-run` dispatch in cli/index.ts.
4. Create the two missing topic-route sets, or update the plan.

## Next steps
1. Decide the F1 fix. 2. Create or defer the two sets. 3. Paid baseline only after user approval (~0.11 USD).

## Unresolved questions
- F1: raise this test's timeout, or lower the worker count? Needs your call.
- Are the two missing topic-route sets deferred on purpose (user spot-check pending)?
- Local DB is in post-e2e state with the admin fixture row. Helpers reset it on next run. OK?
