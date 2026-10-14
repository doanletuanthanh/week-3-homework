---
phase: 8
title: "Admin learners, config, custom topics, audit"
status: pending
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
- [ ] Every page that reads learner content writes `admin_access_log`.
- [ ] A config change takes effect on the next request. The existing `tests/server/cost-cap.int.test.ts` still passes.
- [ ] Deleted accounts (`delete-account.ts`) disappear from the lists, and their spend stays in the totals through `daily_spend`.

## Risk Assessment
- Privacy: transcripts are learner data. Mitigation: admin only, every read logged, no bulk export. The data notice already names admin access. Check its wording.
