---
phase: 7
title: "Admin scenario review"
status: done
priority: P1
effort: "2.5d"
dependencies: [5, 6]
---

# Phase 7: Admin scenario review

## Overview
Review personas in the browser instead of the CLI. An admin lists topics and versions, starts a lean eval, reads the probe results, rules on leak flags, approves fixed strings, approves the version, and publishes or unpublishes. An admin can also draft a new persona for a topic with the existing scenario generator, which is much cheaper than writing one by hand.

## Requirements
- Functional, `/admin/scenarios`: a table of personas with topic, latest version, gate status (pass, or the reasons), last lean cost and published state.
- Functional, `/admin/scenarios/[personaId]`:
  - a version list and a JSON diff against the previous version;
  - the lean report: structural-check and public-review findings, then each probe with its question, the persona reply, the judged `disclosed_item_ids` and pass/fail. Each `leaked` id is a flag the admin rules on. The agent's risk map, its decision per round and its suggested fixes (field path + reason) are shown beside the probes;
  - actions: Run lean eval, Rule on flag (leak / not leak + reason), Approve strings, Approve version, Publish, Unpublish (with the option to stop sessions).
- Functional, `/admin/scenarios/new`: pick a topic and fill in the focus fields. This runs the existing `runGenerationGraph` (generate → validate → safety), saves the result as a draft version and opens it for review. It does not publish automatically.
- Non-functional: the actions are Server Actions. Each one re-checks `requireAdmin`, writes `admin_access_log` (channel `console`) and calls the same server functions as the CLI. There is no second implementation.
- Non-functional: the page shows locked item content, which is admin only and never goes into a client bundle for non-admins.

## Architecture
- `src/server/admin/scenarios.ts`: the list, the detail and the actions. These are thin wrappers over `src/db/repo/scenarios.ts`, `src/db/repo/eval.ts`, `src/eval/publish-gate.ts` and `src/server/eval-job.ts`.
- The lean job status is polled every 2 s from a small client component, the same pattern as `generating-screen.tsx`.
- Drafting reuses `src/graphs/generation-graph.ts` with `scope: 'generation'` and an admin attempt id. It is charged to the generation budget.

## Related Code Files
- Create: `src/app/admin/scenarios/page.tsx`, `src/app/admin/scenarios/[personaId]/page.tsx`, `src/app/admin/scenarios/new/page.tsx`, `src/server/admin/scenarios.ts`, `src/components/admin/probe-table.tsx`, `src/components/admin/version-diff.tsx`, `src/components/admin/eval-progress.tsx`, `tests/server/admin-scenarios.int.test.ts`, `tests/e2e/admin-review.spec.ts`
- Modify: `cli/commands/publish.ts`, `cli/commands/adjudicate.ts`, `cli/commands/strings.ts` (extract the shared logic into `src/server` where it now lives inside the CLI)

## Implementation Steps
1. Move publish, unpublish, adjudicate and approve-strings logic out of `cli/` into `src/server/admin/scenarios.ts` where needed. The CLI then calls it, and the CLI tests stay green.
2. Build the list page, then the detail page (read-only).
3. Add the actions with audit logging. Add an integration test per action, including a non-admin call that is refused.
4. Add the eval progress poller.
5. Add the draft-from-topic page.
6. E2E with the LLM stub: draft, then run lean, then approve, then publish.

## Implementation design (2026-10-15)
User: build all of it, but cheaply. Gemini credit is ~30k VND, so every check runs on the LLM stub or injected fakes, with 0 paid calls.
- **Shared logic, no auth:** `src/server/scenario-review.ts` takes over from `cli/` the string targets, `checkPublishGate`, publish-newest, approve-newest, check-strings and approve-strings. The CLI turns its typed refusals into `CliError` text, so CLI output does not change.
- **Admin services:** `src/server/admin/scenarios.ts`. Every function calls `assertAdmin`, and every mutation writes one `admin_access_log` row (`console`). A flag ruling must belong to the persona's newest lean run.
- **Server Actions:** `src/app/admin/scenarios/actions.ts` (`"use server"`, `await requireAdmin()` in each). One client `ActionForm` (`useActionState`) shows the returned message.
- **Eval progress:** `EvalProgress` calls `router.refresh()` every 2 s while the run is queued or running. When the run is due, the detail page restarts `runEvalJob` in `after()`, the same pattern as `runGeneration`. No new API.
- **Draft, kept cheap:** an admin attempt in `generation_attempt` (new nullable `persona_id`, which marks an admin draft; no session). It takes the same budget lock, sweep and reservation as a learner attempt. No moderation call, because the input comes from an admin. The generator and the output safety check run as for a learner. `finishAttempt` stores a pass as a new `draft` version (`origin: authored`) and leaves learner counters alone. Per-learner quota counts ignore admin drafts.
- **E2E stub:** the stub learns the QA planner, reflect, reply judge and string-check calls, so a lean run and a string check work in the browser for free. The e2e env sets `LLM_QA_PLANNER`, `LLM_STRING_CHECK` and `LLM_EVAL_LEAK_JUDGE` to the stub.
- **Not in scope (YAGNI):** returning a string from the browser stays CLI-only (`approve-strings return`).

## Success Criteria
- [x] The whole review flow works in the browser with no CLI step: drafting, the lean eval, rulings, string check and approval, version approval, publish and unpublish (`tests/e2e/admin-review.spec.ts`, on the LLM stub).
- [x] Every action writes one `admin_access_log` row (`console`). The exception is a request too malformed to name what it acts on (`tests/server/admin-scenarios.int.test.ts`).
- [x] The CLI and the console give the same gate result for the same version. Both call `src/server/scenario-review.ts`, and the int test compares them.

## Result (2026-10-15)
Done with 0 paid LLM calls. Everything ran on the e2e stub, which now answers the QA planner, reflect, reply judge and string-check calls, or on injected fakes.

Changes after code review ([report](../reports/code-reviewer-261015-1612-phase-7-admin-scenario-review.md)):
- The console reaches curated personas only. A learner's custom persona is 404 in every service, so admins cannot read or withdraw it without the learner-scoped custom tools.
- The draft persona id is checked again under the budget lock, against existing personas and running drafts. If an import takes the id while the draft is being generated, the draft ends as `system_error` (`persona_taken`) and never becomes a version of that persona. Ids starting with `custom-` are refused.
- Admin drafts are left out of learner metrics: the overview's custom attempts, `il custom list` and `il custom stats`.
- `maxDuration = 300` is set on the two pages that start runners. `docs/setup.md` now says the console needs `LLM_QA_PLANNER`, `LLM_EVAL_LEAK_JUDGE` and `LLM_STRING_CHECK` in production.

Dropped (user, 2026-10-15): the agent's rationale per round. The page shows each round's decision and probe count, which is what the lean report stores.
Known trade-off: while an admin's draft runs, the same account cannot start a learner custom topic (one running attempt per user).
Pre-existing flake (not caused by this phase): `canvas.int.test.ts` "waits out the grace period" waits about 5 s against a 5 s timeout. It fails under load and passes when run alone.

## Risk Assessment
- Server Actions that are callable by id need an auth check inside each action, not only in the layout. Mitigation: a non-admin test for each action.
- Drafting with the generator can fill the daily generation budget. Mitigation: it uses the same reservation path as learner attempts.
