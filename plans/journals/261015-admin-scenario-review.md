# Admin scenario review: the console nearly reached learners' personas

**Date**: 2026-10-15
**Severity**: Medium
**Component**: `/admin/scenarios` (`src/app/admin/scenarios/`, `src/server/admin/scenarios.ts`, `src/server/scenario-review.ts`), `generation_attempt.persona_id`
**Status**: Done (phase 7)

Work history only. Current state lives in the phase 7 file and the code.

## What Happened

Personas are now reviewed in the browser instead of the CLI. From `/admin/scenarios` an admin can:
- list curated personas with their gate result and newest lean run;
- open a persona's review: version diff, lean report and probes, flags, strings, and locked items;
- run a lean eval;
- rule on flags, check and approve strings, approve the version;
- publish and unpublish;
- draft a new persona with the scenario generator.

The Gemini key has about 30,000 VND left, so nothing called a paid model. The e2e LLM stub now answers the QA planner, reflect, reply-judge and string-check calls. A whole draft → lean eval → publish flow runs in the browser for free.

## Decisions and Mistakes

- **Rationale per round dropped** (user). The lean report stores only each round's decision and probe count, and the page shows those. Showing the rationale would have meant changing the QA report format and its cache key.

- **One implementation.** The gate, publish, approve and string logic moved from `cli/commands/*` to `src/server/scenario-review.ts`, which has no auth checks. The CLI turns its typed refusals into the same messages as before. The admin services wrap it with `assertAdmin` and one `console` access-log row per action.
- **Drafts reuse the generation job.** An admin draft is a `generation_attempt` with `persona_id` set and no session. It shares the budget lock, the reservation, the sweep and the runner with learner attempts. Moderation is skipped, because an admin wrote the input, which saves one call. A pass becomes a `draft` version and is never published. Per-learner quota counts, learner metrics and `il custom` leave admin drafts out.
- **The services took any persona id** (code review, High). Only the list filtered to curated topics. `/admin/scenarios/custom-<id>` would show a learner's private scenario, locked items included, and unpublish with stop-sessions would withdraw their live session, with no learner-scoped log. Every service now answers 404 for a persona whose topic has an owner.
- **Draft id race** (code review, High). The "id is free" check ran before the budget lock. Two admins could each claim the same id, and the second draft became version 2 of the first admin's persona. An import landing mid-draft made `finishAttempt` throw, so the attempt was paid for again and then swept. Now the id is checked again under the lock against running drafts too. A taken id ends the draft as `system_error` (`persona_taken`).
- **No new API for progress.** A client component calls `router.refresh()` every 2 s. The page restarts a due runner in `after()`, as the learner pages do.

## Verification

- typecheck: clean
- lint: clean
- unit tests: 1150 pass
- int tests: `admin-scenarios` (24) and the touched suites pass. Under load, the full run also hit 5 s timeouts in timing tests, and those pass when rerun alone. `canvas` "grace period" is a pre-existing flake: about 5 s of real waiting against a 5 s timeout.
- e2e: the full suite passes (322), including `admin-review.spec.ts` (3).
- 0 paid LLM calls.

## Open

- Production needs `LLM_QA_PLANNER`, `LLM_EVAL_LEAK_JUDGE` and `LLM_STRING_CHECK` for the console's eval and string-check buttons (`docs/setup.md`).
- A web lean run calls models directly, at about 0.09 USD. The CLI's batch mode costs about 0.04 USD, so prefer it while credit is low.
