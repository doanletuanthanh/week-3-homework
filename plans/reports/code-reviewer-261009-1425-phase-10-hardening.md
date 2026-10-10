# Code review: phase 10 (hardening, docs, launch checks)

Date 2026-10-09. Scope: uncommitted working tree (15 changed, 14 new files). Advisory only; no source touched.

## What I ran, and what I did not

- Ran: `pnpm typecheck` (exit 0), `pnpm lint` (exit 0), `pnpm test` (47 files, 920 tests, all pass).
- Not run (shared database and `.next` in use by another agent): `pnpm test:int`, `pnpm test:e2e`, `next build`. Everything said below about `tests/server/cost-cap.int.test.ts` and `tests/e2e/hardening.spec.ts` is from reading them, not from a run of mine.
- Not read: Next.js bundled docs and `.next` output (shell hook). CSP wiring in `src/proxy.ts` rests on the Playwright evidence the lead reported.
- Two small Node probes: float behaviour of `cap - reserve`, and what `fetch` prints for a bad `cookie` header.

## Acceptance criteria

| | Verdict | Note |
|---|---|---|
| (a) cost cap | Met by reading | All five cases have a test with real paths. Not executed by me. See L1, L5 |
| (b) headers + CSP, escaping | Met | Unit tests pass; source scan finds no `dangerouslySetInnerHTML`/`innerHTML` under `src/` |
| (c) `/phuong-phap` 404, no link | Met by reading | No reference in `src/`; e2e asserts 404 and no link |
| (d) CI | Written, not proven | Never run on GitHub (`.github/` untracked). The env-less build is unverified: H1 |
| (e) docs match repo | Met except two claims | M3, M4. Commands, paths, env vars, config keys and defaults, cited test files all checked and exist |
| (f) accessibility notes | Met as specified, with two functional doubts | M1, M2. End dialog not touched: see L8 |

## Must fix before commit

### H1 (High, unverified). CI's `pnpm build` runs with no environment at all
`.github/workflows/ci.yml:27`. `src/instrumentation.ts` calls `getEnv()` and `process.exit(1)` on a bad environment. No build in this repo has ever run without one: locally `.env.local` exists and `next build` loads it; Playwright passes `appEnv()`. If Next.js 16.3 runs `register()` in its build workers (older versions did, which is why `NEXT_PHASE` guards are common), the `checks` job fails on every push with "Invalid environment configuration". I could not run a build to settle it.
Check: once the Playwright run ends, move `.env.local` aside and run `pnpm build`. If it fails, give the step the placeholder values `tests/e2e/helpers/stack.ts` `appEnv()` already holds, rather than weakening the startup check.

### M1 (Medium). The second "Tải thêm" announces nothing
`src/components/sessions/session-list.tsx:71-73`. Pages are 20 rows, so loads two and three both render `Đã thêm 20 buổi.`. The text node does not change, React leaves the DOM alone, and a live region with no mutation is not read. Focus still moves, so the user is not lost, but the count the note asked for is silent from the second load on. The e2e test loads once (`hardening.spec.ts:275-300`), so it cannot see this.
Fix: make the sentence differ per load, for example with the running total (`Đã thêm 20 buổi, đang hiện 60.`). Add a second click to the test.

### M2 (Medium, from the ARIA spec; not checked with a screen reader). The status line sits inside `aria-busy="true"`
`src/components/ui/page-skeletons.tsx:12-13, 43-44, 79-80`. `aria-busy="true"` on a container tells assistive technology to hold back changes inside it until it turns false, and it never turns false: the fallback is replaced. So the one element meant to announce the wait is inside the region marked "do not announce yet". `tests/components/loading-and-dialog-a11y.test.tsx:24` asserts exactly that nesting, so the test locks the doubt in. Separately, a `role="status"` node inserted already holding its text is announced inconsistently across readers.
Fix: drop `aria-busy` from the wrapper (the blocks are already `aria-hidden`), or put `SkeletonStatus` outside it. Update the test's regex.

### M3 (Medium, docs). The D8 queries cannot run where the checklist says to run them
`docs/launch-checklist.md:27` says "run these in the Supabase SQL editor"; the queries (`:29-56`) use `:'user_id'` and `:'email'`, which is psql variable syntax. The SQL editor returns a syntax error at the first colon.
Fix: say `psql "$DATABASE_URL_DIRECT" -v user_id=... -v email=... -f ...`, or write plain placeholders to replace by hand.

### M4 (Medium, docs). "Set the cap to what has been spent plus the reserve" has no way to read what has been spent
`docs/operations.md:94`. No CLI command prints the day's session spend (`sessionSpendToday` is used only by `canStartSession`; `il config list` shows settings). An operator following the sentence has to write SQL against `llm_call` and `daily_spend` in UTC+7 by hand. Either give the query in the doc, or print today's spend next to the cap in `il config list`. Tied to L1.

### L0 (Low, trivial). Comment now describes the wrong command
`cli/index.ts:74-75`. "Reads the whole environment as the app does, so a bad value stops the command before it starts a session" belongs to `seed-demo`; the `measure-latency` line was inserted between the comment and its command. `measure-latency` reads one variable and never calls `getEnv()`. Move the new line above the comment.

## Nice to have

### L1. `spent < cap - reserve` on float8: a real boundary error, narrow in practice
`src/server/cost-cap.ts:38`. Answer to the question asked: yes, the rounding in `lowerCapToCurrentSpend` hides it, and so does the choice of 0.25 (exact in binary). Probe: with `cap = spent + reserve` typed to the cent and spend exactly on a cent, the learner is **not** blocked in 127 of 2,000 cent values at reserve 1 (621 of 10,000 across reserves 0.1 to 2); for example spend 0.30, cap 1.30 gives `1.3 - 1 = 0.30000000000000004`. With spend that has more decimals than a cent, rounding the cap down always blocks (0 of 2,000).
Operator impact: real token costs are almost never an exact cent, and the error admits one session, after which spend moves past the limit. So Low. But the test name "is exact at the limit" (`cost-cap.int.test.ts:57`) claims more than the code gives. Either compare in whole micro-dollars (`Math.round(x * 1e6)`), or rename the test and state the tolerance.

### L2. `measure-latency` and the session cookie
`cli/commands/measure-latency.ts`. The cookie is never printed on the paths the tests cover and goes only to `${origin}/api/sessions/...`; Node's `fetch` drops `cookie` on a cross-origin redirect. Three gaps:
- `:66,78`: a cookie pasted with a line break inside makes `fetch` throw `TypeError: Headers.append: "<the whole cookie>" is an invalid header value` (probed on Node 22). It is not a `CliError`, so `cli/index.ts:93-96` prints it with a stack. Validate the cookie as one line of printable ASCII up front, with a message that does not echo it.
- `:51`: `http://` is accepted for any host, so a mistyped scheme sends the sign-in in clear text before any redirect to https. Refuse non-https except localhost/127.0.0.1.
- A run takes minutes. If the access token expires mid-run, the proxy refreshes it, the CLI keeps sending the old refresh token, and after Supabase's reuse window the session is revoked for the browser too. The error text already says the cookie ran out; `docs/operations.md:61-69` should say to copy the cookie right after signing in. It also shows the cookie inline on the command line, which lands in shell history.

### L3. URLs ending in an image extension skip the proxy
`src/proxy.ts:43`. `/prep/x.png` or `/anything.svg` renders the not-found page with no CSP and no session refresh (fixed headers from `next.config.ts` still apply). No learner text is on that page, so no exposure today; worth one line in the comment so nobody adds a route whose last segment can end that way.

### L4. CSP on Vercel
- Sound as written: nonce (122 bits) plus `strict-dynamic`, no `unsafe-inline`/`unsafe-eval` in production, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'` with `X-Frame-Options: DENY`, `form-action` built from `URL.origin` so the env value cannot inject a directive. `img-src 'self' data:` is enough: avatars are inline SVG, nothing uses blob or a remote image. Dev additions are dev-only.
- Preview deployments inject the Vercel toolbar from `vercel.live`; the policy blocks it. Checklist D2 ("no Refused to ... line") will fail on a preview URL for that reason alone. Say in D2 to run on the production deployment or with the toolbar off.
- `form-action` past the first hop is untested by design (D1 says so). Keep D1 as a hard gate: a signed-in Google user with consent already given goes self → Supabase → Google → Supabase → self in one redirect chain.
- No `report-to`/`report-uri`: a violation in production is invisible. Optional.
- `Strict-Transport-Security ... includeSubDomains`: fine on `*.vercel.app`; on an apex custom domain it pins every subdomain to https for two years. Note it in `docs/setup.md` part 3.

### L5. Test quality
- `tests/server/cost-cap.int.test.ts:53` asserts a constant against a literal; it cannot fail for any reason connected to the cap. The message on the page is covered by `tests/e2e/turn-engine.spec.ts:192-193`; delete the line or leave it to the e2e.
- `:75-76`: the comment says the learner's own session is still handed back, the assertion checks that a different learner is blocked. Assert `openSession(db(), learner, PERSONA_ID)` returns the running session, which is the behaviour `src/server/sessions.ts` promises.
- `tests/server/escape-render.test.tsx`: the render cases hold by React's own guarantee; the test that guards the codebase is the source scan at `:116-119`. Fine as is.
- No test drives `proxy` through `setAll` (a refreshed cookie). By reading it is correct: see below.

### L6. `.github/workflows/ci.yml`
- `pnpm/action-setup@v4` with no `version` reads `packageManager`; it is placed before `setup-node` with `cache: pnpm`. Correct.
- `supabase` ships its binary as platform packages (`@supabase/cli-linux-x64` in the lockfile), so `allowBuilds` in `pnpm-workspace.yaml` does not need it. `supabase/config.toml` has studio, realtime, storage, analytics off, so the start is short.
- Both Playwright projects are Chromium; `install --with-deps chromium` is enough.
- Add `permissions: contents: read`. `on: push` plus `pull_request` runs a pull request's branch twice; `cancel-in-progress` also cancels a run on `main` when the next push lands.

### L7. Float and race, not from this diff
`canStartSession` is check-then-create with no lock: N starts at the boundary all pass. Pre-existing soft cap; noted only.

### L8. End dialog
`src/components/interview/end-session-dialog.tsx:18` has no `describedBy`. It has no consequence sentence either: the title "Kết thúc và đóng băng ghi chú?" carries it. Acceptable; the phase note lists the end dialog, so record the reason in the plan.

## Regression checks (explicit check 2)

- **Proxy.** The CSP is put on `request.headers` before the first `NextResponse.next({ request })`; `setAll` re-creates the response from the same mutated request, so the forwarded request carries the policy on both paths. `response.headers.set` runs after `getClaims()` on whichever object is current, so the final response carries it on both paths. Cookie handling is unchanged. A `getClaims()` that throws gives a 500 without CSP, as before.
- **Session list dedupe.** Equivalent to the functional update: `items` only changes inside `loadMore`, and `loading` is flushed between two clicks, so the closure is never stale when it matters. Two calls from the same render would both compute the same array and overwrite, not append. Every row has a link, so the focus target always exists.
- **Transcript drawer.** `li.turn[.now][data-turn]`, `.turn-k`, the "Dẫn dắt" label and `LearnerText` come out as before; the scroll and highlight selectors still match.
- **Withdrawn screen.** `.turn + .turn` still applies (siblings inside the `ol`); `.turn .k` and `.turn .who-l` still match; `.turn-list` resets the list. The label is now wrapped in `.turn-k` (a column flex), which does not change a single-child cell. Rows gain `data-turn`.

## Contracts (explicit check 3)

No change to API responses, schema, env vars read by the app, config keys or existing CLI commands. New: CLI `measure-latency`, `IL_MEASURE_COOKIE` (CLI only, absent from `.env.example`, which is right), `Dialog` prop `describedBy` (optional), response headers, unit project now includes `tests/**/*.test.tsx`.

## Conventions (explicit check 4)

Kebab-case files, plain-word comments, Vietnamese CLI output through `CliIo`, real HTTP stub instead of mocks, no plan or phase ids in code or test names. `TranscriptTurn` has two real callers. No scope drift found.

## Plan follow-ups for the lead

Complete by reading: cost-cap tests, headers + CSP, escaping tests, CI file, docs, accessibility notes. Open: latency measured, manual demo, D8, "CI green on the branch" (needs a push), and the items above.

## Unresolved questions

1. Does `next build` on 16.3 call `register()` in `src/instrumentation.ts`? Decides H1.
2. M2: was nesting the status line inside `aria-busy` a deliberate reading of the phase 8 note, or an oversight? A screen-reader check would settle it.
3. L1: should the cap comparison be made exact, or is "to within float error, one session" the accepted meaning of the limit?
4. Is NFR-2's 6 s turn target meant to the end of the reply (what the verdict uses) or to the first text (also printed)?
