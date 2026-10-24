# Phase 2 verification: Director v2 topic routing

Run 2026-10-23, 22:31–22:57 (Asia/Saigon). Repo D:/Tekmium/week-3, main, uncommitted phase-2 tree. Mode: full suites (explicit). No source or test edits, no commits. Untracked user docs untouched.

## Results

| Step | Command | Result | Time |
|---|---|---|---|
| 1 | `pnpm typecheck` | exit 0, no errors (tsconfig covers tests/) | 7.7 s |
| 1 | `pnpm lint` | exit 0, no warnings | 21.1 s |
| 2 | `pnpm test` (unit) | 62/62 files, 1171/1171 tests | 23.0 s |
| 3 | `pnpm test:int` (serial, local Supabase) | 32/32 files, 673/673 tests | 457.7 s |
| 4 | `pnpm test:e2e` (desktop + mobile responsive, stub) | 328 passed, 0 failed, 0 flaky, 0 skipped | 16.0 min (962 s wall incl. build) |
| 5 | `git diff --quiet -- src/engine/unlock.ts` | no diff | - |

Count deltas: unit 1170 (controller run) to 1171; int 672 (phase 1) to 673; e2e 328 to 328.

## Named new tests (verbose rerun, all pass)
- Unit `check-analysis`, `hooks`, `plan-turn-adversarial`, `contexts-isolation`: 105/105. Includes 12 direct-topic tests (7 invalid-span cases), 5 bad-span cases that open nothing, "never opens an item named only as a broad topic", ROUTING_RULES pin, and the 300x30-session property (non-vacuity guard > 10).
- Int `config-and-trace`: 23/23, incl. "reads turns stored before topic routing" and "makes no model call".
- Unit `qa-agent-graph`: 13/13. Tool-cache test 1.8 s; the 15 s timeout did not trigger.

## Failures and flakes
None. No reruns needed. No retried or flaky e2e specs. Error log lines came from intentional fault-injection specs (moderation_failed, stubbed 500s).

Slowest e2e: custom-topic.spec.ts:407 (13.0 s), custom-topic.spec.ts:385 (12.2 s), library.spec.ts:401 (10.3 s). None near its timeout.

## Paid-call check: none made
- Not run: judgement-eval, eval, eval-calibrate, transcript-run, scenario generation, measure-latency.
- Unit and int: no GOOGLE_API_KEY or OPENAI_API_KEY in process env. Only cli/index.ts and drizzle.config.ts call dotenv; no test imports either (see gap 2).
- E2E: appEnv() pins all 12 LLM roles in src/config/env.ts to openai:gpt-6-luna:low, sets OPENAI_BASE_URL to the local stub (127.0.0.1:4010), LANGSMITH_TRACING=false. No Google role in e2e.
- Only hard-coded provider host: src/llm/gemini-batch.ts (CLI batch path; its unit test injects a fake fetch).

## Build
- Production build ran as the e2e webServer (`next build && next start`) and succeeded. All 328 specs ran against it.
- Warnings not captured (Playwright drops webServer stdout). Standalone `pnpm build` not run: it would load .env.local (real keys) outside the stub env.

## Coverage
- Not measured. No coverage provider in package.json devDependencies; adding one changes the lockfile, so skipped.
- Static check: each new path (span demotion, ROUTE_BROAD_MAX=3 cap, topic.direct and topic.broad corrections, hook eligibility from hints, plan-turn gating) has direct assertions.

## Gaps (not blocking)
1. No case for repeated non-direct ids in `broad` (e.g. [A, A] should give one hint). check-analysis.ts:65 dedupes via Set; no test asserts it.
2. tests/cli/import-scenario.int.test.ts:261 spawns `pnpm exec tsx cli/index.ts`, which loads .env.local (real keys, LLM roles) into the child. The validate, import and unknown-command paths make no LLM call. A future LLM subcommand run there would spend money.

## Plan success criteria NOT covered
- Flash on pooled topic-route sets (>= 48 lines): wrong-direct <= 1, missed-direct <= 20%.
- label-classifier >= 94.4%, 0 leading false positives.
- Plan todos 5 and 6 still unchecked: paid re-measure (~0.09 USD) and tag re-run (~0.01 USD). Both need approval.
Phase 2 cannot close on these from this run.

## Notes
- A Bash call that inspected key shape in .env.local was denied by the permission classifier. Not retried. No key value was printed, logged or stored.

## Unresolved questions
1. Report path: task said `tester-261023-2221-phase-02-director-v2.md`; SubagentStart naming hint said `tester-261023-2229-{slug}.md`. Wrote the task path.
2. Approve the paid Flash re-measure (~0.09 USD) and tag re-run (~0.01 USD)?
3. Capture build warnings with a stub-env build, or accept the e2e build as sufficient?
4. Add a coverage provider to get coverage %? Changes package.json and lockfile.
5. Strip .env.local from the import-scenario CLI spawn to remove the latent paid-call path?

Status: DONE_WITH_CONCERNS
Summary: All gates pass: typecheck, lint, unit 1171/1171, int 673/673, e2e 328/328. unlock.ts unchanged, no paid calls. Plan success criteria 1-2 (Flash measurement) remain open and need approval.
Concerns/Blockers: coverage not measured; build warnings not captured; latent .env.local exposure in the import-scenario CLI spawn; one denied credential-inspection call (not retried).
