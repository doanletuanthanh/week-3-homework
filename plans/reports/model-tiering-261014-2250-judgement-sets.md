# Model tiering by judgement sets (2026-10-14)

Question: which roles can run on Flash-Lite (gemini-3.5-flash-lite: 0.30 in / 2.50 out per 1M, with no 2027 increase listed) instead of 3.8 Flash (0.75 / 3.75 now, 1.50 / 7.50 from 2027-01-01)? The user's rule is "Flash-Lite where the job is not important". Here "not important" was measured, not guessed: a role moves to Lite only if Lite passes its judgement set in every run.

Method: `pnpm il judgement-eval evalsets/<set>.jsonl`, with `LLM_<ROLE>` overridden per run, on the default scenario chi-thu. Each run scores the gates in `src/eval/judgement-eval.ts`. Runs were repeated 3× wherever the result decided a move. Total spend was about 250 calls, under 0.5 USD.

**Caveat:** the sets have 8–18 lines and need ≥ 50–100 to prove a gate (the CLI says so on every run). These results rank the models; they do not prove the NFR-7 gates.

| Set (role) | 3.8 Flash | 3.5 Flash-Lite | Decision |
|---|---|---|---|
| label-classifier (ANALYSIS) | 94.4% agreement, 0 leading false positives (1 run) | agreement 83.3 / 100 / 94.4%, 0 leading false positives (3 runs). Every miss was confirm_grounded ↔ boundary_probe, both "good" labels | **Flash**: the user chose accuracy first (2026-10-14) |
| turn-verdict (REPLAY_JUDGE) | all gates pass | all gates pass 3/3 (run 1 had 1 extra "told" item) | **Lite** (already Lite in `.env.local`) |
| canvas-judge (END_JUDGE) | **fails 3/3**: 50 / 33 / 33% missed against a ≤ 5% gate | passes 3/3 (0%) | **Lite**. It is cheaper *and* more accurate. The production setting (3.8 Flash) was failing this gate |
| leading-novelty (VERIFIER) | passes | passes 3/3 | **Lite** (was 3.5 Flash at 1.50 / 9.00) |
| moderation (MODERATION) | passes 3/3 | **fails**: lets 1 of 6 real-person / brand / sexual topics through (gate ≤ 2%) | **Flash**. The production setting (Lite) was failing this safety gate |
| output-safety (SAFETY) | passes 3/3 (0 of 9 violations through; 2–3 clean cases refused) | **fails**: 2 of 9 violations through | **Flash** (was 3.5 Flash, which costs more) |

Roles with no set (generation and user-facing text) stay on 3.8 Flash: PERSONA, FEEDBACK, SCENARIO_GENERATOR. EVAL_LEAK_JUDGE stays on Flash, because a missed leak is the costliest error. EVAL_INTERVIEWER and STRING_CHECK stay on Lite.

## Production bugs this found
1. **MODERATION on Lite let a real-person topic through** (`.env.local` had `LLM_MODERATION=…flash-lite`). This is the first gate of the custom-topic path. Fix: Flash.
2. **END_JUDGE on 3.8 Flash misses ~1/3 of correct notes**, marking them "never said" in the reveal. Fix: Lite.

## Cost effect (per 30-turn session, extrapolated from the baseline)
- END_JUDGE + VERIFIER on Lite: the reveal falls from ≈ 0.045 to ≈ 0.03 USD.
- MODERATION and SAFETY on Flash: +0.0003 and −0.002 USD per custom attempt (SAFETY was on 3.5 Flash).
- **ANALYSIS on Lite** would be the big lever. ANALYSIS is ~60% of turn cost, and Lite input is 2.5× cheaper now and 5× cheaper from 2027. That makes a session ≈ 35% cheaper, and it roughly halves the QA agent floor. The user chose to keep ANALYSIS on Flash (2026-10-14).

## Not done
- `.env.local` and the deployment's env vars are not changed by this work. `.env.example` holds the new defaults. Set the same `LLM_*` values on Vercel and in `.env.local`.
- The sets are small. Phase 4 calibration and phase 9 add lines; rerun this matrix when they grow.
