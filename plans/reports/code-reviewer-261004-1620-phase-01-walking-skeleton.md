# Code review: phase 1 walking skeleton

Date 2026-10-04. Branch `feat/bootstrap-interviewlab` (all untracked). Reviewer read-only on source.

## Scope

- Files: all of `src/**`, `drizzle/*.sql`, `tests/**`, `scripts/seed-skeleton.ts`, `supabase/config.toml`, config files (~6.2k lines incl. snapshots).
- Re-run: `pnpm typecheck`, `pnpm lint`, `pnpm test` (63/63) pass. int + e2e not re-run.
- Runtime probes: started the existing production build on port 3197 against the local stack; one throwaway Google-marked account in local Supabase Auth (deleted afterwards; its `public.user` row remains until the next test reset).
- Not done: `node_modules/next/dist/docs` could not be read (scout-block hook denies the path). Next 16 judgements rest on the build manifest and runtime probes.

## Overall

Structure matches the plan, auth is checked in every page/action/route, learner queries are filtered by user id, turn API shape and data-block wrapping hold. Three defects need fixing before deploy: a proven open redirect, and two holes in "every model call is recorded".

## High

### H1. Open redirect: `safeNextPath` returns `//host` after URL normalisation (proven)
- `src/server/safe-next.ts:10-12`. Checks the raw string for `//`, then returns the *normalised* `url.pathname`. Dot segments collapse: `/.//evil.example` -> `//evil.example`; also `/..//x`, `/a/..//x`, `/%2e//x`.
- Probe, signed in: `GET /dang-nhap?next=/.//evil.example/login` -> `307 location: //evil.example/login`. Notice page renders `name="next" value="//evil.example"`.
- Sinks: `src/app/dang-nhap/page.tsx:17`, `src/app/thong-bao-du-lieu/page.tsx:35`, `src/server/actions.ts:67`. Callback is safe only because it prefixes `origin`.
- Violates the phase security line "next targets validated as same-origin paths". `tests/server/safe-next.test.ts` has no dot-segment case.
- Fix: validate the output, e.g. `const path = url.pathname + url.search; if (path.startsWith("//") || path.startsWith("/\\")) return "/";`. Add the four inputs above to the unit test.

### H2. `callModel`: a failed `llm_call` insert after a successful attempt is treated as a model failure
- `src/llm/call-model.ts:163-171`. `await record(true, usage)` sits inside the `try` whose `catch` handles model errors.
- Scenario: model replies (billed), insert fails (pooler blip, single connection). Catch writes `ok=false`, zero tokens, cost 0 for an attempt that succeeded and cost money, then the loop calls the model again (up to 2 more billed calls, good reply discarded). If the second insert also fails, a raw DB error escapes: not `LlmCallError`, `signal.aborted` check skipped, route answers 500.
- Breaks "every call recorded with its cost". No test covers a throwing `recordCall`.
- Fix: keep only `runAttempt` in the try. Record after it; on a recording failure do not re-call the model: throw a distinct error (fail closed) or log and return the output, per budget policy. Add a unit test with a rejecting `recordCall`.

### H3. `maxDuration = 60` is shorter than the retry budget (3 x 45 s)
- `src/app/api/buoi/[id]/luot/route.ts:6` vs `src/config/limits.ts:8,11`.
- Scenario on Vercel: provider hangs; attempt 1 times out at 45 s and is recorded; attempt 2 starts; platform kills the function at 60 s. Attempt 2 gets no `llm_call` row, `awaitAllCallbacks()` never runs (trace lost), client gets a platform 504.
- Not reproducible locally (`maxDuration` is ignored by `next start`).
- Fix: one of: `maxDuration` >= 150; or a persona-role timeout near the latency target (10-15 s); or an overall deadline in `callModel` that skips a retry it cannot finish.

## Medium

### M1. Unauthenticated, unbounded `pending_action` writes; no cleanup
- `src/server/actions.ts:46-58`, `src/db/repo/pending-actions.ts:7-16`. A guest POST to `startSession` inserts a row with an unvalidated `personaId` of any length (server-action body limit). Expired rows are never deleted; every abandoned "Bat dau" leaves one.
- Scenario: script loops the action -> fills the free-tier database. No sign-in needed.
- Fix: check `getScenarioByPersona` before storing (unknown persona -> redirect `/`), cap length, delete expired rows on create (`DELETE ... WHERE expires_at < now()`), index `expires_at`.

### M2. No turn cap or rate limit on a publicly deployed endpoint
- `src/server/turns.ts:31-33`. Any Google account can send unlimited turns; the prompt carries the whole transcript, so cost per turn grows. Prep screen states "Toi da 30 luot". Claim/lock is deferred to phase 3 (accepted), but the phase deploys with real keys.
- Fix (one line): refuse when `transcript.length > 30`; or keep the deployment private until phase 3.

### M3. Paths with no automated coverage that the deploy depends on
- OAuth callback success path (`src/app/auth/callback/route.ts:15-24`): e2e plants cookies directly, so `exchangeCodeForSession` -> `getUser()` on a second client reading cookies written in the same request -> redirect is never run. If that read-after-write does not hold, every sign-in ends in `signOut()` + error. Safer: call `getClaims()` on the same client instance and pass claims to `resolveUser`.
- Proxy session refresh (`src/proxy.ts`): registered (`functions-config-manifest.json`: `/_middleware`, nodejs, matcher present) but no test shows a refreshed cookie being set.
- Google provider (`src/llm/create-model.ts:13-20`): `.env.example` defaults to `google:...`, yet no test builds `ChatGoogle`; `reasoningEffort` and the usage mapping are unverified. Structured-output path only runs against a hand-written fake (`tests/helpers/scripted-model.ts:59`).
- Action: steps 8/10/11 must include one real sign-in, one >1 h session, one text and one structured call per provider, before the criteria are ticked.

### M4. Test "loading the resume page with GET never performs the action" cannot fail
- `tests/e2e/notice-and-start.spec.ts:143-154`. The learner has not consented, so `requireAckedUser` redirects before any resume logic. The test passes even if `/tiep-tuc` consumed the action on GET.
- Fix: consent first, then `page.request.get("/tiep-tuc")`; assert no session and the `pending_action` row still exists.

### M5. Retry policy: no backoff, retries everything
- `src/llm/call-model.ts:137-172`. 401/400/content-filter errors are retried 3 times; 429/503 are retried immediately, which tends to fail again and deepens rate limiting.
- Fix: short jittered delay; do not retry 4xx other than 408/429.

## Low

- `src/server/auth-claims.ts:20-21`: `user_metadata.email_verified` is user-editable, so the check proves nothing on its own (harmless: Supabase issues no Google session for an unverified email). Comment overstates it.
- Email claim (asked): probe showed self-service `PUT /auth/v1/user {email}` leaves `email` unchanged and sets `new_email` pending confirmation, provider stays `google`. A learner cannot take an `ADMIN_EMAILS` address without its mailbox. They can move to another address they own, so later quota keys must use `sub`/Google identity, not email.
- `getClaims()` accepts a token until expiry (<= 1 h) after sign-out or deletion; `resolveUser` would re-create a deleted `user` row. Matters in phase 8.
- Turn route has no Origin/content-type check: a POST with `Origin: https://evil.example`, `text/plain` reached auth logic. Protection is SameSite=Lax only. No `frame-ancestors`/`X-Frame-Options` (consent button can be framed).
- `src/server/pending-actions.ts:38`: regex accepts 36 dashes -> Postgres cast error -> 500 (own cookie only). Three separate UUID regexes; share one.
- `src/server/actions.ts:17-22`: OAuth `redirectTo` built from `x-forwarded-host`; prefer a configured site URL.
- `src/db/repo/users.ts:8-15`: an UPDATE on every signed-in request.
- `src/db/client.ts:9`: no `idle_timeout`/`connect_timeout`; `max: 1` serialises concurrent requests in one instance (accepted setting, noting the cost).
- Indexes: none on `llm_call.session_id` (FK `set null` scans on session delete), none usable by `findSessionForPersona` for demo rows.
- Timed-out and aborted attempts are recorded at cost 0 though the provider may bill them.
- `src/instrumentation.ts`: config is checked only at runtime; on Vercel a bad env deploys green then every request fails. Also parse env in `next.config.ts` to fail the build.
- Unused in this phase: `signal` (route never passes `request.signal`), `attemptId`, `isAdmin`, `daily_spend`. Plan-mandated, not flagged as defects.

## Checked and fine

- Auth inside every page, action and route; proxy authorises nothing.
- Cross-learner access: `getSession`, `listTurns`, `appendTurn` all filter by user id; int + e2e cover it.
- `createSession`: `ON CONFLICT DO NOTHING` without target works with the partial unique index; loser re-reads after the winner commits. `appendTurn`: session row lock + PK conflict -> "conflict".
- Pending action: delete-returning is atomic, owner check, expiry, httpOnly + Lax cookie, consumed only by POST actions.
- No `redirect()` inside try/catch in `actions.ts`; `acceptDataNotice` passes `noticeAcked: true` rather than trusting a cached user.
- Turn API body: `{personaText, turnIndex}` or `{error[, redirectTo]}` only. Learner text wrapped by `dataBlock` and rendered as text nodes.
- RLS migration + four int tests; secrets are not `NEXT_PUBLIC_`; `.gitignore` covers env files.
- Async `params`/`searchParams`/`cookies`/`headers` used correctly; `src/proxy.ts` and `src/instrumentation.ts` are compiled into the build.

## Plan follow-ups

- Requirements met in code except: deploy, latency, live LangSmith trace (need cloud credentials); `*_API_KEY_BATCH` not yet present (first needed by later roles).
- Success criteria 2-6 have tests; criterion 5 "cannot be triggered by GET" is covered only by M4's weak test.
- Recommended order: H1, H2, H3, M1, M4, M2, then M3 during deploy.

## Unresolved questions

1. Does `@langchain/google` report `output_tokens` including reasoning tokens? `pricing.ts` assumes yes; if not, Gemini reasoning is unmetered. Needs one real call.
2. If the `llm_call` insert fails after a good reply: fail the turn or return the reply and log? (decides H2 fix)
3. Is the phase-1 deployment public? Decides whether M2 is a blocker.
4. Hosted Supabase: keep "Confirm email" and "Secure email change" on; worth a line in the setup walk-through.
