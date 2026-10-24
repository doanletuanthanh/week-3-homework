---
phase: 2
title: "Director v2: topic routing with abstention and evidence"
status: completed
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
  - `chooseHook`: the turn's own reasons come first: an item is eligible when its id is the direct tag, had its prerequisite just opened, or the question is closing. Only when none of those is eligible, and the direct tag (if any) is already open, do the items in `hint_item_ids` count. The other conditions and "highest weight, then scenario order" are unchanged. So a broad question gets the hook line of its most important touched item, once per item (user decision, validation 2026-10-23); a touched topic never takes the slot from the direct topic or a story's next step, and drops no hook while the learner asks directly about a locked item (user decisions, code review 2026-10-23/24). <!-- Updated: Validation Session 1 - broad question drops one hook --> <!-- Updated: code review C1 - hints are a fallback pool --> <!-- Updated: code review N1 - no fallback while the direct item is locked -->
  - The persona's do-not-assert comes from the direct tag while its item is locked; otherwise, when the dropped hook's item is in `hint_item_ids`, from that item. So a hook drawn from the touched topics always goes out with its own constraint; chain and closing hooks still carry none, as before (user decision, code review 2026-10-23). Still ≤ 1 do-not-assert per Call 2. <!-- Updated: code review W1 - a broad hook carries its own do-not-assert -->
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
- broad: mã T của các chủ đề (tối đa 3, không tính chủ đề direct) mà câu hỏi chạm tới nhưng không hỏi đúng vào phần riêng; không có thì mảng rỗng.
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
chooseHook     → own = tag_item_id === id || prereqJustOpened || closing; eligible = own, or else (no locked direct) hint_item_ids.includes(id)
persona        → doNotAssert = locked direct item ?? (hook ∈ hint_item_ids ? hook item : none)
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
   - a hint makes a hook eligible, as a fallback only (no own reason, no locked direct topic);
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
- [x] Schema, types, alias resolution, checks
- [x] Hook eligibility from hints
- [x] `ROUTING_RULES` prompt
- [x] Tests and stub migrated from `topic_tags`
- [x] Re-measure (approved; 0.0864 USD) recorded
- [x] Curated tag rewrites on disk, validated, and their lines re-run on Flash (approved; one tag; 0.0189 USD)

## Success criteria
- [x] With Flash, over the pooled `topic-route` set (56 lines): wrong-direct 1/56 (gate ≤ 1 line) and missed-direct 0/36. The edited-tag lines (chị Hạnh's 18) hold the same gate: 0/18 wrong-direct, 0/11 missed.
- [x] `label-classifier` 100% (24/24) agreement, 0/18 leading false positives.
- [x] `src/engine/unlock.ts` has no diff. Every test passes on stubs: unit 1178/1178, int 673/673, e2e 328/328.

## Results (2026-10-24)
- **Routing**, full output in `plans/reports/remeasure-261024-0149-phase-02-topic-route.md` (Flash, batch, tags unchanged):
  - Wrong-direct: 16.1% (9/56) → **1.8% (1/56)**.
  - Missed-direct: **0% (0/36)**, so the new prompt does not over-abstain.
  - General questions that open nothing: 11/20 → **19/20**.
  - The one remaining error, ch-15 ("Chị nắm tiến độ của nhóm qua những cách nào ạ?", broad → `private-notebook`), was a tag problem: "cách chị tự theo dõi việc đã giao" read as the general tracking topic.
- **Tag rewrite** (user-approved; tags only):
  - `private-notebook` now reads "cách riêng của chị để nhớ từng việc đã giao". It echoes the public hook line, has no secret term, and passes `validate`.
  - chị Hạnh's 18 lines re-run: 0/18 wrong-direct, 0/11 missed, 7/7 general questions open nothing.
  - With run 1's unchanged other lines, current tags give 0/56 wrong-direct (two runs combined).
  - No sibling confusion appeared among direct questions, so no other tag was edited.
  - The DB import and the lean eval wait for phase 6.
- **Labels:** 100% (24/24), 0 leading false positives. This run is phase 3's baseline: full transcript, no window yet.
- **Code review**: 7.5/10, then 9/10 (`plans/reports/code-reviewer-261023-2259-phase-02-director-v2.md`, `plans/reports/code-reviewer-261024-0007-phase-02-review-fixes.md`). User decisions applied:
  - **C1:** touched topics are a fallback hook pool.
  - **W1:** a touched-topic hook carries its own do-not-assert.
  - **N1:** no fallback while the direct item is locked.
  - W2, W3, S1, S2 and S4 were fixed. S3 (generated scenarios are not checked against the fixed prompt wording) is deferred to phase 5.
- **Tests**:
  - `plans/reports/tester-261023-2221-phase-02-director-v2.md`, `tester-261023-2340-phase-02-review-fixes.md`, `tester-261024-0025-phase-02-cycle-3.md`.
  - Cycle 3 had one unit timeout. It came from load: tsc and eslint ran beside 62 workers. On a quiet machine the test takes 1.08 s, the same as before this phase; the tester's own 2.3 s rerun still overlapped other load. A quiet full unit run then passed 1178/1178.
- **Side effects, all intended or accepted:**
  - Fewer surface, trust and past-story items open.
  - Broad questions drop hooks from touched topics, so the reveal will show more ignored hooks.
  - The trace line reads `direct = …; direct_span = …; broad = …`, and corrections are now named `topic.direct` / `topic.broad`.
  - **The prompt change invalidates the lean-eval probe cache, so the next `pnpm il eval` pays for every probe again.**
  - `decision_json.analysis` gains two keys, with no migration. Old rows read as "no span, no hints".
- **Spend:** 0.0864 + 0.0189 = **0.1053 USD** (plan ≈ 0.10).

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
