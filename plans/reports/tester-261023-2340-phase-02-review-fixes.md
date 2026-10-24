# Tester report: phase 02 review fixes (Director v2 topic routing)

Scope: full suite on the uncommitted tree. No source or test edits, no commit, stash, or reset. Local Supabase up (db, rest, auth, kong healthy). Zero paid LLM calls.

## Results

| Step | Command | Result | Time |
|---|---|---|---|
| Typecheck | `pnpm typecheck` (tsc --noEmit) | exit 0, no output | 8s |
| Lint | `pnpm lint` (eslint) | exit 0, no output | 21s |
| Unit | `pnpm test` (vitest --project unit) | 62/62 files, 1176/1176 passed, 0 failed, 0 skipped | 24.4s |
| Int | `pnpm test:int` (vitest, serial) | 32/32 files, 673/673 passed, 0 failed, 0 skipped | 454s |
| E2E | `pnpm test:e2e` (playwright, desktop + mobile, workers=1) | 328/328 passed, 0 failed, 0 flaky, 0 skipped | 17.0m |
| unlock.ts | `git diff --quiet -- src/engine/unlock.ts` | exit 0, unchanged | - |

Versus last green run: unit 1171 -> 1176 (+5 new cases), int 673 (same), e2e 328 (same).
Flakes: none. One run per suite; playwright config sets no retries, so any flake would have shown as a failure.

Failures: none. No reruns needed.

## E2E log noise (all expected)
- 53x `The destination stream closed early.` (per brief).
- 18x `test fault: page|layout`: deliberate fault injection (`src/server/test-faults.ts:20`).
- 1x `generation_stopped ... SCENARIO_GENERATOR failed after 3 attempt(s)`: deliberate `[stub:fail-gen]` (`tests/e2e/custom-topic.spec.ts:374`).

## Paid-call audit: PASS
- Shell: no GOOGLE_API_KEY, OPENAI_API_KEY, or LLM_* set (presence check only, no values read).
- E2E `appEnv` (`tests/e2e/helpers/stack.ts`): all 12 roles (`src/llm/roles.ts` APP_ROLES + EVAL_ROLES) set to `openai:gpt-6-luna:low`, `OPENAI_BASE_URL` pointed at the stub on 127.0.0.1:4010, LANGSMITH off. Playwright worker has no LLM env.
- Unit/int: models injected via `createModel` fakes.
- Residual risk: `tests/cli/import-scenario.int.test.ts:256-262` spawns `tsx cli/index.ts`, which loads `.env.local` (`cli/index.ts:24`). Only `validate`, `import`, and an unknown command run there, none call an LLM. Safe today, not enforced.

## Build
- Passed implicitly: e2e webServer ran `next build && next start`, served on :3100.
- Build warnings not captured (Playwright ignores webServer stdout by default).

## Performance
- Unit 24s, int 454s (81% test time), e2e 17.0m. No timeouts.
- Slowest e2e: `custom-topic.spec.ts:407` 13.1s, `:385` 12.2s, `library.spec.ts:401` 11.8s, `my-sessions.spec.ts:79` 10.9s.

## Coverage gaps
- No coverage script in package.json; coverage not measured.
- [!] `buildPersonaContext` hint branch (`src/engine/contexts.ts`) has no direct unit test. Only caller in tests passes `hintItemIds: []` (`tests/scenario/curated-scenarios.test.ts:98`). Hint-drawn do-not-assert is covered only via whole-turn `planTurn` cases (`tests/engine/hooks.test.ts:127-151`) and the hostile-loop property (`tests/engine/plan-turn-adversarial.test.ts`). Suggested direct cases: locked direct item beats hints; hook drawn from hints sets do-not-assert to that item; at most one do-not-assert.

## Next steps
1. Add the direct `buildPersonaContext` hint cases above (test-only change, owner decides).
2. Strip or pin `LLM_*` and provider vars in the import-scenario CLI subprocess env, so a future command cannot reach a paid provider.
3. Capture `next build` output if build warnings matter.

## Unresolved questions
- Coverage target (80%?) and whether to add a coverage script; none exists today.
- Should the import-scenario CLI test read `.env.local` at all?
