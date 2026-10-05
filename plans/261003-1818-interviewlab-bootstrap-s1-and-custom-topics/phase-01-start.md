---
title: "Phase 1: Walking skeleton"
status: in-progress
phase: 1
priority: P1
effort: "2d"
dependencies: []
---

# Phase 1: Walking skeleton

## Overview

A deployed app where a signed-in learner sends one question and gets one real persona reply, stored in Postgres and traced in LangSmith. It exists to prove the platform (auth, DB pooler, model calls, tracing flush, Vercel limits) and to measure real latency before the engine is built on top.

## Context links

- `docs/tech-stack.md`; `plans/reports/researcher-261003-1707-vercel-supabase-platform.md` §Recommended; `researcher-261003-1707-langgraph-llm-stack.md` §Recommended.
- Artboards: `Main`, `Prep`, `PrepSignIn`, `Notice`, `SystemStates` (header, footer).
- PRD Màn 0, 1, 3; FR-1, FR-2, FR-45 (startup check), FR-63.

## Requirements

- [x] Next.js 16 App Router + TypeScript at the repo root, pnpm, no Tailwind (design classes come from `theme.css`).
- [x] Google sign-in through Supabase Auth, and only Google: every other provider is disabled in the Supabase project, and the server rejects claims whose provider is not `google` or whose email is unverified. Every server handler verifies the user itself.
- [x] Data notice (Màn 0) gates every page that needs sign-in or writes data; consent stored with version and time.
- [x] One LLM wrapper used by every later phase: role → provider/model/effort from env, per-call timeout, usage and latency returned, LangSmith metadata attached, traces flushed before the function ends.
- [x] Every model call, including failed calls and technical retries, is recorded with its cost as it returns, outside any business transaction.
- [x] LangSmith traces carry full prompts and replies in every environment (user decision); the data notice names the tracing service.
- [x] App refuses to start when an email is in both `ADMIN_EMAILS` and `DEMO_ACCOUNT_EMAILS`.
- [ ] Deployed on Vercel with env vars set; p50/p95 of the single persona call recorded in this file.

## Architecture

Repo layout (all later phases follow it):

```
src/app/            routes (English slugs): / , /prep/[personaId], /sessions/[id],
                    /my-sessions, /custom-topic, /data-notice, /auth/callback, /api/...
src/components/     UI components, one folder per screen
src/config/         env.ts (zod-validated), limits.ts
src/db/             schema.ts, client.ts, repo/*.ts  (only place that builds queries; every
                    learner query takes userId)
src/engine/         pure TypeScript, no IO: tokens, checks, unlock, hooks, snapshots, reveal maths, sealing
src/llm/            roles.ts, call-model.ts, pricing.ts, prompts/*.ts
src/graphs/         LangGraph graphs: turn, reveal, generation
src/server/         services called by routes: auth.ts, sessions.ts, turns.ts, ...
src/strings/        product-level fixed Vietnamese strings, keyed
cli/                operator CLI (tsx), shares src/
scenarios/          persona JSON files
evalsets/           labelled JSONL test sets
drizzle/            generated SQL migrations
```

- Auth: `@supabase/ssr` server and browser clients; `proxy.ts` refreshes the session; `requireUser()` in `src/server/auth.ts` calls `getClaims()`, upserts the app `user` row keyed by the auth uid, and returns `{id, email, isAdmin, isDemo}`. `requireAckedUser()` adds the notice check and redirects to `/data-notice?next=...`.
- Sign-in keeps the pending action without making writes reachable by URL: the button POSTs the intent, the server stores a single-use `pending_action` row (owner, kind, payload, expiry 15 min) and redirects with only a same-origin `next`. After Google and "Tôi hiểu" the page consumes the row with a POST. Refresh or a crafted link cannot replay it.
- Emails are lower-cased before comparison with `ADMIN_EMAILS` and `DEMO_ACCOUNT_EMAILS`, and inside the overlap check.
- DB: Drizzle + postgres-js. `DATABASE_URL` (transaction pooler, `prepare: false`, `max: 1`) for the app; `DATABASE_URL_DIRECT` (session pooler) for migrations and CLI. A custom migration enables RLS with no policies and revokes anon/authenticated grants on every table; an integration test fails if any public table lacks RLS.
- LLM: `LLM_<ROLE>=provider:model:effort`. This phase defines `PERSONA` only; each later phase adds the roles it first uses. Keys: one per provider, plus optional `*_API_KEY_BATCH` used by generation and eval roles so batch load cannot rate-limit live turns. `callModel(role, messages, {schema?, meta, scope, signal})` returns `{output, usage, costUsd, latencyMs, attempts}`; structured calls use `withStructuredOutput({includeRaw: true})` and re-parse with Zod; 45 s timeout per attempt; up to 2 technical retries. Each attempt inserts its own `llm_call` row in its own statement, success or failure.
- Tables in this phase: `user`, `topic`, `scenario`, `session`, `turn`, `pending_action`, `llm_call` (scope = `session | generation | eval | moderation`, session_id?, attempt_id?, role, model, tokens in/out/cached/reasoning, cost_usd, latency_ms, attempt, ok, created_at), `daily_spend` (date in UTC+7, scope, usd): a ledger that receives amounts whose `llm_call` rows are deleted, so caps always read `llm_call` + `daily_spend`.
- The FR-63 notice string gains two sentences, and the notice version is bumped whenever it changes: that a tracing service also receives conversation content to debug quality, and that after account deletion an anonymous usage counter (no content) is kept to enforce limits.

## Related code files

- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`, `drizzle.config.ts`, `.env.example`, `proxy.ts`
- Create: `src/app/layout.tsx`, `src/app/globals.css` (from `docs/design/theme.css` + responsive rules), `src/app/page.tsx`, `src/app/prep/[personaId]/page.tsx`, `src/app/data-notice/page.tsx`, `src/app/auth/callback/route.ts`, `src/app/sessions/[id]/page.tsx`, `src/app/api/sessions/[id]/turns/route.ts`
- Create: `src/config/env.ts`, `src/db/schema.ts`, `src/db/client.ts`, `src/db/repo/users.ts`, `src/db/repo/sessions.ts`, `src/server/auth.ts`, `src/llm/roles.ts`, `src/llm/call-model.ts`, `src/llm/pricing.ts`, `src/strings/product-strings.ts`, `src/components/site-header.tsx`, `src/components/site-footer.tsx`
- Modify: `.gitignore` (node, next, env)

## Implementation steps

1. Scaffold with `create-next-app` into a temp folder (the root is not empty), move files to the root, switch to pnpm, remove Tailwind, pin Node ≥ 22 in `package.json` `engines`.
2. Port `theme.css` to `globals.css`; load the three fonts with `next/font/google` including the `vietnamese` subset; add the container and header rules for < 768 px.
3. Write `env.ts` with the admin/demo overlap check; write `.env.example` with every variable and a one-line comment each.
4. Define the six tables, generate the migration, add the RLS/revoke custom migration, run against Supabase.
5. Build auth: clients, `proxy.ts`, callback route, `requireUser`, `requireAckedUser`, sign-in/out controls in the header.
6. Build Màn 0 from `Notice.dc.html` using the extended FR-63 string from `product-strings.ts`; "Tôi hiểu" stores `visibility_ack_version` and `visibility_ack_at`, then resumes the pending action; "Quay lại" stores nothing.
7. Build Màn 1 (`Main.dc.html`, static; reveal screenshot slot is a placeholder until phase 8 seeds a demo session) and Màn 3 (`Prep.dc.html`) reading the persona from DB.
8. Write `callModel` and role config for both providers; attach LangSmith metadata; flush with `awaitAllCallbacks()` in `finally`.
9. Seed one topic and one scenario row holding only identity, opening line and surface facts. Build the skeleton turn: POST saves the learner text, calls the `PERSONA` role with identity + transcript, saves the reply, returns `{personaText, turnIndex}`. The chat page lists turns and posts new ones.
10. Walk the user through Supabase project (Google provider on, Email and every other provider off), Google OAuth client and redirect URLs, API keys, LangSmith project, Vercel project and env vars; deploy.
11. Send 20 turns on the deployed app; record p50/p95 latency and one LangSmith trace link below.

## Todo

- [x] Scaffold, pnpm, fonts, ported theme
- [x] `env.ts` + `.env.example`
- [x] Schema, migrations, RLS check test
- [x] Auth + Màn 0 gate with resume
- [x] Màn 1 and Màn 3
- [x] `callModel` for Gemini and OpenAI + tracing flush
- [x] Skeleton turn end to end
- [ ] Deployed; latency recorded

## Success criteria

- [ ] On the Vercel URL: sign in with Google, accept the notice, send a question, get a Vietnamese reply; rows exist in `turn` and `llm_call`; the trace shows in LangSmith with `session_id` metadata.
- [x] A signed-out request to `/sessions/[id]` redirects to sign-in and returns to the same page.
- [x] Unit test: overlapping admin/demo emails throw at config load, including case differences. Integration test: every public table has RLS enabled.
- [x] Route test: a signed-in user without consent for the current notice version is redirected to Màn 0 from every write route and from a direct link to `/sessions/[id]`; consent stores version and time (§12.2 item 9).
- [x] Test: a claim with a non-Google provider is rejected; a pending action is consumed once and cannot be triggered by GET.
- [x] Test: a failed model call leaves an `llm_call` row with `ok = false` and its cost.
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` pass.

## Risk assessment

- **Zod v4 with `@langchain/google` 0.2.x structured output is unverified.** Mitigation: step 8 includes one structured smoke call per provider; fall back to `@langchain/google-genai` if it fails.
- **Model IDs from research are medium confidence.** Mitigation: user confirms IDs in both consoles during step 10; IDs live only in env.
- **Supavisor transaction mode with multi-statement transactions.** Mitigation: the skeleton turn writes two rows in one transaction, which exercises it on day one.
- **Latency above 6 s for two calls.** Mitigation: measured here with one call; if one call p95 > 3 s, change model or effort before phase 3.

## Security considerations

- Secret key and `DATABASE_URL` are server-only; only the Supabase URL and publishable key are `NEXT_PUBLIC_`.
- Auth is checked inside every route handler and server action, not only in `proxy.ts`.
- `next` redirect targets are validated as same-origin paths; no write is triggered by query parameters.
- LangSmith holds learner text in full by user decision. It is named in the notice, and its API key is server-only.

## Progress (2026-10-04)

Code and local verification are done. Open: steps 10–11 (cloud projects, deploy, latency), which need the user's accounts and keys.

Verified locally: `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` (79 unit), `pnpm test:int` (40, real Postgres), `pnpm test:e2e` (41 Playwright, desktop + mobile, against a production build). Reports: `plans/reports/code-reviewer-261004-1620-phase-01-walking-skeleton.md`, `plans/reports/tester-261004-1620-phase-01-walking-skeleton.md`.

Not verified (needs real credentials): Google OAuth round trip through `/auth/callback`; session refresh in `src/proxy.ts` after token expiry; a real Gemini and OpenAI call, text and structured (Zod v4 with `@langchain/google`); LangSmith trace and flush; pooler behaviour; p50/p95 latency.

Differences from this file as written:

- `proxy.ts` and `instrumentation.ts` live in `src/` (required when the app uses a `src` directory).
- Two routes were added: `/sign-in` (sign-in page, target of every signed-out redirect) and `/resume` (resumes the pending action by POST after sign-in).
- DB tests run against a local Supabase stack (`supabase/config.toml`, default ports 5432x) instead of plain Postgres: the RLS migration needs the `anon` and `authenticated` roles, and Playwright needs real Supabase Auth.
- Eight tables, not six: the list in Architecture is the accurate one. `session` also carries `persona_id` and `is_demo` with a partial unique index (one session per persona per learner, FR-5).
- Cost columns are `numeric(14, 9)`: six decimals rounded single-call costs.
- The turn route has `maxDuration = 150` so three 45 s attempts fit; the skeleton turn refuses turn 31.
- A model request rejected with 4xx (other than 408 and 429) is not retried.
- `SUPABASE_SECRET_KEY`, `*_API_KEY_BATCH` and LangGraph are not added yet; the phases that first use them add them.
- `pnpm test` runs unit tests only; `pnpm test:int` and `pnpm test:e2e` need `pnpm supabase:start` (Docker).

Left for later phases, from the review: no rate limit on turns beyond the 30-turn cap (phase 3 engine and cost cap); `upsertUser` writes on every signed-in request; `getClaims()` accepts a token for up to an hour after sign-out or deletion (matters for account deletion, phase 8); no `frame-ancestors` header (phase 10); quota keys must use the auth id, not the email (phase 8).

### Latency (step 11)

Not measured yet.
