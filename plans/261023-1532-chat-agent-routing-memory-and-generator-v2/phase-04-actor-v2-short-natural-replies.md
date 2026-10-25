---
phase: 4
title: "Actor v2: short, natural replies"
status: in-progress
priority: P1
effort: "1.5d"
dependencies: [3]
---

# Phase 4: Actor v2: short, natural replies

## Overview
The persona answers like a person being interviewed. The length follows the question: a closed question gets one sentence, a leading question gets a nod, and a story comes only when an item opens. The persona hears only the items this turn is about, so it stops jumping to old topics. A hard output cap stops runaway replies. Learners lose nothing they earned: an item that opened but went untold gets one more chance on the next turn.

## Context links
- `src/llm/prompts/persona.ts` (whole file; "lan man" at `:46`, `ITEM_MODES` at `:13-17`, `PERSONA_GUARD_RULES` at `:23-26`)
- `src/engine/contexts.ts:124-162` (`buildPersonaContext`: every open item, every turn, `:144-150`)
- `src/eval/qa/mutants.ts:67-78` (the `prompt-weakened` mutant removes each guard rule, plus a newline, from the system message)
- `src/llm/create-model.ts`, `src/llm/call-model.ts:44` (`createModel` seam), `src/llm/gemini-batch.ts:236-249` (`toGeminiRequest`)
- `scenarios/ux-chi-tieu/chi-thu.json` `error_patterns.closed` ("chị Thu chỉ đáp một tiếng rồi thôi"): the authored intent that a closed question gets a short answer

## Key insights
- Length comes from the prompt, not from the cap. The prompt invites rambling, and the history shows the model its own long replies, which it copies. The window from phase 3 already shortens that history.
- The question type and label are typed outputs that code already holds (`CheckedAnalysis`). Mapping them to a reply shape is a lookup on typed data, like the unlock rules. It decides no meaning.
- Realistic short answers to closed and leading questions are also the lesson: "câu hỏi hỏng thì ra một cái gật" (`docs/loi-thoai-thuyet-trinh-interviewlab.md:221`).
- `PERSONA_GUARD_RULES` must stay verbatim in the system message, each followed by a newline, or the calibration mutant throws (`src/eval/qa/mutants.ts:72-75`).

## Requirements
- Functional:
  - `src/engine/reply-plan.ts`: `REPLY_SHAPES: { key, when, shape }[]`, first match wins. Input `{ tellNow: boolean; label: Label; questionType: QuestionType; opennessLevel: OpennessLevel }`. Order:
    1. `tellNow` and level `guarded` → `story_brief`
    2. `tellNow` → `story`
    3. label `leading` → `nod`
    4. type `closed` → `one_line`
    5. type `hypothetical_future` → `vague`
    6. otherwise → `short`
    This removes the clash between "kể ba bốn câu" and the guarded line "kể ngắn, không tự nói thêm" (`src/llm/prompts/persona.ts:7`). <!-- Red team #4 -->
  - `SHAPE_TEXT` in `persona.ts` (Vietnamese; the lengths were confirmed by the user in validation on 2026-10-23): <!-- Updated: Validation Session 1 - reply lengths confirmed -->
    - `story_brief`: "Kể hai câu ngắn, như trả lời đúng câu hỏi, chỉ phần chính."
    - `story`: "Kể ba bốn câu, như trả lời đúng câu hỏi, có một chi tiết cụ thể."
    - `nod`: "Đáp một câu ngắn, xuôi theo ý người hỏi, không kể thêm."
    - `one_line`: "Đáp một câu ngắn: có hay không, kèm nhiều nhất một chi tiết nhỏ."
    - `vague`: "Đáp một hai câu chung chung; chuyện chưa xảy ra thì không chắc, không đoán thay."
    - `short`: "Đáp hai ba câu ngắn, đúng điều được hỏi."
  - Items in Call 2 (`buildPersonaContext`):
    - `tell_now`: the item opened this turn; or an open, untold item that the question routes to (direct or hint).
    - `tell_if_fitting`: an item opened at t−1 that the verdict did not confirm as told, and that is not routed this turn. One turn only.
    - `keep_consistent`: a told item the question routes to.
    - Nothing else. Open items stay in the session through memory, not by being repeated every turn.
  - System message rules replace the "Luật trả lời" block:
    - spoken, short, and answering the question asked, at the length the turn's directions give;
    - no lists or bullets, no restating the question, no praising it, no greeting again, no questions back at the learner;
    - nothing already said in `<da_noi>`/`<truoc_do>` is retold, and if asked again, the persona says it the same way;
    - one main idea per turn.
    The two `PERSONA_GUARD_RULES` stay verbatim, each followed by a newline, and so does the "Không bàn về câu hỏi nghiên cứu…" rule. "có thể lan man một chút" is removed. `OPENNESS_TEXT.warm` becomes "kể cởi mở hơn", without "có chi tiết", so openness does not override the shape.
  - Output caps: `MAX_OUTPUT_TOKENS` in `src/config/limits.ts`, `{ PERSONA: 400, ANALYSIS: 1024 }`. Other roles are uncapped, as today.
    - `createChatModel(spec, { batch?, maxOutputTokens? })` passes `maxOutputTokens` to `ChatGoogle`, which supports it (`node_modules/@langchain/google/dist/chat_models/types.d.ts:41`), and the matching option to `ChatOpenAI`.
    - `toGeminiRequest` adds `max_output_tokens` to `generation_config`.
    - `callModel` passes the role's cap through `deps.createModel(spec, options)`. Test helpers ignore the new optional argument.
- Non-functional:
  - Isolation is unchanged: ≤ 1 do-not-assert, and only open items' content.
  - The system message stays identical across the turns of a session.
  - 0 paid calls in tests. One paid 10-turn `transcript-run` (≈ 0.04 USD) after approval.

## Architecture

```
plan-turn:   shape = firstMatch(REPLY_SHAPES, { tellNow: unlockedItemId !== null || routedUntold, label, questionType, opennessLevel })
contexts:    items = select(open items, routed ids = {tag_item_id} ∪ hint_item_ids, told, lastTurnMissed)
persona.ts:  system  = role · data rule · nhan_vat · cach_noi · su_that_be_mat · new rules (+ guard rules verbatim)
             history = window (phase 3)
             turn    = "Ghi chép… (dữ liệu)" <truoc_do> · <da_noi>
                       · "Chỉ dẫn cho lượt này (của hệ thống…)" · openness · SHAPE_TEXT[shape] · items by mode · hook · do-not-assert · question
```

## Related code files
- Create: `src/engine/reply-plan.ts`, `tests/engine/reply-plan.test.ts`
- Modify:
  - Engine: `src/engine/contexts.ts` (`PersonaItemMode`, item selection, `shape`), `src/engine/plan-turn.ts` (shape into the persona context)
  - Prompt: `src/llm/prompts/persona.ts`
  - Model plumbing: `src/llm/create-model.ts`, `src/llm/call-model.ts`, `src/llm/gemini-batch.ts`, `src/config/limits.ts`
  - Tests: `tests/engine/contexts-isolation.test.ts`, `tests/engine/plan-turn-adversarial.test.ts:162` (persona messages), `tests/llm/call-model.test.ts`, `tests/llm/gemini-batch.test.ts`, `tests/eval/qa-mutants.test.ts` (the guard rules are still found)

## Implementation steps
1. `reply-plan.ts` with tests: every shape is reachable, the order matters (`tellNow` beats `closed`, guarded `tellNow` gives `story_brief`), and the default is `short`.
2. Item selection with tests:
   - the item opened this turn;
   - routed-untold;
   - missed last turn and not routed (one retry), and not again after that;
   - told and routed;
   - not routed (absent).
3. Rewrite the persona prompt. Tests:
   - the system message is equal at turn 2 and turn 12 of a scripted session;
   - the guard rules are found with a trailing newline;
   - "lan man" is gone;
   - the shape text is present for each shape.
4. Output caps through `createChatModel`, `callModel` and `toGeminiRequest`, with unit tests on the options passed.
5. Run `pnpm test`, `pnpm test:int`, `pnpm test:e2e`. The e2e stub's persona line is fixed text, so no spec should change.
6. Paid, after approval (≈ 0.04 USD): `pnpm il transcript-run scenarios/ux-chi-tieu/chi-thu.json --turns 10 --yes`. That is the same 10 turns as the "before" run; turns 9–10 repeat questions 1–2, which tests that told things are retold consistently. Save it next to phase 1's output. Record here the medians of words, sentences, tokens and latency, the reasoning tokens per call, and the gist fill rate. Ask the user to read both transcripts. <!-- Red team #5, #6, #12 -->

## Todo list
- [x] Reply shape table and tests
- [x] Item selection by mode
- [x] Persona prompt rewrite (guard rules verbatim)
- [x] Output caps in sync and batch paths
- [x] Transcript after, 10 turns (approved; 0.0446 USD)
- [ ] User review of before/after (the user tests it on production after the push, 2026-10-25)

## Success criteria
- [x] Demo transcript: median reply ≤ 60 words, every closed question answered in ≤ 2 sentences, no list-formatted reply. A word and sentence count in the run report, not in runtime code.
- [x] Every item opened in the transcript is told within 2 turns of opening (read from the reply text; the run prints no verdicts).
- [x] The gist fill rate is ≥ 90% of the gists asked for (turns 6–10).
- [x] The median of Call 1 + Call 2 latency is not worse than the "before" run (same machine).
- [x] No PERSONA call spends reasoning tokens that push its output toward the 400 cap.
- [ ] The user accepts naturalness after reading the before and after transcripts, including turns 9–10, which repeat earlier questions.
- [x] All tests pass. `qa-mutants` still strips the guard rules.

## Results (2026-10-25)
- **Decisions (user, after code review, 2026-10-25).** They replace the item rules under Requirements:
  - At most one item is told per turn. Order: the item opened now, then the untold item asked about directly, then the untold item opened last turn (retry).
  - An untold item that a broad question only touches is `tell_when_fitting`. It does not change the shape, so a closed question stays one line.
  - A retry is `tell_now` with shape `story_brief`.
  - `ReplyInput.tellNow` became `tell: "new" | "retry" | "none"`. The mode names stay `tell_when_fitting` and `already_told`, the plan's `tell_if_fitting` and `keep_consistent`.
- **Transcript** (`plans/reports/transcript-after-261025-chi-thu.md`, compared with `transcript-before-261023-chi-thu.md`):
  - Median reply: 140 → **45 words**, 5 → 3 sentences.
  - Call 2 output: 177 → 53 tokens (max 98, cap 400), with 0 reasoning tokens.
  - Latency: 2.4 + 4.5 s → 2.6 + 2.4 s.
  - Closed questions got 2 and 1 sentences. No reply was list-formatted. Gists 5/5.
  - Turns 9–10 retell turns 1–2 consistently.
- **Open:**
  - Turn 6 (`story`, 4 sentences) ends with a feeling about the numbers, a brush on the locked `shame` item. No do-not-assert reached Call 2 that turn, because the tagged item was the one that opened.
  - Turn 5 is the longest reply, at 82 words.
- **Review:** 8/10 (`plans/reports/code-reviewer-261025-1649-phase-04-actor-v2.md`). Its findings M1–M3 led to the decisions above. Fixed from it: the shape printed per turn in `transcript-run`, a shadowed parameter in `generation.ts`, and two test nits.
- **Tests:**
  - typecheck and lint pass; unit 1221/1221; int 675/675.
  - e2e 328/328 before the item rule change. After it, `turn-engine.spec` and `persona.spec` were rerun and pass (`plans/reports/tester-261025-1649-phase-04-actor-v2.md`).
  - One replay int expectation changed with the decision: a retry is now in `<dieu_noi_ngay>`.
  - `access-isolation.int` failed once under load and passed alone.

## Risk assessment
- Replies that are too short may hide surface facts the learner needs to build on. Mitigation: `short` allows 2–3 sentences. Surface facts stay in the system message. The transcript review checks it.
- The `story` shape may push the persona to pad. Mitigation: it says 3–4 sentences, with "one concrete detail", not "be detailed".
- The cap can truncate a reply mid-sentence. Mitigation: 400 tokens is about 4× the target, so the cap is a guard, not a shaper. If truncation shows up in `llm_call` (output = cap), raise it.
- Reasoning tokens count as output (`src/llm/gemini-batch.ts:255-258`, and `readUsage` in `src/llm/call-model.ts`). A model that starts thinking can use up the cap and return an empty reply, which is a billed retry. 3.8 Flash at effort `low` measured 0 reasoning tokens (cost baseline), but that holds per model. Mitigation: `transcript-run` reports reasoning tokens. If PERSONA shows any, raise the cap or lower the effort before shipping. The Lite trial checks Call 1 against its 1,024 cap the same way. <!-- Red team #5 -->
- Told items reach Call 2 only when the question routes to them (today every open item goes every turn, `src/engine/contexts.ts:144-150`). A learner who refers to a told item indirectly ("app đó giờ chị còn dùng không?") may get a reply that contradicts it, if the router does not route there. Mitigation: the 5-exchange window and the gists keep what was said in front of Call 2, and turns 9–10 of the transcript run test exactly this. <!-- Red team #12 -->
- The lean eval's `deliver_item` replies get shorter. That should lower `topic` brushes; phase 6 measures one persona.

## Security considerations
- Fewer items per turn means less open content per call. Isolation is unchanged and still tested.
- The cap also bounds the cost of a prompt injection that asks for a very long answer.

## Next steps
- Phase 6 measures cost and a lean eval run on the final prompts.
