# Cost baseline: LLM spend by role (2026-10-14)

Source: `pnpm il cost-report --days 30` against the configured Supabase DB (read-only). Window 2026-09-14 → 2026-10-14. Prices are from `src/llm/pricing.ts`.

Role config at measurement time (`.env.local`): ANALYSIS, PERSONA, END_JUDGE, FEEDBACK and SCENARIO_GENERATOR on gemini-3.8-flash. VERIFIER, SAFETY and EVAL_LEAK_JUDGE on gemini-3.5-flash. REPLAY_JUDGE, MODERATION, EVAL_INTERVIEWER and STRING_CHECK on gemini-3.5-flash-lite. All roles are Google already; the plan's "all on 3.8-flash" switch is still open (phase 2).

## Eval (quick profile, 2 episodes × 30 turns)

| Persona | Calls | Actual USD | Estimate USD |
|---|---|---|---|
| ban-phuc v1 | 184 | 0.688 | 0.542 |
| chi-my v1 | 184 | 0.690 | 0.542 |
| co-lan v1 | 184 | 0.752 | 0.542 |
| anh-tung v1 | 184 | 0.672 | 0.542 |
| anh-khoa v1 | 184 | 0.689 | 0.542 |
| chi-hanh v2 | 185 | 0.659 | 0.542 |

- About 0.0037 USD per call. The estimator is 21–28% low.
- Eval spend by role, 30 days: ANALYSIS 1.70 · PERSONA 1.64 · EVAL_INTERVIEWER 0.50 · EVAL_LEAK_JUDGE 0.27 · REPLAY_JUDGE 0.04 · STRING_CHECK 0.03.
- ANALYSIS averages **6,474 input tokens per call** against only 78 output tokens. PERSONA averages 5,104 in and 269 out. **Input is about 95% of the cost**, and reasoning tokens are 0 on 3.8-flash at effort `low`.
- Cache hit share (cached / input): ANALYSIS 10%, PERSONA 8%, EVAL_INTERVIEWER 54%.

## Interview sessions (4 sessions, ~7.8 turns on average)

- 0.044 USD per session on average (p95 0.081). Turn 1 costs ≈ 0.0029 USD (ANALYSIS + PERSONA).
- Input grows linearly per call, so the session total grows with the square of the turn count:
  - ANALYSIS: 2,354 tokens at turn 1, 3,952 at turn 13 (≈ +130 per turn).
  - PERSONA: 1,030 tokens at turn 1, 2,497 at turn 13 (≈ +120 per turn).
- **Cache hit share 0%** on every session role.
- Extrapolated 30-turn session: ≈ 0.17 USD of turns + ≈ 0.045 USD of reveal ≈ **0.21 USD**.

## Generation and moderation
- SCENARIO_GENERATOR: 0.017 USD per call, output-heavy (4.2k out). SAFETY: 0.005 USD. MODERATION: 0.0003 USD.

## What this changes in the plan
1. **Prompt caching is the biggest lever, and it is broken today** (0% in sessions, ~10% in eval). Phase 2's first task is to find out why. The likely causes are a prefix that changes between calls (per-turn blocks placed before static ones, or a system message that differs per turn) or a prefix below the provider's minimum cacheable size. Check the minimum and the discount for gemini-3.8-flash in the vendor docs.
2. **Output trimming and reasoning effort matter little** (output is about 5% of cost, reasoning is 0). Phase 2 items 3–4 drop to low priority.
3. **The transcript window matters most for long sessions and eval**: 6.5k-token ANALYSIS inputs come from the 30-turn transcripts.
4. **QA agent cost (phase 3)**: probe calls with short transcripts measure ≈ 0.0021 (ANALYSIS) and ≈ 0.0012 (PERSONA) USD *without* cache. The ~50-call design then costs about 0.10 USD, right at the cap. With a working prefix cache (≈ 2k of 2.4k tokens cached at 10% of the price) it drops to about 0.05–0.06 USD. **The 0.1 USD target depends on fixing the cache in phase 2.** Without that, the agent degrades to the floor.
5. The `quick` estimator in `src/eval/run-eval.ts` is 21–28% low. That code is removed in phase 10, so it is not fixed here.

## Unresolved
- The integration test `tests/db/cost-report.int.test.ts` has not run yet: Docker Desktop was not running, so the local Supabase stack was down.
- The implicit-cache minimum prefix size and discount for gemini-3.8-flash are unverified.
