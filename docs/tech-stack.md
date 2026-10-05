# InterviewLab tech stack

Approved 2026-10-03. Product requirements: `_bmad-output/planning-artifacts/prds/prd-week-3-project-2026-09-24/prd.md` and `addendum.md`. Evidence for versions and limits: `plans/reports/researcher-261003-1707-*.md` (versions were read from npm on 2026-10-03; model IDs and prices are medium confidence and must be re-checked in the vendor consoles before they are hardcoded).

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Web | Next.js 16 (App Router), React 19, TypeScript | `proxy.ts` replaces `middleware`; request APIs are async; Cache Components stay off |
| Styling | Component classes ported from `docs/design/theme.css` | Responsive rules added in the app, following the mobile artboards |
| Hosting | Vercel Hobby | Functions capped at 300 s (Fluid Compute); non-commercial use only |
| Database | Supabase Postgres (free) | Drizzle ORM 0.45.x + postgres-js, server-only. Transaction pooler (port 6543, `prepare: false`, pool max 1) on Vercel; session pooler for the local CLI |
| Authorization | `user_id` filter in one repository layer | RLS enabled on every table with no policies, anon/authenticated grants revoked, so the publishable key reads nothing |
| Auth | Supabase Auth, Google OAuth, `@supabase/ssr` | Verify with `getClaims()` in every handler; admin and demo accounts come from `ADMIN_EMAILS` and `DEMO_ACCOUNT_EMAILS` |
| Agent engine | LangGraph JS 1.x, no checkpointer | State lives in `turn` / `snapshot`; one DB transaction per turn after the graph returns |
| Models | Gemini for analysis, persona, generators, moderation; OpenAI for judges and verifier | One env var per call role; different families for writer and checker on purpose |
| Tracing | LangSmith | Full prompts and replies, plus metadata: session, turn, call role. Flush before the function ends. Off for full and reduced eval runs (free plan: 5k traces/month, 14-day retention) |
| Background work | `after()` + job row + heartbeat, `maxDuration = 300` | Reveal and custom-scenario generation. Poll endpoint marks stale jobs failed; no cron |
| Full evaluation | Local CLI sharing the engine code and database | Never runs in a web request |
| Tests | Vitest for engine logic; Postgres in Docker for DB tests | |

## Deviations from the PRD

- **Custom-scenario hard timeout is ~270 s, not 10 minutes** (Vercel Hobby cap). The p95 ≤ 2 minute target is unchanged. Moving to Vercel Workflow restores 10 minutes if measured p95 exceeds ~200 s.
- **No separate worker process.** Turns and reveal run in request/`after()`, full eval on the developer's machine. Priority of live turns over batch work (FR-37) is kept by an optional separate API key for generation and eval roles.
- **Unpublished personas are playable by every learner** until the `require_published` config row is turned on; the publish gate still runs and records its result.
- **Anonymous quota counters survive account deletion**, keyed by a keyed hash of the Google account, with no learner content.
- **LangSmith receives full prompts and replies in every environment.** The data notice names it; traces are not removed by account deletion and expire with LangSmith retention.

## Before real learners

- Switch the Gemini key to a billing-enabled project: free-tier content is used to improve Google products (PRD §12.4).
- Move off Vercel Hobby if the product charges anyone.
- Measure p95 turn latency in Vietnamese on the deployed app before locking model IDs (NFR-2: ≤ 6 s).
- Supabase free projects may pause after 7 days of low activity.
