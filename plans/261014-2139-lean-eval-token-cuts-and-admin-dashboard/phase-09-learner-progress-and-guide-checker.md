---
phase: 9
title: "Learner progress and interview-guide checker"
status: done
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

## Implementation design (2026-10-15)
User: Gemini credit is ~30k VND. Everything is verified on stubs or injected fakes, except **exactly one** paid `judgement-eval` run on `guide-check.jsonl` (≈ 1,500–3,000 VND). If recall comes out < 90%, report it and do not rerun.
- **Progress, 0 calls:** a repo query reads the learner's last 10 sessions that have a reveal and a guess, plus the checked Call 1 output (`decision_json.analysis`) of their main-branch questions. `src/server/progress.ts` is pure:
  - grounded share (`confirm_grounded` + `boundary_probe`), leading share, and hypothetical-future share (`question_type`);
  - KHAI THÁC = told / total, as the reveal shows it;
  - NHẬN BIẾT = `recognizedFull` / total, null when the notes were not judged;
  - guess accuracy = 1 − |guess − told| / total;
  - heard-not-followed = items whose hook was dropped but which were never told, over items whose hook was dropped.
  The weakest habit is the highest average of the three habit rates (leading, hypothetical future, heard not followed), with the reveal's names.
- **Guide check, 1 call:** the guide is ≤ 3,000 chars and ≤ 20 non-empty lines (an input size limit, not semantic splitting). The idea is an optional one-liner. Steps, in order:
  1. session cap (`canStartSession`);
  2. a per-day limit under the account row lock: a `guide_checked` event is reserved first, then filled with counts, and deleted again if the call fails;
  3. MODERATION, only when an idea is given (a refusal still uses the check);
  4. one ANALYSIS structured call returning `{ questions: { text, label, hint }[] }`, with labels `open | leading | closed | hypothetical_future | compound`.
  The `open` and `leading` definitions come from `LABEL_DEFINITIONS`, which is split per label with the joined Call 1 text unchanged. The model does the splitting.
- **Config:** new key `guide_checks_per_day` (default 5). Demo accounts write no events, so the daily limit does not apply to them; the session cap still does.
- **Strings:** the new UI text is not added to the `productStrings()` registry. Adding it would reopen the paid string check for the product target. YAGNI.
- **Eval set:** each line is one guide, with its expected labels in order, scored by position. If the model returns a different number of questions, every expected leading question in that guide counts as missed. Gate: leading recall ≥ 90%. Accuracy and leading precision are reported.

## Success Criteria
- [x] The progress page makes 0 LLM calls (asserted in the integration test through the `llm_call` count).
- [x] The guide checker makes exactly 1 model call per check (plus moderation when an idea is given), and the 6th check of a day is refused.
- [x] Leading-question recall ≥ 90% on `guide-check.jsonl`: **100% (36/36)**, all 131 labels right, in the one paid run (32 calls, 0.045 USD).

## Result (2026-10-15)
Done. **One paid run only** (the user approved one): `pnpm il judgement-eval evalsets/guide-check.jsonl` on gemini-3.8-flash (effort low): 32 guides, leading recall 100% (36/36), labels 131/131. It cost 0.045 USD, about 0.0014 USD per check. Everything else ran on the e2e stub or injected fakes.
- KHAI THÁC is told / total, as the reveal shows it. The stored reveal carries no item weights, so "(weight told)" above is not what shipped.
- The habit names are the progress page's own wording for the reveal's three comment types (`leading`, `hypothetical_future`, `heard_not_followed`). The reveal's habit card label is set per scenario.
- Changes after code review ([report](../reports/code-reviewer-261015-1810-phase-9-progress-and-guide-check.md)):
  - A check whose call failed **still counts**. Its attempts were billed, so a refund would let a guide that always fails run without limit, up to the shared session cap.
  - A reply longer than 40 questions is cut in code instead of failing the schema (and being retried and billed).
  - `maxDuration = 300` is set on the route.
  - The page no longer claims the guide is "not stored": the database keeps counts only, but traces may hold the prompt.
  - The guide card takes the full row of the next step.
  - `docs/operations.md`: the eval kind, the config key, and the guide checks inside the session cap.
- Header contract changed on purpose: the wide nav adds "Tiến bộ", and the phone menu adds "Tiến bộ" and "Kiểm tra bộ câu hỏi". The e2e header, route-table and NextStep tests were updated to match.
- Accepted, not fixed: demo accounts have no daily limit (the cap still applies), and there is no identity check like custom topics' `quotaKeyOf`, so extra accounts get extra checks. The progress leading share uses Call 1 labels the verifier never confirmed, and NHẬN BIẾT counts the replay target, so a session can read slightly differently from its reveal.
- Tests: unit 1167/1167, int 681/681, e2e 324 passing plus the 4 guard specs updated and rerun (46/46 for the affected files).

## Risk Assessment
- Real guides mix compound questions. Mitigation: the same single call returns the guide already split. Its schema is `{ questions: { text, label, hint }[] }`, and the model separates compound questions. There is no regex or punctuation splitting in code. `compound` is one of the label values. The starter set includes compound lines.
- Scope creep into "AI interview coach chat". Out of scope (YAGNI).
