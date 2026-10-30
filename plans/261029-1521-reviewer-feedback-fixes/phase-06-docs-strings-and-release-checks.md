---
phase: 6
title: "Docs, strings and release checks"
status: pending
priority: P2
effort: "0.5d"
dependencies: [1, 2, 3, 4, 5]
---

# Phase 6: Docs, strings and release checks

## Overview

Record the changed rules, get the changed fixed strings checked and approved, migrate production in the right order around the deploy, run every gate, and accept the five fixes on production against the reviewer's screenshots.

## Context

- Vercel deploys from the repository (Git integration, `docs/setup.md` §3); CI (`.github/workflows/ci.yml`) runs typecheck, lint, unit, build, then int + e2e on a local Supabase stack.
- Prod migrations are manual: `pnpm db:migrate` against `DATABASE_URL_DIRECT` (`docs/setup.md:61`). The Supabase free project pauses after ~7 idle days (memory note): check it answers first.
- Fixed strings: `pnpm il check-strings product` (FR-36, a model call per changed string) then `pnpm il approve-strings product approve --all` (FR-60). `pnpm il publish` refuses every persona until product strings are approved; learners are not blocked while `require_published` is `false` (`docs/launch-checklist.md` row 16).
- Docs that state the old rules: `docs/tech-stack.md` (Deviations), `docs/launch-checklist.md:100` (personal-data row: "anonymous counters and the personas played survive deletion under a keyed hash"), `README.md` (first paragraph). `docs/operations.md` names neither the tombstone nor FR-5, and the checklist has no FR-5, missed-list or progress row: nothing to change there.
<!-- Updated: Validation Session 1 - doc targets corrected by verification -->


## Requirements

- Docs say what is true after this release, in the smallest owning place; plans stay records.
- Migration order: 0016 (index swap) on prod → deploy → separate commit with 0017 (drop `played_persona_ids`). `pnpm db:migrate` applies every pending file, so 0017 must not exist in the repo when 0016 is applied.
- Any paid step runs only after the user approves it with its estimate, asked right before it runs (user decision 2026-10-29).

## Implementation Steps

1. Docs:
   - `docs/tech-stack.md` Deviations: "FR-5 is lifted (user decision 2026-10-29): a learner may start a persona again after finishing it; one unfinished session per persona; only `session_daily_cap_usd` bounds spend." and "Màn 6 no longer lists untold items: up to 3 hints (topic, how to ask, a suggested question shown on a tap), a count for the rest."
   - `docs/launch-checklist.md:100` changes in step 4's commit, not here (it must match the column's state). D8 query 5 ("the kept counters have one more row") stays true.
   - `README.md`: first paragraph mentions hints for next time and retrying a persona.
   - Leave the untracked talk notes (`docs/loi-thoai-thuyet-trinh-interviewlab.md`, `docs/vi-du-tao-kich-ban-chu-de-cua-ban.md`) as they are; mention in the report that slide 19 ("đáp án được giữ kín…") still holds and other lines describe the old result screen.
2. Gates: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e && pnpm build`.
3. Prod DB and deploy: `pnpm il cost-report --days 1` (read-only health check) → `pnpm db:migrate` (applies 0016) → push, Vercel deploys → confirm the new code serves (retry works on prod).
4. Column drop, as its own commit after step 3: remove `playedPersonaIds` from `src/db/schema.ts` → `pnpm db:generate` → 0017 (`DROP COLUMN played_persona_ids`) → `pnpm test:int` → `pnpm db:migrate` on prod → push. Safe in either order now: no deployed code names the column. User decision 2026-10-29: drop it. Same commit: `docs/launch-checklist.md:100` drops "and the personas played" (only anonymous counters survive deletion).
5. Strings (paid, ask first; changed strings only, a few cents at most): `pnpm il check-strings product` → fix any that fail → admin runs `pnpm il approve-strings product approve --all`.
6. Production acceptance, one line per fix, screenshot each next to the reviewer's:
   - F1 tab icon (hard reload).
   - F3 finished persona → "Luyện lại từ đầu" → turn 0.
   - F4 result: ≤ 3 hints, count line; DevTools Network/RSC payload searched for two untold item texts of that persona → none.
   - F5 takeaway voice: needs a real session (≈ 0.03–0.05 USD for 8 turns + reveal); ask first, can share the run with F3/F6.
   - F6 progress after two sessions with one persona: "→" lines, no "%".
7. Report `plans/reports/manual-test-261029-reviewer-feedback-fixes.md` (results, cost spent, screenshots); mark phases with `ak plan check`; journal entry.

## Todo

- [ ] Docs updated
- [ ] All gates green
- [ ] 0016 on prod → deploy
- [ ] Column-drop commit with 0017 + checklist line 100
- [ ] Strings checked + approved (paid step approved by user)
- [ ] Production acceptance F1, F3, F4, F5, F6 + report

## Success Criteria

- [ ] Plan success criteria in `plan.md` all checked with evidence
- [ ] Reviewer re-checks the PDF points on production

## Risk Assessment

- Dropping the column while the old code still serves breaks account deletion and session start (`listPlayedPersonas` reads it): 0017 only after step 3 is confirmed.
- Paused Supabase: health check first; restore from the dashboard if it is down.
- Acceptance costs real credit: one real session can cover F3, F4, F5; the F6 pair needs a second (retry) session; total ≈ 0.1 USD, shown to the user before running.

## Security Considerations

No secrets in docs or reports; screenshots of production show only the tester's own session.
