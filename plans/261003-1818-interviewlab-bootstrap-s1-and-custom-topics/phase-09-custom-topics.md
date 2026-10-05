---
title: "Phase 9: Custom topics"
status: todo
phase: 9
priority: P2
effort: "7d"
dependencies: [4, 8]
---

# Phase 9: Custom topics

## Overview

"Tạo chủ đề của bạn": a learner types a topic, the system moderates it, generates one persona, validates it, safety-checks it, runs a reduced eval, and either opens the session or reports why not. Quotas, a separate generation budget and a kill switch keep cost and abuse bounded.

## Context links

- PRD UJ-2, Màn 10, Màn 11, §4 (focus table), §7 (`generating`, `failed_eval`), FR-52–56, NFR-1, NFR-2, NFR-5, NFR-13; §12.2 item 14. Addendum §1, §2.7–2.9, §4 (`generation_attempt`), §5.
- Artboards: `CustomTopic`, `CustomStates`, `Generating`, `FailedEval`, `PrepCustom`, `RevealCustom`; canvas note `d7`.

## Requirements

- [ ] Moderation + focus classification is one call inside the submit request, before any session exists. Refusal creates no session and uses no attempt.
- [ ] The raw "luyện điều gì" text reaches only that call and the `focus_raw` column.
- [ ] Pipeline: generate (≤ 2 validate-feedback retries) → `validate` → output safety check → reduced eval (1 good, 1 bad, 5 adversarial, ≤ 10 learner turns each, 7 in parallel).
- [ ] Pass rule: good opens ≥ 2× bad and ≥ 3 items; hook transmission ≥ 90 %; zero leak flags; safety clean.
- [ ] Failure codes: `invalid`, `weak_separation`, `leak_flag`, `low_hook_transmission`, `unsafe_output`, `system_error`; each maps to a fixed Vietnamese reason.
- [ ] Quotas exactly as FR-56: 3 attempts/day, 6 lifetime failures, 1 free playable scenario, 1 running attempt, ≤ 20 % of the daily generation budget per account, 10 refusals/day lock. System errors and refusals do not count as attempts.
- [ ] Each attempt reserves its maximum cost up front and returns the unused part; a running attempt is aborted when its spend reaches the reservation.
- [ ] A dead attempt never holds budget, the one-running slot, or account deletion: stale attempts are swept wherever those are checked.
- [ ] One running attempt per learner is a database constraint; per-learner quotas are checked inside the creating transaction.
- [ ] Hard stop at 270 s measured from the start of the submit request → `failed_eval` / `system_error`, attempt not counted.
- [ ] Labels on every custom screen: "Kiểm tra nhẹ", "chi tiết hư cấu", "Đây không phải insight thật".
- [ ] Learner can report "Kịch bản này có vấn đề" on the reveal; operator can take a scenario down and refund the free scenario by CLI; a `config` switch pauses the path.

## Architecture

- Submit `POST /api/custom-topics` (`src/server/custom-topic.ts`): requires acked user; Zod length limits → a cheap pre-check of quotas for the right message (Màn 10 order) → moderation call (role `MODERATION`, scope `moderation`, topic and focus text wrapped as data, policy table from FR-55) → code clamps `focus`, `reason_code`, `constraints` to their closed sets → on allow, **one transaction** that locks the user row and the budget `config` row, sweeps stale attempts, **re-checks every quota and the budget**, then creates the custom `topic` (first attempt only), the `session` (`generating`), the `generation_attempt` (`running`, `cost_reserved_usd`, `deadline_at = requestStart + 270 s`) → `after(() => runGeneration(attemptId))` with `maxDuration = 300`.
- Budget check inside that transaction: `SUM(reserved of running) + today's generation spend (llm_call scope generation + daily_spend) + newReserve ≤ budget`; the per-account 20 % share uses the same sources plus the counter rehydrated from the tombstone.
- Sweep (`sweepStaleAttempts`): attempts `running` with a heartbeat older than 60 s or past `deadline_at` become `system_error`, their session `failed_eval`, their reservation settled to actual spend. Called in the submit transaction, the session list, the status route and before the delete-account check.
- A partial unique index allows one `running` attempt per user.
- `src/graphs/generation-graph.ts`: `generate` (role `SCENARIO_GENERATOR`, input: topic text as data, focus enum, moderation constraints, authoring rubric, schema; never `focus_raw`) → `validate` (code; errors fed back, ≤ 2 loops) → `safety` (role `SAFETY`, addendum §2.9) → `reducedEval` (phase 4 episode runner, in-memory store, concurrency 7, 10-turn limit) → `decide` (phase 4 gate maths with the reduced thresholds).
- Runner `src/server/generation.ts`: claims the attempt with a run token (same fencing as the reveal runner: every write conditional on the token and on the attempt still `running`, so a swept attempt can never be revived); updates `generation_attempt.step` (`generating` → `validating` → `testing`); heartbeat on a 15 s timer; one `AbortSignal` fires at `deadline_at` or when the cost meter (sum of this attempt's `llm_call` rows, scope `generation`) reaches `cost_reserved_usd`; LangSmith tracing is off for the reduced-eval calls; generation and eval roles use the batch key; on pass stores the scenario (`origin=generated`, published for its owner only), sets `scenario_id`, writes turn 0, sets the session `interviewing`, marks `free_custom_used`; on fail sets `failed_eval` + reason and increments `custom_failed_count` unless `system_error`; always settles the budget.
- Status `GET /api/custom-topics/[attemptId]` (owner only): step and outcome; runs the sweep for that user (no cron).
- Generated scenario text is untrusted: the phase 3 data-block rendering covers every field in all prompts including the eval interviewer and leak judge; the safety call checks every string field for model-directed text; `validate` requires code-verified `secret_terms`.
- Focus effects: generator item-path distribution and trust behaviour per the §4 table; takeaway comment ordering in `reveal-compute` reads `session.focus`.
- Screens: Màn 10 `CustomTopicForm` (two fields, four quick chips, verbatim info block, quota line, state precedence list), Màn 11 `GeneratingScreen` (three steps, tab title "✓ Kịch bản sẵn sàng" when done, auto-forward to Màn 3) and `FailedEvalScreen` (reason, attempts left, "Thử lại" pre-filling the form and creating a new session in the same topic), Màn 3 custom variant, Màn 6 custom labels and report button.
- Entry points without a library: home secondary button "Tạo chủ đề của bạn"; Buổi của tôi rows show the typed topic for `generating` / `failed_eval`.
- Custom sessions hit the session cost cap at the first turn (Màn 3), not at creation: `runTurn`'s claim step checks the cap when the next index is 1 and the topic is custom.
- Every operator command below reads learner data and writes `admin_access_log`.
- Operator CLI: `custom list`, `custom takedown <scenarioId> --reason` (owner's unfinished sessions → `withdrawn`), `custom refund <userId>`, `config set custom_path_enabled false`, `custom stats` (pass rate and cost per playable scenario over the last 30 requests, for the FR-56 switch decision).

## Related code files

- Create: `src/server/custom-topic.ts`, `src/server/custom-quota.ts`, `src/server/generation.ts`, `src/graphs/generation-graph.ts`, `src/llm/prompts/moderation.ts`, `scenario-generator.ts`, `output-safety.ts`, `src/eval/reduced-gate.ts`
- Create: `src/app/custom-topic/page.tsx`, `src/app/api/custom-topics/route.ts`, `src/app/api/custom-topics/[attemptId]/route.ts`, `src/app/api/sessions/[id]/report-problem/route.ts`, `src/components/custom/custom-topic-form.tsx`, `generating-screen.tsx`, `failed-eval-screen.tsx`, `cli/commands/custom.ts`
- Create tests: `tests/server/custom-quota.int.test.ts`, `custom-topic.int.test.ts`, `generation.int.test.ts`, `generation-fencing.int.test.ts`, `tests/graphs/focus-canary.test.ts`, `tests/eval/reduced-gate.test.ts`
- Create: `evalsets/moderation.jsonl`, `evalsets/output-safety.jsonl` (starter sets, every refusal group and constraint group represented), wired into `judgement-eval`
- Modify: `src/server/delete-account.ts` and its test (attempts, custom topic and scenario rows, tombstone counters), `tests/server/access-isolation.int.test.ts` (attempt status, custom prep, report routes), `src/server/turns.ts` and `src/server/cost-cap.ts` (first-turn cap)
- Modify: `src/db/schema.ts` (`generation_attempt`, session `focus`, `focus_raw`, `failure_reason`, `problem_report`; user counters), `src/app/sessions/[id]/page.tsx` (`generating`, `failed_eval`), `src/app/prep/[personaId]/page.tsx`, `src/components/reveal/*` (custom labels), `src/engine/reveal-compute.ts` (focus ordering), `src/server/session-list.ts`, `src/app/page.tsx`

## Implementation steps

0. **Go/no-go measurement first:** a throwaway script runs the reduced-eval shape (7 parallel episodes × 10 turns on chị Thu) inside a deployed Vercel function with the batch key and records wall time and 429 count. If it cannot finish in ~200 s, stop and bring the user the choice between fewer adversarial runs and Vercel Workflow before building the rest.
1. Schema, quota functions and their tests (4th attempt today, 7th lifetime failure, second concurrent attempt, over 20 % budget, refusal lock, system error not counted, free scenario spent only on pass; five parallel submits create one attempt; a swept attempt frees its reservation; counters survive delete and re-sign-in).
2. Moderation prompt and submit route; tests with a scripted model for refuse / allow-with-constraints / allow and out-of-set values.
3. Generator prompt with the rubric and focus distributions; validate-feedback loop.
4. Safety check; test with a scripted generator emitting a claim about a real organisation → `unsafe_output`.
5. Reduced gate and wiring to the phase 4 runner.
6. Fenced runner with steps, timer heartbeat, deadline and cost-meter abort, budget settlement; sweep. Fencing tests: a runner that finishes after its attempt was swept changes nothing; the reservation is settled exactly once.
7. Canary test: a unique string in the focus answer appears in no prompt, payload or trace input except those of the moderation call, across generation and a played session.
8. Screens Màn 10, 11, custom Màn 3 and Màn 6; report button.
9. Operator commands and the kill switch state on Màn 10.
10. Run 10 ordinary sample topics end to end; record pass rate, duration p95 and cost per playable scenario here.

## Todo

- [ ] Schema + quotas + tests
- [ ] Moderation + submit
- [ ] Generator + validate loop
- [ ] Safety check
- [ ] Reduced eval + gate
- [ ] Runner, timeout, budget
- [ ] Canary test
- [ ] Screens
- [ ] Operator CLI + kill switch
- [ ] 10-topic measurement
- [ ] Go/no-go measurement on Vercel
- [ ] Fencing, sweep and deletion extensions
- [ ] Moderation and output-safety starter sets

## Success criteria

- [ ] Every bullet of §12.2 item 14 passes (the ≥ 6/10 sample-topic bullet is a measured result, recorded above).
- [ ] No session row exists after a refused submit (test).
- [ ] Total reserved + actual never exceeds the generation budget under 5 concurrent submits (test).
- [ ] p95 generation time on the 10 samples ≤ 2 min, or the gap is reported with the slowest step named.

## Risk assessment

- **Fitting ~70 simulated turns plus generation into 270 s on Vercel Hobby is the tightest constraint in the plan.** 7 parallel runs × 10 turns × ~2.5 calls at ~2 s each ≈ 50–70 s if rate limits allow 7-way parallelism. If measured p95 exceeds ~200 s: cut adversarial runs to scripted-only openings, or move the pipeline to Vercel Workflow (already researched).
- **Rate limits** on a free Gemini key will likely break 7-way parallelism. A billing-enabled key is probably required for this phase even in dev.
- **Cost:** PRD estimates 2.5–4.5 USD per attempt at eval prices; with flash-tier models it should be far lower. Measured in step 10; reserve value set from that.
- **Zero-flag rule fails good scenarios when the leak judge is over-eager.** The PRD says fix the judge, not the quotas; `custom stats` exposes the rate.
- **Generated scenario quality is unread by any human** ("Kiểm tra nhẹ"); labels state this.

## Security considerations

- Topic text is attacker-controlled and flows into the generator: wrapped as data, generator output must pass schema, the imperative-sentence rule and the safety call before any learner sees it.
- Quota and budget checks run server-side in the same transaction that creates the attempt.
- Generated scenarios are visible only to their owner; the repo filter covers `topic.owner_user_id`.
