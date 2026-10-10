---
title: "Phase 10: Hardening docs and launch checks"
status: in-review
phase: 10
priority: P2
effort: "2d"
dependencies: [9]
---

# Phase 10: Hardening, docs, launch checks

## Overview

Measure what the PRD asks to be measured on the deployed app, close the cap and security checks, write the setup and operations docs, and hand the user an explicit list of what remains before real learners.

## Context links

- PRD NFR-2, NFR-5, FR-37, FR-62; §12.2 items 1, 8, 11, 15; §12.4 checklist. `docs/tech-stack.md` "Before real learners".

## Requirements

- [ ] p95 turn latency and p95 reveal readiness measured on the Vercel deployment and recorded.
- [x] Cost-cap behaviour proven: lowering the cap to current spend blocks new sessions with the message, running sessions finish reveal and replay, demo accounts still start, custom sessions are blocked at their first turn.
- [x] Security headers including a Content-Security-Policy; learner text with HTML renders escaped everywhere.
- [x] `/phuong-phap` returns 404 and the footer has no link to it.
- [ ] CI runs typecheck, lint, unit tests and build on every push. (Workflow written; it has not run on GitHub yet.)
- [x] Docs: setup, operations, and the launch checklist.
- [ ] What Supabase Auth keeps about a deleted account is checked on the deployed project (checklist below), and the launch checklist records the answer.
- [x] Accessibility notes carried over from the phase 8 review are closed (list below).

## Architecture

- `cli/commands/measure-latency.ts`: drives one 30-turn session against a deployed base URL with a demo account token, prints p50/p95 for turns and the reveal wait. Uses real models; cost is one session.
- Docs (smallest owning surfaces):
  - `README.md` — what the product is, quick start, links.
  - `docs/setup.md` — Supabase project, Google OAuth, keys, env vars, migrations, first persona import, Vercel deploy.
  - `docs/operations.md` — CLI command reference by task (author, validate, eval, adjudicate, approve strings, publish, trace, seed-demo, custom topic operations, config), test-set file format, cost notes.
  - `docs/launch-checklist.md` — PRD §12.4 items with owner and status; items the build could not do are marked as user tasks.
- CI: one GitHub Actions workflow; integration tests run with a Postgres service container.

## Related code files

- Create: `cli/commands/measure-latency.ts`, `.github/workflows/ci.yml`, `README.md`, `docs/setup.md`, `docs/operations.md`, `docs/launch-checklist.md`, `tests/server/cost-cap.int.test.ts`, `tests/server/escape-render.test.tsx`
- Modify: `next.config.ts` (headers), `docs/tech-stack.md` (measured numbers, any stack change made during the build), `src/components/site-footer.tsx`

## Implementation steps

1. Cost-cap integration tests for the four cases above plus "generation budget exhausted blocks attempts but not sessions".
2. Security headers and CSP; verify fonts, Supabase and the app's own API still load.
3. Escaping test with `<script>` and `<img onerror>` in question, canvas and topic fields.
4. CI workflow.
5. Deploy; run `measure-latency`; record numbers in `docs/tech-stack.md`. If turn p95 > 6 s, lower effort or swap the Call 1 model and re-measure.
6. Manual end-to-end demo on the deployed URL on desktop and on a phone (iOS Safari and Android Chrome for the notes sheet).
7. Write the four docs; verify every command and path in them by running it.
8. Compare the result with the plan's success criteria and the opening contract; list gaps plainly.

## Todo

- [x] Cost-cap tests
- [x] Headers + CSP
- [x] Escaping tests
- [x] CI (written, not yet run on GitHub)
- [ ] Latency measured and recorded
- [ ] Manual demo desktop + mobile
- [x] Docs written and verified
- [x] Gap list against acceptance criteria (`docs/launch-checklist.md`)

## Success criteria

- [ ] §12.2 items 1 (without library screens), 8 (turn and reveal; custom-path number from phase 9), 11 (the "p95 ≤ 6 s while a full eval runs" bullet is measured whenever eval shares an API key with live turns; with a separate batch key it is recorded as not applicable), 15.
- [ ] CI green on the branch.
- [ ] A person following `docs/setup.md` on a clean machine reaches a running local app.

## Carried over from phase 8

### After an account is deleted: what the auth server still holds

`deleteAccount` removes the row of `auth.users`, and with it the identities and login sessions. Supabase Auth also writes tables the app never touches. Run this on the deployed project, as part of the deploy, with a throwaway Google account: sign in, start a session, delete the account in Buổi của tôi, then run the queries with the account's address and id.

```sql
-- 1. The account and what hangs on it are gone. Expect 0 in every column.
SELECT
  (SELECT count(*) FROM auth.users          WHERE id = :'user_id')      AS users,
  (SELECT count(*) FROM auth.identities     WHERE user_id = :'user_id') AS identities,
  (SELECT count(*) FROM auth.sessions       WHERE user_id = :'user_id') AS sessions,
  (SELECT count(*) FROM auth.refresh_tokens WHERE user_id = :'user_id'::text) AS refresh_tokens,
  (SELECT count(*) FROM auth.mfa_factors    WHERE user_id = :'user_id') AS mfa_factors,
  (SELECT count(*) FROM auth.one_time_tokens WHERE user_id = :'user_id') AS one_time_tokens;

-- 2. The audit log: rows that still name the account, with what they hold.
SELECT id, created_at, ip_address, payload
FROM auth.audit_log_entries
WHERE payload::text ILIKE '%' || :'email' || '%' OR payload::text LIKE '%' || :'user_id' || '%'
ORDER BY created_at;

-- 3. Sign-in flows left half way (PKCE): rows of the account.
SELECT id, created_at, provider_type, authentication_method
FROM auth.flow_state
WHERE user_id = :'user_id';

-- 4. That the role the app connects as may delete the account at all. Expect true.
SELECT has_table_privilege(current_user, 'auth.users', 'DELETE');
```

- [ ] Query 1 returns zeros.
- [ ] Query 2: if rows remain, decide between removing them in `deleteAccount` (`DELETE FROM auth.audit_log_entries WHERE payload::text LIKE …`, inside the same transaction) and naming the audit log in the data notice and the delete dialog. Either way the launch checklist says which.
- [ ] Query 3: if rows remain, delete them in `deleteAccount` by `user_id`.
- [ ] The app tables hold nothing either: `SELECT count(*) FROM "user" WHERE id = :'user_id'` is 0, and `quota_tombstone` has one more row.

### Accessibility notes from the phase 8 review

- [x] The delete dialog (and the stop, skip and end dialogs of phases 5 and 7) tie their consequence sentence to the dialog with `aria-describedby`; `Dialog` takes the id.
- [x] The skeletons' `aria-busy` and label sit on an element with a role (`role="status"`), so the wait is announced.
- [x] Rows added by "Tải thêm" are announced (a polite live line with how many were added), and focus stays on the first new row.
- [x] `WithdrawnScreen` and the transcript drawer share one transcript row component.

## Risk assessment

- **Latency targets may not be met with reasoning models.** The plan reports the measured numbers and the cheapest lever, and does not hide a miss.
- **CSP can break OAuth redirects or font loading.** Mitigation: step 2 verifies each origin before deploy.

## Not done by this plan (stated in the launch checklist)

- NFR-7 hard gates (need ≥ 100 hand-labelled items per set).
- Full eval and two-person adjudication of chị Thu; interim-gate publish. Until then the persona is played as a draft (`require_published` false, user decision), and the launch checklist says so.
- Student test sessions; second adjudicator; Vietnamese personal-data review; provider training opt-out check on a paid key.
- S2 library, S3 Console, S4 BA/PM personas, the method page.

## Status (2026-10-09)

Done in code, tests and docs. Open, all needing the deployed project or a person: the deploy itself, latency (`pnpm il measure-latency`), the manual demo on desktop and phones, the auth-table queries after an account is deleted, and a first CI run on GitHub. `docs/launch-checklist.md` lists each as D1–D9.

Reports: `plans/reports/tester-261009-1425-phase-10-hardening.md`, `plans/reports/code-reviewer-261009-1425-phase-10-hardening.md`.

Decisions made while building:

- **The Content-Security-Policy carries a nonce per request and is set in `src/proxy.ts`**; the fixed headers are in `next.config.ts`. Every route is rendered per request, so no page is left without a nonce. `style-src` allows inline styles, because components size blocks with `style` attributes. `form-action` names the auth server and `accounts.google.com`: the sign-in form posted before scripts load follows those redirects. Locally only the hop to the auth server can be tested.
- **The bundled Next.js docs could not be read** (a shell hook blocks `node_modules`). The wiring was checked by Playwright on a production build instead: the nonce is on every script, a whole session raises no refusal, an inline handler and a string given to a timer do not run.
- **CI starts the Supabase stack, not a bare Postgres container**: the tests create and delete sign-in accounts in the `auth` schema. A production build needs no environment (checked with `.env.local` moved aside).
- **`measure-latency` takes a session started in the browser and the account's `Cookie` header** (`IL_MEASURE_COOKIE`). A session is started by a server action, so there is no API to start one from the command line. The reveal wait is measured from a guess sent at once, the longest wait there can be; one run is one reveal sample.
- **The end-session dialog has no `aria-describedby`**: it has no consequence sentence, its title ("Kết thúc và đóng băng ghi chú?") says what ending does. No sentence was added, since fixed strings are approved product text.
- **The skeletons no longer set `aria-busy`.** The note asked for `aria-busy` and the label on an element with a role. A region marked busy holds its announcements back, and a fallback never stops being busy, so the status line (`role="status"`) stands in a parent without it. Not checked with a screen reader.
- **"Tải thêm" says "Đã thêm N buổi, đang hiện M buổi."** The total makes the line of each load a new one; the same line twice is not read out twice.
- **The cap is compared in millionths of a dollar** (`src/server/cost-cap.ts`). In floating point `1.3 - 1` is above `0.3`: with the cap typed as the spend plus the reserve, a spend on an exact cent let one more session start. Found by the review of this phase.
- **`tests/e2e/interview-screen.spec.ts` "shows nothing sealed…" failed before this phase too** (checked on the last commit): after a reload the loading state and the screen are both on the page for a moment, and the test read `main`, which was then two elements. It now reads the interview screen itself.

Left open:

- No test sends a refreshed session cookie through the proxy (`setAll`), so the policy on that path is known from reading only.
- A URL ending in an image extension skips the proxy (its matcher), so its not-found page has no Content-Security-Policy. No learner text is on that page.
- A refusal of the policy in a learner's browser is reported nowhere.
- `canStartSession` checks and then creates, without a lock: the cap is soft by the sessions that start at the same moment. As before this phase.
- Whether NFR-2's 6 s is to the end of the reply or to its first text. `measure-latency` prints both and judges the end.
