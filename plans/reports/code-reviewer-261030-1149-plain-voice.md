# Code review: plain voice in prompts (phase 6, steps 1-5)

## Scope
- New: `src/llm/prompts/plain-voice.ts`, `tests/llm/plain-voice.test.ts`
- Changed: `src/llm/prompts/scenario-generator.ts`, `src/llm/prompts/persona.ts`, `tests/llm/custom-topic-prompts.test.ts`, `tests/engine/contexts-isolation.test.ts`
- Checks run: `pnpm typecheck` clean, `eslint src/llm/prompts tests/llm tests/engine` clean, `pnpm test` 1308/1308 passed. The first run had one failure in `tests/server/escape-render.test.tsx` (it scans source files, unrelated to this change, and passed on two reruns, so it is flaky). `pnpm test:e2e` was not run.

## Overall
The code is correct and stays in scope. No runtime caller uses `slopHits`. The JSON schema, `secret_terms`, the validator and the repair flow are unchanged. The Call 2 first line and `PERSONA_GUARD_RULES` are unchanged, and the persona system message is still the same on every turn (the existing 12-turn test passes). The problems are in the Vietnamese rules: some new length and adjective caps disagree with the hand-written library that the phase names as the target voice.

## High

**H1. The new identity and length caps disagree with the library they are supposed to imitate.** (`scenario-generator.ts:97,100,108,110`, `plain-voice.ts:43`)
I counted every library persona file:
- `identity` "nhiều nhất một tính từ về tính cách" and "Không xếp ba tính từ liền nhau": all 8 library identities break this. Examples: "Phúc cẩn thận, ít nói, lễ phép và ngại làm phiền người khác" (4), "Lan xởi lởi, trọng tình nghĩa, quý người chơi lâu năm" (3), "Hạnh chu đáo, nói năng nhẹ nhàng, ngại làm người khác khó xử" (3). chị Thu has 2 ("thân thiện, hơi kiệm lời với người mới quen").
- `surface_facts` "không quá 15 chữ": 9 of chị Thu's 11 facts are longer (up to 28 syllables), and most facts in the other files are too (16-24).
- `hook_line` "không quá 12 chữ": 7 library hooks are 13-16.
- `sample_question` "không quá 20 chữ": 7 library questions are 21-22.

The phase asked for these caps, so the code follows the spec. The spec is the problem. Why it matters:
- `identity` becomes Call 2's `<nhan_vat>`. Traits such as "hơi kiệm lời với người mới quen" drive how the persona behaves, so one adjective will give thinner personas.
- A 15-syllable fact cap together with "đủ chất liệu cho 30 lượt hỏi" pushes the model toward many very short facts.
- The validator does not enforce any of these caps, so nothing fails hard, but the rules contradict the library examples.

Recommendation, to confirm with the user because the caps were in the spec:
- identity: "tính cách nêu gọn trong một câu, ưu tiên qua cách cư xử (ví dụ 'hơi kiệm lời với người mới quen')".
- surface_facts ≤ 25 chữ, hook_line ≤ 16, sample_question ≤ 25. Or calibrate each cap to the library maximum and add a unit test that the library meets it, the same way step 4 guards the phrase list.

**H2. `PLAIN_VOICE_RULES` is written for narrative but is applied to every field of `FILE_RULES`.** (`plain-voice.ts:42`, `scenario-generator.ts:114`)
"Kể việc đã xảy ra, có con số, thời điểm, nơi chốn hay đồ vật, thay cho việc gọi tên một cảm xúc hay một tính cách" sits after all the field rules. It therefore also covers `identity`, `voice_notes`, `research_goal`, `error_patterns`, `do_not_assert` and `habit_card_label`. That causes two problems:
- It says "no naming a personality trait", while the identity rule a few lines above allows one adjective. The model sees two rules that disagree.
- The docstring at `plain-voice.ts:39` says the block is shared by the persona and the feedback generator. The persona does not import it, and it should not: the line "có con số…" would clash with the persona guard "không tự bịa thêm … con số" (`persona.ts:37`). For phase 7, a mentor's comment should also not be told to "kể việc đã xảy ra".

Fixes:
- Scope the first line: "- Với content, hook_line, surface_facts, opening_line: kể việc đã xảy ra …".
- Correct the docstring, for example "used by the scenario generator; the persona carries its own lines and the same list".
- Before phase 7 imports the block, split the concrete-detail line from the register lines.

## Medium

**M1. Both new tests write their own walk over the library instead of using `tests/helpers/curated-scenarios.ts`.** (`tests/llm/plain-voice.test.ts:6-10`, `tests/llm/custom-topic-prompts.test.ts:174-178`)
`curatedPersonas()` already returns each `{ file, scenario }`, sorted, with forward-slash paths. It is used by 6 other tests. The two copies also differ: `custom-topic-prompts` has no `endsWith(".json")` filter and would crash on a stray non-JSON file. Use the helper in both places.

**M2. "Không mở đầu các lượt bằng cùng một từ" is ambiguous and is not the success criterion.** (`persona.ts:63`)
It can be read as "every turn must start with a word never used before". The success criterion is "no two consecutive replies start with the same word". Suggested wording: "Không mở đầu hai lượt liền nhau bằng cùng một từ (như \"Dạ\", \"Ừm\"), và không kết bằng câu tóm tắt hay bài học." The examples give the model the cue the phase context names.

**M3. The SLOP line says something different from a guard rule that must stay as written.** (`persona.ts:37` and `persona.ts:64`)
`PERSONA_GUARD_RULES` says "chỉ nói về trải nghiệm của bạn …". Two lines later the prompt bans "trải nghiệm". This is harmless to compliance, because the guard is addressed to the model and is not dialogue. But it is the kind of mixed signal that weakens a banned list. The guard rule cannot change, so either accept this (note it in the plan) or drop "trải nghiệm" from the persona's line only. Dropping it would need a persona-specific list, which goes against "list exists once". My preference is to accept it.

## Low

- **L1.** `plain-voice.ts:45` and `persona.ts:64` render the same list with two different prefixes ("Không dùng các cụm sau:" / "Không dùng các cụm:"). An exported `SLOP_RULE` line would keep one wording. Minor DRY.
- **L2.** `tests/llm/plain-voice.test.ts:27` "Cái cân bằng điện tử để bàn." is unnatural Vietnamese: a weighing scale is "cái cân điện tử". The test shows that whole-word matching still hits "cân bằng" in a non-figurative sense, which is fine, but a natural example reads better, e.g. "Chị cân bằng chi tiêu theo tuần." → hit.
- **L3.** hook_line "rồi bỏ lửng" (`scenario-generator.ts:108`): the good reference hook "Bữa đi khám cho con Mướp tốn hơn anh tính." and chị Thu's "Có lần chị định ghi lại nhưng rồi cũng bỏ." are complete sentences, not trailing ones. "Bỏ lửng" may push the model toward "…" endings. "gợi chuyện mà không kể hết" says what is meant.
- **L4.** The module-level JSDoc at `plain-voice.ts:1-5` is a separate block that documents nothing. `data-block.ts` uses the same style, so it matches the repo; no action needed.
- **L5.** "quan trọng là" and "thực sự" are common in real speech. The library is clean today (step 4 test), so keep them, but watch the transcript read in step 6 for stiff workarounds.

## Intentional deviations
1. **slopHits keeps diacritics.** Sound. Stripping them would make "không chị"/"không chỉ" and "hay nhớ"/"hãy nhớ" collide, and the tests cover both. NFC is applied before `\p{L}` splitting, so NFD input still matches (tested). The em dash falls back to a raw `includes`, which is correct.
2. **"một cách" is dropped from the list.** Sound. The only library use is `ban-phuc.json:58` "Em có một cách kiểm nhanh…", and the rule text now bans "một cách + tính từ" by pattern. The reason is recorded in the comment at `plain-voice.ts:9-10`.
3. **"không chỉ … mà còn" matches as ordered parts within one sentence.** Sound. The tests cover order and the sentence boundary. Sentences are split on `[.!?\n]`, so a comma-joined clause still matches, which is the intent. Abbreviations like "TP.HCM" split a sentence, but that can only cause a missed hit, never a false one.

## Acceptance criteria (steps 1-5)
- Step 1 (module + tests, case and Unicode form, chị Thu clean): met. Every library file is checked, not only chị Thu.
- Step 2 (generator rules, field rules, reference pair, `PLAIN_VOICE_RULES` in the messages, no 4-word overlap with the library): met. The repair inherits the block through `FILE_RULES`, and this is tested through `repairSystem`. The overlap test uses `tokenize` with diacritics stripped, which errs toward finding more overlap, so it is stricter, which is good. The reference topic (cat at the vet) is outside the library.
- Step 3 (three persona lines, same system message on every turn): met, and the first line is asserted. `FEEDBACK_ONLY_PHRASES` is asserted absent.
- Step 4 (library through `slopHits`): met (`plain-voice.test.ts` `it.each(LIBRARY)`).
- Step 5: `pnpm test` is green. `pnpm test:e2e` was not run by me. Static check: the stub picks a role by substring (`tests/e2e/llm-stub.mjs:156-167`), and none of the new text contains any `CUSTOM_ROLES` phrase. The generator's first sentence is unchanged and asserted, and the persona's first line is asserted.

## Callers and contracts
- `buildPersonaMessages`: `turn-graph.ts:120`, `eval/isolation.ts:41,62`, `eval/qa/tools.ts:138`, plus tests. The signature is unchanged and only constant lines were added, so isolation sealing is unaffected.
- `buildGeneratorMessages` (`generation-graph.ts:68,81`) and `repairSystem` (`route-check.ts:79`, `scenario-generator.ts:242`) are unchanged. The route check now carries the voice block too. That is harmless but costs input tokens on a classification call.
- Public surface: new exports only (`SLOP_PHRASES`, `FEEDBACK_ONLY_PHRASES`, `quotePhrases`, `PLAIN_VOICE_RULES`, `slopHits`, `VOICE_REFERENCE`). Nothing was removed or renamed.

## Vietnamese wording of VOICE_REFERENCE
The pair is natural and well chosen.
- The bad identity is real slop and even contains the banned "cân bằng". The good one is plain facts.
- "Về nhà anh nói với vợ là 300." is a strong hidden detail that shows a feeling through an action.
- The pair does not break the "không viết 'hãy'" rule (there is no "hãy" anywhere in it).
- Good content is 2 sentences, inside the "1–2 câu" limit. The hook is 10 syllables, inside the cap.
- "Thủ Đức" is a real place. FILE_RULES bans only real people, organisations and brands, so this is allowed, and the library does the same ("Bình Thạnh", "Biên Hòa").

## Recommended actions
1. Put H1 to the user: loosen or calibrate the caps against the library, and add a library-meets-caps unit test.
2. Fix H2: scope the concrete-detail line, and correct the `PLAIN_VOICE_RULES` docstring before phase 7.
3. M1: switch both tests to `curatedPersonas()`.
4. M2: reword the opener rule with "hai lượt liền nhau" and the examples.
5. Run `pnpm test:e2e` before commit (not while `pnpm test:int` runs, because they share a DB).

Status: DONE_WITH_CONCERNS
Summary: The code is correct and in scope: typecheck, lint and unit tests are green, and there are no contract or runtime regressions. The three intentional deviations are sound. The new identity and length caps disagree with every hand-written library persona, and the shared voice block is applied to non-narrative fields.
Concerns/Blockers: Whether to loosen the caps is a spec decision the user needs to make. e2e was not run.
