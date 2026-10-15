---
phase: 8
title: "Admin learners, config, custom topics, audit"
status: done
priority: P2
effort: "1.5d"
dependencies: [6]
---

# Phase 8: Admin learners, config, custom topics, audit

## Overview
The remaining admin views: learners and their sessions, the config editor, custom-topic attempts and the audit log.

## Requirements
- `/admin/learners`: a list with email, first and last seen, session count, custom attempts and spend. The detail page lists sessions with status and cost and links to a transcript view. Opening a transcript writes `admin_access_log` (action `read_transcript`), as `pnpm il trace` does.
- `/admin/config`: every key from the `config` table with its current value, default and meaning (the table in `docs/operations.md`). Values are edited with type validation, and each change is logged with the old and new value.
- `/admin/custom-topics`: attempts with outcome, failure code, cost, runs and duration, filtered by outcome. The topic text is shown only on the detail page, and that read is logged.
- `/admin/audit`: `admin_access_log`, newest first, filtered by admin and action.
- Non-functional: the lists are paginated server-side (50 rows). There is no bulk export in v1.

## Related Code Files
- Create: `src/app/admin/learners/page.tsx`, `src/app/admin/learners/[userId]/page.tsx`, `src/app/admin/sessions/[id]/page.tsx`, `src/app/admin/config/page.tsx`, `src/app/admin/custom-topics/page.tsx`, `src/app/admin/audit/page.tsx`, `src/server/admin/learners.ts`, `src/server/admin/config.ts`, `tests/server/admin-learners.int.test.ts`
- Modify: `src/db/repo/config.ts` (shared validation with `cli/commands/config.ts`), `src/db/repo/users.ts`, `src/db/repo/sessions.ts` (admin list queries)
- Reuse: the trace rendering logic from `cli/commands/trace.ts`, moved to `src/server/admin/trace.ts`

## Implementation Steps
1. Extract the config key schema, used by both the CLI and the console.
2. Build the list queries with pagination, then the pages.
3. Log each learner-data read. Test that each detail view writes a row.
4. Write the e2e smoke test: the admin opens each page. A learner gets 404.

## Success Criteria
- [x] Every page that reads learner content writes `admin_access_log`.
- [x] A config change takes effect on the next request. The existing `tests/server/cost-cap.int.test.ts` still passes.
- [x] Deleted accounts (`delete-account.ts`) disappear from the lists, and their spend stays in the totals through `daily_spend`.

## Result (2026-10-15)
Done with 0 LLM calls (nothing in this phase calls a model).
- **Reads logged** (`console`): `list_learners`, `read_learner`, `read_transcript`, `list_custom_topics [outcome]`, `read_custom_topic`, before anything is returned. Config and audit reads hold no learner data and are not logged. Links to logged pages use `prefetch={false}`, so a log row always means a real visit.
- **Config:** `parseConfigInput` and `changeConfig` in `src/db/repo/config.ts` are shared by `il config set` and the console. A change is logged in the same transaction, as `config set <key>: <old> → <new>` (the existing free-text `action` convention, so no migration), under a per-key advisory lock. The CLI now logs its changes too (channel `cli`).
- **Trace:** the shared description lives in `src/server/session-trace.ts`, not `src/server/admin/trace.ts`: the guard test requires every file in `src/server/admin` to check the admin, and the CLI has no admin user. `il trace` output is unchanged.
- **Lists:** 50 rows, server-side, `?page=`. Repeated query keys use their first value. Admin drafts are left out of learner lists and spend. The audit filter is by admin and by how the action starts (`starts_with`, so `%` is literal).
- Tests: `tests/server/admin-learners.int.test.ts`, `tests/e2e/admin-learners.spec.ts`, plus a log assertion in `tests/cli/config-and-trace.int.test.ts`. Review: [report](../reports/code-reviewer-261015-1721-phase-8-admin-learners-config-audit.md).

Deferred: `llm_call` has no index on `session_id` or `attempt_id`, so the learner list and session cost scan the table. Fine at pilot scale. It needs a migration, which phase 10 or a later plan can add when the table grows.

## Risk Assessment
- Privacy: transcripts are learner data. Mitigation: admin only, every read logged, no bulk export. The data notice already names admin access. Check its wording.
