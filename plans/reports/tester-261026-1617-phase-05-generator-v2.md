# Test report: phase 05 generator v2 (uncommitted tree)

Date: 2026-10-26. Branch main, working tree (no source/test edits made by tester).
Scope: full suites. Changed: scenario-generator.ts, route-check.ts (new), generation-graph.ts, schema.ts (type), admin custom-topics page, llm-stub.mjs, custom-fixtures.ts, 6 test files.

## Results

| Gate | Result | Count |
|---|---|---|
| `pnpm typecheck` (tsc --noEmit) | PASS, exit 0 | - |
| `pnpm lint` (eslint) | PASS, exit 0 | - |
| `pnpm test` (unit) | PASS | 66/66 files, 1245/1245 tests |
| `pnpm test:int` (local Supabase 127.0.0.1:54322) | PASS | 32/32 files, 675/675 tests |
| `pnpm test:e2e` (Playwright, next build + next start, llm-stub) | 1 failed on first run, PASS on rerun | 328 passed, 1 failed first run of 329 |

Runtime: unit 27s; int 497s (8m18s wall); e2e 17.2 min.

## Failures

1. **e2e, first run, flaky (environmental)**
   - `tests/e2e/responsive.spec.ts:82` (`page.goto("/data-notice?next=/prep/chi-thu")`), test at :80, `[desktop]` project.
   - Error: `net::ERR_NETWORK_CHANGED`. Network-layer drop, not an app assertion.
   - Rerun of `responsive.spec.ts` alone: 12/12 passed (47s). Verdict: flaky under load, not a regression.
   - Mobile variant of the same test passed in the first run.

No real failures. No timeouts in int (canvas.int and session-list.int passed in the full run, no rerun needed).

## Coverage gaps (new code)

Route-check path is covered by unit tests (`tests/llm/route-check.test.ts`: confusable detection, alias case, tag repair scope) and graph tests (`tests/graphs/generation-graph.test.ts`: repair of confusable tags, still-confusable pass, dropped repair that breaks validate, no-route counted as confusable). Not covered, suggest adding:

- [!] `src/graphs/generation-graph.ts:109`: `callModel("SCENARIO_GENERATOR", …)` for the tag repair throws. No test asserts the error propagates (same as generator path, but unverified here).
- [!] `src/graphs/generation-graph.ts:110-111`: tag repair reply that applies zero changes (all ignored or empty). Still records a `targeted` repair and runs a second ANALYSIS call and `onDraft` again. Add test: no-op repair reports `repaired: true` with `ignored` and does not emit a misleading repair entry.
- [!] `src/llm/prompts/route-check.ts` `confusableItems(0, …)` / reply with out-of-range item index: no test seen for empty scenario or index beyond `itemCount`.
- [!] `src/graphs/generation-graph.ts:123`: second route check after successful repair returns non-empty; covered for "still confusable" but not asserting `routeCheck.confusable` values are the post-repair indexes.
- [!] Route check has no retry/schema-failure test at the graph level for `routeCheckSchema` mismatch (callModel retries on schema error; untested in this node).
- Note: `report.repairs` / `report.routeCheck` UI rendering in `src/app/admin/custom-topics/[attemptId]/page.tsx` has no unit test; only indirect e2e coverage, if any. Check e2e `custom-topic.spec.ts` asserts the new fields.

## Build status

`next build` ran as part of e2e webServer (`pnpm exec next build && next start`): succeeded (e2e ran against it). No separate warning review performed beyond that; git CRLF warnings only (line-ending, not build).

## Performance

- Slowest e2e: library-path flows 6.5s to 9.8s per test; no timeouts.
- int suite 497s total, dominated by DB/model-stub tests; no single slow-test list captured (no `--reporter=verbose` timing pass).

## Critical issues

None blocking. All gates green except one flaky e2e test that passed on rerun.

## Recommendations / next steps

1. Add the 3-4 route-check/tag-repair edge tests above (no-op repair, index out of range, repair model throw).
2. Confirm admin page renders `report.repairs` and `report.routeCheck` (add a unit or e2e assertion).
3. Investigate `ERR_NETWORK_CHANGED` flakiness in responsive.spec (likely dev-machine network or Playwright webServer warmup); consider `page.goto` retry only if it recurs.
4. Commit is not in tester scope; working tree is untracked for route-check.ts and two docs files, which should be included in the commit.

## Unresolved questions

- Does `tests/e2e/custom-topic.spec.ts` assert `report.routeCheck` / `report.repairs` in the admin UI? Not verified in this run.
- Is the `ANALYSIS` role mapped to a real model in the live config (typecheck passes, live behavior not exercised, paid calls forbidden)?
- Was the ERR_NETWORK_CHANGED caused by machine network changes during the 17-minute run? Could not confirm from logs.
