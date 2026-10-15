# Code review: phase 7, admin scenario review (uncommitted, feat/lean-eval-admin)

Scope: every file in the task list plus their callers (generation runner, custom quota, account deletion, cost report, `il custom`). `pnpm typecheck` and `pnpm lint` both pass with no output. No e2e, int or LLM run was made.

## Verdict
Nothing is blocking. Every Server Action calls `requireAdmin()` first, and every service calls `assertAdmin` again. Each mutation writes its `console` log row. The CLI now delegates to `src/server/scenario-review.ts`, and its output text is byte-identical to before; I checked every message against `HEAD`. The quota and sweep changes are correct for learners. The findings below are the real gaps, ranked.

## High

**H1. Detail page and actions reach learner custom personas.** File: `src/server/admin/scenarios.ts:109,144,166,201,208,223`.
- `listCuratedPersonas` filters to curated topics. `getScenarioReview`, `requestLeanEval`, `ruleOnFlag`, `approveVersionFor`, `publishFor` and `unpublishFor` all resolve the persona through `getScenarioByPersona`, which has no owner filter.
- Failure: an admin opens `/admin/scenarios/custom-<attemptId>`. The page renders a learner's private generated scenario, including the locked items built from the learner's own topic text. No `admin_access_log` row is written for this read, and no `userId` is recorded.
- The admin can also press "Gỡ publish" with stop-sessions on. `unpublishPersona` then withdraws the learner's live custom session. This bypasses `takeDownCustomScenario`, which sets `taken_down`, logs with `userId` and runs in the same transaction as its log.
- The CLI could already do this, but the console makes it one click.
- Fix: use a curated-only lookup (join `topics.ownerUserId IS NULL`) in every service here, and return `not_found` for a custom persona.

**H2. An admin draft can silently become a new version of an existing persona, or fail in a loop.** Files: `src/server/admin/scenarios.ts:261`, `src/db/repo/custom-topics.ts:404-411`.
- The `persona_exists` check runs before the transaction. It does not see another running draft with the same `persona_id`, or a persona imported while the draft is generating.
- Scenario A: admins A and B both draft `anh-minh` on the same topic. Both drafts pass. B's draft becomes version 2 of A's persona, and it is now the "newest" version that the gate, the page and publish all act on.
- Scenario B: the persona was imported under a different topic in the meantime. `insertNextVersion` throws `ScenarioImportError` inside `finishAttempt`, the transaction rolls back, and the attempt stays `running` with a stale token. Polling marks it due, `runGeneration` re-claims it, and the safety step is paid again. This repeats until `GENERATION_MAX_RUNS` or the deadline, and the attempt is finally swept as `system_error` with no useful reason.
- Fix:
  - Re-check inside the budget lock: no scenario row and no running attempt with this `persona_id`.
  - In `closeAdminDraft`, close the attempt as `failed`/`system_error` when the persona now exists, instead of inserting or throwing.
  - Optionally add a partial unique index on `generation_attempt(persona_id) WHERE outcome = 'running'`.

## Medium

**M1. Production env for web eval and string checks is undocumented.** Files: `docs/setup.md:90`, `src/llm/roles.ts:26-31`.
- Both still say that `LLM_EVAL_*`, `LLM_STRING_CHECK` (and, by implication, `LLM_QA_PLANNER`) are read only by the CLI and "may be left out".
- The console now runs the lean eval (`QA_PLANNER` plus `EVAL_LEAK_JUDGE`) and FR-36 (`STRING_CHECK`) on the deployed app.
- Failure when they are missing:
  - "Kiểm chuỗi" throws inside the action. The admin gets the generic error boundary, and the log row is already written.
  - Every lean run ends `failed` with reason `model`.
- Update both texts. The e2e env adding these vars only proves the stub path.

**M2. Admin pages that host runners do not export `maxDuration`.** Files: `src/app/admin/scenarios/[personaId]/page.tsx`, `src/app/admin/scenarios/new/page.tsx`.
- Every learner route that runs `runGeneration` or `after(...)` exports `maxDuration = 300`, and `GENERATION_RUN_LIMIT_MS = 270_000` assumes it.
- These pages, and the Server Actions they host, run `after(runEvalJob)`, `after(runGeneration)`, and `checkStrings` synchronously (one LLM call per unchecked string, which is about all product strings on a fresh database).
- If the platform default is lower, runs get killed mid-way. They are resumable, but each kill wastes a run attempt.
- Fix: add `export const maxDuration = 300;` to both pages, matching the existing pattern.

**M3. Admin drafts leak into learner custom-path metrics.**
- `src/db/repo/cost-report.ts:171`: `customAttempts` on the admin overview counts admin drafts.
- `cli/commands/custom.ts:75` (`il custom stats`) and `listAttempts` (`il custom list`): admin drafts are counted in the FR-56 pass/fail/system-error rates.
- Add `persona_id IS NULL` to these, as was done in `countAttemptsToday` and `accountCommittedToday`.

**M4. "Rationale per round" from the plan is not shown.** File: `src/components/admin/lean-report.tsx:134`.
- `QaReport.rounds` stores only `{decision, actions}`, so the page shows "dừng / thử thêm (+n)" and no reasoning.
- The risk map, findings (field path + reason) and public leaks are shown.
- Either accept this as a documented gap or store the reflect rationale in the report. Storing it is a schema change to `QaReport`, so get the user's decision first.

## Low

- **L1.** `getAdminDraft` (`src/server/admin/scenarios.ts:292`) sweeps only the viewing admin's attempts. Admin B following admin A's expired draft polls "running" every 2 s until something else sweeps it. Sweep the attempt's owner instead: read the attempt, then call `sweepStaleAttempts(db, attempt.userId)`.
- **L2.** The draft persona-id regex accepts `custom-<uuid>`. A draft with the id of a learner attempt in flight makes that attempt's `finishAttempt` insert hit the `(persona_id, version)` unique key and roll back. Admin-only and unlikely; reject the `custom-` prefix in `draftInputSchema`.
- **L3.** While an admin's draft runs, the admin's own learner custom path shows block `running` with no session link (`custom-topic-form.tsx:152` hides it when `runningSessionId` is null). The reverse also holds: the draft refusal message says so. This is an acceptable trade-off, but the learner-facing text does not explain it.
- **L4.** `[personaId]/page.tsx:79` calls `decodeURIComponent` on `params`. No other page does this. A `%` in a path makes it throw a `URIError`, which is a 500 for an admin only, since non-admins get the 404 first. Persona ids are kebab-case, so this is harmless today; drop it for consistency.
- **L5.** `listScenarioReviews` runs a full `checkPublishGate` per persona: about 9 queries each, product strings reloaded every time, and `getScenarioByPersona` twice. With `max: 1` this is all serial. Fine at the current persona count; hoist the product string states if the list grows.
- **L6.** The e2e covers the ruling with `name="verdict"` submitter buttons, and it passes. React 19 builds the `FormData` with the submitter for `useActionState` form actions, and native posting before hydration also includes it. However, the e2e seeds FR-36 through the CLI (`runCheckStrings`), so the browser "Kiểm … chuỗi chưa kiểm" button is never clicked in e2e. That is a test gap only.
- **L7.** `insertScenarioVersion` now takes the advisory lock after `upsertTopic` (it used to come before). I see no deadlock: the topic upsert takes a NO KEY UPDATE lock, and the scenario FK insert takes KEY SHARE. Noted only because the order changed.

## Checks requested
- **(a) Criteria.**
  - Met: list, detail with diff, lean report with probes, risk map and findings, flag ruling, string check and approval, version approval, publish, unpublish with stop-sessions, lean eval with 2 s `router.refresh()`, generator draft saved as `draft` and never published, `requireAdmin` in each action plus `assertAdmin` in each service, one console log row per mutation, CLI and console calling the same `checkPublishGate`/`publishNewest`, 404 for non-admins, draft under budget lock, sweep and reservation.
  - Partial: per-round rationale (M4).
  - Not quite: "same server functions for every persona" also exposes custom personas (H1).
- **(b) Regressions.**
  - `finishAttempt`: the learner path is unchanged. The `sessionId === null` guard is moved after the admin branch, and `closeAttemptRow` is the same update as before.
  - Refusals have `outcome = 'refused'` and a null `persona_id`, so they are still counted.
  - The sweep's session update is a no-op for drafts.
  - `insertScenarioVersion` callers (`import-scenario`) behave the same.
  - CLI messages are identical.
  - Metrics are skewed (M3).
- **(c) Contract changes.**
  - New nullable column `generation_attempt.persona_id`: additive, no index needed for the current `IS NULL` filters.
  - CLI is unchanged.
  - The env doc is now wrong (M1).
- **(d) Patterns.** The code follows local patterns (`after()` resume, typed refusals, `assertAdmin`), except for `maxDuration` (M2) and the stray `decodeURIComponent` (L4).
- **(e) Security.**
  - Actions are POST-reachable but each one checks the admin first. `notFound()` in Server Functions is supported (Next docs, `not-found.md`), and `after()` still runs after `redirect` (`after.md`).
  - No `dangerouslySetInnerHTML`, and every value renders as React text.
  - The redirect target is a server-generated uuid. `revalidatePath` takes a client value, but only under `/admin/scenarios/`, and only for admins.
  - Locked content is rendered only after `requireAdmin`, with no client-component prop that carries content.
  - Non-admin reach: none found. The open issue is admin reach into learner data (H1).

Status: DONE_WITH_CONCERNS
Summary: Phase 7 meets its acceptance criteria apart from per-round rationale. Typecheck and lint are clean, and the CLI output is unchanged. The admin services still accept learner custom personas, and drafting has an unguarded persona-id race that can produce a version on the wrong persona or a paid retry loop.
Concerns/Blockers: H1 (custom personas reachable and unpublishable from the console without a learner-scoped log), H2 (draft persona-id race and the `ScenarioImportError` retry loop), M1 (production env docs), M2 (`maxDuration`), M3 (metrics include admin drafts), M4 (round rationale is a product decision).
