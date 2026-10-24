# Code review: phase 2 Director v2 (topic routing), uncommitted tree

2026-10-23 ~23:10. Scope `git diff -- src tests` (11 src, 33 test files, +458/-211). Read-only, no paid calls.
My runs: `pnpm typecheck` exit 0, `pnpm lint` exit 0, `pnpm test` 1171/1171 (62 files). Int 673/673, e2e 328/328 and the prod build (e2e webServer) are from the tester report. `src/engine/unlock.ts` has no diff.
I also ran one pure-engine probe (scratchpad only, nothing written to the repo): `C:/Users/thanh/AppData/Local/Temp/claude/D--Tekmium-week-3/384f2ed6-ca1b-47e9-988c-f420f1a841c1/scratchpad/probe-hooks.ts`.

## Score: 7.5/10
The code is clean, follows the spec, and is well tested. One spec-level regression in hook choice (C1) needs a fix or explicit user sign-off before the phase closes.

## Critical (fix, or get user sign-off)
C1. Hints compete on weight with the direct topic's hook and with the prerequisite-chain hook (`src/engine/hooks.ts:62-67`).
- Before: on a turn where tag X opened X, the only candidates were X's dependents (prerequisite just opened). On a turn with locked tag X, the hook was X's.
- Now any hint that is heavier, or equal weight and earlier in the scenario, wins. Probe on chị Thu, openness 4:
  - direct last-attempt, past_specific, no hint → opens last-attempt, hook `shame` (the chain hook).
  - same + hint paid-app → opens last-attempt, hook `paid-app`. The chain hook is lost; shame is offered later only when touched or on a closing question.
  - direct small-spend + hint installment → hook `installment`, do-not-assert small-spend. Call 2 gets one item's hook and another item's constraint. Before, that happened only when a hook pickup opened another item on the same turn.
- Likely in practice: 5 of chị Thu's 11 tags are "ghi chi tiêu" (plan.md:20), so direct + neighbour hints will co-occur, and a reply that jumps topic is plan problem 1/2.
- Validation Q4 (plan.md:182-191) decided broad questions only ("chạm nhiều chủ đề thì không mở gì → thả 1 câu gợi mở"). The phase formula (phase-02:37, :67) is a union, and the implementer pinned it in a test (`tests/engine/hooks.test.ts:101-102`).
- Fix that keeps the user decision: use the hints only as a fallback pool.
  ```ts
  const open = scenario.items.filter(/* unlocked / dropped / prerequisite checks as today */);
  const primary = open.filter((item) => analysis.tag_item_id === item.id || prerequisiteJustOpened(item) || closing);
  const eligible = primary.length > 0 ? primary : open.filter((item) => analysis.hint_item_ids.includes(item.id));
  ```
  Then flip hooks.test.ts:101-102 to `small-spend` and add a chain case (direct last-attempt + hint paid-app → shame).
- Alternative: keep the union with explicit user sign-off, and say in the hooks.ts JSDoc that hints can displace chain hooks.

## Warnings
W1. On a broad-only turn, the hook line ships without its item's do-not-assert. The do-not-assert comes from the direct topic only (`plan-turn.ts:110`, `contexts.ts:151`). The old forced-tag turn carried the hook and do-not-assert of the same item. This follows the spec, there is a precedent (closing-question hooks), and the persona is told "không giải thích gì thêm" (`persona.ts:66`). But this is the topic-brush class behind every 2026-10-15 no_leaks failure.
- Option that still sends ≤ 1 do-not-assert: use the direct's, else the hook item's when the hook came from a hint.
- Needs a user call. At least watch it in the phase 4 transcript-run.

W2. Test gap for AC4: "do-not-assert from direct only" is never exercised with hints present.
- `contexts-isolation.test.ts:87-100` iterates THIRTY_TURN_SCRIPT, which has no `broad` at all.
- The hostile sessions in `plan-turn-adversarial.test.ts` have random broad topics but assert nothing about the do-not-assert.
- Fix: in the hostile loop, assert ≤ 1 do-not-assert text in the persona prompt and, when present, that it is `tag_item_id`'s.

W3. ROUTING_RULES does not say what `broad` holds when `direct` is set (`src/llm/prompts/analysis.ts:71-72`). The only direct example has an empty broad. Together with C1, this wording decides the hook.
- If C1 stays as is, add a rule such as "Khi đã có direct, broad để rỗng".
- Do it before the paid re-measure, because a later prompt edit makes that measurement stale.

## Suggestions
S1. ROUTING_RULES JSDoc (`analysis.ts:65-68`): state the contract phase 5 must honour. That is `<chu_de>` lines `T<n>: tag`, `<cau_hoi_moi>` as `index:token` (from `engine/tokens.tokenize`), DATA_BLOCK_RULE in the prompt, and the schema field `topic {direct, direct_span, broad}`. Otherwise the block is self-contained, and the example indices are right: [2,5] = "đi làm bằng gì".

S2. `turns.analysis_json` is still `$type<RawAnalysis>()` (`src/db/schema.ts:232`). Old rows hold `topic_tags` while the type now claims `topic`. The only reader is `JSON.stringify` (`session-trace.ts:38`), so it is safe today. Add a one-line note or a legacy union so a future reader cannot read `.topic` on an old row.

S3. Generated scenarios: nothing checks that their secret_terms avoid the fixed prompt wording. Curated ones have that check (`tests/scenario/curated-scenarios.test.ts:88`).
- ROUTING_RULES adds commuting phrases ("chi phí đi lại", "giờ giấc đi làm", "cuối tuần").
- A commuting custom topic could trip `assertIsolated` in the lean eval (`src/graphs/qa-agent-graph.ts:204`). It is not in prod turns.
- Fold this check into the phase 5 validate.

S4. Nits:
- Blank line before `});` at `tests/engine/check-analysis.test.ts:120`.
- `hint_item_ids` for bad spans is asserted twice, at check-analysis.test.ts:132-144 and plan-turn-adversarial.test.ts:253-259. Keep the unlock assertion in the adversarial test and drop the hint one there.

S5. Tester gap 1 (repeated non-direct ids in broad) is already covered: `check-analysis.test.ts:165-173` turns broad [.., money-home, .., money-home] into ["money-home"].

## Side effects (for the no-side-effects gate)
SE1. Hook choice changes on direct and chain turns (C1). Affects live sessions.

SE2. A broad question now drops a hook chosen from ≤ 3 touched items (before: 1 forced tag). More confirmed drops lead to more ledger entries and ignored hooks. So the habit-card threshold is reached sooner, the replay target can come from a broad-question hook, and "heard but did not follow up" comments get more frequent. This matches validation Q4 but shows in the reveal.

SE3. The closing path narrows. A general question the model now tags broad is no longer a closing question, so its hook pool is ≤ 3 hinted items instead of every eligible item.

SE4. Broad turns send a hook without a do-not-assert (W1).

SE5. Items open only on a direct topic with an in-range span, so there will be fewer surface, trust and past-story opens (intended). The same Call 1 drives replay turns (`server/replay.ts`). If the model abstains, primary-replay success and the lean-eval floor `opensOnce` (`eval/qa/thresholds.ts:39`) may drop. Both are measured later.

SE6. The lean-eval probe cache is invalidated. The fingerprint renders the Call 1 system text, which now includes ROUTING_RULES (`eval/qa/tools.ts:119-137`). The next `pnpm il eval` pays for every probe again.

SE7. Output formats changed. The "Sau khi kiểm" line of `il trace` and the admin transcript goes from `tag =` to `direct = …; direct_span = …; broad = …`. Correction fields on new rows are `topic.direct` and `topic.broad`; old rows keep `topic_tags`. No code parses either.

SE8. `decision_json.analysis` gains `tag_span` and `hint_item_ids`. No migration, no env, `llm_call` or API change. Rollback is safe: old code reads only label, question_type, grounded_turn_id, introduced_span, hook_item_id and tag_item_id (all still written), and never re-plans stored raw analysis.

No change to: unlock.ts, the DB schema, env names, browser payloads (e2e regex at `interview.spec.ts:249` and `interview-screen.spec.ts:249`).

## Checks
(a) Acceptance criteria: PASS, with the C1 caveat.
- 1 Schema, types, aliases and checks match the spec (`schemas.ts:23-27`, `aliases.ts:79-89`, `check-analysis.ts:52-70`). `tag_item_id` is set only with a valid span (`:55-56`). ✓
- 2 Broad never opens, and a bad span opens nothing. Unlock reads only `tag_item_id` (`unlock.ts:7`, no diff). Tests: `plan-turn-adversarial.test.ts:141-157, 234-265`. ✓
- 3 Hints are eligible, broad ≠ closing, weight order unchanged (`hooks.ts:8-15, 62-67`; hooks.test.ts:87-108). ✓ per spec; see C1.
- 4 Do-not-assert from direct only, ≤ 1. The code is unchanged (`plan-turn.ts:110`, `contexts.ts:151`). ✓ for code; test gap W2.
- 5 Old rows:
  - `StoredAnalysis` (`types.ts:56-57`) types `TurnDecision` and `RevealTurn`, so the compiler forces `??` on the new fields. The trace uses it (`session-trace.ts:58`). An int test strips the keys with SQL (`config-and-trace.int.test.ts:194-205`).
  - No other reader touches a new field (reveal.ts:27, sessions.ts:271, replay-outcome.ts:12-13, reveal-*).
  - Every `planTurn` caller gets fresh model output (turn-graph, eval sets, QA tools). None re-plans stored raw analysis. ✓
- 6 ROUTING_RULES is exported, its examples are about commuting, and the system message stays static (contexts-isolation.test.ts:173, :181). ✓ (see S1)
- 7 Invariants:
  - No locked content added to Call 1 or Call 2.
  - unlock.ts unchanged, ≤ 1 item per turn, no new calls.
  - Learner text is still wrapped as data.
  - Code checks only aliases, ranges and sets.
  - No env, column or table change. ✓
- 8 Stubs only: e2e `NEUTRAL_ANALYSIS` and `directTopic` (`e2e/helpers/chat.ts:10`). I ran no paid command. ✓

(b) No regression: CONCERN. C1 (chain and direct hook displacement) is shown by the probe. The rest of the blast radius shows no regression: reveal readers, select-replay, replay, trace, admin page, eval sets, QA tools.

(c) Public contracts: PASS. Every break is called out in the phase file (Call 1 schema, RawAnalysis, CheckedAnalysis +2 fields, trace text). No env, DB or API change.

(d) Patterns: PASS.
- Corrections use `{field, from, to, reason}` with Vietnamese reasons.
- Evidence is checked with `isValidRange` and a tuple copy, as `introduced_span` is (`check-analysis.ts:77`).
- The new constant lives in `config/limits.ts`, and the prompt examples are about commuting.
- One fixture builder (`engine-fixtures.ts:19`) plus its e2e twin.

(e) Lint, types and build: PASS. typecheck 0, lint 0, unit 1171/1171 (my runs); int, e2e and build from the tester. The added lines have no console, eslint-disable, ts-ignore, `.only` or `.skip`. The CRLF warnings affect only the worktree (the index is LF, per `git ls-files --eol`).

## Unresolved questions
1. C1: apply the fallback-pool fix, or keep the union with user sign-off? It goes beyond the scope of validation Q4.
2. W1: should a hint-driven hook carry its own item's do-not-assert (still ≤ 1), or stay direct-only as the spec says?
3. W3: add the "broad when direct is set" rule before the paid re-measure, so the 0.09 USD run measures the final prompt?
