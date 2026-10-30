# Code review: phase 4, fallback chain and OpenAI readiness

## Scope
- Files: src/llm/roles.ts, src/config/env.ts, src/llm/call-model.ts, src/llm/pricing.ts, .env.example, tests/config/env.test.ts, tests/llm/call-model.test.ts, tests/llm/roles-and-pricing.test.ts
- LOC: about 120 in src, about 200 in tests
- Focus: the uncommitted diff, plus every caller of `roleSpecFromEnv`, `CallModelDeps`, `getEnv().LLM_*` and `batchLlmDeps`
- Gates I ran: `pnpm typecheck` clean, `pnpm lint` clean, `pnpm test` 67 files and 1290 tests passed. I did not run int or e2e, as asked.

## Overall assessment
The chain loop is right and small. Streaming, abort, attempt numbering and `LlmCallError.attempts` all behave as the plan says, and tests cover each rule. No caller reads `LLM_*` as a single object: the only direct reader of `getEnv()[\`LLM_${role}\`]` is `roleChainFromEnv`. I found no blocker. One acceptance item is not met (the prices were not confirmed in the vendor console). Two eval paths now take fallbacks silently, and the plan did not consider that.

## Critical issues
None.

## High priority

### H1. The price acceptance item is not met
The plan says: add `gpt-6.1-terra` only after the user confirms it in the OpenAI console, re-confirm `gpt-6.1-sol` and `gpt-6-luna`, and date the source comment from the console. The diff instead cites "third-party price lists of 2026-10-30", and sol and luna were not re-checked. The env price check now lets six roles bill at an unconfirmed rate (ANALYSIS, PERSONA, FEEDBACK, MODERATION, SAFETY, QA_PLANNER, EVAL_LEAK_JUDGE). The `llm_call.cost_usd` figures and the quota or budget guards rest on that rate.
Fix: the user confirms the prices in the console, then the comment changes to "OpenAI console, <date>". Until then, leave the Todo item "Prices confirmed in the console and added" unchecked.

## Medium priority

### M1. The judgement-eval and lean-eval paths now take fallbacks silently, which can corrupt measurements
Nothing in production sets `roleSpec`, so every path gets the env fallbacks, CLI evals included. `pnpm il judgement-eval` exists to measure one model ("cheapest model that passed 3/3"). Take an operator who sets `LLM_<ROLE>` to a chain, or who overrides only the role under test while another role in the set (for example `topic-route` going through ANALYSIS) keeps a chain. A primary that fails with a 401, a quota error, a 404 or a run of 5xx is then scored on the fallback's answers. The verdict output still names the primary as the model under test. Phase 5 relies on these runs ("`LLM_<ROLE>` overridden per run").
Also in this area:
- `runQaAgent` builds `cacheSalt` and `runKey` from `roleSpec("ANALYSIS"/"PERSONA"/...)`, the primary only (src/graphs/qa-agent-graph.ts:409-414). A probe that the fallback answered is cached under the primary's key, and later runs with "the same probe models" reuse it.
- Cost estimates use the primary price only: `transcript-run.ts:73-75`, and the QA budget's `canAfford` pre-check. The Google fallbacks cost 3 to 5 times more than `gpt-6-luna` (flash-lite at 0.3/2.5 against 0.1/0.5). The QA agent's `hardStop` on actual spend still caps the real cost, so only the up-front estimate is wrong.

Fix (cheap): measurement paths pin the primary. `runJudgementEval` (and the lean eval, if wanted) passes `fallbackSpecs: () => []` in its `callDeps`. If not, add a line to phase 5 that every judgement run must use single-spec values for every role its set touches.

### M2. Google 4xx errors are no longer retried. The change is intended, but it is a behaviour change worth stating in the commit
Before this diff, `isRetryable` read only `status`, and `@langchain/google`'s `RequestError` carries `statusCode`. So every Google 400, 401, 403 and 404 was retried up to 3 times. Now they fail on the first attempt, or go straight to the next spec. I found nothing in src, docs or plans that relies on a Gemini 400 being retried: no "flaky 400" notes, and no code that matches on it. The batch path is untouched, since `BatchCallError` sets `status` and maps rpc codes on its own. Two risks remain:
- A Gemini 400 that is in fact transient (one is sometimes seen with thinking plus a structured schema) now fails the call when Google is the last spec. Today Google is the fallback in every chain, so that is the last resort.
- The plan's own risk: a 400 from a strict-schema mismatch on the OpenAI primary falls back silently. The only signal is the `console.warn`, so an OpenAI schema bug would look like "it works", just billed at the Google price. The phase 5 primary-alone smoke test is the mitigation. Keep it.

### M3. The chain makes worst-case latency longer on paths with no time budget
`TURN_TIME_BUDGET_MS` (110 s) aborts turns and replays as before, so turns are bounded. Inside a turn, a primary that times out spends 3 x 45 s = 135 s, more than the budget. So a fallback after timeouts can never happen on a turn: the chain only helps there on fast failures (quota, auth, 5xx). That is acceptable and matches the plan, but `.env.example` reads as if fallback were a general safety net.
Reveal (`/end`, `/reveal`), custom topics and guide-check have `maxDuration = 300` and no overall signal. One call's worst case goes from 135 s to 270 s on a two-spec chain, and reveal makes three calls in a row. Those paths could already pass 300 s before this change, so this is not a regression in kind, but the gap is now twice as wide. No change is needed now. Note it in the phase 5 smoke or the deploy runbook if timeouts appear.

## Low priority

- L1. In `call-model.ts`, if `createModel` throws for a fallback spec (it now runs inside the `try`), a raw error escapes instead of `LlmCallError`, and the primary's `lastError` is lost. `turns.ts:106`, `replay.ts:194`, `custom-topic.ts:81` and `guide-check.ts:85` rethrow anything that is not an `LlmCallError`, so the learner would get a 500 instead of the graceful failure. In practice env validation guarantees every chain provider has a key, and `createChatModel` does no other check, so this cannot happen today. Moving `createModel` into the `try` also means `awaitAllCallbacks` now runs on a primary construction error, which is harmless. Optional fix: wrap the `createModel` call so that a throw becomes `lastError` and the loop `continue`s.
- L2. `isRetryable` depends only on the client-derived `rateLimitType === "stop"`. You verified this against the installed clients, which is good. As a hedge against a client upgrade that renames the field, also treat `code === "insufficient_quota"` as final. The plan asked for that, and the OpenAI test fixture already carries it.
- L3. The test "uses no fallback when the caller picks the model and names none" cannot fail if the merge rule `depsOverride.roleSpec && !depsOverride.fallbackSpecs` is removed. The unit-test env is single-spec, so `fallbackSpecsFromEnv("PERSONA")` returns `[]` either way. To prove the rule, stub env with a chain, or assert that `fallbackSpecsFromEnv` is not called.
- L4. Unpriced-model errors name the model but not the position ("spec N"). The model name finds the spot just as well, so this needs no change. The plan asked for role and position, and the role is present through the zod path.
- L5. The message in `roleChainFromEnv` still says `expected "provider:model:effort"`. Consider "provider:model:effort[,…]".
- L6. Success criterion ".env.example parses with chains" has no test. I checked by hand: every chained model (gpt-6.1-terra, gpt-6.1-sol, gpt-6-luna, gemini-3.8-flash, gemini-3.5-flash-lite) is in `PRICES`, every spec has three parts with valid effort, and both keys are listed. The int or e2e stub env is single-spec, so the new format is proven only by unit tests.

## Answers to the explicit checks

(a) Acceptance criteria
| Item | Status |
|---|---|
| Single spec stays valid | Met (tests and the stub env) |
| Every spec priced, every provider keyed, error names role and position | Met. Price errors name the model, not the position (L4) |
| Own retry loop per spec | Met |
| Move on at once if non-retryable, including insufficient_quota and Google billing | Met, through `rateLimitType: "stop"` (L2) |
| Move on after retries are spent | Met (tested 3+1) |
| No move after abort or deltaSent | Met (both tested) |
| `attempt` counts across the chain, `model` is the spec that ran | Met (tested) |
| One warn per fallback, no content | Met (tested that the error message is excluded) |
| `LlmCallError.attempts` is the total | Met (tested) |
| `gpt-6.1-terra` price confirmed in console, sol/luna re-confirmed | Not met (H1) |
| `.env.example` OpenAI-first plus chain comment | Met |
| No new dependency | Met |
| All 7 listed unit tests | Present and passing |
| Unit, int and e2e green | Unit green. I did not run int or e2e, as asked |

(b) Callers
- `roleSpecFromEnv`: `qa-agent-graph.ts:409` and `transcript-run.ts:73` still get a single `RoleSpec`, so the contract is kept. Neither reads `getEnv().LLM_*` directly.
- `batchLlmDeps` does not set `roleSpec`, so batch runs get the env fallbacks. A Google fallback goes through the collector at batch price, and an OpenAI spec keeps its usual client. That works. With OpenAI-first chains, though, `--batch` saves almost nothing until a fallback fires. That is a phase 5 cost note.
- `tests/helpers/eval-models.ts`, `session-fixtures.ts` and `custom-fixtures.ts` set `roleSpec`, so they get no fallback. That is right for deterministic tests.
- CLI eval paths (`eval.ts`, `eval-calibrate.ts`, `judgement-eval.ts`) do not set `roleSpec`, so they take fallbacks. Wrong for measurement, see M1.

(c) Public contract: `Env["LLM_<ROLE>"]` is now `RoleSpec[]` (optional roles are `RoleSpec[] | undefined`). `CallModelDeps` gains a required `fallbackSpecs`, but every external use is `Partial<CallModelDeps>`, so nothing breaks. New exports: `parseRoleChain`, `roleChainFromEnv`, `fallbackSpecsFromEnv`. Call these out in the commit body.

(d) Google 4xx: see M2. No caller relies on it. The residual risk is that a transient Gemini 400 now fails the call when Google is the last spec.

(e) Streaming and createModel: the `deltaSent` and abort guards come before the `isRetryable` and break logic, so a fallback never starts after a piece was sent. A `createModel` throw inside `try`/`finally` runs `awaitAllCallbacks` and then escapes as a raw error (L1). That cannot happen today, given the env key check.

(f) `TURN_TIME_BUDGET_MS`: see M3. A turn stays bounded. A fallback after timeouts cannot happen within a turn. Reveal, custom-topic and guide-check have no overall bound beyond `maxDuration`.

(g) Style: comments are sparse and explain the reason, as in the surrounding code. Naming matches (`specAttempt`, `statusOf`). The `ProviderError` alias plus `NonNullable<...>` is a little roundabout: `type ProviderError = { status?: unknown; statusCode?: unknown; rateLimitType?: unknown }` without `| null` would remove both `NonNullable` uses. The long line at env.ts:89 passes lint and matches others in the repo.

## Recommended actions
1. H1: the user confirms the terra, sol and luna prices in the OpenAI console, then the pricing comment is updated.
2. M1: pin the primary on judgement-eval, or add a single-spec rule to phase 5. Consider pinning the lean eval too, or adding fallback models to its cache salt.
3. L2: add `code === "insufficient_quota"` as a second check.
4. L3: make the "caller picks the model" test fail when the merge rule is removed.
5. Commit body: list the `Env` type change and the Google 4xx retry change (M2).

## Metrics
- Typecheck: 0 errors. Lint: 0 issues. Unit: 1290/1290 passed.
- Coverage: not measured.

## Unresolved questions
- Should eval and judgement-eval ever use fallbacks? This is a product and ops decision, see M1.
- Are the third-party terra prices acceptable until the console check? That is the user's call.
