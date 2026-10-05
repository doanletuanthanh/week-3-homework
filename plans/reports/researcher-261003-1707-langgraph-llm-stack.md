# InterviewLab LLM stack research (checked 2026-10-03)

Method: npm registry (`npm view`, authoritative) + official docs via fetch tool (page text is summarized by a small model, so exact numbers = medium confidence; re-verify price/ID in console before hardcoding). Marked [U] = unverified.

## 1. LangGraph JS
npm view, 2026-10-03 (https://www.npmjs.com/package/@langchain/langgraph etc.):
| pkg | ver | notes |
|---|---|---|
| @langchain/langgraph | 1.4.18 | peer: @langchain/core ^1.1.48, zod ^3.25.32 or ^4.2.0; node >=18 |
| @langchain/core | 1.2.14 | |
| @langchain/openai | 1.6.2 | engines node >=22; peer core ^1.2.14 |
| @langchain/google | 0.2.9 | NEW recommended pkg, class `ChatGoogle`, env `GOOGLE_API_KEY` |
| @langchain/google-genai | 2.3.2 | docs say "older", replaced by @langchain/google (https://docs.langchain.com/oss/javascript/integrations/chat/google) |
| zod | 4.6.5 | |
| langsmith | 0.10.8 | |
| next | 16.3.8 | |
- Vercel: LangChain.js officially supports Vercel/Next.js serverless (https://js.langchain.com/docs/how_to/callbacks_serverless). LangGraph docs do not cover Vercel specifically [U], but a no-checkpointer compiled graph is plain async JS; no known blocker. Hobby fn max duration 300s w/ fluid compute (default 300s) (https://vercel.com/docs/functions/configuring-functions/duration, updated 2026-08-24) -> fine for 3-call reveal; set `export const maxDuration`. Use Node 22 runtime (openai pkg needs >=22), NOT edge.
- Typed state: current docs recommend `StateSchema` + Zod v4 (`import { z } from "zod/v4"`), types via `typeof State.State` / `.Update` (https://docs.langchain.com/oss/javascript/langgraph/graph-api). `Annotation.Root` is the older API [U whether deprecated]. Pick StateSchema.
- Graph: START -> analyze -> gate (pure TS node) -> persona -> persist -> END; linear `addEdge`, `.compile()` with no args.
- Checkpointer: confirm your default = NO. Docs: checkpointer is for conversation continuity, HITL, time travel, fault tolerance; without it each invoke is stateless (https://docs.langchain.com/oss/javascript/langgraph/persistence). You own state in Postgres in one txn, model has no tools, no interrupts -> checkpointer adds a second source of truth + writes per super-step + latency for zero benefit. Risk: you lose LangGraph resume-after-crash; handle by idempotent turn (client turn_id, retry whole turn). Honest take: LangGraph itself is marginal for 2 calls; keep it only because user decided; keep nodes thin so plain-function fallback is trivial.
- Persist node: do the DB txn inside the graph or after `invoke` returns; prefer after (graph returns state; route handler writes txn) -> testable, no partial-persist on node retry.

## 2. Structured output
- LangChain docs: provider (native) strategy recommended when available; tool-calling strategy is fallback. Supported natively: OpenAI, Gemini (https://docs.langchain.com/oss/javascript/langchain/structured-output). On chat models use `model.withStructuredOutput(zodSchema, {...})`.
- OpenAI: use `method: "jsonSchema"` + `strict: true` (https://docs.langchain.com/oss/javascript/integrations/chat/openai). Strict => no optional/defaulted fields; use `z.nullable()` not `z.optional()` (docs state this for reasoning models). All fields required; `additionalProperties:false` handled by lib.
- Gemini: native JSON-schema structured output; supports string/number/integer/boolean/object/array/null, enum, format, min/max, `$ref` recursion; "not all JSON Schema features supported", "very large or deeply nested schemas may be rejected" (https://ai.google.dev/gemini-api/docs/structured-output). Exact nesting/property/enum limits NOT documented there [U].
- Zod v3 vs v4: langgraph accepts both; use v4 (4.6.5) and `zod/v4` import consistently. Gemini+Zod v4 compat not stated in docs [U] -> smoke-test schemas for call 1/judge/generator/verifier once per provider in CI.
- Pitfalls/rules: keep schemas flat, arrays of simple objects, closed enums for `label`/`question_type`; use `nullable` for `grounded_turn_id`, `introduced_span`, `hook_id` (matches your addendum JSON); NEVER trust the schema for semantics (your code-gate already re-validates); always re-parse with Zod after return and treat parse failure as retry-once-then-degrade (label=`open`).
- Gemini thinking tokens count against `max_output_tokens` (hard cutoff -> truncated JSON). Set generous maxOutputTokens (https://ai.google.dev/gemini-api/docs/thinking).

## 3. Models (prices per 1M tokens, standard tier, USD)
Gemini (https://ai.google.dev/gemini-api/docs/pricing, page "last updated 2026-10-01"; models list https://ai.google.dev/gemini-api/docs/models):
| ID | status | in | cached in | out | free tier |
|---|---|---|---|---|---|
| gemini-3.8-flash | stable | 0.75* | 0.075* | 3.75* | yes |
| gemini-3.7-flash / 3.6-flash | stable | 0.75* | 0.075* | 3.75* | yes |
| gemini-3.5-flash | stable (legacy) | 1.50 | 0.15 | 9.00 | yes |
| gemini-3.5-flash-lite | stable | 0.30 | 0.03 | 2.50 | yes |
| gemini-3.1-flash-lite | stable | 0.25 | 0.025 | 1.50 | yes |
| gemini-3.1-pro-preview | preview | 2.00 (<=200k) | 0.20 | 12.00 | no |
| gemini-2.5-* | limited to past active users | | | | |
*price rises 2027-01-01 (new amounts not stated on page) [U]. Docs recommend "3.5 Flash-Lite or 3.8 Flash" for new projects.
- Thinking config: levels `minimal|low|medium|high` (`thinking_level`); defaults: 3.8-flash = medium, 3.5-flash-lite = minimal. Thinking tokens billed as output. LangChain: `new ChatGoogle({model, reasoningEffort: "low"})` or `thinkingBudget` / `maxReasoningTokens` (https://docs.langchain.com/oss/javascript/integrations/chat/google). Not verified whether `reasoningEffort` maps to level vs budget per model [U].
OpenAI (https://developers.openai.com/api/docs/pricing, no date on page; https://developers.openai.com/api/docs/models):
| ID | in | cached in | out | notes |
|---|---|---|---|---|
| gpt-6-astra | 10.00 | 1.00 | 50.00 | flagship; effort low..max |
| gpt-6.1-sol | 2.00 | 0.10 | 10.00 | near-flagship, mid tier |
| gpt-6-sol | 2.00 | 0.20 | 10.00 | older Sol |
| gpt-6-luna | 0.10 | 0.01 | 0.50 | efficient; effort none..max |
| gpt-5.6-sol/terra/luna | 4/2/0.20 | .4/.2/.02 | 20/12/1.20 | previous gen |
- Effort via LangChain: `new ChatOpenAI({model, reasoning: {effort: "medium"}})` (Responses API; param shape [U], check @langchain/openai ref). 1.05M ctx.
- Latency (<=3s) for any model: NOT verified, no official numbers; benchmark in Vietnamese with real prompt sizes before locking.

Recommendation per role (pin IDs in one config file, env-overridable):
| role | model | setting | why |
|---|---|---|---|
| Call 1 analysis | gemini-3.5-flash-lite | thinking low (default minimal ok) | cheapest, JSON classification, latency |
| Call 2 persona | gemini-3.8-flash | low | Vietnamese naturalness > lite; fallback 3.5-flash-lite if p95 blown |
| End judge | gpt-6.1-sol | effort medium | 3 calls only, ~8k in; accuracy matters; diff family |
| Generator (feedback) | gemini-3.8-flash | medium | structured claims; not latency-critical |
| Verifier | gpt-6-luna medium (upgrade to gpt-6.1-sol if disagree-rate noisy) | medium | cheap, other family than generator |
| Scenario generator | gemini-3.8-flash | high | worker, offline-ish; quality; retry loop up to 2 |
| Moderation (2.7 classify+focus) | gemini-3.5-flash-lite | low | policy+focus JSON needs LLM, not just flags. OpenAI `omni-moderation-latest` is free (https://developers.openai.com/api/docs/guides/moderation) but Vietnamese coverage not documented [U]; optional extra pre-check |
Cost sanity (my estimate): reveal = 3 calls x ~8k in; judge on sol ~$0.016 in + out small; all calls < ~$0.05/session. Turn: ~2 calls x few k tokens ~ $0.002-0.01.
Could not verify: real latency, free-tier lists for gpt-6, whether 3.8-flash price after 2027-01-01.

## 4. Prompt caching
- Gemini: implicit caching on by default for 2.5+; min 4,096 tokens for 3.8/3.7/3.6/3.5 Flash and 3.1 Pro; 2,048 for 2.5; put large common content first; similar prefixes close in time; check `usage.total_cached_tokens`; explicit caching only via generateContent (https://ai.google.dev/gemini-api/docs/caching). Discount per table above (~90%). Min for 3.5-flash-lite not stated [U].
- OpenAI: GPT-5.6+ min 1,024 tokens; implicit (auto breakpoint at end of latest eligible message) or explicit `prompt_cache_breakpoint`; GPT-5.6+ TTL 30 min default (`prompt_cache_options.ttl`), cache read 0.1x, write 1.25x (https://developers.openai.com/api/docs/guides/prompt-caching). Whether gpt-6 family follows the "5.6+" rules: assumed [U].
- Ordering: [fixed rules + schema/instructions] -> [persona identity/surface facts/opened items] -> [transcript, append-only] -> [new learner question LAST]. Don't reorder/rewrite old turns. Caveat: your Call 2 context changes per turn (openness, opened items, hook) -> keep those blocks AFTER transcript-independent static part but they invalidate cache for everything after; put volatile bits at the very end. Realistic hit: static persona block only; if it is <4,096 tokens on Gemini no caching happens (likely for Call 1/2) -> don't count on savings; reveal calls (6-10k) can cache between judge/generator/verifier only across providers? No: judge (OpenAI) and verifier (OpenAI) can share a prefix of the transcript; Gemini generator separate.

## 5. Data policy / free tier
- Gemini free tier: content used to improve Google products = YES; paid = NO (pricing page, 2026-10-01). Learner transcripts are user data -> use paid (billing-enabled) key in prod; free only for dev with fake data. Vietnamese learner PII/privacy notice must reflect this.
- Free-tier rate limits: NOT verifiable. Official docs say limits "viewed in AI Studio" (login-gated), per project, not guaranteed (https://ai.google.dev/gemini-api/docs/rate-limits). Third-party blogs claim large cuts in 2025/2026 and ~15 RPM for lite (low credibility, unsourced). Treat free tier as insufficient for 7-parallel evals; check AI Studio manually.
- OpenAI: API data not used for training unless opt-in; abuse-monitoring logs 30 days default; ZDR by approval (https://developers.openai.com/api/docs/guides/your-data).

## 6. LangSmith
- Free Developer plan: 1 seat, 5k base traces/mo then pay-as-you-go, base retention 14 days (https://www.langchain.com/pricing, 2026-10-03). Set a spend cap/disable PAYG [U where]. 1 interview session ~ (2 calls x ~20 turns + reveal) = many runs but one trace per request: 1 turn = 1 trace -> ~5k turns/mo. Use sampling.
- Env (https://docs.langchain.com/langsmith/trace-with-langgraph): `LANGSMITH_TRACING=true`, `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT`, `LANGSMITH_ENDPOINT` (non-US only).
- Serverless flush (two layers): LangChain callbacks: `LANGCHAIN_CALLBACKS_BACKGROUND=false` (blocking) or `await awaitAllCallbacks()` from `@langchain/core/callbacks/promises` (https://js.langchain.com/docs/how_to/callbacks_serverless; docs.langchain.com also says false for serverless). LangSmith SDK/traceable: `LANGSMITH_TRACING_BACKGROUND=false` or `await client.awaitPendingTraceBatches()` (https://docs.langchain.com/langsmith/serverless-environments). Safest: in route handler `try { ... } finally { await awaitAllCallbacks(); }`; keep background=false off the hot path if latency matters (blocking adds trace-send time to p95; prefer finally-flush after response data is ready, or Next `after()` [U verified with Vercel keeping fn alive]).
- Metadata/tags: pass in invoke config: `graph.invoke(input, {runName:"turn", tags:["call:analysis"], metadata:{session_id, turn_index, call_role}})`; inherited by child runs. Per-model-call role: `model.withConfig({tags:[...], metadata:{call_role:"judge"}})`. Also `ls_model_name` metadata overrides model display (https://docs.langchain.com/langsmith/trace-with-langchain).
- Hide: env `LANGSMITH_HIDE_INPUTS=true`, `LANGSMITH_HIDE_OUTPUTS=true`; or `new Client({hideInputs: fn, hideOutputs: fn})` and pass client explicitly (calls without it ignore it) (https://docs.langchain.com/langsmith/mask-inputs-outputs). Sampling env `LANGSMITH_TRACING_SAMPLING_RATE` [U not fetched; verify]. Recommend: hide inputs in prod (Vietnamese learner text), sample 100% in dev.

## 7. Usage/cost accounting
- LangChain standard `AIMessage.usage_metadata`: `input_tokens`, `output_tokens`, `total_tokens`, `input_token_details.cache_read`, `output_token_details.reasoning` (OpenAI: https://docs.langchain.com/oss/javascript/integrations/chat/openai). ChatGoogle: reference says usage_metadata captures cached and reasoning tokens (https://reference.langchain.com/javascript/langchain-google/ChatGoogle); exact field names assumed same standard shape [U] -> log raw `response_metadata` too and assert in a one-off test.
- Gotchas [U, test]: Gemini `output_tokens` may or may not include thinking tokens; OpenAI `output_tokens` includes reasoning. Compute cost = (input - cache_read)*in + cache_read*cached + (output [+ reasoning if separate])*out; thinking billed as output (Gemini doc). Store raw usage JSON per call + price snapshot version in DB; use `withStructuredOutput({includeRaw:true})` or read message via callback (`handleLLMEnd`) because plain `withStructuredOutput` drops the AIMessage and its usage. This is the main trap.
- Daily cap: reserve estimated max cost before call (your PRD does this), reconcile with actuals after.

## Recommended
- deps: next 16.3.8 (or your pinned), @langchain/langgraph 1.4.18, @langchain/core 1.2.14, @langchain/google 0.2.9 (not google-genai), @langchain/openai 1.6.2, zod 4.6.5 (`zod/v4`), langsmith 0.10.8. Node 22 runtime, `maxDuration` set.
- Graph: StateSchema+Zod v4, no checkpointer, compile once at module scope, invoke per request; DB txn in route after invoke.
- Models: see table (flash-lite 3.5 / flash 3.8 / gpt-6.1-sol / gpt-6-luna). Config in one file keyed by role; paid Gemini key in prod.
- Structured: OpenAI `jsonSchema`+`strict`, nullable-only; Gemini native; always Zod re-parse; `includeRaw` for usage.
- Tracing: LANGSMITH_TRACING=true, LANGSMITH_PROJECT, HIDE_INPUTS in prod, metadata {session_id, turn_index, call_role}, `finally { await awaitAllCallbacks(); }`.

## Unresolved questions
1. Gemini free-tier RPM/RPD for 3.5-flash-lite / 3.8-flash (AI Studio login-gated). 
2. p95 latency of 3.5-flash-lite and 3.8-flash(low) on ~3-5k Vietnamese prompts; benchmark needed.
3. Does ChatGoogle usage_metadata include thinking tokens inside output_tokens? Exact field names.
4. gpt-6.1-sol vs gpt-6-sol: why different cached price; any structured-output/strict caveats on gpt-6-luna with effort `none`.
5. Zod v4 + Gemini schema conversion in @langchain/google 0.2.x (pre-1.0 pkg; breaking-change risk). Fallback: @langchain/google-genai 2.3.2.
6. 2027-01-01 Gemini price increase amounts; LangSmith PAYG cap setting; sampling env name.
7. Gemini 3.5-flash-lite min cache tokens; whether gpt-6 follows GPT-5.6 caching rules.
