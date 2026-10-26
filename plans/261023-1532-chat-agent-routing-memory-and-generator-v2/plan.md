---
title: "Chat agent routing, session memory and generator v2"
description: "Rebuild the two calls of a turn as a Director (topic routing that may abstain and must quote evidence, plus session memory) and an Actor (short natural replies from only what the turn is about), and make scenario generation repair only what failed and check its own topic tags."
status: completed
priority: P1
effort: "~10.5d"
branch: main
tags: [refactor, critical, llm-cost, langgraph, chat, generator]
blockedBy: []
blocks: []
created: 2026-10-23
---

# Chat agent routing, session memory and generator v2

## Overview

Four problems, one engine.

1. **Wrong-topic unlocks (critical).** Call 1 must pick at most one of 8–12 short topic tags for every question, "the clearest match", with no way to say the question is general (`src/llm/prompts/analysis.ts:73`); when it lists several, code keeps the first (`src/engine/check-analysis.ts:52`). A `surface` item opens on the tag alone (`src/engine/unlock.ts:11`) and the persona is then told to say it now, so a wrong tag opens the wrong secret and the reply jumps topic. Tags overlap by design: 5 of chị Thu's 11 tags are about "ghi chi tiêu"; co-lan has "khi hai bên muốn cùng một giờ" next to "lần xếp lịch bị trục trặc". No test set measures question → item. Calibration (2026-10-15) found every `no_leaks` failure was a `topic` brush on a neighbouring locked item (`plans/reports/calibration-261015-lean-eval.md`), and the same question opened an item in one run and not the next (`plans/reports/qa-agent-261014-2330-first-real-runs.md`).
2. **Long, unnatural replies.** The persona prompt says "có thể lan man một chút" (`src/llm/prompts/persona.ts:46`); there is no output cap; every open item is offered every turn ("nói ra khi phù hợp", `src/llm/prompts/persona.ts:15`); the question type is computed but never shapes the reply. Call 2 averaged 269 output tokens in the 2026-10-14 eval runs (`plans/reports/cost-baseline-261014-2205-llm-spend-by-role.md`). That figure comes from eval transcripts, not learner sessions; phase 1's "before" run measures the session figure.
3. **No memory.** Both calls get the whole transcript every turn (+~130 input tokens per turn per call), and nothing records the details the persona made up, so later replies can contradict them.
4. **Generation pays twice.** A failed `validate` regenerates the whole scenario (~4k output tokens) for one bad field (2 of 3 measured topics needed a second try, `plans/261003-1818-interviewlab-bootstrap-s1-and-custom-topics/phase-09-custom-topics.md`), and nothing checks that generated tags can be told apart.

The shape stays: two calls per main turn, with the unlock decided in code between them. That shape is what keeps secrets sealed. What changes is what goes into each call:

```
learner question
  │
  ▼
Director (Call 1, role ANALYSIS, structured) ─ sees: last 5 exchanges + memory of older ones,
  │  label + evidence (as today)                 open items, hooks, do-not-asserts, public tags;
  │  topic: direct + quoted span | broad | none  never locked content
  │  verdict on the last reply (as today)
  │  memory of the exchange leaving the window: gist + details the persona gave about itself
  ▼
decide (code, pure) ─ unlock only on direct + valid span; broad → a hook line may drop;
  │                    openness; reply shape from a data table
  ▼
Actor (Call 2, role PERSONA, streamed) ─ sees: persona card, last 5 exchanges, memory,
                                         only this turn's items, shape, ≤ 1 hook, ≤ 1 do-not-assert
```

Rejected: one tool-calling agent per turn that unlocks items itself (the model would see secrets and decide unlocks, and it needs more calls); embedding similarity for routing (a threshold would decide a semantic question, against the 2026-10-14 rule); a LangGraph checkpointer (state already lives in `turn`/`snapshot` rows, which replay branches read).

## Decisions (user, 2026-10-23)

- Scope **HOLD**: routing, in-session memory, short replies, token cuts, generator v2. No cross-session learner memory. Call 2 keeps its model.
- Memory is **in-session only**, stored in `turn.decision_json`. No new table, no migration.
- Director model: **measure Flash-Lite, then decide**. The switch happens only if every gate passes 3/3 and the user approves the measured result. Until then, the 2026-10-14 decision stands: ANALYSIS stays on 3.8 Flash.
- Paid verification **≤ 0.5 USD for the whole plan**, every run approved first. Everything else runs on stubs and scripted models (memory `llm-budget-zero-paid-calls`).
- Hooks (user, phase 2 code review, 2026-10-23/24):
  - Topics a question only touches are a fallback pool. Their hook never takes the slot from the direct topic or from a story's next step.
  - No such hook is dropped while the learner asks directly about a locked item.
  - A hook drawn from that pool carries its own do-not-assert.
  - The validation decision still holds: a broad question drops one hook.

## Invariants kept

1. Locked item content never enters Call 1, Call 2 or the replay judge. Memory is written by Call 1, so it cannot carry what Call 1 never saw.
2. Unlocking is deterministic code over checked evidence. At most 1 item per turn.
3. A main turn makes ≤ 2 logical LLM calls and a replay turn ≤ 3. Only Call 2 streams. The turn API returns persona text, the turn count, or an error state.
4. Learner text and every model-written memory line are wrapped as data in prompts.
5. The 2026-10-14 rules hold. No string matching, regex or if/else heuristic decides anything semantic. Code checks references, ranges and sets only. Rule tables are data. The `secret_terms` rule stays unchanged, and nothing new depends on it.
6. The `LLM_<ROLE>` names, the `llm_call` columns and the turn/snapshot tables stay as they are (deploy contract).

**Rollback:** revert the deploy, with no data step. New keys in `decision_json` are ignored by old code. Rows written before the change read in new code as "no memory, no hints" (verbatim fallback). A Director model switch is undone by setting `LLM_ANALYSIS` back.

## Cost model (measured, phase 6)

| | Before (2026-10-14 estimate) | Estimate for this plan | Measured |
|---|---|---|---|
| 8-turn interview | ≈ 0.036 USD | ≈ −10% | **0.031 USD** (−15%) |
| 30-turn interview | ≈ 0.197 USD | ≈ −28% | **≈ 0.15 USD** (−24%, extrapolated from 17 turns) |
| Generator retry | ≈ 0.021 USD | ≈ −80% | a targeted repair cost 0.008 USD (−62%) |
| Routing check per generated scenario | — | ≈ 0.002–0.006 USD | 0.0013–0.0015 USD |

- Measured on a 17-turn production session on Flash (2026-10-25). The Director stays on Flash: Lite failed routing.
- Call 2 output is 15–107 tokens.
- Input keeps growing by ≈ 65–110 tokens a turn after turn 5 (gists and claims of older exchanges), unlike the estimate.
- No call hit Gemini's cache.
- The reveal (≈ 0.03 USD) is not included.

## Phases

| # | Phase | Status | Depends on | Effort |
|---|-------|--------|------------|--------|
| 1 | [Routing test set, batch judgement runs and baseline](./phase-01-start.md) | Done: wrong-route baseline 16.1% (9/56). Before-transcript: median 140 words a reply, persona drifts into locked items, ~7 s a turn | — | 1.5d |
| 2 | [Director v2: topic routing with abstention and evidence](./phase-02-director-v2-topic-routing.md) | Done: wrong-route 16.1% → 1.8% (1/56) on unchanged tags, 0/56 after one tag rewrite; missed 0%; labels 100% | 1 | 2d |
| 3 | [Session memory and bounded context](./phase-03-session-memory-and-bounded-context.md) | Done: prompt at turn 30 −46% (Call 1), −53% (Call 2); labels 100% (24/24) with window + memory | 2 | 2d |
| 4 | [Actor v2: short, natural replies](./phase-04-actor-v2-short-natural-replies.md) | Done: median reply 140 → 45 words, Call 2 latency 4.5 → 2.4 s; naturalness accepted by the user on production | 3 | 1.5d |
| 5 | [Scenario generator v2](./phase-05-scenario-generator-v2.md) | Done: targeted repair and routing check; leave-request topic 75 s / 0.046 → 38 s / 0.0185 USD; a repair writes 10% of a full scenario but bills 35% (reasoning) | 2 | 2d |
| 6 | [Measure, tier and ship](./phase-06-measure-tier-and-ship.md) | Done: Lite fails routing (7/56 wrong), so ANALYSIS stays on Flash; 8 turns cost 0.031 USD measured; co-lan passes `no_leaks` (calibration: 0/6) | 3, 4, 5 | 1.5d |

Phase 5 touches the generation path (`src/graphs/generation-graph.ts`, `src/llm/prompts/scenario-generator.ts`, a new route-check prompt, the `AttemptReport` type, and the admin attempt page). It reuses phase 2's `ROUTING_RULES`, so it can run in parallel with phases 3–4, with one exception: phases 2, 3 and 5 all edit `tests/e2e/llm-stub.mjs`, so its edits must land one at a time.

## Paid verification budget (≤ 0.5 USD; ask before every run)

Before each run, print the estimate and the plan's spend so far (`pnpm il cost-report`, scope `eval`/`generation` since 2026-10-23). If spend + estimate > 0.5 USD, stop and ask. Judgement sets run through Gemini Batch (half price) once phase 1 adds `--batch`.

**Spent: ≈ 0.421 USD of 0.5** (phase 1 ≈ 0.105, phase 2 0.1053, phase 3 0.0303, phase 4 0.0446, phase 5 0.0577, phase 6 0.0775). Phase 1's first two runs wrote no `llm_call` rows because the DB was unreachable, and phase 5's run used no database, so this running total is kept here by hand.

Remaining: ≈ 0.079 USD. The before-transcript cost 0.052 against 0.04 planned, because the replies were long; phase 4's after-run should cost less.

Rule: run no paid CLI command while the configured DB is unreachable. The call is paid first, and then the `llm_call` write crashes the run.

| Phase | Run | Est. USD |
|---|---|---|
| 1 | `topic-route` 56 lines (one pooled file), today's prompt, Flash, batch (baseline) | 0.06 → **0.0514 spent** |
| 1 | ~~`label-classifier` far-reference baseline~~ skipped (user, 2026-10-23); phase 2's run is the baseline for phase 3 | 0.01 → 0 |
| 1 | `transcript-run --turns 10` chị Thu, today's engine (before): the first try crashed on the DB write (**0.0021 lost**); the rerun after the Supabase restore spent **0.0517** | 0.04 → **0.0538** |
| 2 | `topic-route` (56 lines pooled) + `label-classifier`, new prompt, unchanged tags, Flash, batch | 0.09 → **0.0864 spent** |
| 2 | `topic-route` lines touched by curated tag edits (chị Hạnh's 18), Flash, batch | 0.01 → **0.0189 spent** |
| 3 | `label-classifier` with window + memory, batch | 0.03 → **0.0303 spent** |
| 4 | `transcript-run --turns 10` (after) | 0.04 → **0.0446 spent** |
| 5 | 2 real custom topics end to end | 0.07 → **0.0577 spent** |
| 6 | Lite trial: `topic-route` × 3 runs, `label-classifier`, `guide-check`, batch | 0.11 → **0.0307 spent** (stopped after run 1 failed) |
| | **Core total** | **≈ 0.46** |
| 6 | Lean eval co-lan after the curated tag import, batch (only if the running total allows) | 0.04 → **0.0468 spent** |

## Cross-plan relations

- `261014-2139-lean-eval-token-cuts-and-admin-dashboard` (in progress, phase 4 partial). Its open gate rule waits on clean personas that stop failing `no_leaks`. This plan changes the persona behaviour that those failures come from, so that plan was `blockedBy` this one, until 2026-10-26 (user decision after co-lan passed `no_leaks`). The judge's tolerance for `topic` brushes caused by overlapping item content stays that plan's decision.
- `261003-1818-interviewlab-bootstrap-s1-and-custom-topics` (in progress). Its invariants are kept. Its open question 7 (the persona invents detail) and 8 (nothing checks generated personas) are narrowed by phases 4 and 5. There is no blocking either way.
- `261010-1200-library-topic-layer-and-app-topics`. Shares only the curated scenario files, whose tags phase 2 may edit. There is no blocking.

## Success criteria

- [x] On the three `topic-route` sets pooled (≥ 48 lines per run), with the production Director model: wrong-direct ≤ 1 line (≈ 2%) and missed-direct ≤ 20%, against a recorded baseline. Phase 2 measured this on Flash: 1/56 wrong and 0/36 missed, against a 9/56 baseline. If phase 6 switches the Director model, its 3/3 gate must prove this again.
- [x] `label-classifier` agreement ≥ 94.4% (the 2026-10-14 Flash result) with 0 leading false positives; far-reference lines no worse than baseline. Turn-judge changes are covered by unit tests; `turn-verdict` has no paid rerun, because its cases are one exchange long. Phase 2 scored 100% (24/24) with 0 leading false positives on the full transcript; phase 3 matched it with the window and memory: 100% (24/24), 0 leading false positives.
- [x] A scripted 30-turn session shows Call 1 and Call 2 prompts bounded after turn 5: growth ≤ one gist line per turn. Unit test, 0 paid calls.
- [ ] Demo `transcript-run --turns 10` after phase 4: median reply ≤ 60 words, closed questions answered in ≤ 2 sentences, no list-formatted reply, gist fill ≥ 90%, latency not worse than before. The user reads before/after and accepts.
- [ ] A generator retry patches only the broken items (repair output ≤ 25% of a full scenario's). Every passed scenario has a routing check. 2 real topics pass.
- [ ] Isolation tests pass with memory present. Calls per turn are unchanged. The unlock is still decided in `src/engine/unlock.ts`.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:int`, `pnpm test:e2e` pass.
- [ ] Paid spend ≤ 0.5 USD, recorded per run in the phase files.

## Not in scope

- Cross-session learner memory. Call 2 on Flash-Lite. Prompt caching: prompts sit under the 4,096-token minimum (decided 2026-10-14).
- Reveal pipeline changes, new learner screens, env var renames.
- The lean eval judge's policy on `topic` brushes from overlapping item content (plan 261014, phase 4).

## Red Team Review

Inline adversarial review, 2026-10-23. It used four lenses: security, failure modes, assumptions, and scope. The reviews ran in this session, with no subagents. 15 findings, 12 accepted (user: apply all), 3 rejected. Every finding cites code.

| # | Severity | Finding | Disposition | Applied in |
|---|---|---|---|---|
| 1 | High | A per-set gate of ≤ 2% on 14–20 lines allows 0 errors, and the non-deterministic Call 1 fails on noise | Accept: the gate is on the three sets pooled, ≤ 1 wrong-direct per run | plan, 1, 2, 6 |
| 2 | High | `runGuideSet` loops one case at a time (`src/eval/guide-check-set.ts:71`), so a batch Lite trial takes over an hour | Accept: pool it | 1 |
| 3 | High | Tag edits change what is measured. Flash on edited tags would never be measured if Lite is rejected | Accept: measure the prompt on unchanged tags, then re-run the edited lines | 2, plan |
| 4 | Medium | The `story` shape contradicts the guarded openness line (`src/llm/prompts/persona.ts:7`) | Accept: `story_brief` when guarded | 4 |
| 5 | Medium | No visibility of reasoning tokens against the cap (`src/llm/gemini-batch.ts:255-258`), of empty gists (a silent cost fallback), or of latency (NFR-2) | Accept: `transcript-run` reports all three, with gates | 1, 3, 4, 6 |
| 6 | Medium | The before and after transcripts have different lengths | Accept: both `--turns 10` | 1, 4, plan |
| 7 | Medium | `turn-verdict` cases are one exchange long (`evalsets/turn-verdict.jsonl:1-3`), so a phase 3 run measures nothing new | Accept: dropped, −0.02 USD | 3, plan |
| 8 | Medium | Stored `decision_json.analysis` from before phase 2 lacks the new fields (`src/server/session-trace.ts:57`) | Accept: readers treat them as optional | 2 |
| 9 | Medium | No rollback statement | Accept | plan |
| 10 | Medium | Model-written memory sits under "Chỉ dẫn… của hệ thống" (`src/llm/prompts/persona.ts:58`) | Accept: memory goes before that header, as data | 3, 4 |
| 11 | Medium | "269 output tokens" is an eval figure, not a session figure | Accept: qualified | plan |
| 12 | Medium | Told items leave Call 2 unless routed (`src/engine/contexts.ts:144-150`), so the persona could contradict them | Accept: risk noted; turns 9–10 repeat questions to test it | 4 |
| R1 | — | "Exempting memory from the isolation scan hides engine leaks" | Reject: Call 1's own context is scanned without conversation or memory (`src/eval/isolation.ts:34-43`), so an engine leak is caught before it can reach memory | — |
| R2 | — | "`runPool` touches the QA agent for no gain" | Reject: it is the third copy of one loop (`src/eval/qa/calibration.ts:168`, `src/graphs/qa-agent-graph.ts:148`), and both are covered by tests | — |
| R3 | — | "`transcript-run` duplicates `measure-latency`" | Reject: `measure-latency` needs a deployed URL and a real session, and pays for a reveal (`docs/operations.md:87`) | — |

### Whole-Plan Consistency Sweep
- Files re-read: plan.md and phase-01 through phase-06.
- Decision deltas checked: 9. They are the pooled gate; guide-check pooling; measuring on unchanged tags first; `story_brief`; the transcript metrics; 10 turns; no `turn-verdict` in phase 3; the memory placement; the budget lines.
- Stale references reconciled: 9. They are the "≤ 2%" wording in plan and phase 2; the 0.03 transcript cost in phases 1 and 4; 0.05 in phase 3; the `turn-verdict` success lines in phase 3 and in plan; `memory` on `turn-verdict` cases (YAGNI); the budget total.
- Unresolved contradictions: 0.

## Validation Log

### Session 1 — 2026-10-23
**Trigger:** post-plan validation (`Validation: mode=prompt`), run after the red-team review. The verification pass was skipped by the guard: the Red Team Review already carries `file:line` evidence, and the plan has no `[UNVERIFIED]` claims.
**Questions asked:** 4

#### Questions & Answers

1. **[Risks]** "Persona tự sinh: sau 1 lần sửa mà routing check vẫn thấy nhãn dễ nhầm thì xử lý thế nào?"
   - Options: Cho qua, ghi vào report | Fail 'invalid', có tính lượt | Fail, không tính lượt
   - **Answer:** Cho qua, ghi vào report
   - **Rationale:** No new quota rule. The learner is not punished for a generator weakness. Runtime abstention keeps confusable tags from opening the wrong item.
2. **[Scope]** "Nội dung persona tuyển chọn có chỗ chồng nhau (co-lan: phần mềm đặt cọc ↔ lý do không lấy cọc; chị Thu: app trả phí ↔ các cách đã thử). Plan này làm gì?"
   - Options: Chỉ sửa nhãn | Sửa cả nội dung | Không sửa gì
   - **Answer:** Chỉ sửa nhãn
   - **Rationale:** The content is the user's learning design. The judge's tolerance for brushes caused by overlapping content stays with plan 261014.
3. **[Assumptions]** "Độ dài trả lời của persona theo loại câu hỏi: câu đóng → 1 câu; dẫn dắt → 1 câu gật xuôi; giả định tương lai → 1–2 câu mơ hồ; còn lại → 2–3 câu; kể điều riêng → 3–4 câu (2 câu khi còn dè dặt). Đồng ý?"
   - Options: Đồng ý | Mềm hơn | Ngắn hơn nữa
   - **Answer:** Đồng ý
   - **Rationale:** It fixes `REPLY_SHAPES` and `SHAPE_TEXT` as written in phase 4.
4. **[Architecture]** "Câu hỏi chung chung (chạm nhiều chủ đề) thì không mở gì. Persona nên phản ứng thế nào?"
   - Options: Thả 1 câu gợi mở | Không gợi ý
   - **Answer:** Thả 1 câu gợi mở
   - **Rationale:** It fixes `chooseHook`'s eligibility from `hint_item_ids`, as written in phase 2.

#### Confirmed Decisions
- A generated persona that is still confusable after one repair passes, and its report keeps the result.
- Curated personas get tag rewrites only; no content edits.
- Reply lengths per question type are as drafted.
- A broad question gets one hook line (the highest-weight touched item, once per item).

#### Action Items
- [x] Phase 5: replace the pending policy with "pass + report entry"; test wording updated.
- [x] Phase 2: tags-only note on the curated rewrite step; the hook-on-broad decision noted.
- [x] Phase 4: reply lengths marked as confirmed.

#### Impact on Phases
- Phase 2: requirements (`chooseHook`) and step 9 (tags only).
- Phase 4: `SHAPE_TEXT` confirmed, no change in substance.
- Phase 5: routing-check outcome rule and its test.

### Whole-Plan Consistency Sweep
- Files re-read: plan.md, phase-01 through phase-06.
- Decision deltas checked: 4.
- Stale references reconciled: 2 (the phase 5 "policy pending validation" requirement and its test step).
- Unresolved contradictions: 0.

## Open questions

None. The scope, memory, model and budget decisions were made on 2026-10-23, the four product choices in validation Session 1, and the red-team findings were applied.

<!-- slug: chat-agent-routing-memory-and-generator-v2 -->
