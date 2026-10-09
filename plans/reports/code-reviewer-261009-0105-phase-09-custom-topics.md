# Code review: phase 9 "Custom topics"

## Scope

- Uncommitted work on `main`: 55 modified files (+1055/-134) and about 2,100 lines of new source; `tmp-ten-topics.ts` ignored.
- Read: every new file named in the task and the diff of every modified file named in the task.
- Ran: `pnpm typecheck` (clean) and `pnpm lint` (clean).
- Not run: `pnpm test:int`, `pnpm test:e2e`, any real model call. Every finding below comes from reading the code, not from a failing run.

## Overall

No critical defect. Fencing, quota and budget logic are sound and well covered by tests. One safety control fails open (High). Five Medium findings sit at the edges: concurrent submits, takedown, account deletion, refund, and wasted spend.

## Critical

None.

## High

### H1. Moderation constraints fail open
`src/llm/prompts/moderation.ts:29-34` (`clampModeration`)

- **Problem:** `constraints` is a free string array, and entries outside the closed set are dropped silently. A reply of `allow_with_constraints` with a misspelt or empty list becomes a plain `allow` with no constraints.
- **Failure scenario:** the topic is "học sinh lớp 8 dùng app học thêm". The model answers `allow_with_constraints` with `["adult_only"]`. The entry is dropped, so the generator gets no `adult_persona_only` rule. `buildOutputSafetyMessages` also receives `[]`, so the safety call has no constraint to enforce. A minor persona, or crisis content on a mental-health topic, can reach the learner, against FR-55.
- **Fix:** treat `allow_with_constraints` with any dropped entry, or with none left, as all three constraints (or as a refusal with `other`). Add a case to the scripted "out-of-set values" test.

## Medium

### M1. The refusal lock and the moderation call are not serialised
`src/server/custom-topic.ts:72-88`

- **Problem:** the pre-check, the moderation call and `recordRefusal` all run outside any lock. The 10-refusals-a-day lock is only read in the pre-check.
- **Failure scenario:** a learner fires 100 parallel POSTs. All pass the pre-check, all call the model, and all 100 refusals are recorded. Allowed topics behave the same way: N moderation calls for one attempt.
- **Impact:** moderation spend is scope `moderation` and counts against no budget, so each burst is unbounded.
- **Fix:** take a per-user advisory lock (or the user row lock in a short transaction) around pre-check, moderation and refusal insert. Alternatively re-count refusals under the lock before the call, and count moderation spend in the generation budget.

### M2. A taken-down scenario stays readable by its owner
`src/db/repo/custom-topics.ts:350-367`, `src/db/repo/sessions.ts:30`, `src/app/prep/[personaId]/page.tsx:38-40`

- **Problem:** PRD line 339 says a taken-down persona is hidden from its owner. Takedown only withdraws unfinished sessions.
- **Failure scenario:** after takedown, `getVisibleScenario` still returns the scenario, so `/prep/custom-…` renders the name, tagline and research goal. A `done` session still renders the full reveal, items included. The content that was pulled, for example a claim about a real organisation, remains on screen.
- **Fix:** exclude `origin = 'generated' AND status = 'taken_down'` in `getVisibleScenario`, and withdraw `done` sessions too (or render the withdrawn screen for them).
- **Needs a decision:** the plan text only says "unfinished sessions → withdrawn", so the treatment of `done` sessions is a product call.

### M3. Deleting the account can reset the 20 % share
`src/server/delete-account.ts:59`

- **Problem:** `usedCustom` ignores `spendTodayUsd`. An account whose attempts today all ended as `system_error` has zero attempts and zero refusals, so no tombstone row is written.
- **Failure scenario:** two system-error attempts spend about 2 USD. The learner deletes the account and signs in again. The per-account share reads 0, so they get another 2 USD. Repeating this lets one Google account use the whole day's budget.
- **Bound:** the global budget still holds, because the spend moves to `daily_spend`.
- **Fix:** add `|| usage.spendTodayUsd > 0` to `usedCustom`.

### M4. Refund has no effect when the flag lives in the tombstone
`src/db/repo/custom-topics.ts:370-373`, `src/server/custom-quota.ts:46`

- **Problem:** `refundFreeScenario` clears `user.free_custom_used` only. `readCustomQuota` ORs it with `kept.freeCustomUsed`.
- **Failure scenario:** a learner who deleted their account and signed in again is refunded by the operator. The CLI prints "Đã trả lại", but the learner stays on `free_used`.
- **Fix:** clear the tombstone flag for the user's quota key in the same call, or have the CLI report that the block comes from the kept row.

### M5. One failed episode still pays for the other six
`src/eval/run-eval.ts:93-106`, `src/server/generation.ts:98-108`

- **Problem:** `runEpisodes` lets in-flight episodes finish after a failure. That suits a resumable CLI run. Here all 7 are in flight and nothing resumes.
- **Failure scenario:** one episode hits a non-retryable provider error at turn 1. The attempt is already bound to end as `system_error`, yet about 180 more calls are paid for and the learner waits for them.
- **Fix:** give the reduced run a fail-fast path, for example a local `AbortController` merged into `llmDeps.signal` and aborted on the first episode failure. Also call `stop.abort()` in the runner's `finally`.

## Low

- **L1. Possible deadlock between finish and delete.** `finishAttempt` locks the attempt row, then the user row (`custom-topics.ts:261, 286-291`). `deleteAccount` locks the user row, then sweeps the attempt row (`delete-account.ts:27-34`). They only collide when a pass or fail lands after `deadline_at` while the owner deletes. Postgres aborts one side: a 500 on delete, or a lost pass that is later swept. Fix: lock the user row first in `finishAttempt`, as submit and delete do.
- **L2. "Thử lại" keeps the old topic title.** A retry reuses the topic row (`custom-topic.ts:103`) but `topic.title` keeps the first text. If the learner edits the topic, a later pass shows the old title on the prep breadcrumb, in the session list and on the print sheet. Fix: update the title, or create a new topic when the text differs.
- **L3. Focus `follow_up` does not move the habit card.** PRD §4 line 97 puts "nghe nhưng không hỏi tiếp" *and* the habit card first after the praise. `reveal-compute.ts:134-139, 218-220` moves only the fault and always appends the habit card last. Confirm the intent.
- **L4. Dead code.** `getAttemptOfScenario` (`custom-topics.ts:208-212`) has no caller, and its comment describes a focus lookup it does not do.
- **L5. Admin log is written after the change.** `cli/commands/custom.ts:95-97, 104-105` writes `admin_access_log` after takedown and refund, while the comment at lines 43-45 says before. A failed log insert leaves an unlogged change. Fix: log first, or use one transaction.
- **L6. Generated text sits outside a data block.** `validate` messages quote generated text (`"${term}"`, topic tags), and `scenario-generator.ts:131` puts them in the feedback prompt as plain lines. This is only self-injection, but it breaks the "generated text is untrusted" rule. Fix: wrap the list in `dataBlock`.
- **L7. Sweep cost detail.** The sweep's `cost_actual_usd` subquery (`custom-topics.ts:42`) filters `llm_call` by `attempt_id` with no index and no date bound. A runner that is still alive for up to 15 s after a sweep adds rows the stored figure misses. The budget is unaffected because it sums `llm_call` directly; `custom stats` reads slightly low.
- **L8. Tracing-off is untested.** No test asserts that reduced-eval calls are not traced (`generation-graph.ts:86-97`). Upstream `@langchain/core` main honours `tracingEnabled === false` on a traceable parent; I did not check the installed version.

## Verified correct

- **Moderation order:** moderation runs before any row exists. A refusal writes one `refused` attempt with no topic or session, and it is not counted as an attempt.
- **`focus_raw`:** it reaches only `buildModerationMessages` and its column. The generator input type has no such field, and the canary test covers generation plus a played session and reveal.
- **Quotas:** the 3/day, 6 lifetime, 1 free, 1 running, 20 % share and 10-refusal limits follow the Màn 10 precedence. `system_error` and `refused` are excluded from the attempt count.
- **Creating transaction:** quotas are re-read under the user row lock and the `pg_advisory_xact_lock`, which is safe on the transaction pooler. The partial unique index backs the one-running rule.
- **Budget:** running attempts count at their reservation and finished ones at actual `llm_call` plus `daily_spend`, with no double count. The reservation is released atomically when the outcome changes.
- **Fencing:** the claim requires `running` and a null token. The sweep is one statement that clears the token. Heartbeat, step and finish are all conditional on token and `running`, and finish re-checks under `FOR UPDATE`. A swept attempt cannot be revived, and two runners cannot both write.
- **Submit against sweep or finish:** I found no reachable lock cycle (user row → advisory → attempt rows). The only cycle is L1.
- **Stale attempts:** they are swept in the submit transaction, the session list, the status route, the session page, the Màn 10 quota read and before the delete-account check.
- **Deadline and abort:** the deadline is request start + 270 s. The `CallModelDeps.signal` merge uses `AbortSignal.any`, and an aborted call is recorded and not retried.
- **Access:**
  - `visibleTo` filters prep, `startSession` and `openSession` for other learners and guests.
  - The status and report routes are owner-scoped.
  - `getPendingCustomSession` is owner-scoped.
  - The status response and Màn 11 carry no generated content.
  - `generation_attempt` has RLS enabled and grants revoked.
  - The home link is limited to authored personas.
- **Prompts and UI:** topic text and every safety field go through `dataBlock`, which neutralises closing tags. All UI output is React-escaped, with no `dangerouslySetInnerHTML`.
- **Regressions:**
  - Each `scenarioId!` / `personaId!` sits on a path that only an `interviewing`-or-later session reaches.
  - The list's left joins cannot duplicate rows, because `session_id` is unique.
  - Every `getPlayableScenario` caller is updated.
  - Delete order is sessions → custom scenarios and topics → user, with spend moved to the ledger first.
  - Comment ordering is unchanged when `focus` is null.
- **First-turn cost cap:** the claim is released and `cap_reached` is mapped in the route and the UI.

## Plan follow-ups (not edited)

- No evidence in the diff for step 0 (go/no-go measurement on Vercel) or step 10 (10-topic measurement). The plan's success criteria depend on both.
- `tests/graphs/focus-canary.test.ts` named in the plan does not exist; the canary lives in `tests/server/custom-topic.int.test.ts`.
- Remove `tmp-ten-topics.ts` before commit.

## Unresolved questions

1. M2: should `done` sessions of a taken-down scenario be hidden as well?
2. L3: is the habit card meant to move up for `follow_up`?
3. M1: is uncapped moderation spend accepted, or should it count in the generation budget?
