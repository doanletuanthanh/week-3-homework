---
phase: 7
title: "Admin scenario review"
status: pending
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
  - the lean report: structural-check and public-review findings, then each probe with its question, the persona reply, the judged `disclosed_item_ids` and pass/fail. Each `leaked` id is a flag the admin rules on. The agent's risk map, its rationale per round and its suggested fixes (field path + reason) are shown beside the probes;
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

## Success Criteria
- [ ] The whole review flow works in the browser with no CLI step.
- [ ] Every action writes one `admin_access_log` row.
- [ ] The CLI and the console give the same gate result for the same version.

## Risk Assessment
- Server Actions that are callable by id need an auth check inside each action, not only in the layout. Mitigation: a non-admin test for each action.
- Drafting with the generator can fill the daily generation budget. Mitigation: it uses the same reservation path as learner attempts.
