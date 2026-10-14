---
phase: 2
title: "Token and prompt cuts"
status: pending
priority: P1
effort: "2d"
dependencies: [1]
---

# Phase 2: Token and prompt cuts

## Overview
Move every role to `google:gemini-3.8-flash` (user decision: no OpenAI key), then cut tokens in the prompts that live sessions and the lean eval share (ANALYSIS, PERSONA, REPLAY_JUDGE, reveal). Target: ≥ 25% lower cost per 30-turn session than the phase 1 baseline (measured all-Google), with no judgement-eval regression.

## Requirements
- Functional: same outputs and schemas. The engine logic (`src/engine/*`) is unchanged.
- Non-functional: each cut is measured on its own with `pnpm il cost-report` and `pnpm il judgement-eval`. A cut that regresses a set is reverted.

## Architecture
Measured baseline (`plans/reports/cost-baseline-261014-2205-llm-spend-by-role.md`):
- Input is ~95% of cost. Reasoning is 0 and output is ~5%.
- The cache hit share is **0% in sessions** and ~10% in eval.
- Session input grows ~+125 tokens per call per turn.

So cut 1 (making the cache work) and cut 2 (the transcript window) are the work. Cuts 3–4 are low priority, and cut 3 can be skipped if reasoning stays at 0.

Cuts, in order of expected gain:
1. **Cache-friendly prefix.** Put everything static for a session first, byte-identical every turn: system rules, label definitions, persona facts (`renderPersonaFacts`), the scenario public block. Put per-turn blocks (transcript tail, selected hook, judged turn) last. `persona.ts` already keeps its system message fixed. Apply the same rule to `analysis.ts`, `turn-judge.ts` and the reveal prompts. Check that `tokens_cached` rises in `llm_call`. Implicit caching has a minimum prefix size and a discount that must be confirmed in the Gemini docs first (plan open question 2).
2. **Transcript window.** ANALYSIS and the turn judge get the last N turns verbatim (start at N = 6) and a compact digest of older turns. The digest is a typed projection of the engine state, `TranscriptDigest = { told: { alias, turn }[]; droppedHooks: { alias, turn }[]; openness }`, rendered from a fixed template. Its input type holds no item `content`, so locked content cannot reach it by construction. No LLM summary and no text parsing. This turns quadratic token growth into linear. PERSONA keeps the full chat history, because the voice needs it. Only if the measurements show it is the top cost does PERSONA also get a window.
3. **Reasoning effort per role.** Try `minimal` for PERSONA (pure role-play) and for `EVAL_INTERVIEWER` and `STRING_CHECK`. Keep `low` for the judges. Reasoning tokens are billed as output (`src/llm/pricing.ts`). This is env only (`LLM_<ROLE>`), so it needs no code beyond updating the `.env.example` defaults. These defaults become all `google:gemini-3.8-flash:<effort>`, and `OPENAI_API_KEY` stays optional (`src/config/env.ts` already treats it so).
4. **Output trimming.** Structured schemas (`src/llm/schemas.ts`) drop free-text `reason` fields that nothing reads in production. Keep them only where the reveal or a trace reader uses them.
5. **Rule text dedupe.** Cut the repeated rule prose in `analysis.ts`, `turn-judge.ts` and `verifier.ts` to the shortest form that still passes the judgement sets.

## Related Code Files
- Modify: `src/llm/prompts/analysis.ts`, `src/llm/prompts/turn-judge.ts`, `src/llm/prompts/persona.ts`, `src/llm/prompts/end-judge.ts`, `src/llm/prompts/feedback-generator.ts`, `src/llm/prompts/verifier.ts`, `src/llm/schemas.ts`, `src/engine/contexts.ts` (digest builder), `.env.example`
- Create: `src/engine/transcript-digest.ts`, `tests/engine/transcript-digest.test.ts`
- Tests to keep green: `tests/engine/contexts-isolation.test.ts` (the digest must not carry locked content), `tests/llm/*`, `tests/graphs/*`

## Implementation Steps
1. Set every `LLM_<ROLE>` to gemini-3.8-flash. Snapshot the judgement-eval results for all 6 sets (`evalsets/*.jsonl`) on the current prompts as the reference. This captures what the judges score after leaving gpt-6-luna. If a judge set drops, fix it with a prompt change before going on.
2. Reorder the prompt blocks for a stable prefix. Unit-test that two consecutive turns of one session share an identical prefix string.
3. Add `transcript-digest.ts` (pure function of the engine state and turns) and wire it into `contexts.ts` for ANALYSIS and the turn judge.
4. Extend `contexts-isolation.test.ts` the way it already checks the other contexts. The type of `buildDigest`'s parameter must not include `content`, enforced with a compile-time `expectTypeOf` assertion.
5. Change efforts in `.env.example`. Rerun the judgement sets.
6. Trim the schemas and rule text one at a time, rerunning the sets after each.
7. Play one real 30-turn session and one quick eval. Compare with the baseline in `cost-report`.

## Success Criteria
- [ ] Each judgement-eval set scores at least its reference.
- [ ] Measured cost per 30-turn session is ≥ 25% below the phase 1 baseline.
- [ ] `tokens_cached / tokens_in` > 0 on PERSONA and ANALYSIS from turn 2 on, if the provider supports implicit caching at this prompt size.
- [ ] Isolation tests pass.

## Risk Assessment
- The windowed transcript may hurt `grounded_turn_id` evidence for old turns. Mitigation: the digest keeps the turn numbers of told items, and N is tunable. The turn-verdict set is the guard.
- The starter judgement sets are small (8–18 lines). A "no regression" result there is weak evidence. Mitigation: phase 4's mutation suite and one real session review back it up.
