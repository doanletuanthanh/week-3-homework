# Code review: phase 3, session memory and bounded context

Scope: the uncommitted diff (31 files, about 386 lines added and 71 removed) plus the new `src/engine/memory.ts`, `tests/engine/memory.test.ts` and `tests/engine/prompt-budget.test.ts`. The untracked docs were left out.
Checks: `pnpm typecheck` clean, `pnpm lint` clean, `pnpm test` (unit) 64 files and 1205 tests pass. Int and e2e tests were not run, as instructed. No paid calls.
Probe: a scratchpad tsx copy of `prompt-budget.test.ts` `play()` printed the prompt growth at every turn.

## Overall
The window and memory logic is correct. There are no off-by-one errors in `memoryTurnFor` or `splitContext`. Each exchange on a replay path has at most one gist. Main gists written after the fork are invisible. Stores, replay and the judge are wired the same way everywhere. The default `[]` keeps today's prompts. I found no blocking defects in the code. There is one prompt-contract gap that weakens an existing production guard, and two prompt rules that do not yet mention the new blocks.

## High

**H1. Memory claims can carry locked items' do-not-asserts into Call 2. Nothing checks this at runtime.**
- `src/llm/prompts/analysis.ts:95`: the claims rule leaves out only what is in `<su_that_be_mat>` and `<dieu_da_mo>`.
- But Call 1 also sees every locked item's do-not-assert in `<dieu_can_tranh>` (`src/engine/contexts.ts:83-85`).
- When the persona broke a rule in exchange k (which happens: it is the `flagged` case), Call 1 at turn k+5 is likely to record that statement as a claim, either word for word or paraphrased.
- `<da_noi>` then tells Call 2 "you already said X" for up to 12 claims that stay for the rest of the session. That reinforces the broken rule. It also gets around the structural rule that Call 2 gets at most one do-not-assert (`doNotAssert: string | null`).
- `assertIsolated` runs only in the QA graph (`src/graphs/qa-agent-graph.ts:204`), not in `runTurn` or `runReplayTurn`. The new count at `src/eval/isolation.ts:61-63` therefore protects evals only. It also matches exact text, so a paraphrase passes it.
- Fix (prompt): add `<dieu_can_tranh>` to the exclusion list, and say not to record anything the persona said that a `<dieu_can_tranh>` line forbids.
- Optional fix (code, a deterministic reference check that fits the 2026-10-14 rule): drop the claims of an exchange whose stored verdict has `violations.length > 0`. The verdict for exchange t−5 was written by turn t−4, which is on the path.

## Medium

**M1. The grounding rule still points only at transcript lines.**
- `src/llm/prompts/analysis.ts:102` says `grounded_turn_id` is "số trong [lượt N] nhân vật".
- Gist lines render as `[lượt N] <gist>`, with no "nhân vật".
- For a far reference (the `lc-far-*` cases), Call 1 may fall back to `open` because no line matches the rule's wording. That is the main risk named in the phase.
- The unit test `judgement-eval.test.ts` "far-reference" stubs the label, so it does not exercise this.
- Fix: add one clause saying a `<bo_nho>` line `[lượt N]` also counts. Do this before the paid step 8 re-measure, or the measurement is of the old rule.

**M2. Callers that pass no memory still ask Call 1 for a gist from turn 6 on.**
- `<luot_can_ghi_nho>` comes from `turnIndex` alone (`analysis.ts:130`, `contexts.ts:101`), whether or not the caller passed memory.
- Affected callers: `string-check.ts:91`, `topic-route-set.ts:107`, `qa/tools.ts:122`, and the QA attack loop at `qa/tools.ts:94`, which builds `basis` without `loaded.memory`.
- The gist is paid for as output tokens and then thrown away.
- It is harmless today: attacks run 2 turns, and the eval sets are short. It goes against (d) only in cost, not in prompt text.
- Fix: pass `loaded.memory` in `qa/tools.ts:94` so the in-memory path matches production. The others are fine as they are.

## Low

**L1. Prompt-budget test (criterion a): starting the per-turn check at turn 8 is a fair reading, but it skips more than it needs to.** Measured growth per turn, in characters:
- Call 1: 175 at turn 7, then about 210 per turn.
- Call 2: 479 at turn 7 (the notes header, the two data blocks, and the first claims all arrive at once). Then 455 per turn for turns 8 to 12 (one gist plus two full claims, until the 12-claim cap). Then about 210.
- Bound: `PER_TURN` = 460.
- Turn 7 is covered by the total check (`sizes[30] ≤ sizes[6] + 24 × PER_TURN`), so the bound still holds over turns 7 to 30.
- The skip is needed only for Call 2. Call 1 could check from turn 7 (`prompt-budget.test.ts:44`).
- Call 2's margin is 5 characters while the claims fill up, so any change to how claims render will trip this test. That is acceptable, but the "fixed overhead ~260" is really "two full claims"; the comment should say so.
- What the test proves is growth of at most one line per turn, not a plateau. That matches the plan's wording.
- The full-transcript control beats the bound by only about 60 to 85 characters per turn, because the fixture's persona replies are about 25 characters. It would not catch a verbatim fallback of a short exchange. Long real persona replies would make the margin larger.

**L2. `RawAnalysis.memory` is required, but `turn.analysis_json` rows written before this change do not have it** (`src/db/schema.ts:235`). Nothing reads `analysisJson.memory` today, and `acceptMemory` handles `undefined`. The type is wrong, though. A future reader of `analysisJson.memory.gist` would crash on old rows.

**L3. An entry with claims but an empty gist is kept** (`memory.ts:36`). The exchange then stays word for word and its claims also go to `<da_noi>`, so the information appears twice. That is harmless.

**L4. `judgement-eval` `memoryEntrySchema` accepts entries that fall inside the window**, and `splitContext` then drops them silently. A typo in a case's `turn` would go unnoticed. One option is a check at parse time: `turn ≤ transcript.length − W`.

**L5. Style.** The doc comment line at `src/llm/prompts/persona.ts:31` is not wrapped like the rest of the file. `persona.ts` now imports `oneLine` and `renderGists` from `analysis.ts`. That is acceptable, but `data-block.ts` or a small shared render module would be the more natural home.

**Info.** Once the window starts sliding (turn 7 on), Call 2's chat history no longer begins with the same messages each turn. Only the system message remains a stable cacheable prefix. The cost model's "both inputs stop growing" holds, but implicit-cache hits on history go away. Check this in phase 6's measured numbers.

## Acceptance criteria
- **(a)** Holds, with the notes in L1. Starting at turn 8 is fair for Call 2 (the header is a one-off constant, and the total check covers turn 7). It is unnecessary for Call 1.
- **(b)** Holds.
  - `buildJudgeContext` renders `<bo_nho>` and the window.
  - The replay judge gets `[...state.memory, plan.memory]` (`turn-graph.ts:141`). With turn t in its transcript, exchange t−5 is outside its window, so the fresh gist is used. When the gist was empty, that exchange stays word for word.
  - Unit tests in `contexts-isolation` and `replay-turn-graph` cover this.
- **(c)** Partly holds.
  - Invariant 1 holds: memory comes from Call 1, which sees no locked content. The replay basis reads main turns only up to `forkAfterTurn`.
  - Memory is shown as data, on one line through `oneLine`, and `dataBlock` neutralises closing tags. Both are tested.
  - Gap: see H1 (do-not-asserts reach Call 2 through claims). That is outside invariant 1's letter (do-not-assert text is not in `sealedParts`), but it is inside the purpose of the Call 2 limit.
- **(d)** Holds.
  - Old rows read as word-for-word, and an empty entry list returns the whole transcript.
  - Callers that pass no memory get today's prompts plus `MEMORY_RULES` and `<luot_can_ghi_nho>` (see M2 for the cost).
  - Calls per turn are unchanged.
  - `memory.ts` and `planTurn` do not touch unlocking. `decideUnlock` is still the only place items open.
- **(e)** Holds.
  - Every producer of Call 1 output was updated: `llm-stub.mjs` `NEUTRAL_ANALYSIS` (merged over by the `[stub:analysis=…]` markers), `engine-fixtures.rawAnalysis`, `publish-fixtures`, and `qa/tools.ts` fingerprint. Typecheck would catch any typed producer that was missed.
  - `TurnDecision.memory` is optional and written only when present (`decisionOf`).
  - No `llm_call` columns or env vars changed.
  - Neither `decisionJson.memory` nor `analysisJson` reaches browser or reveal payloads (`reveal.ts:27-29` picks fields).
- **(f)** Holds. Naming and comment density match the code around them. The new code checks only empty strings and exact trimmed text when deduping claims, both structural. No heuristic decides meaning.

## Replay and edge cases checked
- Replay at turn r writes the gist for r−5 ≥ fork−4. Main turns up to the fork wrote gists for exchanges up to fork−5. The two sets do not overlap, so each exchange has at most one gist. `replay.int.test.ts` asserts that "Gist chính" is not visible.
- Window at turn t: Call 1 and Call 2 see exchanges t−5 to t−1, and the judge sees t−4 to t. `memoryTurnFor(t) = t−5` is the oldest exchange in Call 1's window, so the gist exists exactly when that exchange first leaves the window.
- Claims: deduplicated newest first, capped at 12, then put back oldest first. This is correct and tested.
- Turn 0 is dropped once any entry exists and turn 0 is outside the window. Sessions already running at deploy also lose the opening line, even though exchanges 1 to 15 stay word for word. The spec intends this.

## Unresolved questions
1. H1: does the do-not-assert limit of one count as an isolation invariant for model-written notes, or only for engine-chosen directions? This decides whether the code-side drop is required or the prompt fix is enough.
2. M1: should the grounding-rule wording be fixed before the paid `label-classifier` re-measure? I recommend yes; otherwise the measurement is of the old rule.

Status: DONE_WITH_CONCERNS
Summary: The memory and window logic, the replay path, the stores and the contracts are correct; typecheck, lint and 1205 unit tests pass. The claims rule lets locked items' do-not-asserts reach Call 2 through `<da_noi>`, with no runtime guard (H1), and the grounding rule does not mention gist lines (M1).
Concerns/Blockers: Fix H1 and M1 in the prompt before the paid re-measure; int tests not run by instruction.
