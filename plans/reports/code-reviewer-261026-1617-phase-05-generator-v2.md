# Code review: scenario generator v2 (uncommitted tree, 2026-10-26)

Scope: src/llm/prompts/{scenario-generator,route-check}.ts, src/graphs/generation-graph.ts, src/db/schema.ts (type only), admin attempt page, e2e stub, fixtures, 7 test files. ~550 LOC added.
Re-ran: `pnpm typecheck` clean; vitest route-check + custom-topic-prompts + generation-graph 51/51. Int/e2e not re-run (shared DB).

Score: 8.5/10. No blockers. Spec met except the paid-run criteria, which are gated on approval.

## Critical
None.

## High
None.

## Medium
1. **A targeted repair is written without FOCUS_RULES.** `scenario-generator.ts:201-203` `repairSystem()` adds FILE_RULES and constraints but leaves out `FOCUS_RULES[input.focus]`. A targeted repair sends back whole items, including `path`. Under `trust`, `follow_up` or `past_story` focus, the repairer can move an item off the focus path. Nothing catches it: `validate` does not check focus quotas, so the scenario passes and quietly loses its training focus. `buildRepairMessages` already takes the full `GeneratorInput`. Fix: add the focus rule to the repair system message (`repairSystem(input)` with `Pick<GeneratorInput,"constraints"|"focus">`). The other option is to keep each repaired item's original `path` the way `id` is kept. The tag repair is unaffected because it only touches tag and question.
2. **A dropped tag repair looks like an applied one.** `generation-graph.ts:186-190`: when the tag repair fails `validate`, the `repairs` entry is still `{mode:"targeted", violations:[...]}` with no sign it was thrown away, and the reason it failed is not recorded. The admin page (`page.tsx:91,103`) then shows "Sửa đúng phần lỗi" and "(đã sửa một lần)". Spec decision (2), dropping the repair, is sound. But the operator cannot tell a dropped repair from a kept one. Fix: record the failed `validate` violations on the entry (for example in `ignored`, or a `dropped: true` key), and word the admin text so it says the repair was tried.

## Low
3. **The token-size test only compares two fixtures.** `generation-graph.test.ts` "asks for a reply far shorter than a whole scenario" compares `JSON.stringify(tagFix())` with `generatedFrom()`. It never touches the graph or the meter's output tokens, so it proves nothing about the code. The success criterion allows "shown on the scripted model by token counts", which arguably makes this enough. A stronger version would assert recorded `outputTokens` from the fixture's `recordCall` in the duplicate-tag run. Otherwise, leave it for the paid run to measure.
4. **A resumed run drops the earlier run's history.** `runGenerationGraph` (`generation-graph.ts:159`) starts every run from `report: {}`. A run released at the run limit loses its `repairs`, and the resumed run records only its own route check. So the doc comment on `AttemptReport.repairs` ("Every repair the attempt made", `schema.ts:56`) is wrong for resumed attempts. The `system_error` path also replaces the whole report with `{error}`, but it did that before this change too. Fix the comment ("of the run that finished"), or accept and note it.
5. **A resumed draft can get a second tag repair.** The tag repair is capped at once per run, not once per attempt. Run 1 can repair the tags, store draft B (`onDraft`), then be released before its second check. Run 2 re-checks B and may repair again. Deadline and budget bound it, so cost risk is small. It still differs from the spec's "once".
6. **`confusableItems` does not handle duplicate routes.** In `route-check.ts:43`, `new Map(...)` keeps the last route when the model sends two for the same `Qn`. Harmless (it errs toward a single verdict) but undocumented. Off-by-one check passed: alias = index+1. `T0` and unknown aliases give -1, so nothing is absorbed, and the item's own route still counts as confusable. Routes for Q beyond n are ignored. Correct.
7. **Awkward comment wrap.** `generation-graph.ts:221-222` breaks the line after "No", leaving "No\n * simulated interview". Re-flow it.
8. **Admin shows 0-based positions.** The admin block lists `items[i]` (0-based). An operator would read tags more easily. Optional.

## Checks requested
- **(a) Acceptance criteria.**
  - Met: FILE_RULES additions (4/4); `REPAIR_MODE` covers all 17 codes as data (full = schema, item_count, surface_fact_count, path_missing); output schema; only violated items and fields are applied, with `ignored` recorded; the loop cap is shared.
  - Routing check: role ANALYSIS, billed through the same `scope`/`llmDeps`, `ROUTING_RULES` imported, T/Q aliases, scoring per spec. Still-confusable passes with `repaired:true`. Every passed scenario carries `routeCheck` (both branches). Resume re-checks without regenerating.
  - Stub markers and e2e are covered. `ATTEMPT_STEPS`/`FAILURE_CODES` unchanged. `onStep("validating")` was moved and is still emitted exactly once per run.
  - Not met yet: the paid 2-topic run and the measured ≤25% output tokens (approval-gated). The phase file's todo list and status are not updated (lead's job).
  - Thin: "no quota counter changes" for the still-confusable case is shown only at graph level. It holds by construction, because outcome `passed` takes the normal path.
- **(b) Callers.**
  - Runner: `onDraft` is fenced by token, and the meter wraps `recordCall`, so the route check and tag repair are counted.
  - Fencing and budget int tests were updated.
  - Stub phrases: "người soạn kịch bản nhân vật" now appears only in `buildGeneratorMessages`' intro, not in FILE_RULES or the repair prompts. "người sửa kịch bản nhân vật" appears only in `REPAIR_INTRO`. "người kiểm tra định tuyến chủ đề" appears only in route-check (grep-verified across src/ and tests/).
  - The repair and route-check prompts hold no topic text, so `[stub:*]` markers cannot misfire there.
- **(c) Contracts.** `AttemptReport` changes are additive and optional; no migration needed. `GeneratorFeedback` stays exported. The `onDraft` doc now says it may fire twice, and the runner's `saveDraft` handles that.
- **(d) Patterns.** Matches the local style: rule tables as data, `dataBlock` for model output, comment density. Decision (1), a separate tag-repair schema, is sound: a resumed draft is a `Scenario` (`do_not_assert` is an object, ids are positional), so `buildRepairMessages`/`applyRepair` cannot take it. Decision (3), optional `ignored`, is fine and additive.
- **Path setter safety.** `applyRepair` writes only when `field.path` is exactly one of the violation paths. Those paths come from `formatPath` over zod-parsed, schema-keyed data, and `schema` issues force full mode, so no targeted path is model-controlled. It also writes only over an existing string value. Reading `__proto__` while walking the holder has no side effect. No prototype-pollution or path-injection risk.
  - Item index: model `index` values that were not targeted, negative or out of range are ignored. Duplicates are applied once. The id is pinned to the original, and `toScenarioFile` makes ids positional anyway, so `item_id_duplicate`/`do_not_assert_id_duplicate` cannot occur for generated output.
- **Loop cap.** 1 initial call + at most `GENERATOR_FEEDBACK_LOOPS` (2) repairs of either mode, then `invalid`: the same 3 SCENARIO_GENERATOR calls as before. The cap test covers full followed by targeted. The tag repair (1) and route checks (≤2) sit outside the cap by design.
- **Invariants.** Route check sees only tags and sample questions. The tag repair, as SCENARIO_GENERATOR, sees content and secret_terms, which the generator already wrote. Learner text goes to no new call. Model output is applied only by index and path, and is always re-validated. Safety reads the final scenario. Nothing semantic is decided by string matching.

## Unresolved questions
1. Should a targeted repair keep the item's original `path` (like `id`), or get the focus rule? (Medium 1.)
2. Is "once per attempt" for the tag repair required, or is once per run acceptable? (Low 5.)
3. Paid 2-topic run: still pending approval (≈0.07 USD).
