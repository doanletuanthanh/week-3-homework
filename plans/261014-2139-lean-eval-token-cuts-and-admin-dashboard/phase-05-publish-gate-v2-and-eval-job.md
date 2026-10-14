---
phase: 5
title: "Publish gate v2 and eval job"
status: pending
priority: P1
effort: "2d"
dependencies: [4]
---

# Phase 5: Publish gate v2 and eval job

## Overview
The publish gate reads the lean report instead of a full run, and one admin approval replaces the two-admin adjudication. A lean eval can run as a background job from the web, because ~50 agent-driven calls fit the existing `after()` + job row + heartbeat pattern.

## Requirements
- Functional: the gate passes when validate is clean, the newest `lean` run of this exact version is `done` with every threshold met, every fixed string is approved, and one admin approved the version.
- Functional: one admin ruling settles a leak flag. A `leak` ruling blocks publishing. The flag history keeps who ruled and why.
- Functional: `startLeanEval(versionId, adminEmail)` creates an `eval_run` with status `queued` and runs it via `after()` with claim, heartbeat and stale takeover. The pattern is copied from `src/server/generation.ts`, and shared code is extracted when it is the same.
- Non-functional: one lean run per version at a time. The daily eval budget is the config key `eval_daily_budget_usd` (default 5).

## Architecture
- Rewrite `evaluateGate` in `src/eval/publish-gate.ts` as a rule table instead of the current `if/else if` chain: `GATE_RULES: { key, reasons(input) → string[] }[]` (validate, lean run present, lean run done, thresholds met, no confirmed leak, strings checked, strings approved, version approved). `evaluateGate = rules.flatMap(r => r.reasons(input))`. Each rule is a small pure function, tested on its own. `flagStatus` becomes one ruling, the latest by time. Add `approval: { adminEmail, at, evalRunId } | null`.
- New table `version_approval` (scenario_id, version, admin_email, note, at). A new eval run of the same version clears approval: the approval is tied to `eval_run_id`.
- `src/server/eval-job.ts`: claim, run `runLean`, finish. It is resumable through the probe cache: a takeover reruns only the probes that were not cached.
- The existing `full`/`quick`/`reduced` rows stay readable for history. The gate ignores them.

## Related Code Files
- Modify: `src/eval/publish-gate.ts`, `tests/eval/publish-gate.test.ts`, `src/db/repo/eval.ts`, `src/db/schema.ts` + migration, `cli/commands/publish.ts`, `cli/commands/adjudicate.ts` (single ruling), `tests/cli/publish-flow.int.test.ts`
- Create: `src/server/eval-job.ts`, `tests/server/eval-job.int.test.ts`, `cli/commands/approve.ts` (`pnpm il approve <persona> "<note>"`)

## Implementation Steps
1. Write the gate tests first: a lean pass, a lean fail, a missing approval, an approval invalidated by a new run, a single leak ruling.
2. Change `evaluateGate` and `flagStatus`. Add the migration for `version_approval`.
3. Extract the shared job-runner bits (claim/heartbeat/stale) from `generation.ts` only if they come out identical. Otherwise, copy and keep it small.
4. Write `eval-job.ts` with fencing tests, modelled on `tests/server/generation-fencing.int.test.ts`.
5. Update the CLI commands, then the publish-flow integration test.

## Success Criteria
- [ ] Gate unit tests cover every reason string.
- [ ] A lean job survives a killed runner (the stale takeover finishes it) without paying for cached probes again.
- [ ] `pnpm il publish` works end to end on a local stack with the scripted model.

## Risk Assessment
- Changing the gate rules is a deliberate product change (user decision 2026-10-14). The old `full` evidence is no longer required, and the docs must say so (phase 10).
- `after()` on Vercel Hobby is limited to 300 s per function. Mitigation: GENERATION-style runs of ≤ 270 s with resume. Lean at concurrency 4 should finish in < 120 s. Measure it.
