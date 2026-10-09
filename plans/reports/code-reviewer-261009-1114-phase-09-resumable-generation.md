# Code review: resumable custom-topic generation runner

Date: 2026-10-09. Scope: the runner redesign only (claim / release / sweep, the three kick points, cost meter, eval removal). Read-only.

Checks run: `pnpm typecheck` clean, `pnpm lint` clean, `pnpm test` 876/876. Integration and e2e suites were not run (out of bounds); findings below come from reading the code.

## Overall

No Critical or High finding. Fencing holds: I found no path where two runners both write, or where a runner that lost the attempt opens the session or records a failure. No state stays `running` / `generating` past the 10-minute deadline once anyone sweeps. The findings are about time anchoring, dead waiting windows and cost under-counting.

## Critical

None.

## High

None.

## Medium

### M1. The 270 s run limit counts from the claim, not from the start of the function
`src/server/generation.ts:86-88`, `src/app/api/custom-topics/route.ts:18-29`

- In the submit route the function has already spent the moderation call (and auth, quota reads) before `after()` starts the run. Moderation uses the default 45 s attempt timeout with 2 retries.
- Scenario: the moderation provider times out once (45 s) and then answers. The run is claimed at about t = 47 s and would release itself at t = 317 s. The platform kills the function at 300 s first.
- Result: no release is written, the attempt sits owned-but-dead for 60 s, one of the three runs is burnt, and the model call in flight never gets its `llm_call` row (its cost is in no meter).
- Any moderation slower than about 25 s has this effect. The other three kick points have negligible lead time.
- Fix: pass the function's start to the runner and shorten the limit, e.g. `runLimitMs: GENERATION_RUN_LIMIT_MS - (Date.now() - requestStartedAt)` from the submit route.

### M2. A call cut by the run limit is recorded at zero cost
`src/llm/call-model.ts:229`, `src/server/generation.ts:80-84,88`

- An aborted attempt is recorded with `ZERO_USAGE`. Before the redesign an abort ended the attempt; now it is the routine way a run ends (`run_limit`), and also happens on `lost`.
- Scenario: the generator is 90 s into a slow call when the 270 s timer fires. The provider still bills the tokens; the row says 0 USD. The next run's meter starts from a sum that is too low, and so do `generationCommittedToday` / `accountCommittedToday` once the attempt ends.
- Bound: at most one call per run, so three per attempt (roughly 0.02-0.05 USD each at the measured costs). The 1 USD reservation is not at risk; the daily ledger drifts low.
- Fix (either): do not abort at the run limit when a call is in flight for less than its own timeout, i.e. stop *between* calls (check the limit in `onStep` / before each generator try) and keep the hard abort only for the deadline; or record an estimated input-token cost for aborted attempts.

### M3. Sweep and claim disagree on "unowned": a released attempt with no runs left waits 60 s for nobody
`src/db/repo/custom-topics.ts:56` vs `:223-224,248`; `src/server/generation.ts:120-123`

- Claim treats `run_token IS NULL` as unowned. Sweep only looks at `heartbeat_at`, which `releaseAttempt` leaves fresh.
- Scenario: runs 1 and 2 die early (function crashes), run 3 is claimed at t = 140 s with 460 s left, hits `run_limit` at t = 410 s and releases. Now `run_attempt = 3`, token null, heartbeat fresh: not claimable, not due, not sweepable. The waiting screen spins for up to 60 s more before the sweep closes it.
- Same mismatch with `abandon: true`: an attempt released (or never claimed) less than 60 s ago is not closed, so `deleteAccount` answers `generating` although nobody owns it.
- Not a permanent stuck state: the heartbeat goes stale after 60 s, and the deadline closes it regardless.
- Fix: in the sweep use the same predicate as the claim, `(a.run_token IS NULL OR a.heartbeat_at < now() - stale) AND <out of runs>`. Optionally, in `runGeneration`, finish as `system_error` instead of releasing when `attempt.runAttempt >= GENERATION_MAX_RUNS`.

## Low

### L1. `abandon` is unreachable from the UI, and the page with the delete button restarts the attempt
`src/app/my-sessions/page.tsx:30-33,78`, `src/server/delete-account.ts:35`

- `/my-sessions` renders the delete button disabled while a session is `generating`, and the same render starts a new run when the attempt is due. So by the time the learner could delete, the attempt has a live runner again and the abandon sweep closes nothing.
- Deletion is still bounded by the 10-minute deadline, so nothing blocks longer than that.
- Suggestion: either accept this (then `abandon` only serves a direct action call from a stale tab) or do not disable the button for an attempt that is due.

### L2. `cost_actual_usd` and the `cost_usd` event prop can under-count after a takeover
`src/server/generation.ts:72,133`, `src/db/repo/custom-topics.ts:253-256`

- The new runner reads the sum once at claim. Rows the previous runner writes afterwards (its aborted call, or calls it finishes while its heartbeat is failing) are in neither meter.
- Budget accounting itself stays right, because it sums `llm_call` rows; only the attempt column and the event are low. The sweep already uses the sum.
- Fix: in `finishAttempt` set `cost_actual_usd` from the `llm_call` sum inside the transaction, as the sweep does.

### L3. A runner whose heartbeat keeps failing does not stop
`src/server/generation.ts:89-95`

- A heartbeat error is only logged. Scenario: the DB is unreachable from runner A for more than 60 s while its model call goes on; B claims and generates too. A stops only at its next successful write. Both pay for a generator call; no double write.
- Fix: abort with `lost` when the last successful heartbeat is older than `GENERATION_STALE_MS`.

### L4. The two feedback loops are per run, not per attempt
`src/graphs/generation-graph.ts:56-73`

- A run cut during generation leaves no draft and no loop count, so the next run starts at try 0: up to 9 generator calls an attempt. Bounded by the reservation and the deadline. Only reachable with a slow provider (three tries normally take about 115 s).
- No change needed unless the count is meant as a hard cap; then store the try count on the attempt.

### L5. Leftovers and stale text
- `src/server/generation.ts:43`: "`not_claimed`: ... or has no runs left" is right, but the earlier report's fencing line ("claim requires a null token") no longer describes the code; the journal should not quote it.
- `src/components/custom/generating-screen.tsx:13`: `STEP_ORDER` repeats `ATTEMPT_STEPS` from the schema.
- `failed_eval` / `FailedEvalScreen` keep the name of a step that no longer exists. Renaming needs a migration; not worth it now.
- No reference to `reduced-gate` remains in `src`, `cli` or `tests`. `LLM_EVAL_INTERVIEWER` / `LLM_EVAL_LEAK_JUDGE` are optional in `src/config/env.ts:61-62`; steps, failure codes and strings agree (`generating`, `validating`; `invalid`, `unsafe_output`, `system_error`).

## Verified correct

- **Fencing (a):** `touchAttempt`, `saveDraft` and `releaseAttempt` are all conditional on id + token + `running`. `finishAttempt` re-checks token and outcome under `FOR UPDATE`. The claim and the sweep are single conditional statements, so a claim that waits on a finishing or swept row re-evaluates and loses. The sweep clears the token and the draft.
- **Lost runner:** returns `lost` before any write, from the heartbeat, from `onStep` / `onDraft`, or from `finishAttempt` returning false. It cannot open the session or count a failure.
- **Draft reuse (b):** the claim's `RETURNING` row carries the draft; the graph skips `generate` when it is set, so only the safety call runs.
- **Budget while unowned (b):** a `running` attempt counts at its full reservation whether owned or not, and its `llm_call` rows are excluded until it ends. No double count, no gap during a release.
- **Liveness (c):** every reader that matters sweeps first (submit transaction, quota read, status route, session page, session list, delete). The deadline closes an attempt whatever its heartbeat or runs. The one-running slot, the budget and account deletion are held for at most 10 minutes.
- **Timer (d):** `Math.min(untilDeadline, runLimit)` with the reason chosen by the same comparison is right, including `untilDeadline = 0`. An abort during a DB write does not cancel the write; the next model call fails at once and the run is released with its draft. A result that is already paid for when the timer fires is still written.
- **Rejections (d):** the heartbeat has its own catch. A failing `releaseAttempt` or `finishAttempt` rejects `runGeneration`, which every caller catches; the attempt then goes stale and is taken over. Timers are cleared on every path.
- **Kick points (e):** all four functions that run a generation set `maxDuration = 300`. The poll is sequential per tab and each due poll costs one conditional update; only one claim wins. All three kicks are owner-scoped (attempt by user id, session by user id, running attempt by user id).
- **Draft exposure (e):** the status route returns `outcome`, `step`, `sessionId`, `personaId` only. `PendingScreen` passes `id`, `topicText`, `step`, `failureCode`. The session list selects `topicText` only. The CLI does not print the draft.

## Unresolved questions

1. A model call that fails after its retries ends the attempt as `system_error` and throws the stored draft away, even with runs left. Is that intended now that a release is cheap? (For the 1 s safety call it means the learner pays moderation and generation again.)
2. When the operator turns `custom_path_enabled` off, running attempts are still resumed by the kick points. Should the switch also stop them?
3. L1: should a due attempt block the delete button at all?
