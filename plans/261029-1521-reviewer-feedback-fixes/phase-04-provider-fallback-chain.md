---
phase: 4
title: "Fallback chain and OpenAI readiness"
status: completed
priority: P1
effort: "1d"
dependencies: []
---

# Phase 4: Fallback chain and OpenAI readiness

## Overview

Let each role name an ordered chain of specs (D11), so OpenAI answers first and Google takes over when OpenAI is exhausted. Make the OpenAI path ready: prices, env checks and tests. This phase makes no paid call.

## Context

- `parseRoleSpec` (`src/llm/roles.ts`) parses one `provider:model:effort`. The env schema (`src/config/env.ts:50-63`) stores one `RoleSpec` per role, checks `hasPrice` per spec (`:27`), and requires a provider key when a role uses that provider (`:83-90`).
- `callModel` (`src/llm/call-model.ts`) resolves one spec through `deps.roleSpec`. It runs `LLM_MAX_RETRIES + 1` attempts, writes one `llm_call` row per attempt, never retries after a streamed piece was sent (`deltaSent`), and stops early on non-retryable status (`isRetryable`).
- Callers outside `callModel` read the primary spec only. These are the Gemini batch path (`src/llm/gemini-batch.ts:315`), the cost estimates and the eval CLIs. They keep doing so.
- OpenAI exhausted credit looks like HTTP 429 with `code: "insufficient_quota"`. Retrying it never helps, but today `isRetryable` retries every 429.

## Requirements

- Syntax: `LLM_<ROLE>=spec[,spec…]`, each spec `provider:model:effort`. A single spec, which is today's format, stays valid.
- Env: every spec in a chain must have a price and a configured key for its provider. Error messages name the role and the position in the chain.
- `callModel` walks the chain:
  - Each spec gets its own retry loop, as today.
  - It moves to the next spec at once on a non-retryable error. Non-retryable now also covers 429 with `code` `insufficient_quota` from either provider (Google: status `RESOURCE_EXHAUSTED` with a billing message). Ordinary rate-limit 429s stay retryable.
  - It also moves on after a spec's retries are exhausted.
  - It never moves on when the caller aborted, or when a streamed piece was already sent.
  - `llm_call.attempt` keeps counting across the chain, and `model` is the spec that ran.
  - It logs one `console.warn` per fallback with role, from-model, to-model and status. The log carries no prompt or reply text.
  - `LlmCallError.attempts` is the total across the chain.
- Pricing: add `gpt-6.1-terra` (1.00 / 0.05 / 5.00) after the user confirms it in the OpenAI console. Re-confirm `gpt-6.1-sol` and `gpt-6-luna`, and update the source comment to the console date.
- `.env.example`: OpenAI-first chains with a Google fallback. Final values are set in phase 5. Add a comment on the chain syntax.
- No new dependency.

## Architecture

```ts
// src/llm/roles.ts
export function parseRoleChain(raw: string): RoleSpec[];   // split on ",", parseRoleSpec each, ≥ 1

// src/config/env.ts — schema value becomes RoleSpec[]
export function roleChainFromEnv(role: Role): RoleSpec[];
export function roleSpecFromEnv(role: Role): RoleSpec;     // = roleChainFromEnv(role)[0], unchanged contract

// src/llm/call-model.ts
type CallModelDeps = {
  roleSpec: (role: Role) => RoleSpec;            // kept: tests and batch inject it
  fallbackSpecs?: (role: Role) => RoleSpec[];    // default: roleChainFromEnv(role).slice(1)
  …
};
```

Control flow: `for (const spec of [primary, ...fallbacks])` → existing attempt loop extracted into `runSpec(spec, attemptOffset)` → it returns a result or throws `{ final: boolean, error }`. Here `final` is true for abort or `deltaSent`, and the chain stops on it. `createModel` is called per spec, with the role's `MAX_OUTPUT_TOKENS`.

## Related Code Files

- Modify: `src/llm/roles.ts`, `src/config/env.ts`, `src/llm/call-model.ts`, `src/llm/pricing.ts`, `.env.example`
- Tests: `tests/llm/call-model.test.ts`, `tests/llm/roles-and-pricing.test.ts`, `tests/config/env.test.ts`
- Read only: `src/llm/gemini-batch.ts` (it must still compile with `roleSpecFromEnv`), `tests/helpers/eval-models.ts`

## Implementation Steps

1. `parseRoleChain` and its tests: single spec; two specs; spaces around commas; empty element; bad provider at position 2, with the error naming it.
2. Env: schema to `RoleSpec[]`; per-spec `hasPrice`; the key check covers every provider in any chain; `roleChainFromEnv`; `roleSpecFromEnv` stays.
3. `isRetryable`: treat 429 with `insufficient_quota` / billing exhaustion as non-retryable. Read the shape off the SDK error objects (`error.code`, `error.error?.code`, and Google's `status` string). Pin it with tests built from the real error shapes.
4. `callModel` chain loop, as in Architecture. Keep `onDelta` semantics.
5. Unit tests with an injected `createModel`:
   - The primary throws 500 three times, and the fallback answers. That gives 4 rows, `model` correct, `attempt` 1–4.
   - The primary throws 429 `insufficient_quota`. That gives 1 row, then the fallback.
   - The primary throws 401. The fallback answers.
   - A stream sends one piece and then fails. There is no fallback, and `LlmCallError` is thrown.
   - The caller aborts. There is no fallback.
   - Both specs are exhausted. `LlmCallError.attempts` is the total.
   - A structured-output parse failure on the primary falls back after its retries.
6. Pricing rows and tests (`hasPrice("gpt-6.1-terra")`).
7. `pnpm typecheck && pnpm test`, then `pnpm test:int` (env parsing is used by the int stack), then `pnpm test:e2e`. The stub env is single-spec, so it shows the old format still works.

## Todo

- [x] `parseRoleChain` + env schema
- [x] Non-retryable quota errors
- [x] Chain loop in `callModel`
- [x] Prices confirmed in the console by the user (2026-10-30): terra 1 / 0.05 / 5, sol 2 / 0.1 / 10, luna 0.1 / 0.01 / 0.5
- [x] Tests green

## Success Criteria

- [x] All listed unit tests pass. Unit, int and e2e suites are green with no key.
- [x] `.env.example` parses with chains.

## Risk Assessment

- Retries and the chain together can exceed `TURN_TIME_BUDGET_MS`. Quota and auth errors skip retries, and the turn budget still aborts the whole turn as today.
- A 400 from a strict-schema mismatch would silently fall back and hide a bug. The `console.warn` names the status, and the phase 5 smoke test calls every role on the primary alone.

## Security Considerations

Keys are read only through `getEnv()`. Fallback logs carry role, model and status, never message content.

## Implementation notes (2026-10-30)

- The error shapes were read off the installed clients against a local fake server. OpenAI quota exhaustion returns `{ status: 429, code: "insufficient_quota", rateLimitType: "stop" }`. Google's `RequestError` carries `statusCode` (not `status`), and a depleted prepaid credit gives `rateLimitType: "stop"`. Side effect: Google 400/401/403/404 are no longer retried. They used to be, because their status was invisible to `isRetryable`.
- After code review: calls in scope `eval` never fall back (judgement-eval, eval, transcript-run, QA agent, string check). Each score therefore belongs to the model it names, and the QA cache key and cost estimates stay correct.
- Accepted: on a turn, a primary that keeps timing out (3 × 45 s) uses the 110 s turn budget, so there the fallback only helps with fast failures (quota, auth, 5xx).
- Gates: typecheck, lint, unit 1292/1292, int 677/677 (first run: the 30-turn test "makes a later end request harmless" failed once for reasons outside this change and passed on rerun), e2e 331/331. Review: `plans/reports/code-reviewer-261030-1025-phase-04-fallback-chain.md`.
