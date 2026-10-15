# Code review: phase 9, learner progress and guide checker

Scope: uncommitted changes on `feat/lean-eval-admin` (16 modified + 15 untracked files, about 1,100 LOC incl. eval set). `docs/loi-thoai-thuyet-trinh-interviewlab.md` was not reviewed.

## Verification run
- `pnpm typecheck`: pass. `pnpm lint`: pass (0 issues). `pnpm test` (unit): 60 files / 1167 tests pass.
- `pnpm test:int`: **not run**. The int project calls `resetDatabase` on the same local Supabase DB that the running `pnpm test:e2e` (`next start -p 3100`) uses, so running it would have broken the e2e run. `tests/server/guide-check.int.test.ts`, `access-isolation.int.test.ts` and `config-and-trace.int.test.ts` are still unverified.
- `LABEL_DEFINITIONS` was checked against `HEAD`: I took the four strings from the old array and the four values of `LABEL_DEFINITION`, in `LABELS` order, and they are byte-identical. `LABELS` order (`confirm_grounded, boundary_probe, open, leading`) matches the old array, so the Call 1 and replay-judge prompts are unchanged.
- No paid LLM call was made.

## Overall
The structure is sound and follows existing patterns: route mirrors `custom-topics`, row-lock reservation mirrors `custom-topics.ts:322`, moderation call is identical to `custom-topic.ts:78`, config key validated by the shared zod schema so `/admin/config` and `il config set` handle the integer key. Learner text is in `dataBlock`s and rendered as React text. Nothing typed is written to Postgres, and `llm_call` holds no text. One cost-control hole defeats the daily limit. The rest are consistency, docs and minor issues.

## High

### H1. A failed check is given back after billed retries, so the daily limit can be bypassed and the session cap drained
`src/server/guide-check.ts:83-87`, `src/llm/prompts/guide-check.ts:11,22`, `src/llm/call-model.ts:116-119,233-237`
- `callModel` treats a schema-validation failure as `BilledAttemptError`. That error has no status, so `isRetryable` returns true and up to 3 attempts run, each billed and charged to `session` scope. After that, `LlmCallError` makes `checkGuide` call `releaseGuideCheck`, which deletes the reservation.
- A crafted guide can reliably fail validation. Example: 20 lines of `A? B? C?` stay within 3,000 chars and 20 lines, but the prompt tells the model to split separate questions on one line. That gives more than 40 questions, so `.max(MAX_GUIDE_REPLY_QUESTIONS)` fails (unless the provider enforces `maxItems`, which is not verified). Malformed output induced by prompt injection would do the same.
- Each such request costs up to 3 billed ANALYSIS calls and uses no daily check. It is unlimited per account, and there is no request rate limit. The only backstop is the global `session_daily_cap_usd`, and reaching it **refuses new sessions for every learner** for the rest of the day.
- This breaks the success criterion "the 6th check of a day is refused" for adversarial use.
- Fix options (pick one):
  - (a) Do not use `.max()` in the schema. Slice to 40 in code, so validation cannot be forced.
  - (b) Refund only failures with zero billed usage (no `BilledAttemptError` in the attempts), or keep the event with a `failed: true` prop and cap refunds at 1–2 per day.
  - (c) Both. (a) alone still leaves injection-induced invalid JSON.

## Medium

### M1. The page promises "Bộ câu hỏi không được lưu lại", but full prompts go to LangSmith in production
`src/app/guide-check/page.tsx:22`, `src/server/guide-check.ts:47`, `docs/launch-checklist.md:100`
- With `LANGSMITH_TRACING=true`, the guide and idea are sent and kept until LangSmith retention ends. The launch checklist itself says "full prompts and replies go to LangSmith and outlive account deletion".
- The DB side meets the plan's "no new learner-content retention". The user-facing claim does not hold.
- Fix: reword (e.g. "không lưu vào tài khoản của bạn"), or do not trace this call. The trace is a call option, so check whether `callModel` can turn tracing off per call.

### M2. `/api/guide-check` has no `maxDuration`
`src/app/api/guide-check/route.ts:1-8`
- Every other route that calls a model sets `export const maxDuration = 300` (`custom-topics/route.ts:10`, `sessions/[id]/turns/route.ts:13`, etc.).
- Worst case here is moderation plus analysis, 3 attempts each at 45 s, about 270 s.
- If the Vercel project default is shorter, the function is killed mid-call. The reserved event then stays, the learner loses a check with no result, and the actual provider spend is not recorded.
- Fix: add `export const maxDuration = 300;`.

### M3. The progress "leading" share counts unverified Call 1 labels and can disagree with what the reveal showed
`src/server/progress.ts:69`, compare `src/engine/reveal-types.ts` (`LeadingTurn.novel`), `src/engine/reveal-compute.ts:162`
- The reveal shows a leading turn only when the verifier agreed it was novel (`reveal.leading[].novel`).
- Progress counts every `analysis.label === "leading"`. A learner can see "no leading question" in the reveal and a non-zero "Câu dẫn dắt" on /progress for the same session.
- This matches the accepted design text ("checked Call 1 output"), so it is not a blocker. Still, consider counting `reveal.leading.filter(t => t.novel)` over judged questions so the numbers match what the learner was told.

### M4. The habit names are not "the reveal's names"
`src/server/progress.ts:18-23`
- The requirement says to use "the same habit names as the reveal habit card".
- The reveal habit card text is per scenario (`scenario.habit_card_label`, `reveal-contexts.ts:77`), and comment slots are model-written. Nowhere does the reveal show "Câu hỏi dẫn dắt", "Hỏi về tương lai giả định" or "Nghe được, nhưng chưa hỏi tiếp". The closest is `DIAGNOSIS.heard_not_followed = "Bạn nghe được, nhưng chưa hỏi tiếp."`.
- The comment "by the names the reveal gives them" is false.
- Fix: reuse `DIAGNOSIS.heard_not_followed` wording or register the three names in `product-strings.ts`, or fix the comment and record the deviation.

### M5. The weakest-habit pick favours heard-not-followed by construction
`src/server/progress.ts:71,79-85`
- `leading` and `hypothetical_future` are shares of questions. `heard_not_followed` is a share of hooked items, and it also counts items not told for reasons other than skipping the hook (trust gating; the `held` replay target).
- In practice it will usually be the highest rate, so "Thói quen cần sửa nhất" will rarely change.
- This follows the accepted design, so it is calibration and not a defect. It is worth checking on real data before relying on it.

### M6. Docs drift on public and operator contracts
`docs/operations.md:56` (judgement-eval kinds list lacks `guide-check`), `docs/operations.md:94-101` (config table lacks `guide_checks_per_day`), `docs/operations.md:105` ("Every model call of a session…").
- Session-scope spend now includes guide checks, which have no `session_id`.
- The cap message learners see ("hết chỗ cho buổi luyện mới") can now be triggered by guide checks.
- `cost-report.ts:83` excludes rows without a `session_id` from per-session cost, so the daily total and the per-session figures now differ by design. Say so in the docs.

## Low
- **L1. Demo accounts have no guide-check limit, and they spend against the full cap including the demo reserve** (`guide-check.ts:38-39,64`, `cost-cap.ts:44`). A demo account can use up the reserve that exists so demo sessions can still start. This was an accepted decision. Note it in operations docs.
- **L2. No identity gate.** Custom topics require `quotaKeyOf` (`custom-topic.ts:68`). The guide check allows 5/day per account, so making new accounts multiplies the limit. The global cap bounds the damage.
- **L3. NHẬN BIẾT uses `recognizedFull`, while the reveal shows `recognizedCount(canvasMatches, heldItemId)`**, which leaves out the unopened replay target (`seal.ts:102-105`). Progress can be 1 item higher than the reveal showed. The plan specified `recognizedFull`; only the comment should say so.
- **L4. `.next-step` is a 2-column grid (`globals.css:586`) and now holds 3 cards** (`next-step.tsx:78-84`). On desktop the waitlist card sits alone at half width on a second row. Verify it visually, or put the guide card full width.
- **L5. DRY.** `TODAY_START` is duplicated (`guide-checks.ts:14` vs `custom-topics.ts:25`), and `GuideCheckedProps` repeats the `guide_checked` props of `AppEvent` (`guide-checks.ts:12` vs `events.ts`). Derive it with `Extract<AppEvent, {name:"guide_checked"}>["props"]`.
- **L6. Sparkline draws the last point twice** when the last run has 1 point (r=2 and r=3 circles), `sparkline.tsx:28,33`. `prog-spark-last` has no CSS rule. Cosmetic.
- **L7. A DB error in `fillGuideCheck` after a successful call returns 500** and the learner loses both the result and the check (`guide-check.ts:81`). This is rare. It is acceptable, but the order could be: return the result, and do the fill best-effort.
- **L8. `guide_checks_per_day = 0` ("tắt")** still shows the header, NextStep and progress links to a page whose button is disabled with "Còn 0 lượt". Acceptable for a kill switch.

## Checklist results
- (a) Requirements and criteria:
  - Progress: met, with 0 calls asserted in the int test via `llm_call` count. That test covers the repo and the pure function, not the page render, which is fine because the page imports no model code.
  - Guide checker: 1 ANALYSIS call, plus MODERATION only with an idea. Scope is `session`. Limits are 3,000 chars and 20 lines.
  - 6th check refused: met in the int test, but defeated by H1.
  - Leading recall: 100% (36/36) on the reported paid run. I confirmed the set has 32 guides, 131 questions and 36 leading.
  - `product-strings.ts` not modified: deviation justified in the design section.
  - No new role: ANALYSIS reused.
- (b) Regressions:
  - Call 1 text unchanged (verified byte-identical).
  - Other `judgement-eval` kinds are untouched. `notes` is optional and printed only when present.
  - Config and CLI listing test updated. The admin config page uses the generic number input, and the server validates `int().nonnegative()`.
  - NextStep unit tests updated. The e2e `.next-card` nth(0)/nth(1) stacking assertion should still hold on a phone.
- (c) Public contract changes:
  - New route `POST /api/guide-check` (400/429/503/422/502).
  - New pages `/progress` and `/guide-check`.
  - New config key, new event name, new `SetKind`.
  - `SetScore.notes` added (optional, backward compatible).
  - `LABEL_DEFINITION` is a new export; `LABEL_DEFINITIONS` keeps its value.
  - Session-scope spend now includes non-session calls (M6).
- (d) Patterns: followed, except M2 and L5.
- (e) Security:
  - dataBlock is used for the guide and the idea, and closing tags are neutralised.
  - Output is rendered as text; the e2e test asserts `<img onerror>` shows literally.
  - `label` is enum-validated before it is used as a class key.
  - No learner text is in the DB.
  - The daily limit is race-safe: `FOR UPDATE` on the user row, then count and insert in one tx, under READ COMMITTED, so the second statement sees the committed insert. The concurrency int test exists.
  - Cost-cap ordering is correct.
  - Gaps: H1 and M1.
- (f) Progress math:
  - Shares, null handling (no judged question, no hook, notes empty or unjudged), the guess-accuracy clamp, the 10-session window, oldest-first order and tie-break are all correct and unit-tested.
  - KHAI THÁC = told/total is acceptable. `RevealJson.items` carries no weight, and the reveal itself shows "told trên total" (`two-numbers.tsx:56`). A weighted figure would need a scenario join and would disagree with the reveal. The design section records this choice. The Requirements line "(weight told)" should be edited to match, to avoid future confusion.

## Recommended actions
1. Fix H1: remove the forced-failure path (`.max` → slice) and stop refunding billed failures, or cap the refunds.
2. Add `maxDuration = 300` to the route (M2).
3. Correct the "không được lưu lại" claim, or disable tracing for this call (M1).
4. Update `docs/operations.md`: kinds, config key, session-scope wording (M6). Fix the phase-file "(weight told)" wording.
5. Decide on M3/M4 (verified leading, real habit names) with the user, since they touch accepted design text.
6. Run `pnpm test:int` once the e2e run has finished.

## Unresolved questions
- Does the provider's structured output (Gemini) enforce `maxItems: 40`? If it does, the H1 vector narrows to injection-induced invalid output, but the refund-on-billed-failure gap remains.
- What is the Vercel project's default function duration (fluid compute on/off)? This decides how urgent M2 is.

Status: DONE_WITH_CONCERNS
Summary: Phase 9 is implemented to plan with clean typecheck, lint and unit tests, and the Call 1 label text is verified unchanged. One high-severity cost-control hole exists: billed schema-validation failures refund the daily check, so the limit can be bypassed and the global session cap drained.
Concerns/Blockers: H1 should be fixed before merge. The int tests were not run because they share the DB with the running e2e suite.
