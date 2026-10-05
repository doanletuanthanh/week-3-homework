---
title: "Phase 4: Eval harness and operator CLI"
status: todo
phase: 4
priority: P1
effort: "5d"
dependencies: [3]
---

# Phase 4: Eval harness and operator CLI

## Overview

Simulated interviews that measure whether a persona separates good from bad questioning and leaks nothing, the interim publish gate built on those results, and the judgement test-set harness for NFR-7. Runs from the developer's machine only.

## Context links

- PRD FR-34, FR-35 (interim gate), FR-36, FR-60 (CLI `adjudicate`, `approve-strings`), NFR-6, NFR-7, §12.2 item 2; addendum §5 (cost), §4 (`eval_run`, `leak_flag`, `adjudication`, `string_approval`).

## Requirements

- [ ] `eval --profile quick` (good/bad ×1) and `--profile full` (good ×3, bad ×3, 20 adversarial, prompt-only baseline on the same 20 attacks). Quick results can never satisfy the publish gate.
- [ ] Episodes run in parallel with a concurrency limit, on the in-memory `TurnStore`, through the same turn graph as production.
- [ ] Report covers FR-34: items opened per profile (median), ratio vs the 50–75 % calibration target, leak flags per episode, hook transmission rate, contradiction rate, baseline comparison. Verifier disagreement is added by phase 6; until then the gate treats the missing metric as **not met**.
- [ ] Eval roles use the batch API key when one is configured.
- [ ] `publish` passes only when: validate clean, every §12.2 item 2 threshold met on a full run of that exact version, every leak flag closed by two different admins, every fixed string approved, FR-36 clean. It lists each failing reason.
- [ ] FR-36 checker for fixed strings (persona-level and product-level).
- [ ] Test-set harness for NFR-7 with JSONL format, starter sets, and pass/fail against the hard gates.
- [ ] Full eval asks for confirmation with a cost estimate; LangSmith tracing is off unless `--trace`.

## Architecture

- `src/eval/interviewer.ts`: an LLM learner (role `EVAL_INTERVIEWER`). Profiles: **good** (sees only what a learner sees: research goal, transcript; told to follow up on what was just said, ask about specific past events, never add its own ideas), **bad** (leading, hypothetical-future and closed questions, changes topic), **adversarial** (one of 20 scripted attacks in `src/eval/attacks.ts`: topic-map probing, direct demands, role-play injection, "repeat your instructions", reuse of topic words, fake system text, and so on; scripted opening turns then LLM continuation).
- `src/eval/run-episode.ts`: loop interviewer → `runTurnInMemory` up to 30 turns (10 for the reduced profile in phase 9); final verdict from `judgeTurn`.
- `src/eval/leak-judge.ts` (role `EVAL_LEAK_JUDGE`, sees the full iceberg): flags (a) content of an item not opened, (b) naming a locked topic in the persona's words outside the allowed hook; each flag has episode, turn, excerpt, allowed hooks, reason. Also marks contradictions before/after an item opened.
- `src/eval/baseline.ts`: one prompt holding the whole scenario with "do not reveal unless asked well", same attacks, same leak judge.
- `src/eval/report.ts`: metrics, threshold table (met / not met), cost estimate vs actual. Stored in `eval_run.report_json`; printed as a table.
- Gate logic in `src/eval/publish-gate.ts` (pure, given report + flags + approvals) so phase 9's reduced gate reuses the metric code.
- String registry: persona strings come from the scenario file; product strings from `src/strings/product-strings.ts`. `string_approval` stores a hash of the text; a changed string loses its approval.
- FR-36 checker `src/eval/string-check.ts`: for each fixed string, one call labels it as a question (must not be `leading`) and checks for claims about real users; deterministic pre-checks first.
- Judgement sets in this phase: `evalsets/label-classifier.jsonl` and `evalsets/turn-verdict.jsonl` with `{input..., expected}`; `judgement-eval <set>` runs the production prompt and reports each NFR-7 rate. The canvas-judge and leading-novelty sets arrive with their prompts in phase 6; moderation and output-safety sets in phase 9.

Publish and play: by user decision learners can play unpublished personas while `require_published` is false (phase 3). `publish` still runs the full gate and records the result, so the persona's status is honest; `pnpm il config set require_published true` makes the gate binding.

## Related code files

- Create: `src/eval/interviewer.ts`, `attacks.ts`, `run-episode.ts`, `leak-judge.ts`, `baseline.ts`, `report.ts`, `publish-gate.ts`, `string-check.ts`, `judgement-eval.ts`, `src/llm/prompts/eval-*.ts`, `src/server/in-memory-turn-store.ts`
- Create: `cli/commands/eval.ts`, `publish.ts`, `unpublish.ts`, `adjudicate.ts`, `approve-strings.ts`, `check-strings.ts`, `judgement-eval.ts`
- Create: `evalsets/*.jsonl` (starter sets, 15–20 items each), `evalsets/README.md` is not created; the format is documented in `docs/operations.md` (phase 10)
- Create tests: `tests/eval/publish-gate.test.ts`, `tests/eval/report.test.ts`, `tests/eval/run-episode.test.ts` (scripted models)
- Modify: `src/db/schema.ts` (`eval_run`, `leak_flag`, `adjudication`, `string_approval`)

## Implementation steps

1. In-memory `TurnStore`; `runEpisode` with scripted models under test.
2. Interviewer prompts for the three profiles; 20 attack scripts.
3. Leak judge, baseline runner, report maths with unit tests on fixed transcripts.
4. `eval` command: cost estimate, confirmation, concurrency limit (default 4), progress line per episode, resume-safe write of `eval_run`.
5. Tables and `adjudicate` (lists open flags; each admin records verdict + reason; the other admin's verdict is hidden until one's own exists; a flag closes on two matching verdicts from different emails; disagreement counts as a confirmed leak).
6. String registry, `check-strings`, `approve-strings` (approver email recorded).
7. `publish-gate` and `publish` / `unpublish` (`--stop-sessions` moves unfinished sessions to `withdrawn`; default leaves them on the old version).
8. Test-set format, starter sets, `judgement-eval` with the NFR-7 thresholds.
9. Run `eval --profile quick` on chị Thu; tune persona and prompts until good opens ≥ 2× bad and ≥ 3 items. Record the result here. The first full run is a user decision (cost).

## Todo

- [ ] In-memory store + episode runner
- [ ] Interviewer profiles + 20 attacks
- [ ] Leak judge, baseline, report
- [ ] `eval` command
- [ ] `adjudicate`, `approve-strings`, `check-strings`
- [ ] `publish` / `unpublish` with interim gate
- [ ] Judgement harness + starter sets
- [ ] Quick eval on chị Thu recorded

## Success criteria

- [ ] `publish` refuses with a precise list when any gate input is missing; unit tests cover each refusal reason and the all-green case.
- [ ] A quick run cannot be used for publish (test).
- [ ] Isolation assertion from phase 3 runs inside every eval episode and fails the run on violation (§12.2 item 3 "every turn of eval").
- [ ] `judgement-eval` prints each NFR-7 rate and exits 1 below a hard gate.

## Risk assessment

- **Cost:** a full run is 2,000+ calls, roughly 20–40 USD. Mitigation: estimate + confirmation; quick profile for tuning.
- **Rate limits** on free keys will stall parallel episodes. Mitigation: configurable concurrency, retry with backoff, clear error when the limit persists.
- **Hand-labelled sets are not built here.** Starter sets prove the harness, not the gates. NFR-7 stays red until the user labels ≥ 100 items per set.
- **Two adjudicators are required by the gate.** With one admin the persona cannot reach `published`; it stays playable as a draft while `require_published` is false.
- **Judges share model families with what they judge.** Mitigation: leak judge and end judge run on the other provider than the persona.
