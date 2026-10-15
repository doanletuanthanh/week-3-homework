---
phase: 6
title: "Admin shell and cost dashboard"
status: done
priority: P2
effort: "2d"
dependencies: [1]
---

# Phase 6: Admin shell and cost dashboard

## Overview
A `/admin` area in the existing Next.js app, open only to `ADMIN_EMAILS`. Its first page shows LLM spend and usage, read from the phase 1 cost queries.

## Implementation plan (2026-10-15, after scout)
Read-only: no LLM call, so 0 Gemini spend (the key has ≈ 30,000 VND left).
- Next 16 (docs read): a layout renders in parallel with its page, so the layout's check does not guard the page's data. Every admin page calls `requireAdmin()` itself, and the data service takes the user and checks `isAdmin` again (the `access-isolation` pattern). `notFound()` gives a 404 status only before streaming starts, so admin pages use no `Suspense`.
- The nav is a data table (`ADMIN_NAV`) with Overview only. Phases 7–8 add a row when their page exists, so no link leads to a 404.
- New repo query `usageCounts` (sessions started, active learners, custom attempts) in `cost-report.ts`. Cache-hit and failed-call shares and the top roles come from `spendByRole`. Caps: `session_daily_cap_usd`, `generation_daily_budget_usd`, `eval_daily_budget_usd`. Moderation has no cap of its own.
- Charts: one stacked bar per day by scope (30 days), and a meter per scope of today's spend against its cap. Inline SVG and CSS only.
- A unit test walks `src/app/admin/**/page.tsx` and fails if a page does not call `requireAdmin`.

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
- [x] A non-admin gets 404 on every `/admin/*` route (integration and e2e). Guests, learners and demo accounts get the same 404 as a URL that does not exist: status, title and body (`tests/e2e/admin.spec.ts`). A unit test makes every admin page, route and server-function module call `requireAdmin()`, and every `src/server/admin` service call `assertAdmin`.
- [x] The overview numbers match `pnpm il cost-report` for the same DB (`tests/server/admin-access.int.test.ts`, and the e2e reads today's total through the same query).
- [x] The page renders correctly at phone width (e2e at 375 px, no horizontal scroll; screenshots checked).

## Result (2026-10-15)
Done with 0 LLM calls. Changes made after code review:
- "Active learners" counts learners whose sessions made a model call. A session's `updated_at` also changes on system writes (sweeps, unpublish).
- Demo accounts are left out of both usage counts.
- The 30-day total is summed from the query rows, so it still matches the cost report around midnight.
- The chart's figures are in a visually hidden table for screen readers.
- The meters clamp `aria-valuenow` and treat a cap of 0 that has spend as over the cap.

Side effect, intended: a new root `src/app/not-found.tsx` (Vietnamese) now serves every unmatched URL, and the admin area has no `metadata` title. Without this, a `notFound()` thrown under `/admin` had a different `<title>` from an unknown URL, which showed that the route exists.

## Risk Assessment
- Aggregates over `llm_call` slow down as the table grows. Mitigation: the existing `(scope, created_at)` index. Add a `(created_at)` index only if a measured query takes > 300 ms.
