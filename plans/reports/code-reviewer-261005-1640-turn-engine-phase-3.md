# Code review: turn engine (phase 3)

Date 2026-10-05. Scope: all uncommitted changes on `feat/turn-engine`. Reviewer ran typecheck, lint, unit, integration; probed the time-budget abort and applied migration `0003` to old-shape data in a throwaway database. Not run by reviewer: e2e, Vercel runtime.

Verdict: no critical finding. Engine rules, isolation boundary, claim/commit atomicity and migration hold against spec and probes.

## Findings and disposition

| # | Sev | Finding | Disposition |
|---|---|---|---|
| H1 | High | 110 s turn budget surfaced as 500 `server_error`, not `llm_failed`; failed attempt's `llm_call` row written after the response | Fixed: budget signal goes to model calls only; `runTurn` returns `llm_failed`. Two hang tests added |
| M1 | Medium | Tail of a streamed turn ran detached from the request; on Vercel a client disconnect could suspend it before commit/release | Fixed with `after()`. Vercel behaviour still to confirm on first deploy |
| M2 | Medium | Prep page and session start read different scenario versions; no message when nothing playable | Fixed: prep uses the playable version; shows "Nhân vật này đang được cập nhật." Browser test added |
| M3 | Medium | `llm_failed` left no server log of the cause | Fixed: one warn line (session, turn, role, attempts, cause; no learner text) |
| M4 | Medium | Parallel-submit tests share one connection, so they do not prove the row lock | Fixed: claim test over four separate connections |
| L1 | Low | Resend race re-check only on `wrong_index` | Fixed: re-check on every refusal except `not_found` |
| L2 | Low | `awaitAllCallbacks()` not bounded by the turn budget | Open |
| L3 | Low | "Say it now" instruction sat inside a data block | Fixed: instructions outside, one block per group |
| L4 | Low | Transcript line spoofing in Call 1 | Rejected: lines are re-joined from tokens, so learner text cannot start a line (test in `contexts-isolation.test.ts`) |
| L5 | Low | Hook marked ignored at t+1 when its item opens at t+1 by another path | Open question for the user |
| L6 | Low | `getConfig` throws on a malformed row | Kept: a cap that silently falls back is worse than a loud failure |
| L7 | Low | LangGraph run sends the whole scenario to LangSmith as input | Open question for the user |
| L8 | Low | Canvas limit, device class in `session_started`, manual 10-turn run not done | Canvas and device class belong to phase 5; unused constant removed. Manual run needs a real model key |
| L9 | Low | PRD section numbers in two test comments | Fixed |
| L10 | Low | `LLM_ANALYSIS`, `LLM_REPLAY_JUDGE` required at boot | Noted for deploy |

After fixes: typecheck and lint clean; 309 unit, 130 integration, 64 Playwright tests pass.

## Unresolved questions

1. Does Vercel keep the function alive after the browser cancels the response stream?
2. With the publish gate off, `evaluating` and `eval_failed` versions are playable. Intended?
3. Should a hook count as ignored when its item opens on that same turn by another path?
4. Is sending the whole scenario to LangSmith as graph input acceptable under the tracing deviation?
