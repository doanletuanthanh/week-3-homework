# Code review: phase 4, Actor v2 (short, natural replies)

Scope: uncommitted diff in `D:/Tekmium/week-3` (13 modified files + `src/engine/reply-plan.ts`, `tests/engine/reply-plan.test.ts`), about 220 changed LOC.
Spec: `plans/261023-1532-chat-agent-routing-memory-and-generator-v2/phase-04-actor-v2-short-natural-replies.md` and the invariants in `plan.md`.
Checks run: `pnpm typecheck` (clean), `pnpm lint` (clean), `pnpm test` (65 files, 1219 tests pass). `test:int` and `test:e2e` were not run because they truncate the shared local DB that holds paid eval rows. No paid calls were made.
Offline probes (scratchpad `tsx`, no network) built `ChatOpenAI` and `ChatGoogle` and read their `invocationParams()`.

**Score: 8/10.** The plumbing is correct and the item selection follows the spec. I found no blocking defects. The main risk is in the spec itself: two of its rules conflict with its own transcript success criteria. The paid transcript run will show this.

## Critical
None.

## High
None.

## Medium

1. **A closed question can get a 3–4 sentence story, which fails the criterion "every closed question answered in ≤ 2 sentences".** `src/engine/contexts.ts:184-189` gives `tell_now` to any open, untold item that a *hint* routes to (a broad topic the question only touches). `src/engine/reply-plan.ts:24` then picks `story` before the `closed` row is read. At openness neutral or warm, a closed question that only brushes an open, untold topic gets "Kể ba bốn câu". This follows the spec's own order (rules 1–2 before rule 4), so it is not an implementation bug. But the paid run checks this exact criterion. Options:
   - only `tagItemId` (direct) sets `tellNow` for the shape;
   - add a row: closed + told-by-hint-only → `story_brief`;
   - accept it and note it in the run report.

2. **The one-turn retry likely gets a reply shape too short to hold it.** `tell_when_fitting` items do not count towards `tellNow` (`contexts.ts:207`, which only checks `mode === "tell_now"`). So the retry turn takes its shape from the question: `nod`, `one_line` or `vague` ("không kể thêm"). It also gets "Mỗi lượt một ý chính" and the instruction "nói ra khi phù hợp". The persona then has almost no room to tell the missed item, which puts the criterion "every opened item told within 2 turns" at risk. This also follows the spec. Watch it in the transcript. If missed items stay untold, let a `tell_when_fitting` item lift `one_line`/`short` to `story_brief`.

3. **Up to 5 `tell_now` items in one turn, against "Mỗi lượt một ý chính".** That is the just-unlocked item, the tag item, and up to `ROUTE_BROAD_MAX = 3` hints (`src/config/limits.ts:10`), all under "nói ra ngay trong câu trả lời này" (`persona.ts:26`). The system rule at `persona.ts:60` says one main idea. The model gets two directions that conflict. In practice, two or more open, untold, routed items at once is rare, but nothing bounds it. A bound would be data: keep the just-unlocked item, then the tag, then at most one hint as `tell_now`.

## Low

4. **Replay's first turn treats items told at the fork turn as untold. This existed before the diff.** The fork snapshot is copied from main snapshot `k` (`src/db/repo/replay.ts:85-86`). That snapshot never holds the verdict about turn `k`: main applies it at `k+1`, and the snapshot is never rewritten. Replay sets `ignoreVerdict` (`src/graphs/turn-graph.ts:108`), so that verdict is never applied. An item opened and told at `k` then comes back at replay turn `k+1` as `tell_when_fitting`, or as `tell_now` if routed. Before this diff it came back as `tell_when_fitting` on every turn, so the diff narrows the problem. Later replay turns are correct: `finishReplayTurn` applies the judge's verdict to `stateAfter` before writing the snapshot (`src/server/replay.ts:219-260`). A possible fix later: apply main turn `k+1`'s `verdictJson` when the branch is created.

5. **The shape is not stored or traced.** It is not in `TurnDecision` (`src/engine/plan-turn.ts:36`) and not in `session-trace.ts`. `transcript-run` and `trace` cannot show which shape a turn got unless they derive it again. That makes medium items 1–2 harder to diagnose from the paid run. The spec also wanted a `key` per row (`{ key, when, shape }`). `REPLY_RULES` has none (`reply-plan.ts:22`). This is fine as data, but it gives nothing to trace.

6. **A truncated PERSONA reply goes through silently.** At the cap, Gemini returns partial text with `finishReason=MAX_TOKENS`. `callModel` only rejects empty text (`call-model.ts`), and it does not retry once streaming has started. The only signal is `output_tokens == 400` in `llm_call`, and that count includes reasoning tokens. This matches the spec's stated mitigation. Note that the baseline PERSONA output averaged 269 tokens (cost baseline report), so the old prompt would already hit 400 sometimes. For ANALYSIS, truncated JSON fails the schema check and is retried three times on the same prompt, then the turn fails. With the baseline at about 78 output tokens plus gists, 1024 has room.

7. **Test quality.**
   - `tests/llm/call-model.test.ts` `expect(MAX_OUTPUT_TOKENS).toEqual({ PERSONA: 400, ANALYSIS: 1024 })` only restates the constant.
   - `tests/engine/contexts-isolation.test.ts`: the guard-rule check uses a template literal that contains a raw newline (`` `${rule}\n` `` is written across two lines). It works, but it is fragile under formatters and CRLF checkouts, since the repo warns that LF will be replaced by CRLF. Use `"\n"`.
   - The new test "keeps the system message identical across the turns" (turns 2 and 12) overlaps the existing set-of-systems check around `:170`.
   - The item-selection suite does not assert that an item opened at `t−1` becomes `tell_when_fitting` in the `later` context. It only checks that the turn-7 item is dropped.

8. **`src/server/generation.ts:74`: the arrow parameter `options` shadows the outer `options` (`RunGenerationOptions`).** It works, since `...options.llmDeps` sits outside the arrow, and lint passes. It is still a readability trap. Name it `modelOptions`.

9. **Mode names differ from the plan.** The plan says `tell_if_fitting` and `keep_consistent`. The code keeps `tell_when_fitting` and `already_told`. This was a deliberate choice, but the phase file should record it so phase 6 readers don't grep for names that don't exist.

## Explicit checks

- **(a) Acceptance criteria that code can meet:**
  - Met:
    - the reply-shape table and its tests, covering every shape, the order, and the `short` default;
    - item selection: just-unlocked, routed-untold, missed last turn with one retry only, told-and-routed, and unrouted items left out;
    - the prompt:
      - "lan man" is gone;
      - the new rule lines are in place;
      - the guard rules are still verbatim, each followed by `\n` (the next line is the "Không bàn…" rule);
      - `OPENNESS_TEXT.warm` is "kể cởi mở hơn";
      - `SHAPE_TEXT` matches the spec strings character for character;
    - the caps are in the sync path, the batch path, the CLI and generation;
    - the system message is unchanged across turns;
    - `qa-mutants` tests pass.
  - Pending: the paid transcript items, plus `test:int` and `test:e2e` (not run here, to keep the DB intact).
- **(b) Regressions in callers:**
  - The replay and graph paths are unchanged apart from the new context fields. The `stateAfter.disclosed` semantics hold on both paths (see below).
  - `src/eval/isolation.ts` renders `buildPersonaMessages` with `shape` carried through by the spread. `SHAPE_TEXT` holds no item data. Isolation is unchanged and still tested (`tests/eval/attacks-and-isolation.test.ts`, curated scenarios).
  - `src/eval/qa/tools.ts` uses `plan.personaContext` as is.
  - No eval path builds a `PersonaContext` by hand. The only hand-built ones are in tests, which spread `plan.personaContext`.
  - `session-trace.ts` is not affected.
  - The lean eval's `deliver_item` replies will get shorter, as the spec expects.
- **(c) Public contract changes. All are internal TypeScript and additive. No env vars, DB schema or HTTP shapes change.**
  - `PersonaContext.shape` is new and required.
  - `buildPersonaContext`'s `decision` now requires `label` and `questionType`.
  - `CallModelDeps.createModel(spec, options?)`. Existing one-argument implementers still type-check.
  - `toGeminiRequest(..., maxOutputTokens?)` and `geminiBatchModel(..., options = {})`.
  - New exports: `ModelOptions`, `MAX_OUTPUT_TOKENS`, `SHAPE_TEXT`, `REPLY_SHAPES`, `REPLY_RULES`, `replyShape`, `ReplyShape`, `ReplyInput`.
- **(d) Patterns:**
  - It follows the existing table-of-data style. Shape selection reads only typed fields, with no string matching.
  - Unlocks are still decided only in `unlock.ts`. The shape never feeds back into an unlock.
  - It is still 2 calls per main turn.
  - The shape is computed in `contexts.ts` rather than in `plan-turn.ts` as the spec sketched. The result is the same and the function stays pure.
- **(e) Lint and type: clean.**
- **Is the "told" set right at Call 2?**
  - Main path: yes. `planTurn` applies the verdict about `t−1` to `state`, giving `previousState`. `stateAfter.disclosed` is `previousState.disclosed` (`plan-turn.ts:84-87,111`). `openedLastTurn` uses `entry.turn === stateAfter.turnIndex - 1` (`contexts.ts:180`), where `stateAfter.turnIndex = t`. So "opened at t−1 and the verdict did not confirm it told" is computed correctly.
  - Replay with `ignoreVerdict`: also correct after the first turn, because the stored replay snapshot already holds the judge's verdict about `t−1` (`server/replay.ts:219-220`). On the first replay turn, see Low 4.
- **Import cycle from `limits.ts`:** none. `src/llm/roles.ts` has no imports, and the import is `import type`, which `isolatedModules` erases. Client components that import `limits.ts` do not pull in LLM code.
- **ChatOpenAI `maxTokens` on reasoning models (installed `@langchain/openai` 1.6.2, probed offline):**
  - For `gpt-5-mini`, `gpt-6-luna` and `o4-mini`, it sends `max_completion_tokens: 400` alongside `reasoning_effort`. That is correct for reasoning models. `gpt-4o` gets `max_tokens`.
  - The Responses API path maps it to `max_output_tokens`.
  - Uncapped roles (`maxTokens: undefined`) send no token field.
  - `ChatGoogle` puts `generationConfig.maxOutputTokens: 400` in the request when a cap is given, and leaves it out when the cap is undefined.

## Recommended actions
1. Before the paid run, decide on Medium 1 and 2. Either change the reply-shape rows or accept the conflict with the success criteria in writing. Otherwise the run will "fail" criteria in ways the spec designed in.
2. Bound the `tell_now` count (Medium 3), or accept it.
3. Optional: surface the shape in the transcript-run output, or in `TurnDecision`, so the paid run can be diagnosed per turn.
4. Small fixes: use `"\n"` in the guard-rule test, add the missing `t−1 → tell_when_fitting` assertion, and rename the shadowed `options`.
5. Run `pnpm test:int` and `pnpm test:e2e` while no paid eval data is at stake.

## Unresolved questions
- Should hint-only routing be allowed to switch the reply to a story? That is a product decision (Medium 1).
- Should the fork snapshot take main turn `k+1`'s verdict? This is outside phase 4.

Status: DONE_WITH_CONCERNS
Summary: The implementation matches the phase 4 spec and passes typecheck, lint and 1219 unit tests. The caps reach both providers and the batch path correctly, and `maxTokens` maps to `max_completion_tokens` on reasoning models. The told set and the t−1 retry are computed correctly.
Concerns/Blockers: The spec's shape order lets hint-routed items turn closed questions into 3–4 sentence stories, and gives the retry turn a short shape. Both threaten the transcript success criteria. Integration and e2e tests were not run here.
