---
title: "Lean eval, token cuts and admin dashboard"
description: "Replace the 20–40 USD full evaluation with a Persona QA agent (plan-execute-reflect) under 0.1 USD per persona, cut tokens in the shared engine prompts, add a web admin dashboard, and add two learner features for developers who practise user interviews before building an app."
status: in-progress
priority: P1
effort: "~20d"
tags: [llm-cost, eval, admin, dashboard, langgraph]
blockedBy: []
blocks: []
created: 2026-10-14
---

# Lean eval, token cuts and admin dashboard

## Overview

Persona review is the cost problem. A `full` eval (`src/eval/run-eval.ts` `episodeSpecs("full")`) plays 46 episodes × 30 turns: 6 learner runs, 20 attacks on the engine, 20 attacks on a prompt-only baseline. That is 2,000+ calls and ~20–40 USD per persona version (`docs/operations.md` § Cost). Then every leak flag needs two admins on the CLI (`src/eval/publish-gate.ts` `flagStatus`). Even a `quick` run cost 0.66–0.75 USD.

Most of that spend is wasted. Each turn pays for a model "learner" (`EVAL_INTERVIEWER`). The transcript keeps growing, so input tokens grow with the square of the turn count. The baseline episodes block nothing. And whether a locked item can be reached is something code can decide, so an LLM interview is not needed to find out.

This plan replaces the fixed battery with a **Persona QA agent**: a LangGraph plan → execute → judge → reflect loop (plan-and-execute, ReWOO-style). It reads the persona, decides where the persona is most likely to break, tests exactly there through typed engine tools (unlock checks, delivery checks, scripted attacks), and observes the typed results. Then it probes deeper or stops, within a budget it can see. A fixed **safety floor** of probes always runs under the agent, so recall never depends on the agent's choices alone. A mutation suite measures recall.

**Authority:** the user decided on 2026-10-14 to ignore the earlier PRD (`_bmad-output/.../prd.md`, `addendum.md`). This plan and the decisions below are the authority. The previous plans' isolation invariants are kept on purpose, as security properties. That choice belongs to this plan, not to the PRD.

## Decisions (user, 2026-10-14)

- Target cost: **≤ 0.1 USD per new persona** (revised from 0.5 USD the same day). The eval must be "very simple but as accurate as possible" and a **real agent system** (plan, act through tools, observe, reflect), not a fixed script.
- Product focus: **developers practising user interviews before building an app**.
- Models: **Google only** (no OpenAI key). Revised the same day: **Flash-Lite where a role's judgement set shows it is enough, 3.8 Flash elsewhere** (phase 2).
- **No string matching, regex or if/else heuristics decide anything semantic.** Leaks, disclosures and question labels come from structured model verdicts, as item-id lists or enums validated by zod. Code only does typed engine-state checks and set arithmetic on ids. Rules, checks, probes and gate reasons are declared as data tables (`{ key, run }[]`), not branch chains. The existing `secret_terms` rule in `validate.ts` is left unchanged and nothing new depends on it.
- Admin dashboard v1 includes: cost and usage, scenario review, learners and audit, config and custom topics.
- Fold 1–2 new learner features into this plan (phase 9).
- Previous PRD ignored. The old 2-admin adjudication and the `full` profile gate are dropped.

## Invariants kept (security, not PRD)

1. Locked item content never enters Call 1 (ANALYSIS), Call 2 (PERSONA) or the replay judge. The canvas never enters any in-session call.
2. Unlocking is deterministic code over checked evidence. At most 1 item per turn.
3. Sealed reveal data never reaches the browser before replay ends.
4. Learner text is always wrapped as data in prompts and escaped in the UI.
5. Every admin read of learner data writes `admin_access_log`.

## Cost model (target)

Estimated at gemini-3.8-flash prices in `src/llm/pricing.ts` (0.75 in / 0.075 cached / 3.75 out per 1M). The estimate assumes the static prompt prefix is served from the implicit cache and that outputs are short, capped by the schemas, so roughly 0.0008–0.0012 USD per probe call. Phases 1–2 measure this, and the details are in phase 3.

| Persona QA agent step | Calls | ~USD |
|---|---|---|
| Structural checks (code, typed) | 0 | 0 |
| `plan`: risk map + public-field leaks + chosen actions (1 LLM call) | 1 | 0.005 |
| Floor: ANALYSIS-only unlock check per item (≤ 12) | ≤12 | 0.008 |
| Floor: 3 universal attacks × 2 turns | 12 | 0.011 |
| Agent-chosen: delivery checks for high-risk items, ≤ 2 fitting attacks, negative probes | ~16 | 0.015 |
| `judge`: one batched `disclosed_item_ids` call | 1 | 0.006 |
| `reflect` ≤ 2 rounds + follow-up probes | ~8 | 0.012 |
| **Total** | **~50** | **~0.06** |

The hard cap `eval_lean_budget_usd = 0.10` aborts the run through the `recordCall` meter, as in `src/server/generation.ts`. The agent sees the budget it has left and drops optional actions first. The floor alone is ~22 calls, about 0.025 USD. A re-eval of an unchanged version is served from the tool cache (~0 USD).

## Phases

| # | Phase | Status | Depends on | Effort |
|---|-------|--------|------------|--------|
| 1 | [Cost baseline and reporting](./phase-01-start.md) | Done (verified on prod via rolled-back tx) | — | 1d |
| 2 | [Model tiering by measured judgement sets](./phase-02-token-and-prompt-cuts.md) | Done: `.env.example` tiered; the user still has to set the deployment env | 1 | 1d |
| 3 | [Persona QA agent (lean eval)](./phase-03-lean-eval-engine.md) | Done: sync ≈ 0.09 and batch ≈ 0.04 USD per persona; an unchanged re-eval costs 0; judge sets and stability moved to phase 4 | 1, 2 | 4d |
| 4 | [Lean eval calibration](./phase-04-lean-eval-calibration.md) | Partial: mutant recall 100%; clean personas fail `no_leaks` 50–100%, gate rule open ([report](../reports/calibration-261015-lean-eval.md)) | 2, 3 | 1.5d |
| 5 | [Publish gate v2 and eval job](./phase-05-publish-gate-v2-and-eval-job.md) | Done: lean gate as a rule table, one admin ruling per flag (it settles `no_leaks`), version approval tied to the run, lean eval as a resumable job; 0 paid calls | 4 | 2d |
| 6 | [Admin shell and cost dashboard](./phase-06-admin-shell-and-cost-dashboard.md) | Done: `/admin` overview (spend vs caps, 30-day chart, top roles, session cost, usage); 404 identical to an unknown URL for non-admins; 0 LLM calls | 1 | 2d |
| 7 | [Admin scenario review](./phase-07-admin-scenario-review.md) | Done: list, review, diff, probes, rulings, strings, approval, publish and unpublish, lean eval and persona drafts from the browser; curated personas only; 0 paid calls (stub) | 5, 6 | 2.5d |
| 8 | [Admin learners, config, custom topics, audit](./phase-08-admin-learners-config-and-audit.md) | Pending | 6 | 1.5d |
| 9 | [Learner progress and interview-guide checker](./phase-09-learner-progress-and-guide-checker.md) | Pending | 2 | 2.5d |
| 10 | [Cleanup, docs and checks](./phase-10-cleanup-docs-and-checks.md) | Pending | all | 1d |

Phase 6 can run in parallel with phases 2–3 after phase 1 (`src/app/admin` against `src/llm` + `src/eval` + `src/graphs`). Phase 3 waits for phase 2, because the agent must evaluate the production prompts and efforts.

## Cross-plan relations

- `261003-1818-interviewlab-bootstrap-s1-and-custom-topics` (in progress). This plan replaces its phase 4 publish gate (the `full` profile, two admins) and its "no Review Console" decision. Its other open items (deploy, latency, real phones) do not conflict. No `blockedBy` is needed, because nothing here waits on them.
- `261010-1200-library-topic-layer-and-app-topics` (in progress, phase 6 done). No file overlap except `docs/operations.md`, which phase 10 edits last.

## Success criteria

- [ ] `pnpm il eval <persona> --profile lean` costs < 0.10 USD (measured in `llm_call`) on every curated persona (7 on disk), and < 0.01 USD for an unchanged re-eval.
- [ ] The lean eval flags 100% of the seeded leak mutants and passes all 9 clean curated personas (phase 4). Two runs give the same verdict.
- [ ] Every role runs the cheapest model that passes its judgement set 3/3 (phase 2). ANALYSIS stays on Flash (user decision), so sessions are ≈ 10% cheaper, mostly in the reveal.
- [ ] `/admin` (admins only) shows spend by day, scope and role. A persona version can be evaluated, reviewed and published or unpublished from the browser. Config, custom attempts, learners and the audit log are visible, and every learner-data read is logged.
- [ ] A learner sees their skill trend across sessions, and can check an interview guide for their app idea.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:int`, `pnpm test:e2e` all pass.

## Open questions

None.

Resolved 2026-10-14: ANALYSIS stays on 3.8 Flash (user decision).
Resolved 2026-10-14: implicit caching on 3.8 Flash needs ≥ 4,096 input tokens, so session prompts never qualify. Caching is dropped (phase 2). The QA agent uses Gemini Batch mode (−50%) for its independent calls by default, with a `--fast` flag for synchronous runs (user decision).

Resolved 2026-10-14: the judges move to Gemini too (no OpenAI key). The cost of losing cross-family checking is covered by the phase 4 mutation recall and the judgement sets rerun in phase 2 step 1.
