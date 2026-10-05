# InterviewLab platform research: Vercel Hobby + Supabase Free + Next.js
Checked: 2026-10-03 (all URLs fetched that day; npm versions from `npm view` registry same day).

## 1. Vercel Hobby
| Item | Finding | Source |
|---|---|---|
| Max duration (Fluid, default for new projects since 2025-04-23) | Default AND max 300s on Hobby (Pro 800s) | https://vercel.com/docs/functions/limitations ; https://vercel.com/docs/fluid-compute |
| Max duration WITHOUT Fluid | Current docs only list Fluid. Last known legacy Hobby: 10s default, 60s max (2024-05-09). Not re-verified for non-Fluid today. Irrelevant: leave Fluid on | https://vercel.com/changelog/vercel-functions-for-hobby-can-now-run-up-to-60-seconds |
| `after()` / `waitUntil` on Hobby | Work; `after` = `waitUntil` on Vercel; promises share the function's maxDuration, cancelled on timeout. `getDeadline()` in `@vercel/functions` exposes the deadline (covers request + waitUntil time) | https://nextjs.org/docs/app/api-reference/functions/after ; https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package |
| `after` stable since | Next 15.1; runs even if response errored | nextjs.org after doc above |
| Concurrency | Auto-scale up to 30,000 (Hobby+Pro); 2 GB/1 vCPU; 4.5 MB body | limitations page |
| Usage guideline (Hobby) | 1M invocations, 4 h Active CPU, 360 GB-hr memory /mo. Waiting on LLM/DB I/O is NOT active CPU | https://vercel.com/docs/limits/fair-use-guidelines ; limitations page |
| Cron | Hobby: 100 jobs, once/day max, fires anywhere within the hour (+-59 min). Useless as a worker/sweeper | https://vercel.com/docs/cron-jobs/usage-and-pricing |
| Non-commercial | Hobby = non-commercial personal use only. Commercial = anything for financial gain of anyone involved (payments, ads, selling service, paid dev/consultant writing the code). Donations OK | fair-use page |
| Vercel Workflow (alt) | GA; Hobby includes 50k events/mo + 1 GB written; run data retained 1 day on Hobby; unlimited run duration; each step still bound by function max (300s). Package `workflow` 5.0.1 | https://vercel.com/docs/workflows/pricing ; https://vercel.com/docs/workflows ; GA news: https://www.dutchitchannel.nl/news/730354/vercel-workflows-nu-officieel-beschikbaar |
| Vercel Queues (alt) | 1M ops included on Hobby; message TTL up to 7d | https://vercel.com/docs/queues/pricing |
| Supabase Edge Functions (alt) | Free: 150s wall-clock, 2s CPU/request, 150s idle timeout. Too tight for (c) | https://supabase.com/docs/guides/functions/limits |
| Supabase Queues (pgmq) (alt) | Exists (Postgres-native queue); needs pg_cron + Edge fn consumer, so inherits the 150s cap and 3 moving parts | https://supabase.com/docs/guides/queues |

### Verdicts
- (b) Reveal (20-60s) in `after()`: SAFE. 60s << 300s. Tab close irrelevant (server-side). Risk = instance crash/redeploy mid-run, no auto-retry -> persist job state + idempotent resume.
- (c) Scenario gen: p95 <=2 min fits inside 300s in ONE invocation (7 parallel interviews, each ~20-30 sequential LLM calls; parallel so wall time ~ one interview). Hard timeout 10 min does NOT fit: Hobby ceiling is 300s. Either cut the hard timeout to ~270s (self-enforced via `getDeadline()`) or use Workflow.
- Rejected: chained self-invocation (extra auth/secret plumbing, same 300s per hop, no durability); Supabase pgmq/pg_cron/Edge (150s cap, 3 services); Inngest/Trigger.dev/QStash not researched (YAGNI: first-party Workflow exists on Hobby).
- Ranked: 1) `after()` + DB job row + poll-time watchdog. 2) Vercel Workflow SDK (upgrade path if measured p95 >200s or hard-timeout >5 min is non-negotiable). 3) Supabase Queues/Edge.
- Note: Hobby cron is daily, so a stuck-job sweeper must be lazy: the poll endpoint marks jobs `system_error` when `heartbeat_at` is stale (>60s). `system_error` already exists in PRD failure_reason and is excluded from quotas.

## 2. Next.js
- Latest 16.3.8 (npm `latest`, modified 2026-10-02). 16.3 released 2026-08-03; 16.0 on 2025-10-21. https://nextjs.org/blog
- `create-next-app@16.3.8` defaults: TypeScript, ESLint (Biome optional), Tailwind CSS, App Router, AGENTS.md; Turbopack default for dev AND build; React Compiler opt-in (`--react-compiler`); import alias `@/*`. https://nextjs.org/docs/app/api-reference/cli/create-next-app
- npm today: react 19.3.0, tailwindcss 4.3.3 (v4 = CSS-first, no tailwind.config), typescript 7.0.2 (latest dist-tag; Next min is TS 5.1; let create-next-app choose its pinned TS, do not hand-bump). Node >=20.9 required. https://nextjs.org/docs/app/guides/upgrading/version-16
- Changes that matter:
  - `middleware.ts` -> `proxy.ts` (export `proxy`), Node.js runtime only, no `runtime` config. Server Functions are POSTs to the page route, so excluded matchers also skip proxy: authorize inside every handler, never rely on proxy alone. https://nextjs.org/docs/app/api-reference/file-conventions/proxy
  - Async request APIs fully enforced: `await cookies()`, `await headers()`, `await params`.
  - `next lint` removed; run ESLint/Biome directly; `next build` no longer lints.
  - Route handler `after()` may call `cookies()`/`headers()` inside the callback; Server Components may not.
  - Caching: `revalidateTag` needs 2nd arg (cacheLife profile); `updateTag` (Server Actions); Cache Components opt-in via `cacheComponents: true`. Keep it OFF (app is per-user dynamic).
  - `maxDuration` export in route file sets Vercel duration. https://vercel.com/docs/functions/configuring-functions/duration
- If Workflow SDK is ever added: exclude `.well-known/workflow/*` from proxy matcher. https://workflow-sdk.dev/docs/getting-started/next

## 3. Supabase Free tier
- Compute Nano: 0.5 GB RAM shared CPU, 60 direct conns, 200 pooler client conns; DB size "recommended max 500 MB". https://supabase.com/docs/guides/platform/compute-and-disk
- Pause: free projects may pause after low activity in a 7-day period; restore from dashboard; no downloadable backups. https://supabase.com/docs/guides/deployment/going-into-prod . Mitigation: a daily Vercel cron hitting a cheap DB-touching route (Hobby daily cron is allowed) + CLI eval runs. Not verified that this counts as "activity".
- Connection strings (copy from dashboard Connect button; pooler host cannot be composed by hand). https://supabase.com/docs/guides/database/connecting-to-postgres
  - Vercel functions: shared pooler, TRANSACTION mode, port 6543, pool `max: 1`, `prepare: false`, `ssl: 'require'`.
  - Local CLI (long-running): direct 5432 if you have IPv6, else shared pooler SESSION mode (5432 on pooler host, IPv4). Home Windows ISPs often lack IPv6: expect session pooler. Prepared statements fine in session mode.
  - Multi-statement transactions work through transaction-mode pooler (connection pinned for the tx). Not separately sourced; standard Supavisor behavior, confirm in a smoke test.

## 4. Auth (Google) in App Router
- Packages: `@supabase/supabase-js` 2.117.2 + `@supabase/ssr` 0.12.7 (peer supabase-js ^2.114). https://supabase.com/docs/guides/auth/server-side/nextjs
- Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Key names: publishable `sb_publishable_...` replaces `anon`; secret `sb_secret_...` replaces `service_role`. Legacy keys deprecated by end of 2026, both work now. https://supabase.com/docs/guides/api/api-keys
- Pattern: `createBrowserClient` (client), `createServerClient` with `cookies().getAll/setAll` (server, `await cookies()`), `proxy.ts` that calls `supabase.auth.getClaims()` to refresh tokens and copies Set-Cookie to the response. Docs snippet still exports `middleware` in a file labeled proxy; in Next 16 export `proxy` (docs inconsistency; verify at scaffold). https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs
- Verified user server-side: docs say always `getClaims()` (verifies signature via JWKS, cached, no network call when project uses asymmetric JWT signing keys; falls back to Auth-server call for symmetric). Use `getUser()` only for account-deletion/sensitive actions needing live revocation check. https://supabase.com/docs/reference/javascript/auth-getclaims . Never trust `getSession()` server-side.
- PKCE callback `app/auth/callback/route.ts`: read `code`, `await supabase.auth.exchangeCodeForSession(code)`, redirect to `next` (validate it is a relative path) or error page. On Vercel prefer `x-forwarded-host` handling only if behind custom proxy; default `origin` works. https://supabase.com/docs/guides/auth/social-login/auth-google
- Google Cloud Console: OAuth client type Web; Authorized JS origins = site origins (http://localhost:3000, prod URL); Authorized redirect URI = Supabase callback `https://<project-ref>.supabase.co/auth/v1/callback` (NOT the Next route); scopes openid, email, profile. Consent screen (External) left in Testing = only listed test users; publish to Production to open sign-in.
- Supabase dashboard: Auth > Providers > Google (client id/secret); Auth > URL Configuration: Site URL = prod URL; Redirect allow-list: `http://localhost:3000/**`, `https://<prod-domain>/auth/callback`, preview `https://*-<team-slug>.vercel.app/**`. Prefer exact path in prod; globs for preview/local. https://supabase.com/docs/guides/auth/redirect-urls
- Preview deployments: one Supabase project = one site URL; set `redirectTo` from `window.location.origin` so previews return to themselves. Google side needs only the single Supabase callback URI, so previews need no Google changes.
- Data-model note: PRD `user(id, google_sub, ...)` is an app table separate from `auth.users`. Account deletion must also delete the `auth.users` row (admin API w/ secret key, or SQL as `postgres` role in the same tx). Not verified which works for "one transaction"; see Unresolved.

## 5. Data access layer
| Dimension | (i) supabase-js + RLS everywhere | (ii) Drizzle on server-only PG conn |
|---|---|---|
| Multi-stmt tx per turn | None (PostgREST = one call/stmt; needs RPC functions per tx) | Native `db.transaction` |
| JSONB typing | Untyped without codegen | `jsonb().$type<T>()` + zod |
| Migrations in repo | Supabase CLI SQL | drizzle-kit SQL files |
| Shared w/ local CLI | CLI needs keys + REST, no tx | Same module, different `DATABASE_URL` |
| Hidden persona items | RLS policy per column: error-prone (RLS is row-level) | Server shapes DTOs; DB never reachable from browser |
| Cost | Low | Medium (one extra dep) |

- RECOMMEND (ii). Drizzle connects as a role that bypasses RLS, so RLS is NOT the authorization layer here; app code must filter `user_id` in every query (put it in one repository layer, test it). Real defence-in-depth: enable RLS on every table with zero policies and revoke anon/authenticated grants, so the publishable key exposes nothing through the Data API. https://supabase.com/docs/guides/database/postgres/row-level-security
- Versions: `drizzle-orm` 0.45.3 / `drizzle-kit` 0.31.11 (npm `latest`). 1.0.0-rc.4/rc.5 exist on `rc`/`beta` tags: stay on 0.45.x stable; migrate when 1.0 becomes `latest`. Driver `postgres` (postgres-js) 3.4.9: Drizzle's Supabase page requires `prepare: false` on transaction pooler. https://orm.drizzle.team/docs/connect-supabase . Also `zod` 4.6.5, `@langchain/langgraph` 1.4.18 (peer `@langchain/core` ^1.1.48, zod ^3.25.32||^4.2.0).
- Migration workflow (Windows-safe, one source of truth): `drizzle-kit generate` -> committed SQL in `drizzle/`; `drizzle-kit migrate` with DIRECT/session URL (DDL must not go through transaction pooler); RLS enable + REVOKE statements as hand-written custom migration (`drizzle-kit generate --custom`). Do NOT also keep Supabase CLI migrations (two histories drift). Supabase CLI only if you want the local stack.
- Hard-delete of a user's rows: single `db.transaction` in server code; declare `ON DELETE CASCADE` FKs from session->turn/snapshot/branch to make it one DELETE plus targeted deletes (generation_attempt, custom topic/scenario, event, waitlist, realism_feedback).
- `events` logged server-side only: insert with Drizzle; no grants to anon.

## 6. Testing
- Vitest 5.0.3 (npm latest 2026-09-30). Requires Node >=22.12 and Vite >=6.4; breaking: unawaited async assertions fail, `clearMocks` default on. Local Node 24.19 OK; pin Node 22+ on Vercel project settings and CI. https://vitest.dev/blog/vitest-5
- Unit: pure engine logic, no mocks of DB, `environment: 'node'`, separate `vitest.config.ts` for `*.test.ts` vs `*.int.test.ts`.
- DB integration, lightest sane option on Windows: one plain Postgres container via Docker Desktop (WSL2) with a `docker-compose.yml`, DB `interviewlab_test`, run `drizzle-kit migrate`, truncate tables between tests (or tx-per-test rollback). Plain Postgres suffices because the app uses its own `user` table (no FK to `auth.users`) and Drizzle does not need GoTrue/PostgREST. Heavy alternative `supabase start` (full stack in Docker; CLI via `npm i -D supabase` 2.119.0 or Scoop, needs Docker) only if you must test RLS grants or Auth. https://supabase.com/docs/guides/local-development/cli/getting-started
- Dedicated test schema on the cloud free project: rejected (shares 500 MB + 7-day activity, flaky, secrets in CI).
- PGlite (in-process Postgres, no Docker) not researched; possible later if Docker is a pain.

## Recommended
- Versions: Node 22 LTS+ (24 local ok), next 16.3.8, react 19.x via create-next-app (npm latest 19.3.0), tailwindcss 4.3.3, supabase-js 2.117.2, @supabase/ssr 0.12.7, drizzle-orm 0.45.3, drizzle-kit 0.31.11, postgres 3.4.9, vitest 5.0.3, @langchain/langgraph 1.4.18. Scaffold: `npx create-next-app@latest` with defaults (Turbopack, App Router, Tailwind, ESLint, TS), React Compiler off.
- Background jobs: Fluid on, `export const maxDuration = 300` on the reveal and generate routes; POST inserts a job row then `after(runJob)`; job writes `heartbeat_at`; self-abort at ~270s via `getDeadline()`; poll endpoint flips stale jobs to `system_error` (no cron needed). Reveal 20-60s safe. Generation p95 2 min fits; hard timeout becomes 5 min unless Workflow SDK (5.0.1, free on Hobby, GA) is adopted. Turn endpoint: plain POST, `maxDuration` 60.
- Auth: @supabase/ssr, Google via `signInWithOAuth` PKCE, `/auth/callback` route, `proxy.ts` refreshes via `getClaims()`, every handler calls `getClaims()` itself; admin = claim email in `ADMIN_EMAILS` env; publishable/secret keys (not anon/service_role).
- Data layer: Drizzle + postgres-js server-only; Vercel uses transaction pooler 6543 (`prepare:false`, `max:1`); CLI uses session pooler/direct; migrations via drizzle-kit only; RLS on + grants revoked as defence in depth; ownership filter in one repository layer.
- Tests: Vitest 5 unit for engine; Docker Postgres for `*.int.test.ts`; no Supabase local stack until RLS/Auth testing is needed.
- Commercial caveat: Hobby forbids commercial use. If InterviewLab charges (PRD mentions waitlist/free_custom_used) or any paid person builds it, you need Pro ($) or another host.

## Unresolved questions
1. Hobby limit when Fluid is disabled: not confirmed on current docs (legacy 10s/60s). Only matters if the project was created pre-2025-04-23.
2. Does the PRD's "hard timeout 10 min" allow dropping to ~5 min, or must Workflow SDK be used? Needs owner decision.
3. Hobby 4 h Active CPU/mo: LangGraph JSON/zod parse + 2,000-call evals are off-Vercel, but parallel-7 generation CPU time was not measured. Measure.
4. Supavisor transaction-mode behavior for multi-statement txs and JSONB through postgres-js `prepare:false`: expected fine, run a smoke test on day 1.
5. Can the `postgres` role delete from `auth.users` inside the same app transaction (FR-66 "one transaction")? Else use `auth.admin.deleteUser` after the tx and tolerate a retry.
6. Whether a daily Vercel cron ping prevents Supabase 7-day pause (doc says "low activity", no threshold).
7. typescript 7.0.2 (npm latest) compatibility with Next 16.3.8 tooling not checked; keep the TS version create-next-app pins.
8. Free plan Postgres major version and Supavisor pool size not fetched; match test container to Supabase's major.
9. Inngest/Trigger.dev/QStash free tiers, PGlite not researched (YAGNI).
