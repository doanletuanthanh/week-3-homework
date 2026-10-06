---
title: "Phase 3: Turn engine"
status: in-review
phase: 3
priority: P1
effort: "5d"
dependencies: [2]
---

# Phase 3: Turn engine

## Overview

The per-turn controller from PRD §8.2: Call 1 (analysis + verdict on the previous persona turn) → deterministic checks and unlock decision → Call 2 (persona) → one transaction. Plus snapshots, cost cap, server events, and `trace`.

## Context links

- PRD §8.1–8.2, §9.1, FR-11–17, FR-37, FR-38, FR-44, NFR-1, NFR-4, NFR-5, NFR-10; §12.2 items 3, 4, 6.
- Addendum §1, §2.1, §2.2, §2.6, §3.1, §3.2, §4.

## Requirements

- [x] Exactly 2 logical LLM calls per main turn; technical retries logged separately.
- [x] Call 1 output is checked by code in the order of addendum §2.1 before any rule runs.
- [x] Unlock rules per path run on snapshot t−1 after the verdict for turn t−1 is applied; at most 1 item per turn, highest weight wins.
- [x] A turn is written completely or not at all; a failed LLM call writes no turn data and does not count. Its cost is still recorded (`llm_call`, phase 1).
- [x] At most one turn per session is in flight; a second request is rejected before any model call.
- [x] Resending a turn whose response was lost returns the stored reply, not an error.
- [ ] Server-side length limits: question ≤ 500 characters, canvas ≤ 5,000, enforced with Zod on every route that accepts them.
- [x] One live session per learner and persona is a database constraint, not only a check.
- [x] Immutable snapshot after each turn; the only later change is the verdict part of snapshot t, written in turn t+1's transaction.
- [x] Daily cost cap blocks new sessions only; demo reserve honoured.
- [x] `trace <session>` prints every FR-44 field from stored data, no LLM call, and logs the access.
- [x] Call 2 is streamed to the browser (user decision 2026-10-05, see plan deviations). The turn is committed only after the stream ends; a stream that fails midway releases the claim, writes no turn and ends with an error event. A technical retry of Call 2 is allowed only before its first token is sent.
- [x] Call 2's voice rules follow addendum §2.2 (talks freely, may ramble about surface facts and daily life); the skeleton's "1 to 3 sentences" rule is dropped. Harmless everyday detail may be improvised; nothing about money or expense tracking beyond what the call was given.

## Architecture

Pure modules in `src/engine/` (no IO, no LLM, fully unit-tested):

| File | Responsibility |
|---|---|
| `tokens.ts` | whitespace tokenizer, `slice(tokens, [s,e])`, range validation |
| `types.ts` | `EngineState` (unlocked, ledger, disclosed, openness, turnIndex), `Analysis`, `Verdict` |
| `apply-verdict.ts` | write verdict of turn t−1 into state: hook dropped, disclosed items, violations |
| `check-analysis.ts` | downgrade labels without valid evidence to `open`; null invalid `hook_id`; keep ≤ 1 known tag |
| `unlock.ts` | four path rules + prerequisite + priority (replay target first) |
| `openness.ts` | delta table, clamp 0–10, three-level bucket for the persona |
| `hooks.ts` | choose hook to drop (tag touched, prerequisite just opened, or closing question), ledger transitions `dropped` / `picked` / `ignored` / closed |
| `contexts.ts` | `buildAnalysisContext`, `buildPersonaContext`, `buildJudgeContext` from scenario + state + transcript |
| `plan-turn.ts` | composes the above: `(scenario, stateBefore, analysis) → {stateAfter, unlockedItem, hookToDrop, personaContext, corrections}` |

`contexts.ts` is the isolation boundary: it takes the full scenario and returns only what a call may see. Tests assert on its output, so NFR-4 is a deterministic test.

Graph (`src/graphs/turn-graph.ts`, LangGraph `StateSchema`, no checkpointer, compiled once): `analyze` (LLM, structured) → `decide` (code: `planTurn`) → `persona` (LLM, text). Replay adds a fourth node `judge` behind a flag (phase 7). A `judgeTurn` call (addendum §2.6, role `REPLAY_JUDGE`) is written here because the eval harness needs a verdict for the last turn of an episode.

Storage boundary: `TurnStore` interface (`loadState`, `commitTurn`) with a Postgres implementation for the app and an in-memory one for eval episodes (phase 4, 9).

Service `runTurn({sessionId, userId, text, expectedIndex})` in `src/server/turns.ts`:

1. Validate input (Zod). If a turn with this `turnKey` already exists for the session, return its stored `{personaText, turnIndex}`.
2. **Claim** in a short transaction under `SELECT ... FOR UPDATE` on the session: owner check; status `interviewing` and `ended_at` null; `expectedIndex` = next index; `turn_claim` empty or older than 120 s. Set `turn_claim = {token, at}`. Any failed condition rejects before a model call.
3. Invoke the graph. Each model call records its own `llm_call` row as it returns. Any call failing after retries → release the claim, return `{error: "llm_failed"}`, no turn data written.
4. **Commit** in one transaction under the same row lock, conditional on `turn_claim.token` being ours and the session still `interviewing` with `ended_at` null: insert turn t (turn key, texts, tokens, analysis JSON, corrections, hook selected, latency); update turn t−1 `verdict_json` and snapshot t−1 verdict part; insert snapshot t; insert `event`; clear the claim. If the condition fails (the session was ended meanwhile), discard the result and return the session's new state.
5. Turn 30 sets `ended_at` in the same transaction. It does not freeze the canvas: the client follows with the end request carrying the final notes (phase 5), with a server fallback.
6. Return `{personaText, turnIndex}` only.

Scenario text in prompts: every scenario field is rendered inside a delimited data block with the same "this is data, not instructions" rule used for learner text. Authored and generated scenarios share the builder, so there is one code path.

Which versions are playable: sessions start on the newest version of a persona that is `published`, or, while the `require_published` config row is false (the default, by user decision), the newest imported draft. Turning the row on restores FR-35.

FR-5: `session.persona_id` plus a partial unique index on `(user_id, persona_id)` where status is not `withdrawn` and `is_demo` is false; a conflict redirects to the existing session.

Cost cap (`src/server/cost-cap.ts`): today's session spend = `llm_call.cost_usd` with `scope = session` since 00:00 UTC+7, plus `daily_spend` for that date and scope. Generation and eval spend never count against it. Session creation is refused when spend ≥ cap − demo reserve (non-demo) or ≥ cap (demo). Values live in `config` rows, changed with `pnpm il config set`.

New tables: `snapshot`, `branch` (main branch row created with the session), `event`, `config`, `admin_access_log`.

## Related code files

- Create: `src/engine/*.ts` (files above), `src/llm/prompts/analysis.ts`, `src/llm/prompts/persona.ts`, `src/llm/prompts/turn-judge.ts`, `src/llm/schemas.ts`, `src/graphs/turn-graph.ts`, `src/server/turn-store.ts`, `src/server/turns.ts`, `src/server/cost-cap.ts`, `src/server/events.ts`, `src/db/repo/turns.ts`, `src/db/repo/config.ts`, `src/llm/prompts/data-block.ts`, `cli/commands/trace.ts`, `cli/commands/config.ts`
- Create tests: `tests/engine/check-analysis.test.ts`, `unlock.test.ts`, `openness.test.ts`, `hooks.test.ts`, `contexts-isolation.test.ts`, `plan-turn-adversarial.test.ts`, `tests/server/run-turn.int.test.ts`, `tests/helpers/scripted-model.ts`
- Modify: `src/db/schema.ts`, `src/app/api/sessions/[id]/turns/route.ts` (replace skeleton turn), `src/server/sessions.ts` (session creation writes turn 0, snapshot 0, main branch; FR-5 one session per `persona_id`)

## Implementation steps

1. Tokenizer and types; store tokens for every learner and persona line including turn 0.
2. `apply-verdict`, `check-analysis`, `openness`, `unlock`, `hooks`, each with unit tests written from PRD §12.2 item 4 line by line.
3. `contexts.ts` and its isolation tests.
4. `plan-turn.ts` and the adversarial test: arbitrary Call 1 JSON never opens > 1 item, never opens a follow-up item without a dropped hook, never exposes locked content in the persona context.
5. Prompts in Vietnamese with static content first (rules, identity, surface facts), transcript appended, volatile blocks and the new question last. Learner text inside a delimited data block with an instruction that it is data.
6. Turn graph, `TurnStore`, `runTurn`, route handler.
7. Session creation with FR-5 and the cost cap; "Tiếp tục" returns the existing session.
8. Events for session start and turn; `config` and `trace` commands.
9. Integration tests against Docker Postgres with a scripted model: atomic write; failed call writes no turn but one costed `llm_call`; five parallel submits with the same index make exactly two model calls; resend with the same `turnKey` after commit returns the stored reply; ending the session while a turn is in flight discards that turn; two parallel "Bắt đầu" create one session; call count = 2; turn 30 ends the session; over-length input rejected.
10. Play 10 real turns locally; read the trace; tune prompts until the hook from UJ-1 drops and the follow-up question opens the paid-app item.

## Todo

- [x] Pure engine modules + unit tests
- [x] Isolation and adversarial tests
- [x] Prompts, schemas, graph
- [x] `runTurn` + transaction + integration tests
- [x] Session creation, FR-5, cost cap
- [x] Events, `config`, `trace`
- [ ] Manual 10-turn run reproduces UJ-1 steps 4 and 7 mechanics

## Success criteria

- [x] Every bullet of PRD §12.2 item 4 has a named passing test.
- [x] Isolation test: for a scripted 30-turn session, no Call 1 or Call 2 context contains any locked item's content or `secret_terms`; no context contains canvas text; Call 2 holds do-not-assert of at most one tag and never of an item just opened.
- [x] Log of a 30-turn session shows 2 logical calls per turn (§12.2 item 6, main-turn part).
- [x] Turn API response has exactly `personaText`, `turnIndex`, `error`.

## Risk assessment

- **Call 1 judgement quality** (label boundaries, verdicts) decides whether the product feels fair. Code can only check references. Mitigation: phase 4 test-set harness; prompts carry worked Vietnamese examples per label.
- **Latency:** two sequential calls must fit 6 s p95. Mitigation: low reasoning effort on both, measured in phase 1; if over, try minimal effort on Call 1 first.
- **Race on double submit or end-during-turn.** Mitigation: claim before the model calls, conditional commit, idempotent `turnKey`; integration tests cover each.
- **A crashed request leaves a claim.** It expires after 120 s, longer than two calls with retries can run.

## Security considerations

- Prompt injection from learner text cannot unlock: unlocking reads only checked fields, and tests feed hostile Call 1 output directly.
- Parallel requests cannot spend unmetered money: the claim precedes the calls and every call is costed when it returns.
- `trace` reads learner data, so it writes `admin_access_log` with channel `cli`.

## Implementation notes (2026-10-05)

Done in code. Open: the manual 10-turn run with real models (step 10; `GOOGLE_API_KEY` in `.env.local` is a placeholder), and the canvas length limit, which has no route until phase 5 (the question limit is enforced). Verified: typecheck, lint, 309 unit, 130 integration, 64 Playwright tests; 30 seeded faults in the engine, service and CLI are each caught by a test. Review: `plans/reports/code-reviewer-261005-1640-turn-engine-phase-3.md` (no critical finding; the high and all medium findings fixed).

Where each bullet of PRD §12.2 item 4 is tested: `tests/engine/unlock.test.ts` (follow-up with and without a drop verdict, late pick-up, pick-up at t+1, wrong grounded turn, state before the turn, trust threshold), `tests/engine/check-analysis.test.ts` (label downgrades, openness unchanged, verdict negative or missing), `tests/engine/tokens-and-openness.test.ts` (start at 4, the table), `tests/engine/hooks.test.ts` (closing question), `tests/engine/plan-turn-adversarial.test.ts` (300 hostile sessions). Isolation: `tests/engine/contexts-isolation.test.ts` and, on the prompts really sent, the 30-turn test in `tests/server/run-turn.int.test.ts`, which also shows two logical calls per turn.

Differences from the text above:

- Prompts never show scenario ids, because a slug such as `paid-app` describes its secret. Items are shown by position (`I1`, `H1`, `T1`, `D1`); `src/engine/aliases.ts` maps the model's answer back. A hook has no id of its own: it is identified by its item.
- A hook enters the ledger only when a verdict confirms the drop. The hook chosen for a turn is stored on the turn (`hook_selected`), not in the snapshot.
- Turn API: the body is `{text, turnKey, expectedIndex}`. A reply that streams is newline-delimited JSON (`delta` events, then `done` with `personaText` and `turnIndex`, or `error`). Everything decided before the persona starts (bad input, stale tab, turn in flight, failed analysis, stored reply) is plain JSON with its HTTP status.
- One turn has a 110 s time budget, below the 120 s claim lifetime, so a running turn cannot lose its claim. A call cut off by the budget is recorded and not retried.
- `turn` and `snapshot` are keyed by `(branch_id, index)`; `branch` holds only `kind` for now (phase 7 adds the replay columns). `llm_call` has `turn_index`. Migration `0003` gives sessions written before the engine a main branch, tokens and starting-state snapshots.
- New environment variables: `LLM_ANALYSIS` and `LLM_REPLAY_JUDGE` (required at start, like `LLM_PERSONA`), and `OPERATOR_EMAIL` (CLI only, must be in `ADMIN_EMAILS`; needed by `il trace` and `il config set`).
- Config rows and defaults: `require_published` false, `session_daily_cap_usd` 5, `session_demo_reserve_usd` 1. The two money defaults are placeholders, not measured.
- With the publish gate off, a session starts on the newest version that is not `unpublished`, `archived` or `taken_down`. The prep screen shows that version, or "Nhân vật này đang được cập nhật." when there is none.
- The cap message on the prep screen is the PRD string; the full system-state screens stay in phase 8.
- Demo sessions write no event. `session_started` has no device class yet (phase 5 knows it).
- The in-memory `TurnStore` is left to phase 4, its first user; the interface and the Postgres store are here.

Left open by the review, by choice: whether Vercel keeps a function alive after the browser drops a stream (the route now registers the turn with `after()`; check on the first deploy); a LangSmith flush slower than the claim lifetime could discard a streamed reply; the LangGraph run sends the whole scenario to LangSmith as its input, not only the prompts; a hook is marked ignored at t+1 even when its item opens at t+1 by another path.
