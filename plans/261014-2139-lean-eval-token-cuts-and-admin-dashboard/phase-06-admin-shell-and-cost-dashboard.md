---
phase: 6
title: "Admin shell and cost dashboard"
status: pending
priority: P2
effort: "2d"
dependencies: [1]
---

# Phase 6: Admin shell and cost dashboard

## Overview
A `/admin` area in the existing Next.js app, open only to `ADMIN_EMAILS`. Its first page shows LLM spend and usage, read from the phase 1 cost queries.

## Requirements
- Functional: `/admin` shows today's and the last 30 days' spend by scope (session, generation, eval, moderation), against the caps from `config`. It also shows the top roles by cost, cost per session (p50/p95), cache-hit share, failed-call share, and counts of sessions, active learners and custom attempts.
- Functional: the admin nav reaches Overview, Scenarios (phase 7), Learners, Config, Custom topics and Audit (phase 8).
- Non-functional: server components only, with data read on the server. No new client data API for these read views. Every route checks `isAdmin` on the server, and anyone else gets 404, not 403 (do not reveal that the area exists). Follow the AGENTS.md rule: read `node_modules/next/dist/docs/` for the layouts, route groups and `proxy.ts` before writing routes.
- Non-functional: the design reuses `docs/design/theme.css` classes and `DESIGN.md`. Charts are plain inline SVG (a bar per day and a stacked bar by scope). No chart library (YAGNI).

## Architecture
- `src/app/admin/layout.tsx`: `requireAdmin()` (new helper in `src/server/auth.ts`, which calls `notFound()` for non-admins), plus the nav.
- `src/app/admin/page.tsx`: the overview. It calls `src/server/admin/overview.ts`, which wraps `src/db/repo/cost-report.ts`.
- `src/components/admin/spend-chart.tsx`, `stat-tile.tsx`.
- The CSP in `src/proxy.ts` needs no change: everything is same-origin and server-rendered.

## Related Code Files
- Create: `src/app/admin/layout.tsx`, `src/app/admin/page.tsx`, `src/server/admin/overview.ts`, `src/components/admin/*`, `tests/server/admin-access.int.test.ts`, `tests/e2e/admin.spec.ts`
- Modify: `src/server/auth.ts` (`requireAdmin`), `src/components/header-menu.tsx` (an "Quản trị" link for admins only)

## Implementation Steps
1. Read the Next 16 docs in `node_modules/next/dist/docs/` on layouts, `notFound` and dynamic rendering.
2. Add `requireAdmin` and the access tests: a guest, a learner, a demo account and an admin.
3. Build the layout and nav, then the overview with stat tiles and the two SVG charts.
4. E2E: an admin sees the numbers seeded in the test DB. A learner gets 404 on `/admin` and on every sub-route.

## Success Criteria
- [ ] A non-admin gets 404 on every `/admin/*` route (integration and e2e).
- [ ] The overview numbers match `pnpm il cost-report` for the same DB.
- [ ] The page renders correctly at phone width (responsive spec).

## Risk Assessment
- Aggregates over `llm_call` slow down as the table grows. Mitigation: the existing `(scope, created_at)` index. Add a `(created_at)` index only if a measured query takes > 300 ms.
