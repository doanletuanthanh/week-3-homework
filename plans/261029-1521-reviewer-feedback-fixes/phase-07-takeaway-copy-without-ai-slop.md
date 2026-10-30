---
phase: 4
title: "Takeaway copy without AI slop"
status: pending
priority: P1
effort: "1d"
dependencies: [3]
---

# Phase 4: Takeaway copy without AI slop

## Overview

Fix F5. Make "Mang về" read like a mentor's note: one short, concrete sentence per comment, in the learner's and the persona's own words, without repeating what the screen already says, inside a lighter frame.

## Context

- Reviewer p.3 screenshot, as generated:
  - praise: "Bạn đã lắng nghe tốt chia sẻ của chị Thu ở lượt trước về việc từng định ghi chép chi tiêu rồi bỏ, và đặt câu hỏi đào sâu đúng lý do khiến chị dừng lại."
  - leading: fixed prefix "Bạn tự thêm '…': chị Thu chưa từng nói điều này." + three generated sentences that restate it ("Bạn có xu hướng đưa sẵn nhận định…", "ví dụ như tự cài cắm giả định…", "Điều này dễ khiến…") + "Cũng thấy ở" + 7 turn chips.
- Prompt: `src/llm/prompts/feedback-generator.ts` `RULES` ("text: một hoặc hai câu…", no length or style limits; examples only name error patterns). Output schema `feedbackSchema` (`src/llm/schemas.ts:62`).
- Verifier (`src/llm/prompts/verifier.ts`) checks grounding of each claim; leave its job as is.
- UI: `src/components/reveal/takeaway.tsx`: `TITLE` "Thói quen hỏi của bạn — đọc lại trước buổi thật", `Evidence` "Cũng thấy ở" chips, `EMPTY` mentions "hook", print sheet.
- `CANVAS_EXPLANATION.unconfirmed` (`src/strings/product-strings.ts`) uses an em dash.
- Budget: little Gemini credit (memory: no paid call without an explicit OK). No judgement set exists for FEEDBACK (`evalsets/`).

## Requirements

- Prompt rules (Vietnamese, in `RULES`):
  - `text`: one sentence. Comments and habit ≤ 20 words; praise ≤ 25 words and quotes the persona words the learner followed.
  - Say what to ask or do next time. Name the persona ("chị Thu"), not "nhân vật".
  - `leading`: the screen already shows the added words and "… chưa từng nói điều này"; do not explain leading again; say what to ask first instead.
  - Never use: "lắng nghe tốt", "đào sâu", "có xu hướng", "điều này (dễ) khiến", "thay vì để", "hãy nhớ", "quan trọng là", "một cách", "tuyệt vời", "chia sẻ", "trải nghiệm", "insight", "feedback", em dash, lists, quotes longer than 8 words.
  - `suggested_question`: one question, ≤ 15 words, as said aloud to a real person; no "của mình".
  - One neutral bad → good pair from a topic outside the library (as `HOME_SAMPLE` does), marked "chỉ để tham khảo giọng, không chép". Example: bad "Bạn có xu hướng đưa sẵn giả định vào câu hỏi, điều này dễ khiến câu trả lời bị định hướng." → good "Hỏi anh đã làm thế nào lần gần nhất, trước khi hỏi vì sao."
  - Keep: slot list, sealed-item rule, `DATA_BLOCK_RULE`, "không chứa nội dung của điều nào trong <dieu_bo_lo>".
  - Keep the system message's first line (it contains "người viết nhận xét") and the slot line format `- S… | loại: … | lượt: …`: the e2e LLM stub picks the generator by that phrase and parses slots with that regex (`tests/e2e/llm-stub.mjs:91,120`).
<!-- Updated: Validation Session 1 - stub dependency found by verification -->

- Fixed UI copy:
  - Title "Đọc lại trước buổi phỏng vấn thật" (eyebrow "Mang về" kept; print sheet same).
  - "Cũng thấy ở" + chips → "Lặp lại ở {n} lượt khác", chips inside `<details>`; print keeps "(lượt 3, 4, …)".
  - `EMPTY` → "Buổi này bạn không hỏi câu dẫn dắt nào và không bỏ qua lời gợi mở nào."
  - `CANVAS_EXPLANATION.unconfirmed`: em dash → period.
  - New/changed strings go through `productStrings()` (approval in phase 6).
- Untold item text out of the takeaway (user decision 2026-10-30, found in the phase 3 review): Màn 6 no longer shows untold items, but `buildFeedbackContext` still hands the generator their `content` (`<dieu_bo_lo>`), so a comment or suggested question can repeat it. Give the generator each untold item's `topic_tag` instead of its `content`, and in code drop a claim whose `text` or `suggested_question` contains a `secret_terms` entry of an untold item (`containsTerm`, as the scenario validator does). This is a leak guard on authored terms, the same check `validate.ts` runs, not a judgement on wording, so the "no string heuristics" rule below is not broken. Tests: a claim quoting an untold item's secret term is not in the payload; the context carries no untold `content`.
- Non-functional: no new call; schema unchanged (Gemini structured output may ignore `maxLength`; word limits live in the prompt); no runtime filter that drops a comment for its wording (plan 261014 rule: no string heuristics decide anything semantic).

## Related Code Files

- Modify: `src/llm/prompts/feedback-generator.ts`, `src/components/reveal/takeaway.tsx`, `src/strings/product-strings.ts`
- Create: `tests/llm/feedback-generator.test.ts`; report `plans/reports/manual-test-261029-takeaway-copy.md` (only if the paid check is approved)
- Modify tests: `tests/e2e/reveal.spec.ts` (title, "Lặp lại ở" line), `tests/eval/string-check.test.ts` stays green (every exported string listed)

## Implementation Steps

1. Rewrite `RULES` and the example block in `buildFeedbackMessages`; keep the human message (blocks, slots) unchanged.
2. `takeaway.tsx`: title, repeated-turns line with `<details>`, empty line; same in `PrintSheet`.
3. Strings: `CANVAS_EXPLANATION.unconfirmed`, any new keys in `productStrings()`.
4. `tests/llm/feedback-generator.test.ts`: messages from a fixture `FeedbackContext` contain the word caps, the banned list, the leading rule and the sealed-item sentence; the example text matches no `content`, `hook_line` or `sample_question` of any file under `scenarios/`.
5. e2e reveal: title and "Lặp lại ở {n} lượt khác" with the stub's claims.
6. Paid check: ask the user right before running it, with the estimate (≤ 0.05 USD; user decision 2026-10-29: ask each time). Then DB health check (`pnpm il cost-report --days 1`), one 8-turn session on the local app with real keys, deliberately with 2+ leading questions and one ignored hint; screenshot "Mang về" next to the reviewer's; record texts, word counts and cost in the report. Without approval: ship on stub tests, read the first real session after release.

## Todo

- [ ] Prompt rules + example
- [ ] Takeaway frame copy
- [ ] Strings
- [ ] Prompt and e2e tests
- [ ] Paid check (gated) or note that it was skipped

## Success Criteria

- [ ] Tests green
- [ ] On a real session (gated check or first after release): each comment one sentence, ≤ 20 words (praise ≤ 25), none of the banned phrases, a concrete next question

## Risk Assessment

- Shorter text can drop the "why". The fixed prefix holds the evidence; the sentence holds the action.
- The model may still overrun word caps sometimes; acceptable; the verifier is unchanged.
- The example could be copied; neutral topic + "không chép" + check in the gated run.

## Security Considerations

Learner text stays inside data blocks; the sealed-item rule is kept word for word.
