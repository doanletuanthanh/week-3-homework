# Admin shell and cost dashboard: a 404 that gave the area away

**Date**: 2026-10-15
**Severity**: Low
**Component**: `/admin` (`src/app/admin/`, `src/server/admin/overview.ts`, `src/components/admin/`), `src/app/not-found.tsx`
**Status**: Done (phase 6)

Work history only. Current state lives in the phase 6 file and the code.

## What Happened

Built `/admin`, open only to `ADMIN_EMAILS`. The overview shows:
- today's spend per scope against its cap;
- 30 days of spend as SVG bars stacked by scope;
- the most expensive roles;
- session cost (p50 and p95);
- cache-hit and failed-call shares;
- usage counts.

Every figure comes from the `cost-report` queries, plus one new `usageCounts`. No LLM call: the Gemini key has about 30,000 VND left.

## Decisions and Mistakes

- **Every page checks for itself.** The Next 16 docs say a layout renders in parallel with its page, so the layout's check does not guard the page's data. Each page calls `requireAdmin()`, and the service checks `assertAdmin` again. A unit test enforces this for pages, routes, `use server` modules and `src/server/admin` services.
- **No `Suspense` in the area.** `notFound()` returns a real 404 status only while nothing has streamed.
- **The 404 still showed the route exists.** Code review asked whether the admin title could leak into the 404. The new e2e test showed a different leak: a `notFound()` thrown under `/admin` had the title "404: This page could not be found.", while an unknown URL kept the root title. Fix: a root `src/app/not-found.tsx` and no admin `metadata`. The full e2e suite (319) passes with the new root 404.
- **Two numbers were misleading** (code review):
  - "active learners" counted session `updated_at`, which sweeps and unpublish also change. It now counts sessions that made model calls.
  - demo accounts were filtered differently in the two usage counts.
- **An invisible table that overflowed.** The visually hidden data table, added for screen readers, made the phone layout 226 px too wide: a table cannot be narrower than its content. The 1 px box is now a `div` around the table.
- **Nav.** It lists only Overview. Phases 7 and 8 add a row each when their page exists.

## Verification

- typecheck: clean
- lint: clean
- unit tests: 1143 pass
- int tests: 628 pass
- e2e tests: 319 pass, including `admin.spec.ts` (3)

## Open

- `session.started_at` and `llm_call.session_id` have no index for the new counts. Measure the query first; add an index only if it takes more than 300 ms.
- Phase 8's server actions must call `requireAdmin()`. The guard test fails if they don't.
