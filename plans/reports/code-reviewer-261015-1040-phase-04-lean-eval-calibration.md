# Code review: phase 4, lean eval calibration (uncommitted, feat/lean-eval-admin)

## Scope
- Modified: src/llm/call-model.ts, src/llm/prompts/persona.ts, src/graphs/qa-agent-graph.ts, src/eval/judgement-eval.ts, cli/commands/judgement-eval.ts, cli/index.ts
- New: src/eval/qa/{mutants,mutant-fixtures,calibration,judgement-sets}.ts, cli/commands/eval-calibrate.ts, evalsets/{reply-judge,qa-plan}.jsonl, tests/eval/qa-{mutants,calibration}.test.ts
- Checks rerun: `pnpm typecheck` clean, `pnpm lint` clean, `vitest run tests/eval` 11 files / 175 tests pass.

## Overall
The seams are small and correct. The persona prompt renders byte-identically (the extracted lines match the removed ones exactly), `callModel` is unchanged when `rewriteMessages` is absent, and the rewrite runs before `createModel`/invoke, so it also reaches the batch transport (`batchLlmDeps` spreads base deps). Calibration passes no `toolCache` (so neither the run cache nor the tool cache is read), writes no `eval_run`, and uses one `randomUUID()` attemptId per run through `scopeOf`. Failed runs count as misses and false failures. The one real design defect: "caught by the declared row" only checks the row key, not that the row failed because of the mutated item. With the clean-run flip rates already measured, that inflates recall.

## High

### H1. A mutant counts as caught when its row fails for an unrelated item (calibration.ts:61-62)
`caught` = `unmet.includes(OPERATORS[op].trips)`. The plan asks that "a mutant caught for the wrong reason counts as a miss", but nothing ties the failure to `targetItemId`. Concrete cases from the plan's own measurements:
- `weak-sample` on chi-thu targets `tried-methods`. The phase notes say chi-thu `installment` already failed `floor_unlocks` in 2 of 3 clean runs. So the mutant can be "caught" by installment's flaky floor probe while tried-methods' broken sample question goes unnoticed.
- `leak-in-surface-fact` / `loose-voice` / `prompt-weakened` (`no_leaks`) on co-lan: co-lan leaked a topic in one clean run. Any unrelated leak marks the mutant caught.
- Structural mutants: the report flattens violations to `path: message` strings (qa-agent-graph.ts:396), so the calibration cannot check the declared `violation` code at run time. Only the unit test checks it (qa-mutants.test.ts:44).

The structured data needed is already in `QaReport`: `leaks[].itemId`, `publicLeaks[]` (`kind === "content"`, `itemId`), and floor `observations` (`action.itemId`, `openedItemId`). Fix: have the operator declare a predicate over the report (data, not regex), e.g. `caughtBy: (report, target) => report.leaks.some(l => l.itemId === target)` for no_leaks, `publicLeaks.some(p => p.kind === "content" && p.itemId === target)` for no_public_leak, and "floor observation for target did not open" for floor_unlocks. Store the result in `CalibrationResult` (e.g. `caughtOnTarget: boolean`). Keep the row check and require both. For `loose-voice`/`prompt-weakened` (target null), at least record which items leaked, so a leak already present in the clean runs can be told apart. Without this, criterion (a) holds only literally, and "100% recall" is not trustworthy given the flip rates.

## Medium

### M1. `leak-in-hook` changes the target's own hook line, not another item's (mutants.ts:82-89)
The plan table says "another item's `hook_line` becomes a paraphrase of the target's content". The code overwrites `fixture.itemId`'s own `hook_line`. These are different tests. The planner prompt says "Câu gợi mở được phép gợi chủ đề", and a hook line is expected to point at its own item, so the planner may well report a content-bearing own hook as `topic_hint` (a warning, not a threshold failure) and the mutant is missed. Or the reverse: the plan's harder cross-item case is never measured. qa-plan labels qp-02/06/10 inherit the same choice. Either follow the plan (pick another item, keep `targetItemId` = the leaked item) or record the deviation in the phase file as a decision.

### M2. No aggregate spend guard on a multi-run command (cli/commands/eval-calibrate.ts:62-102)
Each run gets `new Budget(capUsd)`, but nothing caps or confirms the total. Default `--all`: 7 personas × 3 clean + (5 model ops × 3 fixtures + weak-sample × 7) ≈ 43 paid runs. `--runs 10` gives about 92. At the per-run cap (eval_lean_budget_usd) the worst case is several USD, past the phase NFR of "< 3 USD in total". `eval --profile full` asks for confirmation for this reason. Suggest printing `specs.length × capUsd` as the upper bound and requiring `--yes`/`confirm` above a threshold, or a total cap that stops queueing new specs once spending passes it.

### M3. qa-plan set cannot fail a planner that rates everything high, and has no clean controls (judgement-sets.ts:113-122, evalsets/qa-plan.jsonl)
`scoreQaPlanSet` measures only missed expected-highs. All 12 cases are mutants. Several targets (e.g. chi-thu `installment`, a trust item) are probably rated high on the clean scenario anyway, so the set does not show that the mutation raised the risk. Add `operator: null` control cases (the schema allows them) and/or a precision rate. Note that the test at qa-calibration.test.ts (`OPERATORS[entry.operator!]`) will throw on the first null-operator case, so it needs a guard when controls are added.

### M4. reply-judge label rj-09 is doubtful (evalsets/reply-judge.jsonl, rj-09)
It is labelled `topics: ["money-home", ...]` for "chuyện tiền gửi ba mẹ". Sending money to parents is a surface fact in chi-thu ("tiền gửi về cho ba mẹ" in the fixed monthly costs, surface_facts[1]), and the judge sees surface facts. A judge that leaves it out scores `leak_missed`, and `MAX_LEAK_MISSED = 0` makes one such disagreement fail the gate. The reply does list it among "chuyện chị chưa muốn kể", which the judge rules count as raising a topic, so it can be defended, but it is the weakest label in the set. Either drop money-home from rj-09, or reword the reply to touch the item's own content ("3 triệu", "không được đụng tới").

## Low

- L1. calibration.ts:138: `(error as Error).name` throws a TypeError if a non-object is thrown (`null`/`undefined`). That escapes the worker, rejects `Promise.all`, and loses every result collected so far. Use `error instanceof Error ? error.name : "Error"`. The name alone ("Error", "LlmCallError") also hides the cause in the matrix. Consider `name: message` truncated.
- L2. runQaAgent invalid-scenario early return (qa-agent-graph.ts:393-410): every other row is reported `met` ("đạt") with no probe run. That is fine for calibration, but `eval <persona>` on a stored scenario that fails a newer validate rule now runs `finishQaRun` with a report that shows floor/leak rows as passed (an existing CLI behaviour change; previously it probed). The overall verdict still fails. Consider marking unmeasured rows as such, or a warning per row. For valid scenarios the behaviour is unchanged (validate runs twice, which costs nothing).
- L3. judgement-eval.ts `qa-plan` kind: `--scenario` is ignored but the default chi-thu file is still loaded and validated, and the summary prints "kịch bản chi-thu" (cli/commands/judgement-eval.ts:82). The output is misleading. Print the case scenarios instead, or skip the header persona for this kind.
- L4. Calibration attempts are `scope = 'eval'` with no `eval_run` row. They count in scope/day totals but never appear in the per-eval-run list (cost-report.ts:124 LEFT JOINs from eval_run). That matches the plan ("no eval_run rows"). Mention it in the calibration report so the totals reconcile.
- L5. `weak-sample` always targets the first `surface` item. That is deterministic, but a persona's first surface item may already be one whose clean floor probe flips. Choose the target from the clean-run stability data, or just document it.
- L6. Docs: `docs/operations.md` documents `judgement-eval` but not the new kinds or `eval-calibrate`. This is a user-facing command and should get one line.
- L7. rj-15 ("làm kế toán ... từ tám giờ tới năm rưỡi") sits right on work-fatigue's topic tag "công việc kế toán hằng ngày". The label is correct (it is a surface fact), but expect `leak_invented` noise here.

## Criteria check
- (a) Operators are pure (structuredClone, no shared mutation; the test re-validates the source). Model mutants pass validate and structural ones trip exactly their code (test: qa-mutants.test.ts:39-48). The declared-row check exists, but see H1.
- (b) OK: no toolCache, no eval_run writes, one attemptId per run, errors count as misses or false failures (falseFailures includes `unmet === null`).
- (c) OK: prompt text identical, callModel unchanged when the dep is absent, batch path covered, runQaAgent unchanged for valid scenarios, existing eval CLI unchanged except L2.
- (d) OK: `withoutGuardRules` uses `includes`/`replace` on prompt text, which is a prompt transform, not a semantic decision. It fails loudly if a rule is missing (tested). Operators and rows are data tables.
- (e) OK: comment style, Vietnamese CLI text, the SetScore/`rate` pattern reused (rate/itemIds exported rather than reimplemented).

## Hand-label audit (reply-judge.jsonl vs chi-thu.json)
All item ids exist. Leak rows: rj-01..rj-11 (11 of 22, exactly half). Checked against the judge rules in eval-reply-judge.ts:
- Correct: rj-01, 02, 03, 04, 05, 06, 07 (thưởng cuối năm ≈ lương tháng 13), 08 (told/topic split does not matter, scoring is per item), 10, 11, 12 (asker names the topic and the persona refuses: by rule not a topic), 13, 18 (exact allowed hook), 14, 17, 20 (open), 15, 16, 21, 19, 22.
- Doubtful: rj-09 money-home (M4).
- Note: rj-01 and rj-04 ask essentially the item's sample question with `open: []`. That is valid as a label but unrealistic as a run state (the floor probe would usually open the item first).

## Recommended actions
1. H1: per-operator target predicate over the structured report; require both row and target.
2. M1: align `leak-in-hook` with the plan or record the deviation.
3. M2: total-cost bound and confirmation for eval-calibrate.
4. M3/M4: add clean controls to qa-plan, fix or drop the rj-09 money-home topic.
5. L1-L3, L6 cleanup.

## Unresolved questions
- Was targeting the item's own hook line (M1) a deliberate change from the plan?
- Should the gate rule (k-of-n) be applied to mutants as well? Mutants run once each, but clean rows are known to flip, so single-run recall is subject to the same noise.

Status: DONE_WITH_CONCERNS
Summary: Seams and no-regression guarantees hold, and typecheck, lint and tests pass. But "caught by the declared row" is not tied to the mutated item, so known clean-run flips can inflate recall (H1). There are also a plan deviation in leak-in-hook, no aggregate cost guard, and one doubtful reply-judge label.
