# Eval cleanup and docs (phase 10)

2026-10-15 · branch `feat/lean-eval-admin` · 0 paid calls

## What went
The simulated-interview eval is gone: the `quick`, `full` and `reduced` profiles, the prompt-only baseline, the simulated learner (`EVAL_INTERVIEWER`), the episode leak judge and the report builder. That is about 1,000 lines of code and tests. `il eval` is lean only and still accepts `--profile lean`, so old notes keep working.

## What stayed, on purpose
Old `eval_run` rows must stay readable. So the schema enum, the episode types, `isEpisodeReport` and `listEpisodes` stay. Review caught that nothing tested `adjudicate show` on a flag of an old full run any more, because the fixture had stopped writing episode rows. Now it writes them, and a test covers it.

The QA agent imported its rate-limit backoff from `run-episode.ts`, the file being deleted. The backoff moved to `src/eval/rate-limit.ts` with its own tests instead of being dragged along.

## Docs
`docs/operations.md` now describes the lean eval, the admin console, the one-ruling gate and both eval budget keys. Its cost numbers are the ones measured in phase 3 and in the calibration (0.039–0.055 USD batch, 0.083–0.092 USD with `--fast`). They are not from a fresh `cost-report`, because the tests empty the local database. The launch checklist now says what is still open: clean personas fail `no_leaks` too often, so the gate rule for that row is not chosen.

## Remember
- The env schema is not strict, so a leftover `LLM_EVAL_INTERVIEWER` is ignored, and a test pins that.
- The plan stays in progress: phase 4's clean-persona problem is the one acceptance criterion still open.
