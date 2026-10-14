---
phase: 2
title: "Model tiering by measured judgement sets"
status: completed
priority: P1
effort: "1d"
dependencies: [1]
---

# Phase 2: Model tiering by measured judgement sets

## Overview
Rescoped on 2026-10-14 after the measured baseline (`plans/reports/cost-baseline-261014-2205-llm-spend-by-role.md`) and the vendor docs. Each role now runs the cheapest Gemini model that passes its judgement set in 3 runs out of 3. The user's rule is "Flash-Lite for what is not important", and "not important" is measured, not guessed.

## Why the original cuts were dropped
- **Prompt caching cannot apply.** gemini-3.8-flash caches implicitly only from **4,096 input tokens** (https://ai.google.dev/gemini-api/docs/caching). Session prompts are 1.0–4.0k tokens, which is why the baseline shows 0% cache. Explicit caching has no documented lower minimum and would mean leaving LangChain. Padding prompts to reach the threshold is a hack, and hits are not guaranteed across a learner's think time.
- **The transcript window saves almost nothing for real sessions** (7.8 turns on average). Its gain was in 30-turn eval episodes, which phase 3 replaces. It also risks wrong `leading` labels when a learner refers to an old turn. Dropped (YAGNI, accuracy first).
- **Output and reasoning are ~5% of cost, with 0 reasoning tokens.** Not worth the risk.
- **Pricing note:** 3.8 Flash doubles on 2027-01-01 (1.50 in / 7.50 out). 3.5 Flash-Lite has no change listed (https://ai.google.dev/gemini-api/docs/pricing).

## Result
Recorded in `plans/reports/model-tiering-261014-2250-judgement-sets.md`.

| Role | Model | Evidence |
|---|---|---|
| ANALYSIS | 3.8 Flash (user decision 2026-10-14: accuracy first) | label-classifier: Flash 94.4%; Lite 83.3 / 100 / 94.4%, 0 leading false positives |
| PERSONA, FEEDBACK, SCENARIO_GENERATOR | 3.8 Flash | user-facing text, no set |
| REPLAY_JUDGE | 3.5 Flash-Lite | turn-verdict 3/3 |
| END_JUDGE | 3.5 Flash-Lite | canvas-judge: Lite passes 3/3, **Flash fails 3/3** |
| VERIFIER | 3.5 Flash-Lite | leading-novelty 3/3 |
| MODERATION | 3.8 Flash | **Lite let a real-person topic through**; Flash 3/3 |
| SAFETY | 3.8 Flash | Lite let 2/9 violations through; Flash 3/3 |
| EVAL_LEAK_JUDGE | 3.8 Flash | a missed leak is the costliest error |
| EVAL_INTERVIEWER, STRING_CHECK | 3.5 Flash-Lite | operator-only, low stakes |

## Related Code Files
- Modify: `.env.example` (defaults, each with its evidence), `docs/tech-stack.md` (Models row)
- Create: `plans/reports/model-tiering-261014-2250-judgement-sets.md`
- Not modified: `.env.local` and the deployment's env vars belong to the user, so they get the values from `.env.example`.

## Success Criteria
- [x] Every role with a set was measured on both models; each decision has a 3-run result.
- [x] `.env.example` holds the measured defaults. `pnpm test` (1086) and `pnpm typecheck` pass.
- [ ] (User action, outside the repo) Set the same `LLM_*` values in `.env.local` and on Vercel. **MODERATION → Flash is a safety fix.**
- [x] User decision: ANALYSIS stays on 3.8 Flash.

## Risk Assessment
- The sets are small (8–18 lines). They rank models and prove no gate. Mitigation: rerun this matrix when phase 4 and phase 9 grow the sets.
- Writer and checker are no longer different model families. Mitigation: separate calls and prompts, the judgement sets, and phase 4 mutation recall.
