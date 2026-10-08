# Code review: Phase 7, Replay

Date: 2026-10-08. Reviewer: code-reviewer agent (its session could not write the file; saved by the controller from its hand-back). Scope: uncommitted diff + untracked files, against `phase-07-replay.md`, PRD Màn 6/7, §9.1–9.7.

Reviewer ran: typecheck clean, lint clean, unit 762/762. Did not run integration, e2e, build (constraint). Did not read Next 16 docs.

## Verdict

No Critical. Sealing, main-branch immutability, claim/commit logic, context isolation hold under reading. One High, three Medium, eight Low.

## Findings and disposition

| # | Sev | Finding | Disposition |
|---|---|---|---|
| H1 | High | Replay turn sent with a `turnKey` a main turn already carries: lookup misses, 3 model calls run, commit fails on `turn_session_turn_key_key`, claim released, repeatable without limit (replay has no cost cap) | **Fixed.** `claimReplayTurn` refuses a key any turn of the session carries, under the lock, before any call (`invalid_input`). Test: `replay.int.test.ts` "refuses a key a main turn already carries" |
| M1 | Med | Fallback 1 fail/stop shows "Lần này chưa có câu nào bám vào lời…" when questions were grounded (Call 1 leading, judge disagreed) | **Fixed in part.** Line shown only when `grounded === 0`; otherwise no headline, sample question only. PRD wording has no string for this case: open question for user |
| M2 | Med | No branch-scoped `TurnStore`; `server/replay.ts` rebuilds state load and row shape that `turn-store.ts` owns | Not changed. Recorded in phase notes |
| M3 | Med | Focus lost when replay ends (composer unmounts); "Đang kiểm tra…" and result not reliably announced | **Fixed.** Focus moves to "Về kết quả buổi"; "Đang kiểm tra…" goes through the live region |
| L1 | Low | Claim not released on a throw between graph and commit | **Fixed.** One catch around verdict + decide + commit |
| L2 | Low | `replay_result.turns` on stop counted before the locked transaction | **Fixed.** Counted inside `stopReplayBranch` |
| L3 | Low | `GET /reveal` of a `done` session omits `replaySucceeded` (page props set it) | Not changed; no leak, poll consumer refreshes |
| L4 | Low | Outcome gated on `branch.result`, not session status | Not changed; same transaction writes both |
| L5 | Low | `ReplayOffer` stays on "Đang mở…" if `router.refresh()` fails | Not changed |
| L6 | Low | Dialogs lack `aria-describedby` | Not changed |
| L7 | Low | Stale comment in `limits.ts` | **Fixed** |
| L8 | Low | PRD §9.5 "Bỏ qua: không tạo nhánh"; code inserts a branch row with `skipped` | Follows phase plan; recorded as deviation |

## Checks asked for

- (a) All 8 requirements + 3 success criteria implemented and tested. Gaps: H1, M2.
- (b) Sealing: no leak found. Outcome built only for `done`; replay screen props carry turns, level, fork only; `?branch=replay` empty until `done`; stream carries outcome only when the branch has a result; stop refused during a live claim; withdrawn mid-turn writes nothing.
- (c) FR-27 holds: replay writes replay-branch rows and session `status`/`turnClaim`/`updatedAt` only.
- (d) Lock + re-check on start, skip, stop, claim, commit. Caveat: parallel-start test logic reads correct.
- (e) Isolation holds; ignoring Call 1's verdict is complete incl. first replay turn.
- (f) Result logic matches §9.5. Spec-accepted degraded case: judge fails on the turn the persona told the target → never credited.
- (g) No regression found: main graph 2 calls, analysis prompt text identical, `judgeTurn` unchanged without question.
- (h) Patterns followed; only M2 is duplication.

## Unresolved questions

1. M1: which string for fallback 1 when a question was grounded but the replay failed or was stopped?
2. L8: amend PRD to say a skip records a branch row?
3. Unbounded `llm_failed` retries on a replay turn (no cap by design): accepted cost risk, as on main turns?
