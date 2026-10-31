# InterviewLab tech stack

Approved 2026-10-03. Product requirements were `_bmad-output/planning-artifacts/prds/prd-week-3-project-2026-09-24/prd.md` and `addendum.md`; since 2026-10-14 the PRD is retired as authority, and the decisions of `plans/261014-2139-lean-eval-token-cuts-and-admin-dashboard/plan.md` replace it where they differ (FR numbers in the code still name the requirement a rule came from). Evidence for versions and limits: `plans/reports/researcher-261003-1707-*.md` (versions were read from npm on 2026-10-03; model IDs and prices are medium confidence and must be re-checked in the vendor consoles before they are hardcoded).

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
| Models | OpenAI first, Google as a per-call fallback: `gpt-6.1-terra` for the persona, analysis, feedback and the operator roles; `gpt-6-luna` for the turn judge, end judge, verifier, moderation, safety and the string check; `gpt-6.1-sol` for scenario generation | One env var per call role, a chain `LLM_<ROLE>=spec[,spec…]` with each spec `provider:model:effort`. When a spec fails for good (its retries spent, or an error no retry can fix, such as a spent quota) the call runs on the next one; a streamed reply switches only before its first piece, and an eval call never falls back, so it measures one model. Every attempt writes its own `llm_call` row. Each role runs the cheapest model that passed its judgement set three times in three (`plans/reports/model-tiering-261030-openai.md`); roles without a set stay on Terra. The plain voice of persona, generator and feedback text is set in the prompts and measured by the eval-only `voice-judge` set, never filtered at runtime |
| Tracing | LangSmith | Full prompts and replies, plus metadata: session, turn, call role. Flush before the function ends. Off for CLI eval runs unless `--trace` is given (free plan: 5k traces/month, 14-day retention) |
| Background work | `after()` + job row + heartbeat, `maxDuration = 300` | Reveal, custom-scenario generation and the lean eval. Poll endpoint marks stale jobs failed or hands them to a new runner; no cron |
| Persona evaluation | Persona QA agent (LangGraph plan → execute → judge → reflect) as a resumable job | Started from `/admin/scenarios` or `pnpm il eval`; under 0.10 USD a persona (`eval_lean_budget_usd`) |
| Admin console | `/admin`, server-rendered, admins from `ADMIN_EMAILS` | A non-admin gets the same 404 as an unknown URL; every read of learner data and every config change writes `admin_access_log` |
| Tests | Vitest (unit, and integration against the local Supabase stack in Docker); Playwright on a production build with a model stub | No test needs a key. CI: `.github/workflows/ci.yml` |
| Security headers | Fixed headers in `next.config.ts`; Content-Security-Policy with a nonce per request in `src/proxy.ts` | Scripts are nonce-only, so every page is rendered per request. The browser talks to the app's origin alone. `style-src` allows inline styles |

## Deviations from the PRD

- **A custom-scenario attempt has the PRD's 10 minutes as up to three runs of at most 270 s each** (Vercel Hobby cap per function), each going on from what the one before stored. The p95 ≤ 2 minute target is unchanged.
- **The reduced evaluation of a generated scenario (FR-54) is dropped**: a custom scenario is only lightly checked (`validate`, a routing check of its topic tags and an output safety check) and is not played before the learner gets it.
- **No separate worker process.** Turns, reveal and the lean eval run in request/`after()`; the CLI runs the same eval job on the developer's machine. Priority of live turns over batch work (FR-37) is kept by an optional separate API key for generation and eval roles.
- **The 46-episode full evaluation and its two-admin adjudication are replaced** by the persona QA agent (lean eval) and one admin ruling per leak flag, with a version approval tied to the run. The prompt-only baseline is gone.
- **There is an admin console** (`/admin`), where the PRD had only the operator CLI in this slice.
- **Unpublished personas are playable by every learner** until the `require_published` config row is turned on; the publish gate still runs and records its result.
- **Anonymous quota counters survive account deletion**, keyed by a keyed hash of the Google account, with no learner content.
- **A learner may play a persona again after finishing it** (FR-5 lifted, user decision 2026-10-29). At most one unfinished session per persona and learner; only `session_daily_cap_usd` bounds spend.
- **The result screen no longer lists untold items.** It shows at most 3 hints for next time (the topic to ask about, how to ask, and a suggested question behind a tap) and one count line for the rest. No untold item text reaches a learner's browser in any state.
- **LangSmith receives full prompts and replies in every environment.** The data notice names it; traces are not removed by account deletion and expire with LangSmith retention.

## Measured numbers

None yet: the app has not been deployed. `pnpm il measure-latency` measures turn and reveal latency (NFR-2: turn p95 ≤ 6 s, reveal ≤ 15 s); the results go here and in `docs/launch-checklist.md`.

## Before real learners

The full list, with status, is `docs/launch-checklist.md`.


- OpenAI does not train on API data unless the organization opts in, and keeps abuse-monitoring logs, which can hold prompts and replies, for up to 30 days ([OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data)). The Google fallback key should still come from a billing-enabled project: free-tier content is used to improve Google products (PRD §12.4).
- Move off Vercel Hobby if the product charges anyone.
- Measure p95 turn latency in Vietnamese on the deployed app before locking model IDs (NFR-2: ≤ 6 s).
- Supabase free projects may pause after 7 days of low activity.
