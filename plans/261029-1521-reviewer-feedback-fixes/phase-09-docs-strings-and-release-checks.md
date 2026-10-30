---
phase: 9
title: "Docs, strings and release checks"
status: pending
priority: P1
effort: "1d"
dependencies: [1, 2, 3, 4, 5, 6, 7, 8]
---

# Phase 9: Docs, strings and release checks

## Overview

This phase does six things:

- Record the changed rules in docs.
- Get the changed fixed strings checked and approved.
- Put the OpenAI model chains on production (phases 4–6).
- Migrate production in the right order around the deploy.
- Run every gate.
- Accept everything on production in one round: the five reviewer fixes and the provider switch.

**Urgent path (2026-10-30):** if step 0 finds production down because the Gemini credit is spent, run steps 0, 3a, 2 and 3b right after phase 5, with only phases 4–5 in the deploy. Run the rest of this phase later, as written.

## Context

- Vercel deploys from the repository (Git integration, `docs/setup.md` §3). CI (`.github/workflows/ci.yml`) runs typecheck, lint, unit and build, then int and e2e on a local Supabase stack. The user sets env vars in the Vercel dashboard, and an env change needs a redeploy.
- Prod migrations are manual: `pnpm db:migrate` against `DATABASE_URL_DIRECT` (`docs/setup.md:61`). The Supabase free project pauses after about 7 idle days (memory note), so check that it answers first.
- Fixed strings:
  - `pnpm il check-strings product` (FR-36) makes one model call per changed string, on `LLM_STRING_CHECK`, now OpenAI Luna.
  - Then an admin runs `pnpm il approve-strings product approve --all` (FR-60).
  - `pnpm il publish` refuses every persona until the product strings are approved. Learners are not blocked while `require_published` is `false` (`docs/launch-checklist.md` row 16).
- Docs that state the old rules:
  - `docs/tech-stack.md`: Deviations; Models row `:16` ("Gemini only…"); `:44` (Gemini free-tier data use).
  - `docs/launch-checklist.md:100`: the personal-data row says "anonymous counters and the personas played survive deletion under a keyed hash".
  - `README.md`: first paragraph.
  - `docs/operations.md` names neither the tombstone nor FR-5, and the checklist has no FR-5, missed-list or progress row. Nothing to change there.
- `LLM_EVAL_INTERVIEWER` is set in `.env.local` but is in no role list (`src/llm/roles.ts`). It is a stale variable.
<!-- Updated: Validation Session 1 - doc targets corrected by verification -->

## Requirements

- Docs say what is true after this release, in the smallest owning place. Plans stay records.
- Migration order:
  1. 0016 (index swap) on prod.
  2. Deploy.
  3. A separate commit with 0017 (drop `played_persona_ids`).

  `pnpm db:migrate` applies every pending file, so 0017 must not exist in the repo when 0016 is applied.
- Any paid step runs only after the user approves it with its estimate, asked right before it runs (user decision 2026-10-29). Steps 3b and 6 count toward the ≤ 1 USD of D12.
- Never print `.env.local` or Vercel values. Reports list variable names only.

## Implementation Steps

0. **Is production down?** This step is free. Send one turn as the demo account, or read the newest `llm_call` rows with `ok = false`. `pnpm il cost-report --days 1` doubles as the DB health check. Report the finding, and take the urgent path if production is down.
1. **Docs:**
   - `docs/tech-stack.md` Deviations:
     - "FR-5 is lifted (user decision 2026-10-29): a learner may start a persona again after finishing it; one unfinished session per persona; only `session_daily_cap_usd` bounds spend."
     - "Màn 6 no longer lists untold items: up to 3 hints (topic, how to ask, a suggested question shown on a tap), a count for the rest."
   - `docs/tech-stack.md` Models row:
     - OpenAI primary (Terra / Luna / Sol per `plans/reports/model-tiering-261030-openai.md`), with a Google fallback per role.
     - The chain syntax `LLM_<ROLE>=spec[,spec…]`.
     - Replace the Gemini free-tier line with how the OpenAI API uses data, checked against current OpenAI docs before writing.
   - `docs/setup.md`: the env section, if it names the `LLM_*` format or Gemini as required.
   - `docs/launch-checklist.md:100` changes in step 4's commit, not here, because it must match the column's state. D8 query 5 ("the kept counters have one more row") stays true.
   - `README.md`: the first paragraph mentions hints for next time and retrying a persona. It names the provider only if it already does.
   - Leave the untracked talk notes (`docs/loi-thoai-thuyet-trinh-interviewlab.md`, `docs/vi-du-tao-kich-ban-chu-de-cua-ban.md`) as they are. Mention in the report that slide 19 ("đáp án được giữ kín…") still holds and that other lines describe the old result screen.
2. **Gates:** `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e && pnpm build`.
3. **Prod env, DB and deploy:**
   - a. The user sets the final `LLM_*` chains from the phase 5 report and `OPENAI_API_KEY` on Vercel. Keep `GOOGLE_API_KEY` for the fallback, and remove `LLM_EVAL_INTERVIEWER` wherever it is set.
   - b. Health check → `pnpm db:migrate` (applies 0016) → push, and Vercel deploys. Check the deploy log for env parse errors. Confirm the new code serves: retry works, and `pnpm il cost-report --days 1` shows `gpt-6*` models with no fallback rows. Run `pnpm il measure-latency` for NFR-2 (p95 ≤ 6 s) and record the number; report a miss, do not fix it here.
4. **Column drop**, as its own commit after step 3:
   1. Remove `playedPersonaIds` from `src/db/schema.ts`.
   2. `pnpm db:generate` → 0017 (`DROP COLUMN played_persona_ids`).
   3. `pnpm test:int`.
   4. `pnpm db:migrate` on prod.
   5. Push.

   The order is safe now, because no deployed code names the column. User decision 2026-10-29: drop it. In the same commit, `docs/launch-checklist.md:100` drops "and the personas played", so only anonymous counters survive deletion.
5. **Strings** (paid, ask first; changed strings only, a few cents at most): `pnpm il check-strings product` → fix any that fail → an admin runs `pnpm il approve-strings product approve --all`.
6. **Production acceptance** (paid, about 0.15 USD, ask first). One line per item, with a screenshot of each next to the reviewer's:
   - F1: tab icon (hard reload).
   - F3: finished persona → "Luyện lại từ đầu" → turn 0.
   - F4: the result shows ≤ 3 hints and a count line. Search the DevTools Network/RSC payload for two untold item texts of that persona; neither appears.
   - F5: takeaway voice on a real session, checked with phase 7's word caps and the `voice-judge` reading (every comment plain). One chị Thu session covers F3, F4 and F5.
   - F6: progress after two sessions with one persona shows "→" lines and no "%". The second session is the retry.
   - Models: the same sessions run on OpenAI, and one custom topic generates on Sol with every visible field judged plain by the `voice-judge` reading.
7. **Report and close:**
   - Write `plans/reports/manual-test-261029-reviewer-feedback-fixes.md`: results, env applied (names only), latency, cost spent in phases 5, 6 and 9, and screenshots.
   - Check that memory `llm-budget-zero-paid-calls` still matches (it was updated on 2026-10-30).
   - Mark phases with `ak plan check`.
   - Write a journal entry.

## Todo

- [ ] Production state checked
- [ ] Docs updated
- [ ] All gates green
- [ ] Vercel env set (user)
- [ ] 0016 on prod → deploy → OpenAI confirmed
- [ ] Column-drop commit with 0017 + checklist line 100
- [ ] Strings checked + approved (paid step approved by user)
- [ ] Production acceptance F1, F3, F4, F5, F6 + models + report

## Success Criteria

- [ ] Every success criterion in `plan.md` is checked with evidence.
- [ ] Production `llm_call` rows for the acceptance run show OpenAI models only.
- [ ] The reviewer re-checks the PDF points on production.

## Risk Assessment

- Dropping the column while the old code still serves breaks account deletion and session start (`listPlayedPersonas` reads it). Apply 0017 only after step 3 is confirmed.
- A paused Supabase: health check first, and restore it from the dashboard if it is down.
- A Vercel env typo fails env parsing at boot. `getEnv()` names the bad variable, so check the deploy log right after the redeploy.
- The Google fallback key has no credit, which matters only when OpenAI fails. That is accepted, because it is no worse than today.
- Acceptance costs real credit. One real session covers F3, F4 and F5, and the F6 pair needs a second (retry) session. The estimate is shown before running.

## Security Considerations

No secrets in docs or reports. Production screenshots show only the tester's own session.
