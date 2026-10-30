---
title: "Reviewer feedback fixes"
description: "Act on the 2026-10-29 reviewer feedback: brand favicon, retry a persona from scratch, a result screen that coaches with hints instead of listing every secret, takeaway comments without AI slop, and a progress page that compares before and after in plain words. Since 2026-10-30 also: OpenAI as the primary model provider with Google as per-call fallback, and plain-voice rules for the persona and scenario-generator prompts."
status: in-progress
priority: P1
effort: "~10d"
branch: main
tags: [feature, frontend, ux, llm-prompt, llm, llm-cost, database]
blockedBy: []
blocks: []
created: 2026-10-29
---

# Reviewer feedback fixes

## Overview

Source: `Feedback Detail ( include screenshot ).pdf` (3 pages, 6 points, 1 of them praise). Each point traced to code:

| # | Reviewer said | Cause in code | Phase |
|---|---|---|---|
| F1 | "chưa đồng bộ icon": tab shows ▲, header shows the green mark (p.1) | `src/app/favicon.ico` is the create-next-app default (25 931 B); the mark exists only inline in `site-header.tsx` `Logo` | 1 |
| F2 | "UI đẹp thân thiện người dùng" (p.1, home) | Keep. Every phase reuses existing tokens and classes | — |
| F3 | "chỉ cho luyện tập lại 1 kịch bản mà không cho bắt đầu lại từ đầu làm web mất tính sử dụng lại" (p.2, topic card "Đã luyện · 28/10" + only "Xem lại kết quả") | FR-5: unique index `session_user_persona_key` (`schema.ts:177`), `openSession` returns the old session, `played_before` tombstone | 2 |
| F4 | "không nên hiển thị hết những điều này … nên được AI sử dụng thôi": quá nhiều thông tin một lần, liệt kê không đem giá trị, lộ core kịch bản (p.2–3, "Đã kể 2" + "Bỏ lỡ 9") | `toBrowserReveal` sends every untold item's text; also leaks via notes review, replay result, no-replay sample | 3 |
| F5 | "content viết khá AI slop" (p.3, "Mang về") | Feedback prompt allows 1–2 sentences with no style limits; UI repeats turn chips; em-dash title. The persona and generator prompts have no voice rules either | 6, 7 |
| F6 | "tiến bộ nên so sánh trước và sau … không muốn hiểu mấy con số này" (p.3) | `/progress` = 5 percentage tiles + sparklines + % table | 8 |
| U1 | User, 2026-10-30: the Gemini credit is spent; use OpenAI's newest equivalent models, with Google only as a fallback | Every `LLM_*` role is `google:…`; `callModel` has one spec per role and no fallback | 4, 5 |

## Decisions (user, 2026-10-29)

- **D1 Scope HOLD:** the five fixes, nothing extra.
- **D2 Retry:** after finishing, any learner may start the same persona again from turn 0. No per-learner limit; only the global daily cap `session_daily_cap_usd` (FR-37) bounds spend. At most one *unfinished* session per persona per non-demo learner (keeps "Tiếp tục" and double-submit safety).
- **D3 Result screen:** the text of an untold item never reaches the browser. In its place, up to 3 hints for next time: the topic to ask about (`topic_tag`), how to ask (unlock path), the moment the persona hinted, and a suggested question behind an explicit tap. (User asked "gợi ý câu hỏi hoặc chủ đề hỏi": yes, in this form.)
- **D4 Progress:** newest session vs the previous one with the same persona, else vs the first session. Counts and the learner's own questions; no percentages.
- **D5–D9 (Validation Session 1):** sample question only after a tap; Màn 6 order numbers → replay → Mang về → hints → told (collapsed) → notes → next; `/progress` drops "Nhận biết" and "Đoán đúng"; `session_started` records `attempt`; `played_persona_ids` dropped after deploy; every paid model run is asked for right before it runs.

### Decisions (user, 2026-10-30): OpenAI and voice (this widens D1)

- **D10 Models: map, then measure.**
  - Starting map: Gemini Flash → `gpt-6.1-terra`, Flash-Lite → `gpt-6-luna`, and the scenario generator → `gpt-6.1-sol`.
  - Then the judgement sets run each role on Luna. A role moves down only if Luna passes its set 3/3, the same rule as `plans/reports/model-tiering-261014-2250-judgement-sets.md`.
- **D11 Fallback: automatic, per call.**
  - Format: `LLM_<ROLE>=openai:…,google:…`.
  - When the primary is exhausted, `callModel` calls the next spec.
  - A streamed reply switches only before its first piece, the same rule as retries.
- **D12 Budget:** at most 1 USD of real model runs for phases 5, 6 and 9, each run asked for right before it runs.
- **D13 Slop (revised 2026-10-30, user):** it is fixed in the prompts by descriptive rules (`PLAIN_VOICE_LINES`) and a bad/good pair, with **no banned-word list and no keyword matching anywhere**, tests included. It is measured by an eval-only model judge: the `voice-judge` set (`evalsets/voice-judge.jsonl`, role STRING_CHECK on Luna, 46 cases, passed 3/3), and a person reads the before/after. Nothing filters model output at runtime, which keeps the 2026-10-14 rule that no string heuristic decides anything semantic.

Models available to the key (`GET /v1/models`, 2026-10-30): `gpt-6.1-sol`, `gpt-6.1-terra`, `gpt-6-luna`, `gpt-6-sol`, `gpt-6-astra`. The prices below are third-party figures; confirm them in the OpenAI console in phase 4.

| Model | In / cached / out per 1M | Replaces |
|---|---|---|
| `gpt-6.1-terra` | 1.00 / 0.05 / 5.00 | Gemini 3.8 Flash (0.75 / 3.75), 3.5 Flash (1.5 / 9) |
| `gpt-6-luna` | 0.10 / 0.01 / 0.50 | Gemini 3.5 Flash-Lite (0.30 / 2.50) |
| `gpt-6.1-sol` | 2.00 / 0.10 / 10.00 | scenario generation only |

Sources: https://apidog.com/blog/what-is-gpt-6-1-terra/ · https://aireiter.com/blog/gpt-6-1-terra-api-pricing-review · https://anotherwrapper.com/llm-pricing/gpt-6.1-sol

## Invariants

1. Locked item content still never enters Call 1, Call 2 or the replay judge; `engine/seal.ts` stays the only path from `reveal_json` to a browser.
2. New: untold item text is never sent to a learner's browser in any session state. Admin pages keep the full reveal (they read `reveal_json` directly).
3. No new LLM call on the normal path. Reveal stays 3 calls; progress is computed from stored data. A fallback call happens only after the primary failed.
4. Verification spends nothing: e2e stub (it emulates OpenAI) / injected `llmDeps`. Every real-model run (phase 5 smoke and tiering; phase 6 before/after; phase 7 voice check; phase 9 string check and production acceptance) is asked for, with its estimate, right before it runs.
5. Every attempt, fallback included, writes its own `llm_call` row with the model that ran, so the daily cap keeps counting real spend.

## Phases

| # | Phase | Fixes | Effort | Depends on | Status |
|---|---|---|---|---|---|
| 1 | [Brand icon from the logo mark](./phase-01-start.md) | F1 | 0.5d | — | Done (prod check in 9) |
| 2 | [Retry a persona from scratch](./phase-02-retry-from-scratch.md) | F3 | 1.5d | — | Done (migration on prod in 9) |
| 3 | [Result hints instead of secrets](./phase-03-result-hints-instead-of-secrets.md) | F4 | 2d | 2 | Done |
| 4 | [Fallback chain and OpenAI readiness](./phase-04-provider-fallback-chain.md) | U1 | 1d | — | Done |
| 5 | [Switch roles to OpenAI and measure tiers](./phase-05-switch-roles-to-openai-and-measure-tiers.md) | U1 | 0.75d | 4 | Done (≈ 0.28 USD) |
| 6 | [Plain voice in prompts and generated scenarios](./phase-06-plain-voice-in-prompts-and-generated-scenarios.md) | F5 | 1.25d | 5 | Done (≈ 0.16 USD) |
| 7 | [Takeaway copy without AI slop](./phase-07-takeaway-copy-without-ai-slop.md) | F5 | 1d | 3, 6 | Done (≈ 0.10 USD) |
| 8 | [Progress before and after](./phase-08-progress-before-and-after.md) | F6 | 1d | 2 | Done |
| 9 | [Docs, strings and release checks](./phase-09-docs-strings-and-release-checks.md) | all | 1d | 1–8 | Pending |

Run the phases in order 4 → 9. Phase 6 gives phase 7 the shared voice rules, and phase 5 picks the models that phases 6 and 7 check against. Phase 8 does not depend on 4–7 and can run in parallel.

**Urgent path:** if production is down because the Gemini credit is spent (phase 9 step 0 checks this first, and the check is free), ship phases 4–5 on their own with phase 9's env and deploy steps. Then continue with 6.

### Budget for real model runs (D12, ≤ 1 USD)

| Run | Phase | Estimate |
|---|---|---|
| Smoke: one tiny call per role spec | 5 | ≈ 0.01 |
| Judgement sets: Terra 1× and Luna 3× | 5 | ≈ 0.40 |
| Generator before/after on Sol, plus an 8-turn `transcript-run` | 6 | ≈ 0.17 |
| Takeaway voice check | 7 | ≈ 0.05 |
| String check and production acceptance (two sessions + one custom topic) | 9 | ≈ 0.20 |
| **Total** | | **≈ 0.83** |

Before each run, print the estimate and the spend so far (`pnpm il cost-report --days N`). If the spend plus the estimate would go over 1 USD, stop and ask.

## Success Criteria

- [ ] Browser tab shows the green InterviewLab mark on every page; `/favicon.ico` no longer serves the ▲ (F1).
- [ ] A learner who finished chị Thu sees "Luyện lại từ đầu" on the topic card, prep screen and result; it opens a new interview at turn 0; the old result stays in Buổi của tôi (F3).
- [ ] No untold item text in any learner payload (page RSC, `/api/sessions/[id]/reveal`, replay end); result shows ≤ 3 hints + one count line (F4).
- [x] Takeaway: one short sentence per comment, every comment judged plain by the `voice-judge` reading, no em dash, turn chips folded (F5; `plans/reports/manual-test-261030-takeaway-copy.md`).
- [x] `/progress` contains no "%"; with two sessions on one persona it reads "Lần trước → Lần này" in counts plus one before/after question of the learner's own (F6).
- [ ] Every role runs on OpenAI locally and on production: turns, replay, reveal and one custom topic. Each role sits on the cheapest model that passed its set 3/3 (`plans/reports/model-tiering-261030-openai.md`) (U1).
- [ ] When the primary fails (stubbed 500, 401, or 429 `insufficient_quota`), the fallback spec answers, and each attempt has its own `llm_call` row. A stream that already sent text does not fall back (U1).
- [x] The persona and generator prompts carry the shared voice rules. A generated scenario (0/42 texts AI voice, before 1/42) and an 8-turn transcript (8/8 plain) pass the `voice-judge` reading, and each item has a concrete detail (F5; `plans/reports/manual-test-261030-plain-voice.md`).
- [ ] Real model spend for phases 5, 6, 7 and 9 is ≤ 1 USD, according to the cost report (D12).
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e && pnpm build` green.
- [ ] Home hero and design tokens unchanged except the sample result's missed card wording (F2).

## Not in scope

Per-learner/per-persona retry limits (D2) · restarting an unfinished session mid-interview (end it, then retry) · difficulty levels, learning paths, new metrics (EXPANSION declined) · a site-wide copy sweep (e.g. the word "persona") · changing reveal calls, schemas or sealing · OpenAI Batch API for eval (batch stays Gemini-only; OpenAI roles run eval at the standard price, `src/llm/gemini-batch.ts:315`) · rewriting the hand-authored library scenarios (they are the style target) · a runtime slop filter (D13).

## Change of context (2026-10-30)

The Gemini credit is spent. The user asked to move to OpenAI and to rewrite the prompts so they read less like AI slop, all in this one plan. Phases 4–6 are new. The old phases 4, 5 and 6 are now 7, 8 and 9, and phase 9 also carries the provider release. Phases 1–3 (done) are unaffected. The Validation Log below keeps the old numbers: its "phase 4 / 5 / 6" are now 7 / 8 / 9.

## Model-switch risks (phases 4–6)

| Risk | Mitigation |
|---|---|
| OpenAI strict structured output rejects a schema | The schemas are plain objects with required or nullable fields (`src/llm/schemas.ts:5-7`). The phase 5 smoke test calls every structured role once. |
| OpenAI counts reasoning tokens inside the 400-token PERSONA cap, which can produce an empty reply | The smoke test reads `reasoningTokens`, then use the lowest effort the model accepts, or raise the cap and record why |
| The third-party prices are wrong | `costUsd` drives the daily cap. Confirm the prices in the console in phase 4, then compare the cost report after the smoke test |
| The fallback doubles worst-case latency | Quota and auth errors switch at once without retrying, and `TURN_TIME_BUDGET_MS` still bounds the turn |
| The judgement sets were tuned on Gemini wording | Terra must pass a set before its role switches. A Terra failure is reported as a finding; the set is not tuned to make it pass |
| Banned phrases push the model toward synonyms of the same slop | The concrete-detail rule does the real work, and a person reads the before/after |

## Inline red-team notes (folded into phases)

- Two-step migration: index swap before deploy, column drop after (old code reads the column) → phase 2/9.
- Retry buttons link to Màn 3 (`/prep/…`), where learner sessions are started (the demo card form and the post-sign-in resume are the existing exceptions), so cap, "being updated" and taken-down cases keep one code path → phase 2.
- `ReplayOutcome` also leaks the target on a failed or stopped replay, through `POST /api/sessions/[id]/replay` ("Dừng") and `/replay/turns` (`src/server/replay.ts` 65, 120, 274) → phase 3.
- Some topic tags point hard at their secret ("vay mượn và nợ"); accepted under D3. Hints are ordered by weight, not by how much a tag gives away → phase 3 risk.

## Related plans (none blocking)

`261003-1818-interviewlab-bootstrap-s1-and-custom-topics` (FR-5, reveal, sealing invariants) · `261010-1200-library-topic-layer-and-app-topics` (persona cards) · `261014-2139-lean-eval-token-cuts-and-admin-dashboard` phase 9 (built `/progress`). This plan changes behaviour they shipped; they need no change.

## Open questions

None. The three earlier ones were answered in Validation Session 1 (D5–D9).

## Validation Log

### Session 1 — 2026-10-29
**Trigger:** `/ak:plan validate` chosen by the user after plan creation.
**Questions asked:** 7

#### Verification Results
- **Tier:** Full (6 phases; Fact Checker, Flow Tracer, Scope Auditor, Contract Verifier)
- **Claims checked:** 96 (68 paths, 28 symbols, flows, callers)
- **Verified:** 88 | **Failed:** 5 | **Unverified:** 3

Failures (all corrected after Q1):
1. [Contract Verifier] Phase 3 listed only the replay turns route for `ReplayOutcome`; `src/server/replay.ts` sends it from 3 places (lines 65, 120, 274), including the "Dừng" answer of `POST /api/sessions/[id]/replay` (`route.ts:31`).
2. [Contract Verifier] Phase 2 missed `tests/e2e/delete-account.spec.ts:2,125` (`PLAYED_BEFORE_DELETION`) and the `no_identity` case at `tests/server/delete-account.int.test.ts:496`.
3. [Contract Verifier] Phase 2 missed `src/server/events.ts:8`: `session_started` props are a closed union, so `attempt` needs a type change.
4. [Fact Checker] Phase 3 claimed the home test checks secret terms; `tests/components/next-step-and-home.test.tsx` only checks string registration.
5. [Fact Checker] Phase 6 named `docs/operations.md` (no tombstone or FR-5 there) and FR-5/progress rows in the checklist (none exist); the real target is `docs/launch-checklist.md:100`.

Also verified: the e2e stub picks the feedback generator by "người viết nhận xét" and parses slot lines by regex (`tests/e2e/llm-stub.mjs:91,120`), now a phase 4 constraint. Unverified (runtime only, already in risks): Vercel deploys on push; `/favicon.ico` → `/icon` rewrite; Satori drawing the stroked glyph.

#### Questions & Answers

1. **[Verification]** Kiểm chứng plan thấy 5 chỗ thiếu/sai (replay.ts + route "Dừng"; delete-account e2e; secret-terms claim; doc targets; stub phrase). Sửa plan theo các điểm này?
   - Options: Sửa cả 5 | Để tôi xem từng điểm
   - **Answer:** Sửa cả 5
   - **Rationale:** without them the leak tests miss a route and phase 2/6 edit the wrong files.
2. **[Tradeoff]** Câu hỏi gợi ý riêng của nhân vật nên hiện thế nào?
   - Options: Sau khi bấm "Xem câu hỏi gợi ý" | Không hiện | Hiện luôn
   - **Answer:** Sau khi bấm "Xem câu hỏi gợi ý"
   - **Rationale:** keeps the retry worth doing while still giving a concrete question.
3. **[Risk]** Hai bước dùng credit thật (phase 4 ~0,05 USD; phase 6 ~0,1 USD). Duyệt thế nào?
   - Options: Hỏi lại ngay trước mỗi lần | Duyệt sẵn tối đa 0,15 USD | Không chạy
   - **Answer:** Hỏi lại ngay trước mỗi lần
   - **Rationale:** credit is small; the DB health check comes first.
4. **[Architecture]** Cột `played_persona_ids` không còn dùng. Xử lý sao?
   - Options: Xoá sau khi deploy | Giữ cột, ngừng dùng
   - **Answer:** Xoá sau khi deploy
   - **Rationale:** it existed only for FR-5; less kept after account deletion.
5. **[Assumption]** Trang Tiến bộ bỏ "Nhận biết" và "Đoán đúng" (vẫn có trên màn kết quả)?
   - Options: Bỏ cả hai | Giữ "Nhận biết" dạng trước → sau | Giữ cả hai dạng trước → sau
   - **Answer:** Bỏ cả hai
   - **Rationale:** three plain lines, as the reviewer asked.
6. **[Assumption]** Thứ tự mới của màn kết quả (Mang về lên trước, "Đã kể" thu gọn)?
   - Options: Đồng ý thứ tự mới | Giữ thứ tự cũ
   - **Answer:** Đồng ý thứ tự mới
   - **Rationale:** most useful part first, less at once.
7. **[Scope]** Ghi `attempt` vào sự kiện `session_started`?
   - Options: Có, ghi attempt | Không, giữ đúng phạm vi
   - **Answer:** Có, ghi attempt
   - **Rationale:** measures whether retry is used; one type change and one count query.

#### Confirmed Decisions
- Corrections 1–5: applied (phases 2, 3, 4, 6).
- Sample question behind a tap; new Màn 6 order; `/progress` without "Nhận biết"/"Đoán đúng"; `attempt` recorded; column dropped after deploy; paid runs asked for each time.

#### Impact on Phases
- Phase 2: `src/server/events.ts`; `tests/e2e/delete-account.spec.ts`; exact int-test cases.
- Phase 3: `src/server/replay.ts` + stop route in files and leak tests; new `HOME_SAMPLE` guard; order and tap confirmed.
- Phase 4: stub constraint; paid check asked right before.
- Phase 5: dropped measures confirmed.
- Phase 6: doc targets corrected; column drop no longer conditional; paid steps asked right before.

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-02-retry-from-scratch.md, phase-03-result-hints-instead-of-secrets.md, phase-04-takeaway-copy-without-ai-slop.md, phase-06-docs-strings-and-release-checks.md (phase-01 and phase-05 untouched by the deltas except one confirmation note in phase 5).
- Decision deltas checked: 11 (5 corrections, 6 answers).
- Reconciled stale references: 13 (replay leak routes in plan.md, phase 3 step 2 and success criterion; "only Màn 3 creates sessions" ×3; paid-run invariant; tag-order wording; cap default; demo extra button; checklist line 100 split between steps 1 and 4; tap wording in the tech-stack text; a validation marker that broke a numbered list).
- Unresolved contradictions: 0.
