---
phase: 5
title: "Scenario generator v2"
status: done
priority: P2
effort: "2d"
dependencies: [2]
---

# Phase 5: Scenario generator v2

## Overview
Generation stops paying twice for small mistakes, and starts checking the property that breaks live sessions:
- A failed `validate` sends back only the broken items or fields for repair. A full rewrite happens only when the scenario's overall shape is wrong.
- A new routing check makes sure every item's sample question routes to its own topic tag, under the same routing rules the Director uses, before any learner plays it.
- The generator's rules ask for distinct facets, items that don't overlap, and a persona who answers briefly.

## Context links
- `src/graphs/generation-graph.ts:51-75` (generate + `validate` feedback loop: the whole previous JSON goes back, and the whole scenario comes back)
- `src/llm/prompts/scenario-generator.ts` (`FILE_RULES`, `buildGeneratorMessages`, `toScenarioFile`)
- `src/scenario/validate.ts` (`ViolationCode`, `Violation.path`)
- `src/server/generation.ts` (runner, cost meter, `onDraft` resume), `src/db/schema.ts:351-358` (`AttemptReport`), `:343` (`ATTEMPT_STEPS`), `:347` (`FAILURE_CODES`)
- Phase 9 measurements: 0.018–0.046 USD and 32–75 s per attempt; 2 of 3 topics needed a second try (`plans/261003-1818-interviewlab-bootstrap-s1-and-custom-topics/phase-09-custom-topics.md`)
- `tests/e2e/llm-stub.mjs` (generator, moderation and safety markers)

## Key insights
- A second try costs ≈ 0.021 USD and 29–38 s, because ~4k output tokens are written again. Most `validate` codes point at one path (`items[3].topic_tag`, `surface_facts[2]`). Only count- and shape-level codes need a whole new scenario.
- `AttemptReport.violations` keeps only the last failure's messages. Why successful attempts needed retries was never recorded, so this phase records every repair.
- Confusable tags in a generated persona surface at runtime as wrong unlocks, or after phase 2 as constant abstention. One cheap call can test tag distinctness offline, where seeing every tag and sample question at once breaks no isolation rule.
- `ATTEMPT_STEPS` stays `generating`/`validating`. The routing check runs inside "validating", so the "Đang chuẩn bị" screen does not change.

## Requirements
- Functional:
  - `FILE_RULES` additions:
    - each `topic_tag` names one facet, and no two tags can answer the same question;
    - item contents do not overlap: telling one must not reveal another;
    - `voice_notes` describe someone who answers briefly and only what was asked;
    - `sample_question` asks exactly at its tag's facet.
  - Repair mode is a data table, `REPAIR_MODE: Record<ViolationCode, "targeted" | "full">`:
    - `full` for `schema`, `item_count`, `surface_fact_count`, `path_missing`;
    - `targeted` for every other code.
    A violation list that contains any `full` code goes to today's whole-scenario feedback loop.
  - Targeted repair (`buildRepairMessages(scenario, violations)`):
    - Input: the current scenario as data, plus the violations.
    - Output schema: `{ items: [{ index: number, ...generated item fields }], fields: [{ path: string, text: string }] }`.
    - Code applies only the items whose index had a violation, and only the prose paths that had one. Anything else in the reply is ignored and recorded. Then `validateScenario` runs again.
    - The loop cap stays `GENERATOR_FEEDBACK_LOOPS = 2`, shared by both modes.
  - Routing check (`src/llm/prompts/route-check.ts`):
    - One call, role ANALYSIS (the Director's model, so it measures what live routing will do), billed to the attempt.
    - Input: `ROUTING_RULES` from phase 2, tags `T1..Tn`, sample questions `Q1..Qn`.
    - Output: `{ routes: [{ question: "Q1", direct: "T1" | null, broad: string[] }] }`.
    - Code marks item i confusable when Q_i's direct ≠ T_i, or when another question's direct = T_i. A missing route counts as confusable.
    - Confusable items get one targeted repair of `topic_tag` and `sample_question` (the instruction names the other tags). Then `validate` and the routing check run once more.
    - If items are still confusable after that, the scenario **passes**. `report.routeCheck` keeps the confusable items with `repaired: true`, and the admin attempt page shows them. The learner is not penalised for a generator weakness. At runtime, routing that may abstain means confusable tags make the persona harder, not wrong. (User decision, validation 2026-10-23.) <!-- Updated: Validation Session 1 - confusable after repair passes with a report entry -->
  - `AttemptReport` gains `repairs?: { mode: "targeted" | "full"; violations: string[] }[]` and `routeCheck?: { confusable: number[]; repaired: boolean }`. It is jsonb, so no migration. The admin attempt page today reads only `violations`, `unsafe` and `error` (`src/app/admin/custom-topics/[attemptId]/page.tsx:15`), so it gets two small blocks for the new keys.
  - Graph: `generate` → `validate`/`repair` loop → `route_check` (→ repair → `validate` → `route_check`) → `safety` → end. Safety always reads the final scenario. `onDraft` stores the scenario after each successful `validate`. A resumed run re-runs the routing check (≈ 0.002 USD) instead of storing new state.
- Non-functional:
  - The cost meter covers every new call; the reserve is unchanged.
  - Stub-driven e2e and int tests spend 0.
  - The paid check of 2 topics (≈ 0.07 USD) needs approval.

## Architecture

```
moderate ─► generate ─► validate ─┬─ ok ─────────────► route_check ─┬─ ok ──────────────► safety ─► done
                                  ├─ targeted codes ─► repair(items/fields) ─► validate ...   │
                                  └─ full codes ─────► regenerate (today's loop)              │
                                                                     └─ confusable ─► repair(tags) ─► validate ─► route_check (once)
```

## Related code files
- Create: `src/llm/prompts/route-check.ts`, `tests/llm/route-check.test.ts`
- Modify:
  - Prompts: `src/llm/prompts/scenario-generator.ts` (rules, `buildRepairMessages`, repair schema, `REPAIR_MODE`), `src/llm/prompts/analysis.ts` (export `ROUTING_RULES`, done in phase 2)
  - Pipeline: `src/graphs/generation-graph.ts`, `src/db/schema.ts` (`AttemptReport` type only)
  - Stub: `tests/e2e/llm-stub.mjs` (route-check and repair calls; markers `[stub:confusable]`, `[stub:invalid-once]`)
  - Admin: `src/app/admin/custom-topics/[attemptId]/page.tsx` (render `repairs` and `routeCheck`)
  - Tests: `tests/graphs/generation-graph.test.ts`, `tests/server/generation.int.test.ts`, `tests/e2e/custom-topic.spec.ts`, `tests/llm/custom-topic-prompts.test.ts`

## Implementation steps
1. `REPAIR_MODE` table and `buildRepairMessages`. Unit tests:
   - mode selection;
   - patches outside the violated paths are ignored;
   - item fields map through the same `toScenarioFile` id rules.
2. The generation graph with repair. Tests on scripted models:
   - a tag duplicate is repaired in one targeted call, and the repair's output tokens are well under a full scenario's;
   - an `item_count` failure goes to full regeneration;
   - the loop cap holds across both modes.
3. The routing check prompt, schema and scoring (`confusableItems`), with unit tests: swapped routes, a missing route, a tag that absorbs two questions, unknown aliases.
4. Wire the routing check into the graph and the report. Tests:
   - confusable, then repair, then pass;
   - still confusable after the repair: the attempt passes, `routeCheck.confusable` is non-empty and `repaired` is true, and no quota counter changes;
   - the meter counts the calls;
   - a resumed run from a draft re-checks routing and does not regenerate.
5. Stub support and the e2e custom-topic spec: a normal topic passes, a `[stub:confusable]` topic passes after repair, and `[stub:invalid]` still fails as `invalid`.
6. Paid, after approval: 2 real topics end to end (≈ 0.07 USD). Use one that needed two tries in phase 9 ("quy trình xin nghỉ phép và duyệt nghỉ phép ở công ty nhỏ") and one new one. Record cost, time, repairs and routing check results here.

## Todo list
- [x] Generator rules
- [x] Repair mode table and targeted repair
- [x] Routing check prompt and scoring
- [x] Graph wiring, report keys, resume behaviour
- [x] Stub markers and e2e
- [x] 2 real topics (approved; 0.0577 USD)

## Success criteria
- [~] A targeted repair's output tokens are ≤ 25% of a full generation's, measured in the real run, or shown on the scripted model by token counts. Written output: 280 against 2872 tokens (10%). Billed output, reasoning included: 1245 against 3556 (35%), because the repair spent 965 tokens reasoning. Its cost was 54% of a full generation and its time 31% (11 s against 37 s). See Results.
- [x] Every passed scenario has `report.routeCheck`. The 2 real topics pass, with their cost and time recorded.
- [x] All tests pass. `ATTEMPT_STEPS` and `FAILURE_CODES` are unchanged.

## Results (2026-10-26)
- **Real run**: moderation and the generation graph, Flash, no database. The rows were not written to `llm_call`, so the spend is recorded here.

  | Topic | Time | Cost | Calls | Repairs | Routing check |
  |---|---|---|---|---|---|
  | quy trình xin nghỉ phép và duyệt nghỉ phép ở công ty nhỏ | 38 s | 0.0185 USD | generate, check, safety | none | clean on the first check (9 tags) |
  | cách người đi làm chọn và đổi gói cước điện thoại | 75 s | 0.0392 USD | generate, targeted repair, check, tag repair, check, safety | 1 targeted (2 secret-term leaks: `research_goal`, `items[7].do_not_assert`), 1 tag repair (items 0, 2, 5) | 3 confusable, then clean after the repair |

  - Leave-request topic: in phase 9 it took 2 tries, 75 s and 0.046 USD. Now it took 1 try, 38 s and 0.0185 USD.
  - The targeted repair replaced a second full generation. A full generation took 37 s, 3556 output tokens and 0.0147 USD. The repair took 11 s, 1245 output tokens (965 of them reasoning) and 0.0080 USD.
  - Reasoning dominates both repairs: the tag repair spent 1426 of its 1619 output tokens on it. Lowering the repair's effort is the next lever. It is a role setting, so it is left for phase 6.
  - A routing check costs 0.0013–0.0015 USD and takes 3 s.
- **Code review**: 8.5/10 (`plans/reports/code-reviewer-261026-1617-phase-05-generator-v2.md`). Fixed:
  - Both repairs now carry the focus rule, so a rewritten item keeps to the scenario's focus.
  - A tag repair that breaks `validate` is recorded with `dropped`, and the admin page says it was not kept.
  - Left open (low): repairs are per run, not per attempt, so a resumed attempt can repair its tags again and its report shows only the last run's repairs. The admin page names confusable items by position.
- **Deviations from Requirements**:
  - The tag repair has its own small schema (`src/llm/prompts/route-check.ts`). A resumed draft is a stored `Scenario`, not the generator's reply.
  - A tag repair that breaks `validate` is dropped, and the scenario that passed is kept.
  - Repair entries may carry `ignored` and `dropped`.
- **Tests** (`plans/reports/tester-261026-1617-phase-05-generator-v2.md`):
  - typecheck and lint pass; unit 1245/1245; int 675/675.
  - e2e 328/329: `responsive.spec` failed once on `ERR_NETWORK_CHANGED` and passed 12/12 alone.
  - After the review fixes: unit, the three generation int files (54/54) and `custom-topic.spec` (18/18) were run again.

## Risk assessment
- A targeted repair can fix one rule and break another, for example a new tag that leaks a secret term. Mitigation: full `validate` after every repair, under the shared loop cap.
- The routing check is a proxy: it has no transcript and judges all questions in one call. It can disagree with live routing. Mitigation: it uses the same rules and model as the Director. The live Director still abstains when it cannot tell topics apart, so a missed confusion makes a persona harder, not wrong.
- Extra latency, ≈ 2–4 s per routing check. That is small next to 29–38 s of generation, and repairs save more than that.
- Generated content can still overlap in ways the tags don't show. Only the generator rules address it. The lean eval does not run on custom personas (light check, decided 2026-10-09).

## Security considerations
- Every model output in this path is untrusted data. Patches are applied only to violated paths. The scenario passes `validate`, including `model_directed_text`, and then the output safety check, before anyone plays it.
- The routing check sees only public tags and sample questions, offline. No learner text is involved: the topic text goes only to moderation and generation, as today.

## Next steps
- Phase 6 includes the generation numbers in the docs' cost section.
