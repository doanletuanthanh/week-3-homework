---
phase: 6
title: "Plain voice in prompts and generated scenarios"
status: pending
priority: P1
effort: "1.25d"
dependencies: [5]
---

# Phase 6: Plain voice in prompts and generated scenarios

## Overview

Write one shared set of voice rules and use it in the three prompts whose output a learner reads: the persona (Call 2), the scenario generator, and the feedback generator (phase 7). Generated personas should sound like the hand-written library ones (`scenarios/ux-chi-tieu/chi-thu.json`): concrete facts, numbers, spoken words. Generated personas should not read like a model's summary.

## Context: where the slop comes from

- **Scenario generator** (`src/llm/prompts/scenario-generator.ts` `FILE_RULES`). It specifies fields and lengths but says nothing about voice. `identity` is "2–4 câu mô tả", and items are "trải nghiệm, thói quen hay cảm nhận". Models fill that with adjective stacks ("năng động, luôn cố gắng cân bằng…") and abstract feelings ("cảm thấy áp lực", "trăn trở") instead of events. The generated `identity` and `voice_notes` then become Call 2's `<nhan_vat>` and `<cach_noi>`, so a sloppy scenario also makes a sloppy persona for 30 turns.
- **Persona** (`src/llm/prompts/persona.ts`). The rules are already strict on shape (no lists, no restating the question, one idea per turn), but they say nothing on register. That leaves book words ("thực sự", "vô cùng", "trải nghiệm"), moral wrap-ups, and the same opener every turn ("Dạ…", "Ừm…").
- **Feedback** (`src/llm/prompts/feedback-generator.ts`). The reviewer's F5 is planned in phase 7, with its own banned list. This phase moves that list into the shared module, so it exists once.
- Target voice, from chị Thu: "Lương về tài khoản vào ngày 5 hằng tháng." / "Lần gần nhất chị ghi được 19 ngày thì dừng: đúng tuần đám cưới bạn thân…" / hook "Có lần chị định ghi lại nhưng rồi cũng bỏ."

## Requirements

### Shared module `src/llm/prompts/plain-voice.ts`

- `SLOP_PHRASES: readonly string[]`. These are the phrases no learner-facing model text may contain, in Vietnamese and normalized like `containsTerm` (`src/scenario/text-normalize.ts`). The starting list:
  - "đào sâu", "có xu hướng", "điều này khiến", "điều này dễ khiến", "thay vì để", "hãy nhớ", "quan trọng là", "một cách", "tuyệt vời", "vô cùng", "thực sự", "hành trình", "trải nghiệm", "đóng vai trò", "không chỉ … mà còn", "cân bằng", "tối ưu", "insight", and "—" (em dash).
- `FEEDBACK_ONLY_PHRASES: readonly string[]` holds "lắng nghe tốt", "feedback" and "chia sẻ". These words are wrong in a mentor's comment but normal in a persona's speech. Phase 7 adds them to its own prompt.
  - The list is reviewed with the user before merge. "chia sẻ" and "áp lực" are borderline: real people say them, so propose keeping them out of the list and covering them by the concrete-detail rule.
- `PLAIN_VOICE_RULES: string`. A short Vietnamese rule block:
  - Say what happened, with a number, a time, a place or an object, instead of naming a feeling or a trait.
  - Use short spoken sentences.
  - No list of three adjectives.
  - No closing lesson or summary.
  - No book words.
  - Never use the phrases in the list, which is rendered from `SLOP_PHRASES` so it exists once.
- `slopHits(text): string[]` is used only in tests and eval reports (D13). Nothing at runtime calls it.

### Scenario generator

- Add `PLAIN_VOICE_RULES` to `FILE_RULES`. Because `FILE_RULES` is shared by the generator and the targeted repair, repairs inherit it.
- Sharpen these field rules:
  - `identity`: facts only (age, job, where, who they live with, one detail that breaks the topic's stereotype). No personality adjectives beyond one.
  - `voice_notes`: forms of address, region or filler words, one concrete speech habit.
  - `surface_facts`: one fact per line, ≤ 15 words.
  - `items[].content`: one event or habit with at least one concrete detail (a number, a date, an object, a place), in the persona's spoken words. Feelings show through what the persona did.
  - `hook_line`: an unfinished everyday remark, ≤ 12 words.
  - `sample_question`: as said aloud, ≤ 20 words.
- One bad → good reference pair on a topic outside the library, marked "chỉ để tham khảo giọng, không chép". The library topics are `ux-chi-tieu`, `ux-ban-hang-online`, `ux-cong-viec-nhom` and `ux-dat-san-the-thao`; the pair could be about taking a cat to the vet. It has one `identity` and one item (`content` + `hook_line`). Example:
  - bad identity "Anh Tín là một người năng động, luôn cố gắng cân bằng giữa công việc và cuộc sống."
  - good "Tín, 34 tuổi, sửa xe máy ở Thủ Đức, nuôi hai con mèo trong tiệm."
- Do not change: the JSON schema, `secret_terms` rules, sealing, validator, repair flow, and the e2e stub phrase that picks the generator (its first sentence).

### Persona (Call 2)

- Add 3 lines to "Luật trả lời":
  - Speak like spoken dialogue (the subject may be dropped), using everyday words, not book words.
  - Do not open every turn with the same word, and do not end with a summary or a lesson.
  - Never use the words in the list, rendered from `SLOP_PHRASES` (not `FEEDBACK_ONLY_PHRASES`).
- The system message stays fixed per session, which keeps it cacheable, and its first line stays the same. Every existing rule, the guard rules and the data-block layout are kept word for word.

### Feedback

- Phase 7 imports `SLOP_PHRASES` / `PLAIN_VOICE_RULES` instead of writing its own list. Its other rules (word caps, the leading rule, the neutral pair) stay there.

## Related Code Files

- Create: `src/llm/prompts/plain-voice.ts`, `tests/llm/plain-voice.test.ts`
- Modify: `src/llm/prompts/scenario-generator.ts`, `src/llm/prompts/persona.ts`
- Tests: `tests/llm/custom-topic-prompts.test.ts` (generator messages carry the rules and the pair), and the persona prompt tests wherever they live (grep for `buildPersonaMessages` in `tests/`)
- Report: `plans/reports/manual-test-261030-plain-voice.md`

## Implementation Steps

1. `plain-voice.ts`, plus tests: `slopHits` finds each phrase with accents and case normalized, and finds nothing in the chị Thu file.
2. Generator: rules, field sharpening, reference pair. Test: messages contain `PLAIN_VOICE_RULES`. The pair's text shares no 4-word run with any `scenarios/**/*.json` `content`, `hook_line` or `sample_question`.
3. Persona: the three lines. Test: system message has them and is identical across turns for one session (cache prefix).
4. Run every library scenario file through `slopHits` in a unit test (they must stay clean). This guards the list against banning words the hand-written personas really use.
5. `pnpm test && pnpm test:e2e` (the stub picks prompts by first sentence; both are unchanged).
6. **Paid check (≈ 0.17 USD, ask first):**
   - **Before** (`git stash` of steps 2–3, or the commit before them): one custom topic on the local app, e.g. "người đi chợ online cho cả nhà", focus `general`, on the phase 5 generator model.
   - **After:** the same topic and focus.
   - Then run `pnpm il transcript-run` on chị Thu for 8 turns with the new persona prompt.
   - Record the generated `identity`, `voice_notes`, 3 items and 8 replies side by side, with `slopHits` counts, the count of items with a concrete detail (read by a person), validator pass/repair count and cost.

## Todo

- [ ] Shared module + tests
- [ ] Generator prompt
- [ ] Persona prompt
- [ ] Library files clean
- [ ] Paid before/after (approved) + report

## Success Criteria

- [ ] Tests green. The library scenarios have 0 `slopHits`.
- [ ] After-generation: 0 `slopHits` in learner-visible fields, and every item has a concrete detail. The validator passes, with at most the same repair count as before.
- [ ] Transcript: 0 `slopHits`. No two consecutive replies start with the same word. The existing transcript gates (`no_leaks`, reply length) still pass.

## Risk Assessment

- A banned list can push the model to synonyms of the same slop. The concrete-detail rule does the real work, and the before/after read is by a person.
- The reference pair can be copied. A neutral topic, the "không chép" label and the step 2 overlap test guard against it.
- Longer prompts cost more input. The rules are about 150 tokens, and Call 2's system prefix is cacheable on OpenAI (≥ 1024 tokens, automatic).
- Stricter generator rules can raise validator failures. Compare repair counts before and after, and loosen a length cap before touching the validator.
