---
phase: 5
title: "Switch roles to OpenAI and measure tiers"
status: pending
priority: P1
effort: "0.75d"
dependencies: [4]
---

# Phase 5: Switch roles to OpenAI and measure tiers

## Overview

Point every role at OpenAI with a Google fallback (D10, D11). Prove that each role works on its model with one tiny call. Then run the judgement sets to move every role that can go to Luna.

## Context

- Today (`.env.local`): Flash roles are PERSONA, ANALYSIS, END_JUDGE, FEEDBACK, SCENARIO_GENERATOR (`medium`) and QA_PLANNER. 3.5 Flash roles are EVAL_LEAK_JUDGE, VERIFIER and SAFETY. Lite roles are REPLAY_JUDGE, EVAL_INTERVIEWER, STRING_CHECK and MODERATION. `.env.example` holds the 2026-10-14 tiering, which `.env.local` does not fully follow: there END_JUDGE and VERIFIER are on Lite, and MODERATION and SAFETY on Flash.
- Sets and roles (`plans/reports/model-tiering-261014-2250-judgement-sets.md`): `label-classifier` + `topic-route` (ANALYSIS), `turn-verdict` (REPLAY_JUDGE), `canvas-judge` (END_JUDGE), `leading-novelty` (VERIFIER), `moderation` (MODERATION), `output-safety` (SAFETY), `reply-judge` (eval), `guide-check`, `qa-plan` (QA_PLANNER). PERSONA, FEEDBACK and SCENARIO_GENERATOR have no set.
- `pnpm il judgement-eval evalsets/<set>.jsonl` with `LLM_<ROLE>` overridden per run. `--batch` helps only Google roles.

## Requirements

Starting map, which every run tests against:

| Role | Primary | Fallback |
|---|---|---|
| PERSONA | `openai:gpt-6.1-terra:<lowest accepted>` | `google:gemini-3.8-flash:low` |
| ANALYSIS, FEEDBACK, QA_PLANNER, EVAL_LEAK_JUDGE | `openai:gpt-6.1-terra:low` | `google:gemini-3.8-flash:low` |
| MODERATION, SAFETY | `openai:gpt-6.1-terra:low` | `google:gemini-3.8-flash:low` |
| SCENARIO_GENERATOR | `openai:gpt-6.1-sol:medium` | `google:gemini-3.8-flash:medium` |
| END_JUDGE, VERIFIER, REPLAY_JUDGE | `openai:gpt-6-luna:low` | `google:gemini-3.5-flash-lite:low` |
| EVAL_INTERVIEWER, STRING_CHECK | `openai:gpt-6-luna:low` | none |

- Move down rule: a Terra role moves to Luna only if Luna passes its set 3/3. A Luna role stays on Luna only if Luna passes 3/3; otherwise it goes up to Terra. Safety sets (MODERATION, SAFETY) never trade a gate for cost.
- The first thing measured is whether Terra passes each set (1 run). A Terra failure is reported to the user before anything else moves.
- Every paid run is asked for right before it runs (D12), with the estimate and the spend so far.

## Implementation Steps

1. **Pre-flight (free):**
   - DB health (`pnpm il cost-report --days 1`, memory `check-db-before-paid-cli-runs`).
   - Check that `OPENAI_API_KEY` answers `GET /v1/models` without printing it.
   - Confirm in the OpenAI docs or console which `reasoning.effort` values `gpt-6.1-terra` and `gpt-6-luna` accept (`minimal`? `none`?). If `none` exists and `minimal` does not, add it to `EFFORTS` with a test.
2. **Smoke (≈ 0.01 USD, ask first):** a throwaway script in the scratchpad, not committed. It calls `callModel` once per role with its real prompt builder on the chị Thu fixture and `fallbackSpecs: () => []`, so only the primary runs. For each role it records ok/fail, the structured-output parse, input / cached / output / reasoning tokens, latency and cost. Checks:
   - Every structured schema is accepted in strict mode.
   - PERSONA's reasoning tokens leave room for the reply under its 400-token cap. If not, use a lower effort, or raise the cap and record why.
   - The `llm_call` rows show `openai` model ids and non-zero cost.
3. **Tiering (≈ 0.40 USD, ask before each block):**
   - Terra 1× on every set of a Terra-mapped role.
   - Luna 3× on the same sets.
   - Luna 3× on the sets of the Luna-mapped roles.
   - ANALYSIS needs `label-classifier` and the pooled `topic-route` gate (wrong-direct ≤ 1, missed-direct ≤ 20%; plan 261023 success criteria). The user's 2026-10-14 "accuracy first" choice for ANALYSIS stands, so propose a move only if Luna is at least as good as Terra.
4. **Report** `plans/reports/model-tiering-261030-openai.md`: table per set (Terra / Luna runs / decision), smoke figures, the cost per 8-turn session extrapolated from the smoke tokens, and the spend.
5. **Apply:**
   - Final chains go in `.env.example`.
   - The user updates `.env.local`. Do not edit or print it.
   - The Vercel env list goes in the report for phase 9.
   - `tests/e2e/helpers/stack.ts` keeps single-spec Luna, because the stub ignores the model.

## Todo

- [ ] Pre-flight
- [ ] Smoke (approved)
- [ ] Terra baseline + Luna 3× (approved)
- [ ] Report + `.env.example`

## Success Criteria

- [ ] Every role answered once on its primary OpenAI model with a valid parse.
- [ ] Each role's final model is backed by a 3/3 pass in the report, or for roles without a set by the starting map.
- [ ] Spend so far ≤ 0.45 USD.

## Risk Assessment

- Small sets rank models and do not prove gates (same caveat as 2026-10-14). The report says so.
- Luna could pass ANALYSIS and still read the Vietnamese routing worse in live use. The decision stays with the user and is recorded with the numbers.
- Latency NFR-2 (p95 ≤ 6 s per turn) is measured in phase 9 on the deployed app (`pnpm il measure-latency`).
