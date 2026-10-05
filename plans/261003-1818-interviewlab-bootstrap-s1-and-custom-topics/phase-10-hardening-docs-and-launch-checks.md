---
title: "Phase 10: Hardening docs and launch checks"
status: todo
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
- [ ] Cost-cap behaviour proven: lowering the cap to current spend blocks new sessions with the message, running sessions finish reveal and replay, demo accounts still start, custom sessions are blocked at their first turn.
- [ ] Security headers including a Content-Security-Policy; learner text with HTML renders escaped everywhere.
- [ ] `/phuong-phap` returns 404 and the footer has no link to it.
- [ ] CI runs typecheck, lint, unit tests and build on every push.
- [ ] Docs: setup, operations, and the launch checklist.

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

- [ ] Cost-cap tests
- [ ] Headers + CSP
- [ ] Escaping tests
- [ ] CI
- [ ] Latency measured and recorded
- [ ] Manual demo desktop + mobile
- [ ] Docs written and verified
- [ ] Gap list against acceptance criteria

## Success criteria

- [ ] §12.2 items 1 (without library screens), 8 (turn and reveal; custom-path number from phase 9), 11 (the "p95 ≤ 6 s while a full eval runs" bullet is measured whenever eval shares an API key with live turns; with a separate batch key it is recorded as not applicable), 15.
- [ ] CI green on the branch.
- [ ] A person following `docs/setup.md` on a clean machine reaches a running local app.

## Risk assessment

- **Latency targets may not be met with reasoning models.** The plan reports the measured numbers and the cheapest lever, and does not hide a miss.
- **CSP can break OAuth redirects or font loading.** Mitigation: step 2 verifies each origin before deploy.

## Not done by this plan (stated in the launch checklist)

- NFR-7 hard gates (need ≥ 100 hand-labelled items per set).
- Full eval and two-person adjudication of chị Thu; interim-gate publish. Until then the persona is played as a draft (`require_published` false, user decision), and the launch checklist says so.
- Student test sessions; second adjudicator; Vietnamese personal-data review; provider training opt-out check on a paid key.
- S2 library, S3 Console, S4 BA/PM personas, the method page.
