# Code review: phase 1 (topic-route set, pooled/batch judgement runs, transcript-run)

Date 2026-10-23 · main, uncommitted tree · Plan `plans/261023-1532-chat-agent-routing-memory-and-generator-v2/` (plan.md, phase-01-start.md) · Read-only, 0 LLM calls.
**Score 8/10.** No blocker. The measurement path is faithful: production `buildAnalysisContext` → `callModel("ANALYSIS")` → `planTurn().analysis.tag_item_id`. No engine, prompt, DB or env change. The warnings are about ground truth, wording and spend edges, and they should be fixed before the paid baseline.

## Mandatory checks
- **(a) Acceptance.** The kind, scores, confusion pairs, pooled gate, `--batch/--concurrency`, the 4 pooled runners, the +6 far lines (10 exchanges, ≥ 6 back) and transcript-run are done. Success criterion 1 is met. Partly met (W6, W7): the mix holds only pooled, not per persona; there are no per-persona counts; the per-call cost is not printed; 19/36 direct notes name no closest wrong tag; the none-as-item test is missing. Baseline runs are out of scope.
- **(b) No regression.**
  - QA probe pool: results come back in input order, which is what the old key sort gave, because keys are unique via `fresh` (`qa-agent-graph.ts:147-156`). A rejection gives the first error while the other workers keep draining, the same as the old loop (probe-confirmed).
  - Calibration: `onResult` still fires per completion. Results are now in spec order. The consumers (`operatorScores`, `cleanStability`, `falseFailures`, `formatCalibration`) only group and filter, so nothing relied on completion order.
  - Judgement runners: concurrency 1 equals the old loop. At N, rows stay in input order and the score functions do not depend on order.
  - Exit codes are unchanged. The header strings are byte-identical to HEAD.
- **(c) Contracts.** All changes are additive:
  - the optional `batchCollector` on `runJudgementEval`/`judgementEvalCommand` and `JudgementOptions.concurrency`;
  - new exports (`exchangeSchema`, `toTranscript`, topic-route API);
  - `SET_KINDS += topic-route`, whose only exhaustive record is the CLI `runs` table;
  - new flags and a new command.

  There are no env, DB or `llm_call` changes.
- **(d) Patterns.**
  - The batch wiring mirrors `cli/commands/eval.ts:76-87`. Per-case scenarios mirror `runQaPlanSet`, and the file layout mirrors `guide-check-set.ts`.
  - User-facing strings are Vietnamese. Data tables (`SCENARIO_NOTE`, `TURN_ESTIMATE`) replace branch chains, and comments explain why, except S7.
- **(e) Gates.** `pnpm typecheck` exits 0 and `pnpm lint` exits 0. The 6 touched test files pass 59/59. tests/{eval,cli,graphs,server,engine} pass 785/785 in 44 files.
- **Cost and security.** Tests use only `roleModels`. Batch runs only with `--batch` plus an injected collector, and the tests pass none or a throwing one. transcript-run spends only with `--yes`. There is no learner data.

## Critical
None.

## Warnings (should fix)
- **W1. Ground truth is arguable** on lines that decide the ≤ 1-wrong gate. Fix them before the baseline.
  - `evalsets/topic-route.jsonl:53` ch-15 "nắm tiến độ… qua những cách nào" is labelled `broad`. It nearly paraphrases `:39` ch-01, which is labelled `private-notebook` (tag "cách chị tự theo dõi việc đã giao").
  - `:33` cl-12 "tiền nong của sân… lo" is labelled `broad`. It lexically targets `empty-hours-loss` ("tiền thất thoát của sân").
  - `:11` ct-11 asks about her job, which is a surface fact ("Làm kế toán…"). It is `work-fatigue` only by the tag wording and will flip when phase 2 rewrites the tag.
  - Fix: relabel, or rewrite the questions so they are unambiguous. Watch cl-13, cl-14 and ch-13 in the confusion pairs.
- **W2. The wording says "opened" but the metric is the routed tag.** See `src/eval/topic-route-set.ts:50,68,72,77` ("mở nhầm điều", "không mở gì"). A follow_up or trust item is not opened by its tag alone (the notes of ct-08 and ct-11 say so). Fix: say "định tuyến/trỏ nhầm", "không trỏ chủ đề nào".
- **W3. The flags are ignored for 6 kinds.** `--concurrency` is silently ignored, and `--batch` sends one job per case for canvas, novelty, moderation, safety and qa-plan (`cli/commands/judgement-eval.ts:72-73,105-117`). `docs/operations.md:71` says "all cases at once". Fix: add a `POOLED_KINDS` set and throw a `CliError` when `--batch` or `--concurrency` is used with any other kind.
- **W4. Paid turns past `MAX_TURNS` are dropped silently.**
  - `cli/commands/transcript-run.ts:70`: the `intOption` fallback `questions.length` is not bounded by `MAX_TURNS`.
  - `:108` ignores `commitTurn`, which returns `"session_ended"`.
  - A questions file with more than 30 entries therefore pays for turns 31+ that are never committed, all replayed on the turn-30 state.
  - Fix: `fallback: Math.min(questions.length, MAX_TURNS)`, and fail when `commitTurn` returns anything other than `"committed"`.
- **W5. A failed run hides what it spent.** On `LlmCallError` (`transcript-run.ts:102-106`) it exits 1 without the spend so far. With no DB connected, nothing records it. Fix: print `Tổng: … ${usdOf(records)}` before `return 1`.
- **W6. Per-persona counts are missing.** Step 7 asks for wrong/missed "pooled and per set", but `RouteRow` (`topic-route-set.ts:46`) has no scenario. Fix: add `persona` to the row and one note line of wrong/missed per persona.
- **W7. Plan sync, beyond the two known deviations:**
  - The mix is pooled-only: chị Thu broad 23.8%, none 9.5%; co-lan broad 23.5%; open-item cases co-lan 1, chị Hạnh 1.
  - The step-2 none-as-item row is missing from `tests/eval/topic-route-set.test.ts:58-81`.
  - `docs/operations.md:84` claims a per-call cost, but only the turn total is printed.

## Suggestions
- **S1. The order tests prove little.**
  - The equivalence test (`tests/eval/judgement-eval.test.ts:221-229`) uses identical `repeat(24)` steps, so it cannot catch a result put on the wrong case. Use per-case outputs plus `before: () => wait(ms)`.
  - Add a pooled `runGuideSet` test (none exists).
  - Add a [good, bad] two-line set to prove "checked before any call". `:123-134` uses one-line sets.
- **S2. Reply measures have a bias** (probe). `sentenceCount` gives 1 for "Ờ… Chị không nhớ nữa.", which biases phase 4's "≤ 2 sentences" toward a pass. `isListReply` flags a dialogue dash ("- Dạ, …"). Document the bias or adjust.
- **S3. The wrong-route gate depends on set size.** `MAX_WRONG_ROUTE 0.021` means ≤ 1 wrong only at 48–95 lines; at 96 lines, 2 pass (probe). Pin it with a comment and a test, or gate on a count.
- **S4. Sentinel collision.** An item id `none` or `broad` is read as the sentinel (probe). Reject such ids in `runTopicRouteSet`.
- **S5. `mapPooled` with NaN concurrency** returns `[undefined…]`; the old loop returned `[]` (`src/eval/pool.ts:17`). Guard with `Math.floor(concurrency) || 1`.
- **S6. No rate-limit backoff.** Synchronous `--concurrency` up to 64 has no 429 backoff (the QA agent uses `withRateLimitBackoff`). Cap synchronous runs at about 8, or wrap the calls.
- **S7. Comment does not explain the value.** The `MAX_CONCURRENCY` comment (`judgement-eval.ts:42`) explains 200, not 64.
- **S8. The batch wiring is now copied 3 times** (`eval.ts:76-87`, `eval-calibrate.ts:79-89`, `judgement-eval.ts:90-101`). Extract a helper in a later change.
- **S9. Docs.** The 10-turn cost is given as "0.03–0.04" but the CLI prints a ceiling of about 0.069 USD (both calls on 3.8 Flash). "Starters of 8 to 24" is wrong: guide-check has 32 lines.
- **S10. Budget drift.** 56 lines cost about 0.067 USD in batch (the plan says 0.06). The full label set costs about 0.03 (the plan says 0.01), and there is no id filter to run only `lc-far-*`.
- **S11. Medians.** The median is the lower middle, which is lenient for "≤ 60 words". The turn wall latency is not printed.
- **S12. Keep unrelated docs out of the commit.** The untracked `docs/loi-thoai-thuyet-trinh-interviewlab.md` and `docs/vi-du-tao-kich-ban-chu-de-cua-ban.md` (2026-10-16) are not phase 1.

## Side effects
- The `eval-calibrate` matrix rows now print in spec order (before: completion order, which was not deterministic).
- A malformed `turn-verdict` set now fails before any call (before: mid-run, after spending).
- `--batch` prints `[batch]` lines before the header.
- Nothing else: no engine, prompt, DB, env or `llm_call` change.

## Evidence
- Probe: `C:\Users\thanh\AppData\Local\Temp\claude\D--Tekmium-week-3\275035bc-a75a-4451-8e69-42d66f4314ad\scratchpad\probe-sentences.ts`, which imports the real modules.
- Dataset scan: node over `evalsets/topic-route.jsonl` and the 3 scenarios' `topic_tag`/`surface_facts`.
