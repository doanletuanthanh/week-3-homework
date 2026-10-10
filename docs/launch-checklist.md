# Launch checklist

What stands between this build and real learners. Status as of 2026-10-09. Sources: PRD §12.2 (launch gates) and §12.4 (launch checklist); the plan `plans/261003-1818-interviewlab-bootstrap-s1-and-custom-topics/`.

Status words: **Done** (built and covered by automated tests that pass locally), **Measure** (the tool exists, the number does not), **User** (needs a person, an account or a decision the build cannot supply), **Out** (not in this slice).

## On the deployed app

Nothing below has been done: the app has not been deployed by this build. Do them in order after the first deploy (`docs/setup.md` part 3).

| # | Check | How | Result |
|---|---|---|---|
| D1 | Google sign-in round trip | Sign in, land on the page asked for. Also once with the page still loading (press "Đăng nhập với Google" at once): the Content-Security-Policy `form-action` must let the form follow Supabase and Google. Locally only the first hop to the auth server is tested | not run |
| D2 | No Content-Security-Policy refusal | On the production address, not a preview one (Vercel adds its toolbar script to previews, and the policy refuses it): play one session with DevTools > Console open; there must be no "Refused to ..." line. Covered locally by `tests/e2e/hardening.spec.ts` on a production build | not run |
| D3 | Turn latency p95 ≤ 6 s (NFR-2) | `pnpm il measure-latency`, see `docs/operations.md` | not measured |
| D4 | Reveal ready ≤ 15 s after "Xem kết quả" (NFR-2) | Same command, several runs for a p95 | not measured |
| D5 | Custom-topic path p95 ≤ 2 min (NFR-2) | Ten sample topics. Locally: 3 of 3 real topics passed (plan, phase 9) | not measured |
| D6 | A real model session end to end | Home → prep → sign-in and notice → interview with notes → guess → result → replay → "Mang về" and print → "Buổi của tôi" (§12.2 item 1 without the library) | not run |
| D7 | The same on a phone | iOS Safari and Android Chrome, for the notes sheet | not run |
| D8 | What the auth server keeps of a deleted account | The queries below | not run |
| D9 | Trace reaches LangSmith with the session id | Open the project after D6 | not run |

If D3 misses: lower the effort of `LLM_ANALYSIS`, or change its model, and measure again. Record the numbers here and in `docs/tech-stack.md`.

### D8: after an account is deleted

With a throwaway Google account: sign in, start a session, note the account's id (`SELECT id FROM "user" WHERE email = '<address>'`), delete the account in "Buổi của tôi", then run these with `psql`, which fills in the two variables: save them as `d8.sql` and run `psql "<DATABASE_URL_DIRECT>" -v user_id=<id> -v email=<address> -f d8.sql`. In the Supabase SQL editor the `:'name'` variables do not work: replace each with the quoted value.

```sql
-- 1. The account and what hangs on it are gone. Expect 0 in every column.
SELECT
  (SELECT count(*) FROM auth.users          WHERE id = :'user_id')      AS users,
  (SELECT count(*) FROM auth.identities     WHERE user_id = :'user_id') AS identities,
  (SELECT count(*) FROM auth.sessions       WHERE user_id = :'user_id') AS sessions,
  (SELECT count(*) FROM auth.refresh_tokens WHERE user_id = :'user_id'::text) AS refresh_tokens,
  (SELECT count(*) FROM auth.mfa_factors    WHERE user_id = :'user_id') AS mfa_factors,
  (SELECT count(*) FROM auth.one_time_tokens WHERE user_id = :'user_id') AS one_time_tokens;

-- 2. The audit log: rows that still name the account.
SELECT id, created_at, ip_address, payload
FROM auth.audit_log_entries
WHERE payload::text ILIKE '%' || :'email' || '%' OR payload::text LIKE '%' || :'user_id' || '%'
ORDER BY created_at;

-- 3. Sign-in flows left half way.
SELECT id, created_at, provider_type, authentication_method
FROM auth.flow_state
WHERE user_id = :'user_id';

-- 4. The role the app connects as may delete the account at all. Expect true.
SELECT has_table_privilege(current_user, 'auth.users', 'DELETE');

-- 5. The app tables hold nothing either; the kept counters have one more row.
SELECT count(*) FROM "user" WHERE id = :'user_id';
SELECT count(*) FROM quota_tombstone;
```

- [ ] Query 1 returns zeros.
- [ ] Query 2: if rows remain, either delete them in `deleteAccount` inside the same transaction, or name the audit log in the data notice and the delete dialog. Write here which.
- [ ] Query 3: if rows remain, delete them in `deleteAccount` by `user_id`.
- [ ] Query 4 is true and query 5 shows 0 and one more row.

On the local stack `deleteAccount` removes the `auth.users` row with its identities (`tests/server/delete-account.int.test.ts`). What the hosted auth server writes to its audit log is not known until this is run.

## PRD §12.2 launch gates

| # | Gate | Status | Evidence or what is missing |
|---|---|---|---|
| 1 | End-to-end demo on the deployed URL | User | D6, D7. The same path passes locally against the model stub (`tests/e2e/`). Library screens are out of this slice |
| 2 | Each curated persona passes `validate` and the full evaluation | User | `validate` passes for chị Thu. Quick runs recorded (plan, phase 4): the good run opens 36 % of the items against the 50–75 % target. No full run, no second adjudicator yet |
| 3 | Context isolation | Done | `tests/engine/contexts-isolation.test.ts`, `tests/eval/attacks-and-isolation.test.ts`, `tests/server/replay.int.test.ts` |
| 4 | Unlock gate | Done | `tests/engine/unlock.test.ts`, `tests/engine/plan-turn-adversarial.test.ts` |
| 5 | Replay | Done | `tests/engine/select-replay.test.ts`, `tests/server/replay.int.test.ts`, `tests/server/sealed-payloads.int.test.ts`, `tests/e2e/replay.spec.ts` |
| 6 | Call counts | Done | `tests/server/run-turn.int.test.ts`, `tests/server/replay.int.test.ts`, `tests/server/reveal.int.test.ts`. On scripted models; a real 30-turn log comes with D6 |
| 7 | Judgement gates (NFR-7) | User | The harness and starter sets of 8–18 lines exist. Each gate needs a hand-labelled set of 100 or more |
| 8 | Latency | Measure | D3, D4, D5 |
| 9 | Who can see and delete | Done, D8 open | `tests/server/access-isolation.int.test.ts`, `tests/e2e/access-isolation.spec.ts`, `tests/server/delete-account.int.test.ts`. Console routes are out of this slice |
| 10 | "Buổi của tôi" and navigation | Done | `tests/e2e/session-states.spec.ts`, `tests/e2e/my-sessions.spec.ts` |
| 11 | Cost cap and queue | Done | `tests/server/cost-cap.int.test.ts`, `tests/e2e/turn-engine.spec.ts`, `tests/server/custom-quota.int.test.ts`. "Turn p95 ≤ 6 s while a full evaluation runs" is not applicable when the CLI uses the batch keys, and is measured with D3 when it shares a key with live turns |
| 12 | Trace and seed | Done, real run open | `tests/cli/config-and-trace.int.test.ts`, `tests/cli/seed-demo.int.test.ts`. A real `seed-demo` run and the home screenshot taken from it are open |
| 13 | Notes canvas | Done | `tests/server/canvas.int.test.ts`, `tests/e2e/interview-screen.spec.ts`, `tests/e2e/interview-mobile.spec.ts`. Real phones: D7 |
| 14 | "Tạo chủ đề của bạn" | Done with a deviation | `tests/server/custom-topic.int.test.ts`, `tests/server/custom-quota.int.test.ts`, `tests/e2e/custom-topic.spec.ts`. The reduced evaluation of FR-54 was dropped (user decision 2026-10-09): a generated scenario is only lightly checked, and the "≥ 6 of 10 sample topics" bullet does not apply as written |
| 15 | Method page | Done | `/phuong-phap` answers 404 and nothing links to it (`tests/e2e/hardening.spec.ts`) |
| 16 | Interim gate | User | chị Thu has no full run, so no flag to clear. Until then it is played as a draft: `require_published` is `false` (user decision 2026-10-03) |

Security hardening added by this build, outside the PRD's numbering: security headers and a nonce-based Content-Security-Policy on every response; learner text with HTML renders as text in the question, the notes and the custom-topic fields (`tests/server/escape-render.test.tsx`, `tests/e2e/hardening.spec.ts`).

## PRD §12.4 checklist

| Item | Owner | Status |
|---|---|---|
| Test sessions with 5–8 students, two rounds | User | Not started |
| Second adjudicator, briefed and tried on 10 flags before the first full evaluation | User | Not found yet |
| A practising BA/PM reader (FR-65) | User | Out of this slice (S4) |
| Interim gate re-run for the S1–S2 personas | User | Out of this slice (after S3) |
| Method page: academic research, final wording, then open the route | User | Not started; the route stays 404 |
| Demo transcript | Done | `evalsets/demo/chi-thu-transcript.json` |
| LLM providers do not train on the data (NFR-9) | User | Switch the Gemini key to a billing-enabled project and check the OpenAI setting. Free-tier Gemini content is used to improve Google products |
| Accounts and limits | User | Fill `DEMO_ACCOUNT_EMAILS` and `ADMIN_EMAILS`; run `seed-demo`; accept the notice once on each demo account; set the caps with `pnpm il config set` (defaults: sessions 5 USD/day with 1 USD for demo, generation 10 USD/day; the PRD suggests 30 and 50) |
| Vietnamese personal-data rules | User | Needs a qualified reviewer. Three things to show them: full prompts and replies go to LangSmith and outlive account deletion until its retention ends; anonymous counters and the personas played survive deletion under a keyed hash; model providers are outside Vietnam |
| Internal play-testing uses an account outside `ADMIN_EMAILS` | User | A habit, not a build item |
| Design removes what the prototype had against the PRD | Partly checked | The turn API returns the persona's text and nothing else, so no live warning or openness meter can be shown. The wording of every screen was not re-read against NFR-14 and FR-63 here |

## Other things to settle before real learners

- Move off Vercel Hobby if the product charges anyone (non-commercial use only).
- Supabase free projects pause after about 7 days of low activity.
- LangSmith free plan: 5,000 traces a month, up to about 70 per session. Sample or pay beyond about 70 sessions a month.
- Nothing checks that a generated persona keeps its items sealed before a learner plays it (plan, open question 8). The labels, the report button and `pnpm il custom takedown` are what there is.
- Where real evaluation runs live: the tests empty the local database (see `docs/operations.md`).
- `Strict-Transport-Security` is sent with `includeSubDomains` for two years: on a custom domain, every subdomain of it must serve https.
- A refusal of the Content-Security-Policy in a learner's browser is reported nowhere (no `report-to`).
- The Content-Security-Policy allows inline styles (`style-src 'unsafe-inline'`), because components size blocks with `style` attributes. Scripts are nonce-only.

## Not built in this slice

The S2 library, the S3 Review Console, the S4 BA/PM personas, and the method page.
