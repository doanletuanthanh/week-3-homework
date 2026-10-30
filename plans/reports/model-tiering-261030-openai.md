# Model tiering on OpenAI (2026-10-30)

Question: which roles can run on `gpt-6-luna` (0.10 in / 0.01 cached / 0.50 out per 1M) instead of `gpt-6.1-terra` (1 / 0.05 / 5)? The rule is the one from `model-tiering-261014-2250-judgement-sets.md`: a role moves down only if Luna passes its set in 3 runs out of 3. Prices were confirmed on the OpenAI model pages and by the user in the console.

Method:
- `pnpm il judgement-eval evalsets/<set>.jsonl --concurrency 4`, with `LLM_<ROLE>` overridden per run, on the default scenario chi-thu.
- Eval calls never fall back to another model, so every score below belongs to the model named.
- All runs were approved one block at a time.

**Caveat:** the sets have 8–56 lines. They rank models; they do not prove the NFR-7 gates.

## Smoke (one call per schema)

All 12 response schemas were accepted by strict structured output: analysis, route-check, guide-check, replay judge, turn judge, end judge, feedback, verifier, moderation, safety, string check, and the generated scenario on `gpt-6.1-sol`.

- Reasoning tokens were 0–120 per call at `low`.
- PERSONA on Terra used 0 reasoning tokens at both `none` and `low`, so the 400-token cap leaves the whole budget to the reply.
- Latency was 1–5 s, with one verifier call at 11 s.
- Cost: 0.0068 USD.

Effort values (OpenAI model pages):

| Model | Accepted `reasoning.effort` values |
|---|---|
| Terra and Luna | `none`, `low`, `medium`, `high`, `xhigh`, `max` |
| Sol | `low` and up |

None of the three accepts `minimal`. `none` was added to `EFFORTS`, and PERSONA uses it.

## Judgement sets

| Set (role) | Luna, 3 runs | Terra, 1 run | Decision |
|---|---|---|---|
| label-classifier (ANALYSIS) | **fails 3/3**: agreement 83.3% each run (gate ≥ 85%); 0 leading false positives | passes: 91.7%, 0 leading false positives | **Terra** |
| topic-route (ANALYSIS) | passes 3/3: wrong 0/56, missed 1/36 | passes: wrong 0/56, missed 2/36 | Terra (role-level, follows label-classifier) |
| guide-check (ANALYSIS) | passes 3/3: 100 / 94.4 / 97.2% | passes: 100% | Terra (role-level) |
| turn-verdict (REPLAY_JUDGE) | passes 3/3, 0 errors | not run | **Luna** |
| canvas-judge (END_JUDGE) | passes 3/3, 0/6 missed | not run | **Luna** |
| leading-novelty (VERIFIER) | passes 3/3, 0/3 | not run | **Luna** |
| moderation (MODERATION) | passes 3/3: 0/6 forbidden through, 0/6 normal refused | not run | **Luna** (was Terra in the starting map) |
| output-safety (SAFETY) | passes 3/3: 0/9 violations through | not run | **Luna** (was Terra in the starting map) |

Notes:
- **Luna's label-classifier misses.** All 4 were `confirm_grounded` read as `boundary_probe` (lc-01, lc-06, lc-07, lc-far-01). Both are "good question" labels. This is the same pattern Gemini Flash-Lite showed on 2026-10-14, when the user chose accuracy first for ANALYSIS. Terra's two misses were the same kind (lc-07, lc-far-01).
- **Not measured:** EVAL_LEAK_JUDGE and QA_PLANNER stay on Terra. They are operator-only roles, and a missed leak is the costliest error. PERSONA, FEEDBACK and SCENARIO_GENERATOR have no set and keep the starting map: Terra, Terra and Sol.
- **Fallbacks:** each Google fallback is the Gemini model that passed the same set on 2026-10-14. MODERATION and SAFETY therefore fall back to 3.8 Flash, not Flash-Lite, which had failed both.

## Final chains (also in `.env.example`)

| Role | Chain |
|---|---|
| ANALYSIS, FEEDBACK, QA_PLANNER, EVAL_LEAK_JUDGE | `openai:gpt-6.1-terra:low,google:gemini-3.8-flash:low` |
| PERSONA | `openai:gpt-6.1-terra:none,google:gemini-3.8-flash:low` |
| REPLAY_JUDGE, END_JUDGE, VERIFIER | `openai:gpt-6-luna:low,google:gemini-3.5-flash-lite:low` |
| MODERATION, SAFETY | `openai:gpt-6-luna:low,google:gemini-3.8-flash:low` |
| SCENARIO_GENERATOR | `openai:gpt-6.1-sol:medium,google:gemini-3.8-flash:medium` |
| STRING_CHECK | `openai:gpt-6-luna:low` |

These are the Vercel variables to set in phase 9, names only: the `LLM_*` above, plus `OPENAI_API_KEY` and `GOOGLE_API_KEY`. Remove `LLM_EVAL_INTERVIEWER`.

## Cost

| Block | Calls | USD |
|---|---|---|
| Smoke | 14 | 0.0068 |
| A: Luna 3× on 8 sets | 541 | 0.103 |
| B: Terra 1× on 3 ANALYSIS sets | 115 | 0.170 |
| **Total for phase 5** | | **≈ 0.28** (budget ≤ 0.45) |

- **Prompt cache:** OpenAI's cache served 66–84% of input on the long-prompt roles. Gemini served 0–5% on the same prompts. That is why the measured cost came in under the estimate.
- **Session estimate:** about 0.04 USD for 8 turns plus the reveal, against 0.031 measured on Gemini. This is extrapolated from the eval tokens and cache rate, not measured. Phase 9 measures it on production.

## Unresolved

None. Phase 6 measures the generator's voice on Sol, and phase 9 measures latency (NFR-2).
