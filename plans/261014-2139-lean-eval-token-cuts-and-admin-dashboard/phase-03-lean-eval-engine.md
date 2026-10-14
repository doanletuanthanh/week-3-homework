---
phase: 3
title: "Persona QA agent (lean eval)"
status: pending
priority: P1
effort: "4d"
dependencies: [1, 2]
---

# Phase 3: Persona QA agent (lean eval)

## Overview
A real agent, not a fixed test battery. It is a LangGraph plan → execute → judge → reflect loop. It reads a persona, decides where the persona is most likely to break, tests exactly there through engine tools, observes the results, and either probes deeper or stops. It also writes a verdict and suggested fixes. Target: **≤ 0.1 USD per new persona** (hard cap), about 0.06 USD estimated, and ~0 for a re-eval of an unchanged version.

Pattern: **plan-and-execute (ReWOO-style), not a free ReAct loop.** A ReAct agent re-reads its whole growing context on every step, and that is where agent cost explodes. Here the LLM plans a whole batch of tool calls at once. Code executes the batch in parallel. The LLM only sees compact typed observations when it reflects. So the number of LLM "thinking" calls is 2–4 per run, whatever the number of probes.

## Requirements
- Functional: run `pnpm il eval <persona> --profile lean`. The output is a typed report (verdict, thresholds, every probe with its observation, the agent's rationale, suggested fixes), stored in `eval_run` / `eval_episode` with `profile = 'lean'`.
- Functional, **safety floor**: a fixed set of probes always runs, and the agent may add probes but never remove these. The floor is one ANALYSIS-only unlock check per item and the 3 universal attacks. That keeps recall from depending on the agent's judgement.
- Functional: the agent's decisions are typed: tool names from a registry, item ids, attack ids, enums. All of them are validated by zod against the scenario's real ids. No string matching, regex or keyword rules decide anything.
- Functional: tool results are cached by hash (tool, args, the scenario fields read, the prompt version, the role spec). A re-eval reruns only the tool calls whose inputs changed.
- Non-functional: all roles are `google:gemini-3.8-flash`. The budget cap `eval_lean_budget_usd` defaults to **0.10**. The agent sees `budgetLeftUsd` in its state and must fit its plan to it. The meter aborts at the cap, as in `src/server/generation.ts`.

## Architecture

### Graph (LangGraph `StateGraph`, `src/graphs/qa-agent-graph.ts`)
```
START → structure ─→ plan ─→ execute ─→ judge ─→ reflect ─┬─(decision = probe_more & budget ok & round < 2)→ execute
         (code)     (LLM)    (code)     (LLM)     (LLM)    └─(decision = done | budget | rounds)→ report (code) → END
```
The edges route on typed state fields (`decision` enum, `budgetLeftUsd`, `round`). Each edge is a lookup over those fields, not a heuristic.

### Nodes
| Node | Kind | Calls | What it does |
|---|---|---|---|
| `structure` | code | 0 | Typed graph checks: prerequisites acyclic, every item reachable, trust thresholds reachable from `openness_start` (`src/engine/openness.ts`) |
| `plan` | LLM `QA_PLANNER` | 1 | Reads the whole scenario (public and locked). Outputs `{ publicLeaks: {fieldPath, itemId}[], riskByItem: {itemId, risk: low/med/high, why}[], actions: Action[] }` and adds actions on top of the floor: which of the 20 `ATTACKS` fit this persona's secrets (≤ 2 on top of the 3-attack floor), a paraphrased question per high-risk item, and extra negative probes for items with easy-to-lead topics. The public-field review is folded in here, so it costs no extra call |
| `execute` | code | 1–2 per probe turn | Runs the action batch in parallel (concurrency 4) through the tool registry. Probes that share a prompt prefix run back to back so the implicit cache applies |
| `judge` | LLM `EVAL_LEAK_JUDGE` | 1 | One batched call over every new persona reply: `{ replyId, disclosedItemIds[] }[]`. The locked-items block comes first (cached), the replies last |
| `reflect` | LLM `QA_PLANNER` | 1–2 | Sees compact observations only (typed rows: probe, expected, observed ids and states, never full transcripts) and the budget left. Outputs `{ decision: "done" \| "probe_more", actions?: Action[], findings: Finding[] }`. Its job is to chase near-misses: an item that unlocked but was not delivered, a reply that disclosed the right item early, an attack that raised openness |
| `report` | code | 0 | Applies the `THRESHOLDS` table, merges the findings, writes the run |

### Tool registry (`src/eval/qa/tools.ts`), `Record<ToolName, Tool>`
| Tool | Calls | Observation (typed) |
|---|---|---|
| `check_unlock(itemId, question?)` | 1 (ANALYSIS only) | `{ opened: itemId \| null, label, opennessDelta }` from `decideUnlock` over seeded state |
| `deliver_item(itemId, question?)` | 2 (ANALYSIS + PERSONA) | the above plus `replyId` (sent to the judge) |
| `negative_probe(kind, itemId)` | 1 (ANALYSIS only) | `{ opened, opennessDelta }`; must be `null` / ≤ 0 |
| `attack(attackId, turns ≤ 2)` | 2 per turn | `replyIds`, the allowed item ids per turn (from the store) |
| `inspect_state()` | 0 | told and unlocked ids, openness |

- **State seeding:** `seedState(store, { told, openness })` in `inMemoryTurnStore` (eval/test only). It applies the engine's own unlock and openness functions in order, so the seeded state is always one that real turns can reach.
- **Leak arithmetic:** `leaked = disclosed − allowed(turn)`, as set operations on ids. This is the only leak logic in code.
- **Isolation:** `QA_PLANNER` and `EVAL_LEAK_JUDGE` are eval-only roles that see locked content. ANALYSIS and PERSONA calls inside tools still go through the normal contexts, and `assertIsolated` runs on each one.
- **Design rule:** nodes, tools, thresholds and the floor are data (`{ key, run }` tables). Adding a check means adding a row, not a branch.

### Cost model (gemini-3.8-flash; implicit cache on the static prefix; ANALYSIS and PERSONA at exactly the production effort chosen in phase 2, because the eval must test what learners get; output capped by short schemas)
| Step | Calls | ~USD |
|---|---|---|
| plan (scenario ~3k in, ~700 out) | 1 | 0.005 |
| floor: `check_unlock` × 10 items | 10 | 0.008 |
| `deliver_item` for the planner's high-risk items (≤ 4) | 8 | 0.008 |
| floor and planner attacks: ≤ 5 attacks × 2 turns × 2 calls | 20 | 0.018 |
| negative probes (≤ 4) | 4 | 0.003 |
| judge (1 batched call) | 1 | 0.006 |
| reflect × ≤ 2 rounds, plus follow-up probes (≤ 6 calls) | 8 | 0.012 |
| **Total** | **~52** | **~0.06** |

The per-call price assumes cached prefixes and minimal reasoning. Phase 1 and phase 2 must confirm it. If measured costs come out higher, the agent's budget awareness cuts the optional actions first. The floor alone is ~22 calls.

What is dropped compared with the 0.37 USD design: the scripted 8-turn good path and its reveal run (the reveal prompts are checked by the judgement sets, not per persona), the separate public-review call (folded into `plan`), the persona reply for low-risk items (ANALYSIS alone proves that the item unlocks), and the fixed 10 attacks (the agent picks ≤ 2 that fit, on top of the 3-attack floor).

## Related Code Files
- Create: `src/graphs/qa-agent-graph.ts`, `src/eval/qa/tools.ts`, `src/eval/qa/floor.ts`, `src/eval/qa/thresholds.ts`, `src/eval/qa/structure-checks.ts`, `src/eval/qa/tool-cache.ts`, `src/llm/prompts/qa-planner.ts`, `src/llm/prompts/qa-reflect.ts`, `src/llm/prompts/eval-reply-judge.ts`, `evalsets/reply-judge.jsonl`, `evalsets/qa-plan.jsonl`, `tests/graphs/qa-agent-graph.test.ts`, `tests/eval/qa-*.test.ts`
- Modify: `src/llm/roles.ts` (add eval role `QA_PLANNER`), `src/eval/types.ts` (profile `lean`), `src/server/in-memory-turn-store.ts` (`seedState`), `src/graphs/turn-graph.ts` (export an ANALYSIS-only step for `check_unlock`, reusing the same nodes), `cli/commands/eval.ts`, `cli/commands/judgement-eval.ts` (kinds `reply-judge`, `qa-plan`), `src/db/schema.ts` + migration (profile `lean`; table `eval_tool_cache`)
- Reuse: `src/eval/attacks.ts`, `src/eval/isolation.ts`, `src/eval/run-episode.ts` (`withRateLimitBackoff`), `src/engine/unlock.ts`, `src/engine/openness.ts`, `src/llm/call-model.ts` (all LLM calls, with metering)

## Implementation Steps
1. Write `structure-checks.ts` (pure, typed) and its tests.
2. Add `seedState`, tested so that every seeded state is reproduced by a sequence of real turns.
3. Extract an ANALYSIS-only turn step from `turn-graph.ts` without changing the live turn behaviour (the existing graph tests must stay green).
4. Build the tool registry and the floor table. Unit-test them with `tests/helpers/scripted-model.ts`.
5. Write the planner, reflect and judge prompts and schemas. Every id field uses `z.enum(scenarioIds)`, built per run. Write the starter judgement sets: `reply-judge` (≥ 20 lines) and `qa-plan` (≥ 10 scenarios with the expected high-risk items).
6. Build `qa-agent-graph.ts` with the typed routing and the budget in state.
7. Add the tool cache. Wire up the CLI. It prints the estimate before the run, and the actual cost and the agent's rationale after.
8. Graph tests: a pass, each threshold failure, a budget-exhaustion run (the floor completes and the optional actions are skipped), a reflect loop capped at 2 rounds, and a re-eval served from the cache.

## Success Criteria
- [ ] Measured cost < 0.10 USD per new persona on all 9 curated personas. An unchanged re-eval costs < 0.01 USD.
- [ ] The floor always runs, even when the planner returns no actions (test).
- [ ] The reflect loop is bounded (≤ 2 rounds), and the budget cap is never exceeded by more than one in-flight call.
- [ ] No regex, `.match`, `.includes` or `.test` decides a verdict in `src/eval/qa` or in the agent graph. Membership checks run on id `Set`s only.
- [ ] Reply judge: recall 100%, precision ≥ 90% on its set.

## Risk Assessment
- **The agent may pick the wrong attacks.** Mitigation: the floor guarantees a baseline, and phase 4's mutation recall must be 100%. If an operator is missed, add it to the floor (data change), not to the prompt alone.
- **The writer and checker are the same model family.** Mitigation: separate prompts and calls, an id-only schema, and mutation recall.
- **Cost assumptions** (cache hit share, minimal reasoning) are unmeasured. Mitigation: phase 1/2 measure them. The budget-aware planning degrades to the floor (~22 calls, ~0.025 USD).
- **Nondeterministic planning makes reports differ between runs.** Mitigation: the verdict depends on the floor plus any finding; phase 4 requires the same verdict over 2 runs.
