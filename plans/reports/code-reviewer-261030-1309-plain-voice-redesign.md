# Code review: plain voice redesign (phase 6, after the word list was dropped)

## Scope
- New: `src/llm/prompts/plain-voice.ts`, `src/llm/prompts/eval-voice-judge.ts`, `src/eval/voice-judge-set.ts`, `evalsets/voice-judge.jsonl`, `tests/llm/plain-voice.test.ts`, `tests/eval/voice-judge-set.test.ts`
- Changed: `src/llm/prompts/scenario-generator.ts`, `src/llm/prompts/persona.ts`, `src/llm/roles.ts` (comment), `src/eval/judgement-eval.ts` (SET_KINDS), `cli/commands/judgement-eval.ts`, `tests/llm/custom-topic-prompts.test.ts`, `tests/engine/contexts-isolation.test.ts`
- Checks run: `pnpm typecheck` clean. `eslint` on every touched src/test path clean. `vitest run` on the 4 touched test files plus `tests/eval/string-check.test.ts` and `tests/eval/topic-route-set.test.ts`: 102/102 passed. No paid calls were made, and e2e was not run (one was already running in the background).

## Overall
The redesign is correct and stays in scope. No word list or keyword matching is left in code or tests. The voice judge is eval-only: nothing at runtime or in the admin console calls `judgeVoice`. Reusing STRING_CHECK does not change any existing STRING_CHECK caller or call count. Exports are additive, and there is no env var change. All earlier findings are resolved. The remaining problems are about how much the eval proves. The judge prompt quotes phrases that also appear in the set and in the generator's reference pair, and the set is small and easy. There is also a docs gap.

## (a) Earlier findings
| ID | Status | Evidence |
|----|--------|----------|
| H1 caps vs library | Resolved | `VOICE_CAPS` = library max (`plain-voice.ts:28`). `tests/llm/plain-voice.test.ts` checks both directions: the library stays within the caps, and each cap equals the library max. The identity rule is now "facts first, then one sentence of traits shown through behaviour" (`scenario-generator.ts:98`). |
| H2 concrete-detail scope | Resolved | The header scopes it to `opening_line, surface_facts, content, hook_line` (`plain-voice.ts:19`). The persona gets only `PLAIN_VOICE_LINES` (`persona.ts:62`), so it no longer clashes with the guard against invented numbers. |
| M1 own library walk | Resolved | Both tests use `curatedPersonas()`. |
| M2 opener rule | Resolved | "Không mở đầu hai lượt liền nhau bằng cùng một từ (như "Dạ", "Ừm")" (`persona.ts:63`). |
| M3 "trải nghiệm" vs guard | Moot | The list is gone. |
| L1 / L2 | Moot | The list and the "cân bằng" test are gone. |
| L3 "bỏ lửng" | Resolved | The rule is now "một câu đời thường … gợi rằng có chuyện" (`scenario-generator.ts:108`). |

## (b) Keyword / word-list remnants
`grep SLOP_PHRASES|slopHits|FEEDBACK_ONLY_PHRASES|quotePhrases|SLOP_RULE` finds them only in the phase-06 plan text, under the superseding note. There are no hits in `src/`, `cli/` or `tests/`. The prompts do still quote some phrases as illustrations: the judge's "cảm thấy áp lực", "luôn trăn trở", and the generator's bad/good pair. Those are examples, not a matching list, so they fit the user's decision. See M1 for the problem with them.

## Medium

**M1. The judge prompt quotes phrases from the set and from the generator's reference pair, though its own comment says it must not.** (`src/llm/prompts/eval-voice-judge.ts:14,17`)
- The comment says the examples "must not resemble any scenario, any case of the set, or the generator's reference pair".
- The ai_voice rule quotes `"cảm thấy áp lực"` and `"luôn trăn trở"`. These are the core of:
  - the generator's bad content, "Anh cảm thấy rất áp lực … luôn trăn trở" (`scenario-generator.ts:88`);
  - case `vj-a01`, "thực sự cảm thấy áp lực … luôn trăn trở".
- The judge's own example, "cảm thấy vô cùng bất an", also nearly matches `vj-a07`, "cảm thấy vô cùng mệt mỏi".

Effects:
1. `vj-a01` and `vj-a07` are partly answered by the prompt itself, so "AI voice passed 0/17" overstates the judge.
2. The generator and the judge are taught the same surface cues. A generated scenario that avoids those two phrases but names feelings in other words is exactly the slop the judge is least tested on. That weakens the "0/42 after vs 3/42 before" evidence in `plans/reports/manual-test-261030-plain-voice.md`.

Fix: in the ai_voice rule, describe the sign without quoting phrases, or quote an off-topic one (washing machine), as the comment intends. Then re-run the set when the user next approves a paid run.

**M2. The starter set has no hard cases, and its floor of 30 lets it report "gate proven" below the documented NFR-7 floor.** (`evalsets/voice-judge.jsonl`, `src/eval/voice-judge-set.ts:23`)

Balance is fine: 17 plain and 17 ai_voice, with both kinds on both sides (13 speech and 4 identity per side). All plain cases are verbatim from the library, and the test enforces this. The AI cases are realistic Vietnamese slop. But:
- **Every ai_voice case is a textbook case.** Each one stacks several cues: naming a feeling, "không chỉ … mà còn", "hành trình", "đóng vai trò", "một cách". There are no near misses. Examples of what is missing:
  - a concrete event with a moral tacked on at the end ("…hết 400 nghìn. Từ đó chị hiểu rằng phải luôn chuẩn bị.");
  - a facts-first identity whose last sentence is slop ("Minh, 31 tuổi, kỹ sư ở Đà Nẵng. Minh năng động, luôn cân bằng giữa công việc và gia đình."). This is the most likely failure under the new identity rule. All 4 ai_voice identity cases are pure adjectives with no facts.
- **There are no hard plain cases.** No library line contains everyday words that look like slop, such as "cảm thấy", "thực sự" or "áp lực" used naturally. So `plain_flagged` is not tested on the over-flagging risk the dropped word list was abandoned for.
- **The floor is undocumented.** `MIN_VOICE_SET_SIZE = 30` is below NFR-7's 100 (`docs/operations.md:73`). The CLI exits 0 ("proven") on 34 lines. With 17 per side, a gate of 10% means one miss passes (5.9%) and two fail (11.8%). `topic-route` documents its reason for its own floor (48 = "one line in 48"). This floor has none.

Fix:
- Add about 6 hard cases per side, including the mixed identity and the moral-tail shape.
- State the floor and its reason next to the constant and in the docs, or go back to the NFR-7 floor. Then the CLI exits 2 ("set too small"), which is the honest answer for a 34-line starter.

**M3. `docs/operations.md` does not list `voice-judge`.** (`docs/operations.md:64-71`)
- The "Kinds" list stops at `topic-route`.
- The `--concurrency` sentence (line 71) lists the kinds it applies to and leaves out `voice-judge`, though `runVoiceSet` passes `concurrency` through.
- Phase 9 does not plan this edit.

The CLI usage string and the error text list it automatically from `SET_KINDS`, so only the prose is stale. Add one bullet, roughly: "`voice-judge`: whether a text reads as a real person or as model-written (eval only, role STRING_CHECK). Each line has `kind` (`speech` | `identity`) and `text`; no scenario is used. Gates: AI voice passed ≤ 10%, library flagged ≤ 10%; floor 30." Also add it to the concurrency list. There is no `evalsets/README` to update.

## Low

- **L1.** `plain-voice.ts:8`: the docstring says the lines are "shared by the persona, the scenario generator and the feedback generator". The feedback generator does not import them yet (phase 7). Either say "and, from phase 7, the feedback generator" or drop it until it is true.
- **L2.** `plain-voice.ts:19-20`: `opening_line` is inside the "kể việc đã xảy ra, có con số …" scope. The opening line is a greeting that must reveal no secret, so asking it for numbers or events pushes the wrong way. Consider taking `opening_line` out of the header. Surface facts are habits more than events, but the line reads as a preference, so they are fine.
- **L3.** `persona.ts:59` vs `plain-voice.ts:10`: "câu ngắn" is now said twice in the persona rules. This is harmless, but merging them would save tokens on every turn.
- **L4.** `tests/engine/contexts-isolation.test.ts:203` and `tests/llm/custom-topic-prompts.test.ts:167`: `not.toContain("Không dùng các cụm")` guards against a removed implementation by one exact wording. It would not catch a list reintroduced under other words. It is fine to keep as a tripwire; just know it proves little.
- **L5.** `tests/llm/plain-voice.test.ts:5`: `words` counts whitespace tokens, so a spaced " – " or "…" counts as a word. The library has none today, and the prompt's "chữ" means the same unit, so they are consistent.
- **L6.** The transcript criterion is still `[~]`: turns 1–2 both open with "Chị". The rule's examples ("Dạ", "Ừm") may read as fillers only. If a repeated pronoun opener counts as a failure, add "cả đại từ" or an example with "Chị". This is a product decision.

## (c) STRING_CHECK reuse: no conflict
- `src/eval/string-check.ts:112` and the admin console (`runCheckStrings`) are unchanged. `judgeVoice` has no caller outside `runVoiceSet`, and the admin console does not reach it.
- Tests that count STRING_CHECK calls (`publish-flow.int.test.ts:68` 24 calls, `publish-fixtures.ts:32`, `admin-scenarios.int.test.ts:126`, `admin-review.spec.ts:52`) run the string check only, so their counts are unchanged.
- The role-by-model maps (`tests/helpers/eval-models.ts:15` STRING_CHECK = `gpt-6.1-sol/low`; SAFETY = `gpt-6.1-sol/medium`) are told apart by effort, so `respondingModels` maps the new calls to STRING_CHECK. The new test confirms this (`voice-judge-set.test.ts:50`).
- The e2e stub answers STRING_CHECK by the prefix "Bạn kiểm một chuỗi cố định" (`tests/e2e/llm-stub.mjs:269`). The voice judge never runs in e2e, so there is no clash. The generator and persona prompts contain none of the `CUSTOM_ROLES` / `REVEAL_ROLES` phrases, and their first sentences are unchanged and asserted.
- Cost: voice-judge calls share the STRING_CHECK role in `llm_call`, told apart by `meta.judgement_set = "voice-judge"`. That is fine for eval scope.

## (d) Set-kind wiring
- `SET_KINDS`, the CLI `runs` record (typed `Record<SetKind, …>`, so a missing entry would fail typecheck) and `SCENARIO_NOTE` are all updated.
- `SET_KINDS` is enumerated nowhere else.
- The only gap is the docs (M3).

## (e) Evalset quality
- Plain cases: 17, all verbatim (test-enforced). They cover all 7 library personas: content, hooks, one surface fact and 4 identities.
- AI cases: 17, natural Vietnamese, and recognisably model slop.
- Balance: exact. Weaknesses: see M2.

## (f) Judge prompt
- The verdicts are well framed: "chỉ chấm giọng", not content. Fillers, cut-off sentences and dropped subjects are explicitly allowed as plain.
- The identity carve-out ("vài nét tính cách ngắn sau phần sự thật là bình thường") matches the library and the new identity rule. `DATA_BLOCK_RULE` plus the `doan_van` block treats the text as data.
- It does not reuse the generator's Mướp/Tín pair text. It does reuse that pair's key phrases (M1).

## (g) Public contracts
- New exports only:
  - `PLAIN_VOICE_LINES`, `PLAIN_VOICE_RULES`, `VOICE_CAPS`, `VOICE_REFERENCE`;
  - `VOICE_VERDICTS`, `VOICE_TEXT_KINDS`, `voiceJudgeSchema`, `buildVoiceJudgeMessages`;
  - `voiceCaseSchema`, `scoreVoiceSet`, `judgeVoice`, `runVoiceSet` and the gate constants.
- The `SetKind` union grew by one member, an additive change.
- No env var, schema or DB change. The `buildPersonaMessages` / `buildGeneratorMessages` / `repairSystem` signatures are unchanged, and the persona system message is still identical across turns (the existing test passes).

## (h) Type / lint / tests
Typecheck 0 errors, lint 0 issues, focused tests 102/102. e2e not run (one was already in progress).

## Recommended actions
1. M1: take the quoted "cảm thấy áp lực / luôn trăn trở / cảm thấy vô cùng …" phrases out of the judge's ai_voice rule, or replace them with washing-machine ones. Re-run the set on the next approved paid run.
2. M2: add hard cases (a mixed identity, a moral tail, plain lines with everyday "cảm thấy"/"thực sự"), and justify or remove the floor of 30.
3. M3: add `voice-judge` to the kinds list and the concurrency list in `docs/operations.md`.
4. L1/L2: fix the docstring, and consider taking `opening_line` out of the concrete-detail scope.

## Unresolved questions
- Should a repeated pronoun opener ("Chị …", "Chị …") count as breaking the opener rule (L6)?
- Is the floor of 30 for `voice-judge` an accepted decision, or should the set report "too small" until it grows?

Status: DONE_WITH_CONCERNS
Summary: The redesign is correct and in scope, and all earlier findings are resolved: no word lists remain, STRING_CHECK reuse is safe, contracts are additive, and typecheck, lint and focused tests are green. The eval evidence is weaker than reported, because the judge prompt quotes phrases that also appear in the set and in the generator's reference pair, the set has no hard cases and its floor of 30 is not justified, and docs/operations.md does not list the new kind.
Concerns/Blockers: e2e not run by me (one was already in progress); re-measuring the judge after M1/M2 needs a paid run the user must approve.
