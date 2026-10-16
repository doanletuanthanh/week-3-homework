# Code review: phase 10 cleanup (lean-only eval)

Scope: `git diff HEAD` (33 files, +135/-2086) plus new `src/eval/rate-limit.ts` and `tests/eval/rate-limit.test.ts`. I did not review `docs/loi-thoai-thuyet-trinh-interviewlab.md`.

Checks I ran:
- `pnpm typecheck`: clean.
- `pnpm lint`: clean.
- `vitest --project unit tests/eval tests/config tests/cli`: 228 tests passed, including `docs-evidence`.
- I did not run the int and e2e suites, as instructed.

## Acceptance

- **(a) Dangling references: pass.** A grep over src, cli, app, tests, docs, README, `.env.example` and `tests/e2e/llm-stub.mjs` found nothing for the deleted modules, symbols or the `EVAL_INTERVIEWER` role. `roleSpecFromEnv` is still used by `call-model` and `qa-agent-graph`, which is correct.
- **(b) No regressions: pass.**
  - The lean CLI path is behaviourally unchanged: same concurrency max of 64, same batch default, and `RateLimitError` / `LlmCallError` are still handled in `runLean`.
  - The gate, the admin scenario page and `adjudicate list` all go through `latestLeanRun`.
  - `isEpisodeReport` is still `profile !== "lean"`, so the stub `{profile:"full",turns:30}` report in `seedFullRun` is classified correctly.
  - `llm_call.role` is plain text (`schema.ts:307`), so old `EVAL_INTERVIEWER` rows still render in the overview and cost report.
  - Coverage gap: see M1.
- **(c) Contract changes are only the intended ones: pass.**
  - `envSchema` is a non-strict `z.object`, so unknown keys are stripped.
  - `superRefine` iterates `ROLES` only (`env.ts:85`), so a leftover `LLM_EVAL_INTERVIEWER` cannot break startup.
  - The CLI drops `--resume`, `--turns` and `--yes`, and refuses any `--profile` other than `lean`.
  - `EvalCommandDeps` loses `roleSpec` and `confirm`. That is an internal type only.
- **(d) Doc claims match source: pass, with one small gap (L1).**
  - Config defaults 0.1 and 5 match `config.ts:42-50`.
  - The over-budget rule matches `eval-job.ts:36-37`.
  - The gate prose matches the `GATE_RULES` rows; `no_leaks` is excluded and settled by rulings.
  - "Latest ruling counts" matches `flagStatus`.
  - Calibration figures (≈3.85 USD; 50–100 % `no_leaks` failure on 5 personas) match `calibration-261015-lean-eval.md:8-9,64`.
  - `approve`, `cost-report` and `eval-calibrate` usages match the CLI.
- **(e) No lint or type errors: pass.**

## Critical
None.

## High
None.

## Medium

**M1. The old-full-run branch of `adjudicate show` now has no test.**
- `cli/commands/adjudicate.ts:42-44`: the `listEpisodes` branch of `exchangeOf` handles a flag from an old full run.
- `seedFullRun` (`tests/helpers/publish-fixtures.ts:42-74`) no longer writes `eval_episode` rows.
- The only `show` test (`tests/cli/publish-flow.int.test.ts:216`) uses a lean flag.
- So the branch is never exercised, and the acceptance item "showing a flag of an old full run" has no proof. It would only have been reachable through seeding anyway.
- Fix: in `seedFullRun`, insert one `evalEpisodes` row per flagged episode (raw insert, with one turn `{index, question, personaText}`). Then add a test that `adjudicate show <full-run flag id>` prints "Episode adversarial-03, lượt 4" plus the `Người hỏi:` / `Nhân vật:` lines.
- The admin console has no full-run flag view (`ruleOnFlag` returns `stale`), so the CLI is the only reader.

## Low

**L1. Batch cost range is narrower than the measurements (`docs/operations.md:125`).**
- The doc says the batch cost is "0.039–0.040 USD … on the curated personas".
- Phase-03 measured that range on 5 personas.
- The calibration (batch, no cache) saw up to 0.0521 USD per clean run and 0.0554 USD per mutant run (`calibration-261015-lean-eval.md:66`).
- Suggest: "about 0.04–0.055 USD in batch mode (max seen 0.055), 0.083–0.092 USD with `--fast`".

**L2. Run-duration wording disagrees.**
- `docs/operations.md:48` says "a run takes minutes to about half an hour".
- The JSDoc at `cli/commands/eval.ts:~62` says "minutes to hours".
- Phase-03 measured 20–26 min. Pick one.

**L3. No test for a leftover `LLM_EVAL_INTERVIEWER`.**
- The behaviour is guaranteed by zod's strip default, but nothing tests it.
- A one-line assertion in `tests/config/env.test.ts` would lock in contract (c): `expect(() => parseEnv({ ...valid, LLM_EVAL_INTERVIEWER: "google:gemini-3.5-flash-lite:low" })).not.toThrow()`.

**L4. `il eval --profile full` without a persona prints the generic usage.**
- `cli/commands/eval.ts:36-39`: the positional check runs before the profile check, so the user gets usage text instead of the "profile no longer exists" message.
- Cosmetic.

**L5. Stale docstring on `RateLimitError` (`src/eval/rate-limit.ts:9`).**
- It says "can be resumed later". That is still true for lean jobs, but the CLI's resume flag is gone. Optional rewording: "a later run picks it up".

## Edge cases checked
- Old `eval_run` rows with profile quick/full/reduced: the enum is unchanged (`types.ts:9`). The gate returns "cần một lần eval lean" when such a run is the input, and `latestLeanRun` filters it out.
- The gate's `lean_run_present` correctly ignores a full run (`publish-flow.int.test.ts:360`).
- `--turns` / `--resume` now fail as unknown options through `parseArgs`. Tests match on `/--turns/` and `/--resume/`.
- `rate-limit.ts` is a byte-equivalent move apart from the option type rename (`EpisodeOptions` → `RateLimitOptions`). Its tests cover retry, give-up and non-429 pass-through.

## Plan follow-up
- Phase 10 is done except for the int/e2e runs and the journal entry (steps 3–4).
- `quick` was removed. That is allowed by the plan clause "keep only if phase 4 found a use".

Status: DONE_WITH_CONCERNS
Summary: The cleanup is complete and consistent: no dangling references, typecheck, lint and unit tests pass, the env leftover is safe, and doc claims match source. The one real gap is that `adjudicate show` for an old full-run flag (`listEpisodes` branch) is no longer covered by any test; the other findings are small doc-wording fixes.
