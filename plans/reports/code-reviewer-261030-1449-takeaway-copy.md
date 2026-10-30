# Code review: phase 7, takeaway copy without AI slop (uncommitted), 2026-10-30

## Scope
- Files: src/llm/prompts/feedback-generator.ts, src/engine/reveal-contexts.ts, src/engine/reveal-claims.ts, src/components/reveal/takeaway.tsx, src/strings/product-strings.ts, src/llm/prompts/eval-voice-judge.ts, src/eval/voice-judge-set.ts, src/llm/prompts/plain-voice.ts, evalsets/voice-judge.jsonl, docs/operations.md, 7 test files
- LOC: about 150 added and 57 removed, plus 2 new test files
- Checks re-run: `pnpm typecheck` passed, `pnpm lint` passed, `pnpm vitest run` on the 7 touched/related files passed (123 tests, including string-check and the NFR-14 library test). I did not run e2e or any paid call.
- Scout: I checked the secret terms of every library scenario against every other item's `content` and `sample_question`, and against `surface_facts`. No overlap, so a term from one item cannot come in through another item's text in the library. Many terms are everyday words a learner could easily type: "Excel", "sổ tay", "xấu hổ", "Tết", "khoe", "trả góp", "bảng tính", "bạn gái", "tiền túi", "chụp màn hình".

## Overall
The shape is right. The prompt follows D13: there is no banned-word list, and the only term check is the authored `secret_terms` check. The replay target still reaches the generator as an alias only. Untold `content` no longer reaches the generator. All `missedItems` callers are updated. The e2e stub contract is kept. There are two real defects, and both can tell the learner something false or hide a valid comment.

## High

**H1. The new empty line is stated as fact, but it shows on paths where the learner did ask leading questions.**
`src/strings/product-strings.ts:116`, used by `src/engine/seal.ts:237` (`emptyLine: comments.length === 0 && !habit && !withheld`).
- The old line said nothing was *recorded* ("…được ghi nhận"). The new one says "Buổi này bạn không hỏi câu dẫn dắt nào và không bỏ qua lời gợi mở nào."
- `emptyLine` is also true in these cases:
  - the generator failed (`drafts = []`; addendum §"Trạng thái trống": "generator hoặc verifier lỗi → chỉ dòng đó");
  - the verifier failed or disagreed with every claim;
  - every claim was dropped by FR-21 or by the new leak guard.
- This already happened in the paid check. In session 1 of `plans/reports/manual-test-261030-takeaway-copy.md`, praise and leading were hidden by the verifier and the habit card was hidden, not withheld. So the learner who asked 2 leading questions would have read "bạn không hỏi câu dẫn dắt nào". The transcript can show a "Dẫn dắt" mark on the same screen, because novelty marks come from a separate check.
- `tests/e2e/reveal.spec.ts:429` already says "the empty line would be untrue" for the withheld case. This is the same problem on more paths.
- Fix: keep the plain voice but hedge it to what was found, e.g. "Buổi này chưa thấy câu dẫn dắt hay lời gợi mở nào bị bỏ qua." Or split into two strings: one for no triggers at all (`slots.length === 0`), and a neutral one for "found, but not shown". The spec dictated this exact string, so this is a spec defect, not an implementation slip. The user should decide.

**H2. The leak guard drops valid comments when the "secret" term is already on screen because the learner or persona said it.**
`src/engine/reveal-claims.ts:60-62,102`.
- The generator no longer sees untold `content`. So the main way an untold term can get into `text` or `suggested_question` is by being copied from `<hoi_thoai>`. The prompt asks for that: "vế đầu … theo đúng lời trong <hoi_thoai>".
- Typical case, chị Thu: the learner asks the leading question "Chắc chị thấy xấu hổ nên bỏ hả?", and `shame` is untold (its terms are "xấu hổ" / "thà không biết"). The leading comment quotes the question, contains "xấu hổ", and is dropped silently.
- The words are not secret from the learner: they typed them, and the transcript and the "Bạn tự thêm “…”" prefix show them. The guard removes the most useful comment, a leading question that guessed a hidden item. Combined with H1, the screen can then say "bạn không hỏi câu dẫn dắt nào".
- The guard does run before sealing (line 102 comes before line 104), so a dropped claim never becomes `sealed`/`withheld`.
- Fix: leave out terms that already appear in the transcript, for example:
  ```ts
  const heard = basis.turns.flatMap((t) => [t.learnerText ?? "", t.personaText]).join("\n");
  const untoldTerms = scenario.items
    .filter((item) => !told.has(item.id))
    .flatMap((item) => item.secret_terms)
    .filter((term) => !containsTerm(heard, term));
  ```
  Use the field names of `RevealBasis.turns`. The guard still catches terms the model made up or inferred on its own, which is the actual threat. Add a test where the learner's leading question contains an untold term and the claim is kept.
- Replay target: its terms are also "untold". After a successful replay the target opens, but a claim that quoted its term was dropped instead of being sealed and then shown. The fix above covers this too.

## Medium

**M1. The `<dieu_bo_lo>` rule no longer matches its input.** `src/llm/prompts/feedback-generator.ts:25` still says "không chứa nội dung của điều nào trong <dieu_bo_lo>". The block now holds only topic tags (`:81`), so the model cannot know the "content" it must avoid. Either reword it to what you mean (e.g. "không hỏi thẳng vào mảng nào trong <dieu_bo_lo>"), or keep the sentence knowing it is now weaker. The spec said to keep it word for word, so this needs a decision, not a silent edit.

**M2. Nothing records when the guard drops a claim.** Like the FR-21 drops, a dropped claim leaves no trace in `parts.generator`, `verifierChecks` or `llm_call`. After release ("read the first real session") nobody can tell a guard drop from a generator that wrote nothing. Consider a count in the stored generator part (e.g. `dropped: { leak: n }`). This is optional, but H2 makes it matter.

## Low
- `src/components/reveal/takeaway.tsx:16-17`: two blank lines left where `TITLE`/`EMPTY` were removed.
- `src/strings/product-strings.ts:113-117`: `TAKEAWAY` has no `as const`, while most neighbours (`CANVAS_EXPLANATION`, `HINTS`, `REPLAY_RESULT`) have it.
- Two different print styles for turn lists. `takeaway.tsx:39` prints `<p className="body-sm c-variant">(lượt 6, 9)</p>`, but `Habit` (`:84`) prints `<span className="code c-variant"> (lượt …)</span>`. Pick one.
- The `<summary>` has no `cursor:pointer` and no spacing from the chips under it. The `.told summary` rules (`globals.css:547-550`) are the local pattern. `.cmt .also` (`globals.css:584`) still applies, because the span is still inside `.cmt`. Accessibility is fine: native `details`/`summary`, the count is announced, and the chips are buttons.
- Unrecorded change from the spec: the spec says `suggested_question` should avoid "của mình". The prompt replaced that with "xưng hô như trong <hoi_thoai>". This matches D13 (no word bans), but it is not listed in the Results section of the phase file.
- Word caps vs the two-part rule: about 20 syllables ("chữ") for "what happened, in the transcript's words + next step", with an 8-word quote inside, is tight. The only real leading sample ran 21. The rule and "Ô praise chỉ cần vế đầu" are consistent with each other, and the leading rule ("vế đầu … vế sau …") matches the general rule. Accepted overrun, no change needed.
- `docs/operations.md`: "library text flagged ≤ 10%" now also counts the hand-written plain feedback cases. Say "plain cases flagged".
- `evalsets/voice-judge.jsonl` `vj-p26` ("…chuyện trả phí app…") uses a chị Thu `paid-app` secret term. It is fine as a voice case, but in a real session where `paid-app` is untold the guard would drop that exact comment, which is another example of H2.

## Checklist answers
- (a) Acceptance criteria are met as amended by Results. The open concerns are the empty-line truthfulness (H1) and the guard's false positives (H2).
- (b) Sealing: the replay target is alias-only (`reveal-contexts.ts` filter `item.id !== targetId`; graph test asserts content, sample question, hook, topic tag and id are absent). Untold `content` is not in the generator context (graph test plus the new unit test). The guard runs before sealing. Canvas note (`canvasQuote`) and `quote` need no guard: both are verbatim learner or transcript text cut by code (`reveal-claims.ts` `assembleReveal`), not generated, and both are already visible elsewhere on Màn 6. The guard only needs `text` and `suggested_question`, which is what it covers.
- (c) e2e stub: the first line "người viết nhận xét" is kept (asserted in `tests/llm/feedback-generator.test.ts:17`). `renderSlot` and the slot line format are unchanged. The stub's claim texts contain no secret terms, so the guard does not touch e2e.
- (d) UI: `<details>` sits inside `.cmt`; the print sheet shows "(lượt …)", and the component test checks it; `.also` still applies. See Low for cursor and spacing.
- (e) Old strings remain only in design references: `docs/design/artboards/{Reveal,RevealCustom,RevealStates,Review,GuidePrint}.dc.html`, and the `unconfirmed` em dash in `Reveal`, `RevealMobile` and `Review`. Planning sources also keep them: PRD FR-28 and line 263, addendum §165/§337. Leave the artboards (frozen design refs). Note the FR-28 title and empty-line change in phase 9's docs pass, so the PRD is not read as current. `cli/commands/seed-demo.ts:49` "hook bị bỏ qua" is a CLI/dev message and is out of scope.
- (f) `FeedbackContext.missedItems` is used only by `buildFeedbackMessages` and tests. `onContext` hands the context to callers. Nothing in `src/` reads `missedItems.content`. `src/eval/isolation.ts` does not cover reveal calls. All callers are updated.
- (g) Prompt Vietnamese reads naturally. The bad/good reference is on a neutral topic, and its "chỉ để tham khảo giọng, không chép" label is kept. The test confirms no 4-word run is shared with the library. The new `feedback` judge rule describes signs and does not list words, so it is D13-compliant. See M1 for the `<dieu_bo_lo>` mismatch.
- (h) Style matches the surroundings, apart from the Low nits. Prettier reports diffs, but the repo has no Prettier config and HEAD files diff the same way, so this is not a finding.

## Recommended actions
1. H1: hedge or split `TAKEAWAY.empty`. This needs a user decision because the spec fixed the text.
2. H2: leave out of the guard any term already in the transcript, and add a test where the learner typed the term.
3. M1: decide what to do with the `<dieu_bo_lo>` sentence.
4. Low nits; record the "của mình" change in Results.

## Metrics
- Type errors 0, lint 0. Unit tests for the touched files: 123/123.
- New tests cover prompt content, the frame component, the guard (text, question, told term kept) and context without content. Missing: guard with a learner-typed term, and the empty line in the degraded state.

## Unresolved questions
- Should the empty line still show when the generator or verifier failed (addendum §165), or should the degraded state get its own neutral line?
- Is `<dieu_bo_lo>` still needed at all, now that it carries only tags the hints already show?
