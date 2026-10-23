---
phase: 2
title: "Director v2: topic routing with abstention and evidence"
status: pending
priority: P1
effort: "2d"
dependencies: [1]
---

# Phase 2: Director v2: topic routing with abstention and evidence

## Overview
Call 1 stops forcing one topic onto every question. It names a `direct` topic only when the question asks for that topic's own part, and it must quote the words of the question that show it. A general question goes to `broad` and opens nothing. A broad question may still bring a hook line, so the learner gets a cue to ask more precisely. The unlock rules themselves do not change. They read only the direct topic, which is now rarer and better supported.

## Context links
- `src/llm/schemas.ts:16-24` (`analysisSchema`), `src/engine/types.ts:21-43` (`RawAnalysis`, `CheckedAnalysis`)
- `src/engine/aliases.ts:79-84` (tag resolution), `src/engine/check-analysis.ts:50-53` (first tag kept)
- `src/engine/unlock.ts:5-29` (`satisfies`), `src/engine/hooks.ts:5-56`, `src/engine/plan-turn.ts:79-111`
- `src/llm/prompts/analysis.ts:64-74` (`LABEL_RULES`, the `topic_tags` line at `:73`)
- Phase 1 baseline numbers and confusion pairs (phase-01-start.md)

## Key insights
- The same pattern already works for labels: a model claim plus the evidence it rests on (`introduced_span`, `grounded_turn_id`), with code checking only that the evidence exists (`src/engine/check-analysis.ts:21-39`). Routing gets that same pattern.
- When a learner asks something too general to route, a wrong unlock is the expensive error. Abstaining only makes the persona answer from its surface facts, and maybe drop a hook. The gates follow that asymmetry: over the three sets pooled, wrong ≤ 1 line (≈ 2%) and missed ≤ 20%.
- Tags stay the only routing text. They are public and already checked by the unchanged `secret_term_leak` rule. Sample questions are sealed (`src/eval/isolation.ts:23`), so they cannot be shown to Call 1.

## Requirements
- Functional:
  - `analysisSchema`: `topic_tags: string[]` → `topic: { direct: string | null, direct_span: number[] | null, broad: string[] }`. It stays a plain object with nullable scalars, the shape both providers accept (`src/llm/schemas.ts:5-9`).
  - `resolveAliases` resolves `direct` and `broad` (T aliases). Unknown aliases are dropped with a correction, as today.
  - `checkAnalysis`:
    - Keep `direct` only when it resolves and `isValidRange(direct_span, learnerTokenCount)`. Otherwise record a correction ("direct không có bằng chứng") and move the alias to `broad`.
    - Remove `direct` from `broad`.
    - Dedupe `broad` and cut it to `ROUTE_BROAD_MAX = 3`, with a correction when cut.
  - `CheckedAnalysis` gains `tag_span: TokenRange | null` and `hint_item_ids: string[]`. `tag_item_id` means "direct with evidence".
  - `isClosingQuestion`: label `open`, question type `open`, no direct and no broad.
  - `chooseHook`: an item is eligible when its id is the direct tag, is in `hint_item_ids`, had its prerequisite just opened, or the question is closing. The other conditions and "highest weight, then scenario order" are unchanged. So a broad question gets the hook line of its most important touched item, once per item (user decision, validation 2026-10-23). <!-- Updated: Validation Session 1 - broad question drops one hook -->
  - The persona's do-not-assert still comes from the direct tag only (`src/engine/contexts.ts:151`). That keeps the isolation rule of ≤ 1 do-not-assert per Call 2.
  - `session-trace` shows `direct`, `span` and `broad`. Rows stored before this phase have no `hint_item_ids`/`tag_span`, so every reader of `decision_json.analysis` treats a missing field as empty or null and never assumes it is there. The readers are `src/server/session-trace.ts:57`, `src/server/reveal.ts:27` and `src/db/repo/sessions.ts:271`. <!-- Red team #8 -->
  - The new prompt text lives in an exported `ROUTING_RULES` constant (phase 5 reuses it). Its examples are about commuting, per the convention at `src/llm/prompts/analysis.ts:53`.
- Non-functional:
  - `src/engine/unlock.ts` stays unchanged.
  - No semantic decision in code.
  - Every unit, int and e2e test runs on stubs.
  - The paid re-measure (0.09 USD) needs approval.

## Architecture
Draft prompt rule (Vietnamese, replaces the `topic_tags` line):

```
topic: câu hỏi mới hỏi vào chủ đề nào trong <chu_de>.
- direct: mã T của MỘT chủ đề mà câu hỏi hỏi đúng vào phần riêng của nó, phân biệt được với các chủ đề gần nó; kèm direct_span là [chỉ số token đầu, chỉ số token cuối] của cụm trong <cau_hoi_moi> chỉ ra phần riêng đó. Câu hỏi hợp với hai chủ đề trở lên, hoặc chỉ hỏi chung chung, thì direct là null và direct_span là null.
- broad: mã T của các chủ đề (tối đa 3) mà câu hỏi chạm tới nhưng không hỏi đúng vào phần riêng; không có thì mảng rỗng.
Ví dụ, với các chủ đề T1 "cách đi làm buổi sáng", T2 "giờ giấc đi làm", T3 "chi phí đi lại":
"Sáng anh đi làm bằng gì ạ?" → direct T1, direct_span là cụm "đi làm bằng gì"; broad rỗng.
"Chuyện đi làm của anh thế nào ạ?" → direct null; broad [T1, T2, T3].
"Cuối tuần anh hay làm gì?" → direct null; broad rỗng.
```

Code flow after the change (unchanged parts omitted):

```
resolveAliases → { tag: {direct, direct_span, broad} }
checkAnalysis  → tag_item_id = direct && validSpan ? direct : null
                 hint_item_ids = dedupe(broad ∪ demoted direct) − tag_item_id, ≤ 3
decideUnlock   → unchanged (tagTouched = tag_item_id === item.id)
chooseHook     → touches = tag_item_id === id || hint_item_ids.includes(id) || prereqJustOpened || closing
```

## Related code files
- Modify (src):
  - Schemas and types: `src/llm/schemas.ts`, `src/engine/types.ts`, `src/engine/aliases.ts`, `src/engine/check-analysis.ts`
  - Engine and prompt: `src/engine/hooks.ts`, `src/llm/prompts/analysis.ts`
  - Readers of the analysis: `src/server/session-trace.ts`, `src/eval/qa/tools.ts:127-135` (the analysis literal in `probePromptFingerprint`), `src/config/limits.ts` (`ROUTE_BROAD_MAX`)
- Modify (tests): every test that builds a raw analysis. 31 files hold `topic_tags`:
  - `tests/helpers/engine-fixtures.ts`, `tests/helpers/publish-fixtures.ts`, `tests/helpers/reveal-fixtures.ts`, `tests/helpers/session-fixtures.ts`
  - `tests/engine/{check-analysis,contexts-isolation,hooks,plan-turn-adversarial,reveal-claims,reveal-compute,seal,select-replay,unlock}.test.ts`
  - `tests/eval/{attacks-and-isolation,qa-seed-and-thresholds}.test.ts`
  - `tests/graphs/{qa-agent-graph,replay-turn-graph,reveal-graph}.test.ts`
  - `tests/server/{guide-check,replay,reveal,run-turn,sealed-payloads}.int.test.ts`, `tests/cli/config-and-trace.int.test.ts`
  - `tests/e2e/llm-stub.mjs` (`NEUTRAL_ANALYSIS`), `tests/e2e/helpers/reveal.ts`, `tests/e2e/{interview,interview-screen,library-path,replay,turn-engine}.spec.ts` (the `[stub:analysis=...]` markers)
- Create: a `topic(direct, span?, broad?)` builder in `tests/helpers/engine-fixtures.ts`. Tests use it instead of repeating the literal.
- Modify (data): `scenarios/**/*.json`, only the `topic_tag` of items that the phase 1 or phase 2 confusion pairs show as confusable. No content changes. Run `pnpm il validate` on each changed file.

## Implementation steps
1. Write the `topic` builder. Change the schema and types, then fix the compile errors file by file (`pnpm typecheck` drives it).
2. `resolveAliases` and `checkAnalysis`, with unit tests:
   - a direct with no span or a bad span goes to broad, with a correction;
   - a direct that is also in broad;
   - more than 3 broad aliases;
   - unknown aliases;
   - a valid direct.
3. `hooks.ts`, with tests:
   - a hint makes a hook eligible;
   - a broad question is not a closing question;
   - the order of weights is unchanged.
4. Prompt: put the `ROUTING_RULES` text in `LABEL_RULES`' place for topics. The tests that keep each system message identical across turns must still pass (`tests/engine/contexts-isolation.test.ts:167`, `:173`).
5. Update the e2e stub `NEUTRAL_ANALYSIS` and every spec marker that steered unlocks with `topic_tags`. Run `pnpm test:e2e`.
6. `session-trace` (it tolerates old rows) and the QA tool literal.
7. Adversarial tests in `plan-turn-adversarial.test.ts`:
   - a model that claims direct with an out-of-range span opens nothing;
   - broad never opens a surface, trust or past-story item.
8. Paid, after approval: rerun the three `topic-route` sets and `label-classifier` (Flash, batch) on the **unchanged** tags, so the number measures the prompt alone. Compare with the phase 1 baseline (pooled gate) and record the result here.
9. Curated tags (user decision, validation 2026-10-23: tags only; item content stays as authored). Where confusion pairs remain, rewrite the involved tags so each names its own facet. <!-- Updated: Validation Session 1 - tags only, no content edits --> For example, co-lan `bump-booking` "khi hai bên muốn cùng một giờ" against `double-booked` "lần xếp lịch bị trục trặc"; chị Thu's five "ghi chi tiêu" tags. Use `pnpm il validate`, then the scripted-model tests. Then, after approval, rerun on Flash only the `topic-route` lines whose expected or predicted item had its tag edited (≈ 0.01 USD). Flash on the edited tags is then measured even if Lite is rejected later. The DB import and the lean eval wait for phase 6. <!-- Red team #3 -->

## Todo list
- [ ] Schema, types, alias resolution, checks
- [ ] Hook eligibility from hints
- [ ] `ROUTING_RULES` prompt
- [ ] Tests and stub migrated from `topic_tags`
- [ ] Re-measure (approved, ≈ 0.09 USD) recorded
- [ ] Curated tag rewrites on disk, validated, and their lines re-run on Flash (approved, ≈ 0.01 USD)

## Success criteria
- [ ] With Flash, over the three `topic-route` sets pooled (≥ 48 lines): wrong-direct ≤ 1 line and missed-direct ≤ 20%. The edited-tag lines hold the same gate.
- [ ] `label-classifier` ≥ 94.4% agreement with 0 leading false positives.
- [ ] `src/engine/unlock.ts` has no diff. Every test passes on stubs.

## Risk assessment
- Missed-direct may rise above 20% if the model abstains too much. Mitigation: tune the wording of the examples. A broad question still yields a hook, so the learner gets a path in.
- The new field may hurt label accuracy: one more task in the same call. Mitigation: the `label-classifier` gate. If it drops, move the topic rule after the label rules.
- Test churn is large (123 occurrences). Mitigation: one builder, compile-driven edits, no behaviour asserted twice.

## Security considerations
- The Director sees the same material as before; only the output shape changes. `contexts-isolation.test.ts` must pass unchanged in intent.
- A model trying to force an unlock still needs a direct alias, a valid span and the path's own conditions. Code checks every reference.

## Next steps
- Phase 3 adds memory fields to the same schema.
- Phase 5 reuses `ROUTING_RULES` for the generator's routing check.
