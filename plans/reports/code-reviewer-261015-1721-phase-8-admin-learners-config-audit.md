# Code Review: Phase 8, admin learners, config, custom topics, audit

## Scope
- Files: cli/commands/{config,trace}.ts, src/db/repo/{config,custom-topics,sessions,turns,users}.ts, src/components/admin/{admin-nav,format}.ts(x), src/components/admin/pager.tsx, src/app/globals.css, src/server/{admin-paging,session-trace}.ts, src/server/admin/{learners,config}.ts, src/app/admin/{learners,learners/[userId],sessions/[id],config,custom-topics,custom-topics/[attemptId],audit}/*, tests/server/admin-learners.int.test.ts, tests/e2e/admin-learners.spec.ts, tests/cli/config-and-trace.int.test.ts
- LOC: about 270 changed in tracked files, about 1,100 in new files
- Verification run: `pnpm typecheck` clean, `pnpm lint` clean, `pnpm test` 59 files / 1160 tests pass, `pnpm test:int` on admin-learners + config-and-trace + cost-cap: 3 files / 58 tests pass. E2E was not run because it needs a running server. I also ran a temporary probe confirming that `parseConfigInput("session_daily_cap_usd","1e999")` is rejected (zod 4 refuses Infinity), so a typed `1e999` cannot write `null` into jsonb. I deleted the probe afterwards.

## Overall Assessment
The implementation is solid and follows the scenarios.ts / scenarios/* patterns: each page awaits `requireAdmin()`, each service calls `assertAdmin`, the server action re-checks, and learner text goes out as JSX text only (no `dangerouslySetInnerHTML` under admin). Every learner-data read is logged before data is returned. No blocking defects.

## Critical Issues
None.

## High Priority
None.

## Medium Priority

### M1. Admin list queries run full-table aggregates, and llm_call has no index on session_id or attempt_id
- src/db/repo/users.ts:82-115 (`listLearnerRows`): all four CTEs aggregate the whole `session`, `turn`, `generation_attempt` and `llm_call` tables on every list page. `getLearner` (src/server/admin/learners.ts:35) uses the same query for one user. `own_spend` groups by `COALESCE(s.user_id, a.user_id)`, so Postgres cannot push `u.id = $1` into it, and every learner detail view still scans all of `llm_call`.
- src/db/repo/sessions.ts:245 (`listLearnerSessions`): a correlated `sum(cost_usd) FROM llm_call WHERE session_id = ...` runs per row. The only index on llm_call is `(scope, created_at)` (src/db/schema.ts:320), so this means up to 50 sequential scans of llm_call per page.
- Impact: fine at pilot scale. Cost grows linearly with all-time llm_call rows (every turn writes several), and every admin page view pays it.
- Fix, whenever a migration is acceptable: add `index("llm_call_session_idx").on(sessionId)` and `index("llm_call_attempt_idx").on(attemptId)`. Optionally rewrite `own_spend` as the session-owned sum UNION ALL the attempt-owned sum where `c.session_id IS NULL`. That keeps the count-once rule and lets each branch use an index.

## Low Priority

### L1. Repeated query keys make /admin/audit return 500
- src/server/admin/config.ts:44, src/app/admin/audit/page.tsx:10-13. Next passes `?action=a&action=b` as `string[]`. `filter.actionPrefix?.trim()` then throws a TypeError, and an array `admin` gets bound into `eq(...)`. Only an admin can reach this, so the effect is a 500 and nothing more serious. `pageNumber` and `outcomeFilter` already tolerate arrays.
- Fix: normalise with `typeof v === "string" ? v : undefined` before using the value. One small helper next to `pageNumber` in src/server/admin-paging.ts is enough.

### L2. The config change log can record a stale old value when two changes race
- src/db/repo/config.ts:124-130. Under READ COMMITTED, two concurrent `changeConfig` calls on the same key can both read the same `from`. The second log row then says `A → C` where the true sequence was `A → B → C`. The stored value is still correct; only the audit trail is off.
- Fix, if this matters: take `pg_advisory_xact_lock(hashtext(key))` at the start of the transaction. `SELECT ... FOR UPDATE` cannot lock a key that has no row yet.

### L3. Small gaps in "transcript = same as il trace"
- src/server/session-trace.ts:37: `turn.learnerText ?? ""` now prints an empty string where the old CLI printed `null`. This only matters for a turn with index > 0 and a null learner_text, which should not exist, so CLI output is byte-identical in practice.
- src/app/admin/sessions/[id]/page.tsx:36-37: an empty `items` list (for example, no unlock rules) renders as "(không)". The CLI prints just the bare `Luật mở khóa:` header. This is a cosmetic difference between the two views.

### L4. The pager does not clamp out-of-range pages
- src/server/admin-paging.ts:7-12, src/components/admin/pager.tsx:23. `?page=999` renders an empty table with "Trang 999/2" and a "previous" link. The page is still logged as a learner-list read. This is harmless.

### L5. Read logging depends on Link prefetch never rendering pages
- src/server/admin/learners.ts:51 logs during render. Today this is correct: with `cacheComponents` off and the default `prefetch="auto"`, a dynamic page is not rendered on prefetch (checked against node_modules/next/dist/docs/01-app/02-guides/adopting-partial-prefetching.md). If someone later adds `prefetch={true}` to the transcript links in learners/[userId]/page.tsx:63, or turns on cacheComponents with full prefetch, the audit log would record reads nobody made. A short comment, or an explicit `prefetch={false}` on links into logged pages, would make this hold by design.

## Edge Cases Checked (no defect)
- **Spend double counting**: a call that carries both a session_id and an attempt_id counts once, through the session owner, because of `COALESCE(s.user_id, a.user_id)`. Calls from admin drafts (`persona_id` not null, no session) fall into the NULL group and are dropped. The int test covers the 0.02 + 0.03 + 0.05 = 0.1 case.
- **lastSeen**: Postgres `GREATEST` ignores NULLs and `u.created_at` is NOT NULL, so lastSeen is never null. Order is `"lastSeen" DESC, u.id`, which is stable across pages.
- **Timestamps from the raw query** are parsed with `new Date(text)` on timestamptz values. This is verified indirectly: the int test's `lastSeen >= firstSeen` would fail on NaN.
- **Deleted accounts**: the user row cascades sessions and generation attempts, so the account leaves all lists. `moveSpendToLedger` moves session-linked calls into `daily_spend`. Attempt-only calls stay in llm_call as orphans and still count in totals. The int test asserts that the day total is unchanged.
- **Learner custom attempts** keep `persona_id` NULL (custom-topics.ts:332-339 sets the persona on the scenario and the session, not on the attempt). So `isNull(personaId)` correctly includes passed learner attempts and excludes only admin drafts.
- **404 behaviour**: non-UUID and unknown ids return null and then `notFound()`, and nothing is logged. Guests and learners get 404 from both the page and the service. The int test checks all 8 service calls, and the guard test passes for the new files.
- **XSS**: topic text, learner text, persona text, emails and report entries are all rendered as React text. `focusRaw` and `draft` are selected server-side but never rendered or passed to client components.
- **Config**: changes go through `parseConfigInput` and `setConfig` (which re-parses), the value is read on the next request (no cache in `getConfig`), and a refused value writes nothing. Only the stale-old-value race in L2 remains.
- **Audit `starts_with`** is parameterised, so `%` is matched literally. The test covers this.
- **Data notice** (src/strings/product-strings.ts:14-15) already says that admins can read this content, which covers the plan's risk note.

## Plan Follow-ups (for the lead; plan not edited)
- All three success criteria are met: learner-content reads are logged; config changes take effect on the next request and cost-cap.int still passes; deleted accounts drop out of the lists while their spend stays in the totals.
- Deviation: the plan says `src/server/admin/trace.ts`, but the code uses `src/server/session-trace.ts`. This is justified: admin-pages-guard requires `assertAdmin` in every src/server/admin file, and the CLI must not go through that. Record it in the plan.
- Deviation: the plan's "action" filter is implemented as an action-prefix match. This is consistent with the free-text action convention.
- The e2e spec has not been run in this review.

## Recommended Actions
1. (Optional now, before data grows) Add llm_call indexes on `session_id` and `attempt_id` (M1).
2. Normalise array searchParams on /admin/audit (L1).
3. Optionally add an advisory lock in `changeConfig` (L2) and `prefetch={false}` on links into logged pages (L5).

## Metrics
- Type errors: 0. Lint issues: 0.
- Unit: 1160/1160 pass. Focused int: 58/58 pass.

## Unresolved Questions
- Is a migration for llm_call indexes in scope for this branch, or deferred?
