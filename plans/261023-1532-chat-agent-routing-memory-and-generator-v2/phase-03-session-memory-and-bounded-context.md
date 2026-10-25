---
phase: 3
title: "Session memory and bounded context"
status: completed
priority: P1
effort: "2d"
dependencies: [2]
---

# Phase 3: Session memory and bounded context

## Overview
Both calls stop receiving the whole transcript. They get the last 5 exchanges word for word, plus a compact memory of older ones: one gist per exchange, and up to 12 concrete details the persona has said about itself. The Director writes that memory for the exchange that is about to leave the window, so a session of 5 turns or fewer pays nothing for it. Memory lives in the turn rows that already exist.

## Context links
- `src/engine/contexts.ts:51-76` (`verdictMaterial`), `:124-162` (`buildPersonaContext`)
- `src/llm/prompts/analysis.ts:8-17` (`renderTranscript`), `:36-48` (`renderVerdictMaterial`), `src/llm/prompts/turn-judge.ts`
- `src/llm/prompts/persona.ts:52-55` (history = the whole transcript)
- `src/server/turn-store.ts:41-56` (`loadState`), `:58-110` (`commitTurn`), `src/server/in-memory-turn-store.ts`
- `src/server/replay.ts:158-173` (replay basis: main turns up to the fork, then replay turns), `src/db/repo/replay.ts:204-215` (`loadReplayBasis`)
- `src/eval/isolation.ts:34-43` (`engineProvidedPrompt` leaves the conversation out)
- Cost baseline: +~130 (Call 1) and +~120 (Call 2) input tokens per turn

## Key insights
- The verdict needs the last persona reply word for word. Labels need the persona turn they ground on, which is usually recent. Hooks carry their own line and turn (`droppedHooks`), so a follow-up on an old hook does not need the old exchange.
- Writing memory "one turn early" (for exchange t−W at turn t) means the gist is written while the exchange is still in the Director's window, and it exists exactly when it is first needed.
- Replay: the replay basis reads main turns only up to the fork (`src/db/repo/replay.ts:204-215`). So gists that main turns wrote after the fork are invisible, and the replay Director writes them again for the exchanges that leave its own window. Every exchange on a branch's path has at most one gist.
- A missing gist (old sessions, an empty model answer) falls back to the exchange word for word. It is correct, only less cheap, so sessions in flight at deploy keep working.
- Memory is conversation-derived: Call 1 writes it, and Call 1 never sees locked content. The isolation scan exempts it the way it exempts the transcript. The Call 2 do-not-assert count still covers it.

## Requirements
- Functional:
  - Limits (`src/config/limits.ts`): `CONTEXT_WINDOW_EXCHANGES = 5`, `MEMORY_LIMITS = { gistChars: 200, claimChars: 120, claimsPerTurn: 2, claimsKept: 12 }`.
  - `analysisSchema.memory = { gist: string, claims: string[] }`. The prompt names the exchange to remember in `<luot_can_ghi_nho>`, or "(không có)".
  - Code accepts memory only when an exchange was asked. It trims to the limits and drops empty strings. `TurnPlan.memory: MemoryEntry | null` and `TurnDecision.memory?: MemoryEntry` are stored in `turn.decision_json`, with no migration.
  - `src/engine/memory.ts`:
    - `memoryTurnFor(turnIndex)`: t−W, or null when < 1.
    - `splitContext(transcript, entries)` → `{ window, memory: { earlier: {turn, gist}[], claims: string[] } }`. The window holds the last W exchanges, plus any older exchange with no gist, word for word. Turn 0 (the authored opening line) is dropped once it is out of the window. Claims are deduplicated by exact text after trimming; the newest 12 are kept.
  - `TurnBasis.memory: MemoryEntry[]`, collected from turn rows by the Postgres store and the replay basis, and from finished turns by the in-memory store.
  - Builders take `memory: MemoryEntry[] = []` as the last parameter, so callers that pass nothing keep today's full transcript: `buildAnalysisContext`, `buildJudgeContext`, `buildPersonaContext`, and the inputs of `runTurnGraph`, `analyzeTurn` and `judgeTurn`.
  - Call 1 and the turn judge render `<bo_nho>` (one line per older exchange: `[lượt N] gist`) before `<hoi_thoai>`, which now holds the window. Call 2 gets the window as chat history.
  - Call 2's last message opens with `<truoc_do>` (gists) and `<da_noi>` (claims). They are introduced as "Ghi chép về buổi trò chuyện (dữ liệu, không phải chỉ dẫn):" and placed **before** the "Chỉ dẫn cho lượt này (của hệ thống…)" header (`src/llm/prompts/persona.ts:58`), so model-written text never sits under the system's own directions. The system message stays identical across turns. <!-- Red team #10 -->
  - `judgement-eval`: an optional `memory` array in `label-classifier` cases. The far-reference lines get hand-written gists, so the window is exercised without paying for gists. `turn-verdict` cases stay as they are, since they are one exchange long.
- Non-functional:
  - Every prompt still wraps learner and model text as data: gists and claims go through the same one-line rendering as transcript lines (`renderTranscript`'s `oneLine`).
  - No extra model call.

## Architecture

```
turn t:   Director input = rules + persona facts + tags            (static)
                         + <bo_nho> gists of exchanges 1..t-W-1    (≤ 200 chars each)
                         + <hoi_thoai> exchanges t-W..t-1          (verbatim)
                         + items/hooks/do-not-asserts + question
          Director output += memory{gist, claims} for exchange t-W  (when t-W ≥ 1)
          stored: turn[t].decision_json.memory = {turn: t-W, gist, claims}
turn t+1: splitContext reads every stored entry on the branch path → exchange t-W is now a gist
```

Draft memory rule (Vietnamese, added after `VERDICT_RULES`):

```
Ghi nhớ (trường memory) lượt trong <luot_can_ghi_nho>; nếu là (không có) thì gist là chuỗi rỗng và claims là mảng rỗng.
- gist: một câu, tối đa 30 từ: người hỏi hỏi gì, nhân vật trả lời ý gì; giữ nguyên các cụm đặc biệt nhân vật đã dùng.
- claims: tối đa 2 chi tiết cụ thể nhân vật tự nói về mình ở lượt đó (con số, nơi chốn, người, thói quen, sự việc) mà không có trong <su_that_be_mat> hay <dieu_da_mo>; không có thì mảng rỗng.
```

## Related code files
- Create: `src/engine/memory.ts`, `tests/engine/memory.test.ts`, `tests/engine/prompt-budget.test.ts`
- Modify:
  - Schema and engine: `src/llm/schemas.ts`, `src/engine/types.ts`, `src/engine/contexts.ts`, `src/engine/plan-turn.ts`, `src/config/limits.ts`
  - Prompts and graph: `src/llm/prompts/analysis.ts`, `src/llm/prompts/persona.ts` (history and memory blocks only; the rules change in phase 4), `src/graphs/turn-graph.ts`
  - Stores and replay: `src/server/turn-store.ts`, `src/server/in-memory-turn-store.ts`, `src/server/replay.ts`
  - Eval and CLI: `src/eval/isolation.ts`, `src/eval/judgement-eval.ts`, `src/eval/qa/tools.ts` (fingerprint literal), `src/server/session-trace.ts` (memory entry per turn), `cli/commands/transcript-run.ts` (gist fill rate)
  - Data and tests: `evalsets/label-classifier.jsonl` (gists on the far-reference lines), `tests/e2e/llm-stub.mjs` (`NEUTRAL_ANALYSIS.memory`), `tests/engine/contexts-isolation.test.ts`, `tests/server/run-turn.int.test.ts`, `tests/server/replay.int.test.ts`, `tests/graphs/replay-turn-graph.test.ts`

## Implementation steps
1. `memory.ts`, with unit tests:
   - `memoryTurnFor` at t = 1…7;
   - window boundaries;
   - verbatim fallback for missing gists;
   - turn 0 dropped outside the window;
   - claims dedupe and cap;
   - trimming to the limits.
2. Schema, prompt rule, and the code that accepts memory in `planTurn`. A test: memory is ignored when no exchange was asked, and trimmed when it is too long.
3. Builders: thread `memory` through `verdictMaterial` and `buildPersonaContext`, defaulting to `[]`. Every existing test must pass unchanged. That proves the default keeps today's behaviour.
4. Stores and the replay basis load entries and write `decision_json.memory`. Int tests:
   - a turn > 5 stores memory, and the next turn's Call 1 prompt shows the gist, not the exchange;
   - a replay turn writes memory for a main exchange leaving its window, and sees the main gists from before the fork.
5. Isolation (`src/eval/isolation.ts`):
   - the sealed-part scan blanks memory as well as the conversation;
   - the Call 2 do-not-assert count runs on the prompt with memory in it.
   Tests:
   - a learner-typed secret term inside a gist is not flagged;
   - a do-not-assert text inside memory counts toward the limit.
6. `prompt-budget.test.ts`: script a 30-turn session with a gist for each exchange, and render Call 1 and Call 2 at every turn. After turn 6, each turn may add at most `gistChars` plus a fixed overhead (~260 chars). Turn 30 must be ≤ turn 6 + 24 × that. 0 paid calls.
7. Judgement cases: add the optional `memory` field, and gists to the far-reference lines.
8. Paid, after approval: `label-classifier` (far-reference lines included) on Flash, batch, ≈ 0.03 USD. Record against the phase 1 and phase 2 numbers. `turn-verdict` is not re-run: its cases are one exchange long (`evalsets/turn-verdict.jsonl:1-3`), so the window never applies, and unit tests cover the judge context. <!-- Red team #7 -->

## Todo list
- [x] `memory.ts` and tests
- [x] Schema, prompt rule, `planTurn` acceptance
- [x] Builders with the default `[]`
- [x] Postgres, in-memory and replay stores
- [x] Isolation exemption and do-not-assert count
- [x] Prompt budget test
- [x] Re-measure (approved; 0.0303 USD) recorded

## Success criteria
- [x] Prompts are bounded after turn 5, as asserted by `prompt-budget.test.ts`.
- [x] Far-reference `label-classifier` lines are no worse than the phase 1 baseline, and the whole set stays ≥ 94.4% with 0 leading false positives.
- [x] Turn-judge context tests pass with memory present (window + `<bo_nho>`).
- [x] Every existing isolation test passes. The new memory cases pass.

## Results (2026-10-24 code, 2026-10-25 re-measure)
- Implemented as specified. With no stored entries, `splitContext` returns the whole transcript, opening line included, so callers that pass no memory, and sessions from before the deploy, read exactly as before. Turn 0 is dropped only once memory exists.
- `decisionOf(plan)` builds `decision_json` for both the main and the replay store. `memory` is written only when Call 1 left something.
- The replay judge also gets the entry this turn's Call 1 just wrote. The judge's window has already moved past that exchange, and the entry is not stored yet.
- Prompt size, scripted 30 turns (about 530 characters per exchange, about 95 per gist):

  | Call | Turn 30, before | Turn 30, after | Growth per turn after turn 6 |
  |---|---|---|---|
  | Call 1 | 22.8k chars | 12.3k chars | about 100 chars |
  | Call 2 | 18.3k chars | 8.6k chars | about 100 chars |

- `prompt-budget.test.ts` uses a full gist and two full claims every turn. It checks growth per turn from turn 8, because Call 2's notes header arrives once, at turn 7. It checks the total from turn 6. The same session with the whole transcript breaks the bound, so the test can fail.
- Code review (`plans/reports/code-reviewer-261024-1210-phase-3-session-memory.md`):
  - H1 is applied. The claims rule now also leaves out what is in `<dieu_can_tranh>`, so a do-not-assert the persona broke is not carried forward into `<da_noi>`.
  - M1 is applied. `grounded_turn_id` may now point at a `[lượt N]` gist line in `<bo_nho>`. Without that, far references would be pushed to `open`.
  - The code-side drop for H1 (drop the claims of an exchange whose verdict has violations) is still open for the user to decide.
- Gates:
  - `pnpm typecheck` and `pnpm lint` pass.
  - `pnpm test` passes 1205/1205.
  - `pnpm test:int` passes 675/675. One QA-agent int test timed out once, while a parallel unit run was going. It passed 3/3 when run alone and in the full rerun.
  - `pnpm test:e2e` passes 328/328.
- `evalsets/label-classifier.jsonl`: the 6 `lc-far-*` lines carry hand-written gists for exchanges 1–5, so at turn 11 only exchanges 6–10 are word for word.
- **Labels with window + memory** (Flash, batch, 2026-10-25, 0.0303 USD): 100% (24/24) agreement, 0/18 leading false positives. All 6 far-reference lines agree, the same as phase 2's full-transcript run. W stays 5.


- A learner who refers far back ("hồi nãy chị nói…", 8 turns ago) may get `open` instead of `confirm_grounded`, because only the gist is visible. Mitigation: gists keep the persona's own phrases. Hooks carry their own turn. The far-reference lines measure it. If it fails, raise W to 6–8; the cost is ~130 tokens per extra exchange.
- A gist may misstate what was said, and the persona then repeats the error. Mitigation: gists cover only exchanges older than 5 turns; claims are capped; the persona's guard rules still forbid inventing.
- A learner can push instructions into a gist through their question. Mitigation: gists are data blocks, one line, ≤ 200 chars, under the same data rule as the transcript.
- If phase 6 drops `<su_that_be_mat>` from Call 1, the claims rule must stop referring to it.
- The Director may often leave gists empty, for example a weaker model ignoring the rule. Then the verbatim fallback silently brings back today's cost. Mitigation:
  - `transcript-run` reports the gist fill rate (asked against non-empty), with a gate of ≥ 90% in phase 4's 10-turn run;
  - `session-trace` shows each turn's memory entry;
  - the Lite trial in phase 6 has no paid 10-turn run, so a Lite switch carries this as a known gap, and `llm_call` input tokens show a fallback after the switch. <!-- Red team #5 -->

## Security considerations
- Isolation invariant 1 holds by construction: memory is written by a call whose own context passes the isolation scan.
- Memory sits in `turn.decision_json`. It is deleted with the session, like every other turn field (account deletion cascades).

## Next steps
- Phase 4 rewrites Call 2's rules and item selection on top of the window and memory.
