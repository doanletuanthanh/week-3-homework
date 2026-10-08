---
title: "InterviewLab bootstrap S1 and custom topics"
description: "Build PRD slice S1 (core practice loop, eval harness, operator CLI) plus the learner custom-topic path, on Next.js + Supabase + LangGraph JS, deployed to Vercel."
status: in-progress
priority: P1
effort: "~37d"
branch: feat/bootstrap-interviewlab
tags: [bootstrap, nextjs, langgraph, supabase, llm]
blockedBy: []
blocks: []
created: 2026-10-03
---

# InterviewLab bootstrap S1 and custom topics

## Overview

Vietnamese web app where a learner interviews an AI persona that holds 8–12 unsaid items, takes notes, guesses, then sees what the persona told (KHAI THÁC) and what the notes caught (NHẬN BIẾT), replays the missed moment, and takes home a habit sheet. This plan builds PRD slice S1 and the custom-topic path (PRD S5 with the scenario generator from S3).

Authorities: PRD `_bmad-output/planning-artifacts/prds/prd-week-3-project-2026-09-24/prd.md` and `addendum.md`; stack `docs/tech-stack.md`; design `docs/design/`; research `plans/reports/researcher-261003-1707-*.md`. Where this plan and the PRD differ without a listed deviation, the PRD wins.

## Invariants every phase must keep

1. Main turn ≤ 2 logical LLM calls; replay turn ≤ 3; reveal exactly 3 (judge → generator → verifier).
2. Locked item content never enters Call 1, Call 2 or the replay judge; the canvas never enters any in-session call.
3. Unlocking is deterministic code over checked evidence; the model cannot call it. At most 1 item per turn.
4. No text is judged by the call that wrote it.
5. Sealed reveal data is filtered on the server and never sent to the browser before replay ends.
6. The turn API returns only persona text, turn count, and error state.
7. Learner text is always wrapped as data in prompts and escaped in the UI.

## Phases

| # | Phase | Status | Depends on | Effort |
|---|-------|--------|------------|--------|
| 1 | [Walking skeleton](./phase-01-start.md) | In progress: code and local tests done; deploy and latency open | — | 2d |
| 2 | [Scenario schema, validate, first persona](./phase-02-scenario-schema-validate-and-first-persona.md) | In review: code and tests done; persona content awaits user review | 1 | 2.5d |
| 3 | [Turn engine](./phase-03-turn-engine.md) | In review: code and tests done; run with real models open | 2 | 5d |
| 4 | [Eval harness and operator CLI](./phase-04-eval-harness-and-operator-cli.md) | In review: code and tests done, quick eval recorded; full run, second adjudicator and hand-labelled sets open | 3 | 5d |
| 5 | [Interview screen and notes canvas](./phase-05-interview-screen-and-notes-canvas.md) | In review: code and tests done; real phones and a sweep for abandoned sessions open | 3 | 2.5d |
| 6 | [Reveal pipeline and screen](./phase-06-reveal-pipeline-and-screen.md) | In review: code and tests done; real models, the two hand-labelled sets and measured reveal latency open | 5 | 6d |
| 7 | [Replay](./phase-07-replay.md) | In review: code and tests done; a full session with real models open | 6 | 2.5d |
| 8 | [My sessions, account, system states](./phase-08-my-sessions-account-and-system-states.md) | In review: code and tests done; a real `seed-demo` run, the home screenshot and the auth tables of the real project open | 7 | 2.5d |
| 9 | [Custom topics](./phase-09-custom-topics.md) | Pending | 4, 8 | 7d |
| 10 | [Hardening, docs, launch checks](./phase-10-hardening-docs-and-launch-checks.md) | Pending | 9 | 2d |

## Accepted deviations from the PRD

- Custom-scenario hard timeout ~270 s instead of 10 min (Vercel Hobby cap; user-approved 2026-10-03).
- No worker process: reveal and generation run in `after()`; full eval runs from the local CLI.
- No Review Console. Operator actions the PRD puts in C8/C10 that S1 or custom topics need (unpublish, take down a custom scenario, refund the free scenario, config and kill switch) are CLI commands.
- No library (Màn 2/2b): home links to the one persona's prep screen; custom topics are reached from Buổi của tôi.
- **Unpublished personas are playable by every learner** (user decision 2026-10-03). The publish gate (FR-35) is built and reports, but only blocks play when the `require_published` config row is turned on.
- **Anonymous quota counters survive account deletion** (user decision 2026-10-03): one row keyed by a keyed hash of the Google account, holding counters only. The data notice says so. This narrows FR-66 "toàn bộ dữ liệu".
- **LangSmith receives full prompts and replies in production** (user decision 2026-10-03). The data notice names the tracing service as a recipient; traces are not removed by account deletion and expire with LangSmith retention (14 days on the free plan).
- **The persona reply is streamed** (user decision 2026-10-05; the PRD addendum §7 deferred streaming). Only Call 2 streams, after Call 1 and the unlock decision are done. A stream that fails midway writes no turn and the browser drops the partial text. Nothing is retracted for content: locked item content never enters Call 2 (invariant 2), so a stream cannot leak what the call was not given. Invariant 6 holds: the stream carries persona text, then the turn count or an error state.

## User tasks the build cannot do

- Create the Supabase project, Google OAuth client, Gemini/OpenAI/LangSmith keys, and Vercel project (phase 1 walks through each).
- Confirm model IDs and prices in the vendor consoles before they are written to config.
- Review the content of persona "chị Thu" (phase 2).
- Hand-label the NFR-7 test sets (≥100 items each); the build ships the harness and a starter set only.
- Find a second adjudicator and run the first full eval (~20–40 USD of LLM spend per run).

## Success criteria

- [ ] Deployed URL passes the end-to-end demo: home → prep → sign-in + notice → interview with canvas → guess → reveal → replay → Mang về + print → Buổi của tôi (PRD §12.2 item 1, minus library screens).
- [ ] Automated tests cover PRD §12.2 items 3, 4, 5, 6, 9 (non-Console), 10, 11, 12, 13, 14.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass.
- [ ] A learner can create a custom topic and play it, with quotas, budget and kill switch enforced.
- [ ] `docs/setup.md` lets a new machine reach a running app with real keys.

## Open questions

1. Measured p95 turn latency with the chosen models (target ≤ 6 s) — unknown until phase 1 deploys.
2. Whether `auth.users` can be deleted inside the app transaction: yes on the local stack, and phase 8 does so. To confirm on the real project, with what Supabase Auth keeps in its audit tables (phase 8 notes).
3. Gemini free-tier rate limits are not published; 7 parallel reduced-eval runs may need a paid key even in dev.
4. Should an unpublished persona carry a visible label for learners? None is planned; the PRD has a label only for generated scenarios.
5. LangSmith free plan is 5,000 traces/month and one session is up to ~70 traces. Sampling or a paid plan is needed beyond ~70 sessions a month.
6. Where real eval runs, rulings and string approvals live: the integration and Playwright tests empty the local database the CLI writes them to (phase 4 notes).
7. A good simulated run opens 36 % of chị Thu's items against the 50–75 % target, and the persona invents far more detail than its prompt allows (phase 4 notes).

## Red Team Review

Two hostile reviewers (mechanism/failure, security/scope), 2026-10-03. 20 findings, 15 after deduplication, all with plan and PRD line evidence. 14 accepted, 1 accepted in part.

| # | Severity | Finding | Disposition | Applied in |
|---|---|---|---|---|
| 1 | Critical | Background runners lack ownership fencing; duplicate runs, overwritten results, > 3 reveal calls | Accept | 6, 9 |
| 2 | Critical | Turn lock taken after the LLM calls; parallel submits and failed calls are unmetered | Accept | 1, 3, 7 |
| 3 | High | Turn commit races with end; resend after lost response rejected | Accept | 3, 5 |
| 4 | High | Cost accounting has no scope; deletion drops today's spend | Accept | 1, 3, 8 |
| 5 | High | Dead generation attempts hold budget and block deletion; reserve can be exceeded | Accept | 9 |
| 6 | High | Deployed demo unreachable: no published persona can exist | Accept (user: all learners may play drafts) | 3, 4 |
| 7 | High | Delete then re-sign-in resets every quota | Accept (user: anonymous counters) | 8, 1 |
| 8 | High | LangSmith receives learner text, undisclosed, not deleted | Accept (user: full trace, disclosed) | 1, 8 |
| 9 | High | Publish gate needs a verifier metric nobody wires; no sets for moderation and output safety | Accept | 4, 6, 9 |
| 10 | Medium | Reveal readable before the guess; nobody moves no-replay sessions to `done` | Accept | 6 |
| 11 | Medium | Turn-30 auto end freezes notes before typing finishes | Accept | 3, 5 |
| 12 | Medium | Google-only not enforced; post-login action fires from a URL | Accept | 1 |
| 13 | Medium | Generated scenario text enters system prompts behind a narrow keyword rule; self-declared `secret_terms` | Accept | 2, 3, 9 |
| 14 | Medium | Claimed test coverage not delivered by any phase; FR-5 has no DB constraint | Accept | 1, 3, 6, 7, 9 |
| 15 | Medium | Estimate not credible; phases 6 and 9 too large; shared LLM key; unexercisable approval rule | Accept in part: estimate raised to ~37d, go/no-go at the start of phase 9, batch key, approver-differs rule dropped. Phase files not split. | plan, 1, 4, 9, 10 |

### Whole-Plan Consistency Sweep

Decision deltas checked across all files: the unpublished-scenarios env flag replaced by the `require_published` config row; the post-login `action` URL parameter replaced by a server-stored pending action; `llm_call` written per call with `scope`; heartbeat between calls replaced by timer plus run token; a re-created account rehydrates counters instead of starting empty; the realism-feedback table dropped; the turn-30 freeze moved to the end request. No unresolved contradictions.

<!-- slug: interviewlab-bootstrap-s1-and-custom-topics -->
