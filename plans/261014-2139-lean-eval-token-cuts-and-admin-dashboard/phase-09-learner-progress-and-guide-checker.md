---
phase: 9
title: "Learner progress and interview-guide checker"
status: pending
priority: P2
effort: "2.5d"
dependencies: [2]
---

# Phase 9: Learner progress and interview-guide checker

## Overview
Two features for developers who practise user interviews before building an app:
1. **Tiến bộ của tôi (my progress).** Skill trends across sessions, computed from data already stored. **0 LLM calls.**
2. **Kiểm tra bộ câu hỏi (guide checker).** The developer pastes the interview guide they plan to use with real users of their app idea. Each question is labelled `open` / `leading` / closed / hypothetical-future, with a short fix hint. It costs **1 call per guide**.

## Requirements
- Progress (`/progress`, signed-in): per finished session, show the share of open or grounded questions, the share of leading questions, KHAI THÁC % (weight told), NHẬN BIẾT % (notes caught) and guess accuracy. Show a trend line over the last 10 sessions and the single weakest habit, using the same habit names as the reveal habit card. Data comes from `turn.decision_json` / `analysis_json` and the reveal snapshot. Nothing is recomputed by a model.
- Guide checker (`/guide-check`, signed-in): a textarea of ≤ 20 questions and ≤ 3,000 characters, and an optional one-line app idea. The output is a label per question plus a hint, and a summary such as "5/12 câu dẫn dắt". The learner text is wrapped as data (`dataBlock`) and escaped in the UI.
- Guide checker cost control: 1 structured call on the ANALYSIS model, using the label definitions from `LABEL_DEFINITIONS` (shared, DRY). There is a daily per-account limit (config `guide_checks_per_day`, default 5). Spend goes under scope `session` so the existing session cap covers it. Moderation runs first, only if the app idea text is present: the same MODERATION call as custom topics.
- Non-functional: the results are not stored beyond an `events` row (counts only, no text), so there is no new learner-content retention.

## Architecture
- `src/server/progress.ts`: aggregates per session, as a pure function over rows. Unit-tested.
- `src/llm/prompts/guide-check.ts` + schema. `src/server/guide-check.ts` handles the limit, moderation, the call and the event.
- Pages: `src/app/progress/page.tsx`, `src/app/guide-check/page.tsx`. Header menu links. The reveal "next step" component (`src/components/reveal/next-step.tsx`) links to the guide checker: "Áp dụng cho ý tưởng app của bạn".

## Related Code Files
- Create: `src/server/progress.ts`, `src/server/guide-check.ts`, `src/llm/prompts/guide-check.ts`, `src/app/progress/page.tsx`, `src/app/guide-check/page.tsx`, `src/app/api/guide-check/route.ts`, `src/components/progress/*`, `evalsets/guide-check.jsonl` (≥ 30 lines), `tests/server/progress.test.ts`, `tests/server/guide-check.int.test.ts`, `tests/e2e/progress-and-guide.spec.ts`
- Modify: `src/llm/roles.ts` (only if a new role is needed; prefer reusing ANALYSIS), `src/components/header-menu.tsx`, `src/components/reveal/next-step.tsx`, `src/strings/product-strings.ts`, `cli/commands/judgement-eval.ts` (kind `guide-check`)

## Implementation Steps
1. Write the progress aggregation as a pure function, with tests on the fixture sessions.
2. Build the progress page with SVG sparklines, and an empty state that links to the library.
3. Write the guide-check prompt and schema. Build the starter set and run `judgement-eval` until leading-question recall is ≥ 90%.
4. Add the route, the limit, moderation and the page.
5. Add the e2e test with the LLM stub.

## Success Criteria
- [ ] The progress page makes 0 LLM calls (asserted in the integration test through the `llm_call` count).
- [ ] The guide checker makes exactly 1 model call per check (plus moderation when an idea is given), and the 6th check of a day is refused.
- [ ] Leading-question recall ≥ 90% on `guide-check.jsonl`.

## Risk Assessment
- Real guides mix compound questions. Mitigation: the same single call returns the guide already split. Its schema is `{ questions: { text, label, hint }[] }`, and the model separates compound questions. There is no regex or punctuation splitting in code. `compound` is one of the label values. The starter set includes compound lines.
- Scope creep into "AI interview coach chat". Out of scope (YAGNI).
