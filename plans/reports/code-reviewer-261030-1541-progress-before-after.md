# Code review: phase 8, progress before and after (uncommitted)

Date: 2026-10-30. Spec: `plans/261029-1521-reviewer-feedback-fixes/phase-08-progress-before-and-after.md` and D4 in `plan.md`.

## Scope

- Files: src/server/progress.ts, src/db/repo/sessions.ts, src/app/progress/page.tsx, src/app/globals.css, src/components/progress/sparkline.tsx (deleted), tests/server/progress.test.ts, tests/server/guide-check.int.test.ts, tests/e2e/progress-and-guide.spec.ts
- Diff: about 313 lines added and 251 removed
- Checks run: `pnpm typecheck` passed, `pnpm lint` passed (0 issues), `pnpm vitest run tests/server/progress.test.ts` passed (9/9).
- **Not run:** `guide-check.int.test.ts`. A Playwright run (`next start -p 3100`) was live. The int suite's `beforeEach(resetDatabase)` TRUNCATEs the same local DB, so running it would have broken the e2e run. The SQL changes are verified only by reading the code.

## Overall

Matches the spec in substance. The pure functions are small and correct for the cases the spec lists. The page has no percentages and renders learner text as JSX text. There are no leftover references to removed exports. I found no blocker. There are two correctness or wording issues worth fixing before commit, and a few smaller ones.

## Critical

None.

## High

None.

## Medium

**M1. A same-persona line can contradict its trend word when scenario versions differ** (`src/server/progress.ts:63,77`; `src/app/progress/page.tsx:19-20`).
- `toldTrend` always compares shares (`told/total`). With the same persona, the line shows bare counts: "Chị Thu kể: a → b điều".
- `scenarios` are versioned per `personaId` (`schema.ts:88,107`), and `scenarios.personaId` is the join key. Two chị Thu sessions on v1 (11 items) and v2 (8 items) therefore count as `samePersona: true`.
- Result: "Chị Thu kể: 4 → 4 điều · Tốt hơn" (4/11 → 4/8), or "4 → 5 điều · Cần chú ý" (4/6 → 5/8).
- Fix: use `before.total === after.total` to choose the bare-count form, not `samePersona`. When the totals differ, show "a/n → b/m" (the `samePersona` flag can stay for the eyebrow). Or compare counts directly when the totals are equal.

**M2. The habit sentence claims more than the data shows** (`src/server/progress.ts:52`; `src/app/progress/page.tsx:31`).
- `ignoredHints` counts items with `hook !== null && state !== "told"`. That includes:
  - `held` (the replay target);
  - a hook dropped right before the session ended (`hook.next === null`);
  - a hook the learner did follow while the persona still did not tell.
- The engine's own "ignored" is `ledger.ignoredAt`, and the result screen's habit card keeps only the turns the verifier agreed with (`engine/reveal-claims.ts:216-223`).
- "Ở buổi này, 3 lần chị Thu gợi mở mà bạn hỏi sang chuyện khác" therefore states a behaviour ("hỏi sang chuyện khác") the count does not prove. It can also disagree with what the learner just saw on the result screen.
- The definition does follow the spec ("items with a hook, not told") and the old `heard_not_followed` measure. The problem is the specific wording. Either:
  - soften it: "Ở buổi này, chị Thu gợi mở {n} lần mà bạn chưa hỏi tiếp" or "{n} điều chị Thu đã gợi mở nhưng chưa kể"; or
  - at least exclude `hook.next === null`.
- The third line's label "Lời gợi mở bị bỏ qua" has the same, milder, issue.

**M3. The baseline search is capped at the 10 newest sessions, so it can pick the wrong baseline** (`src/server/progress.ts:73`; `src/app/progress/page.tsx:44`).
- Suppose the previous chị Thu session is the 11th newest. Then `older.find` misses it, and the page compares against the first session, which may be a different persona (or a much older chị Thu session).
- That contradicts D4 ("previous same-persona session, else first"). It was introduced by keeping N = 10 from the old trend page, where N meant something.
- The same design also loads 10 sessions with every main-branch question text (up to 30 each) to use two of them. The two queries also run one after the other.
- Fix (also fixes the cost): replace the windowed list with targeted queries using the existing `progressSources(...).$dynamic()` builder:
  - newest: `orderBy desc(revealedAt), desc(id) limit 1`;
  - previous same persona: `where scenarios.personaId = newest.personaId and (revealedAt, id) < (newest.revealedAt, newest.id)`, same order, limit 1;
  - first: the current `findFirstProgressSource`.
  The last two can run in `Promise.all`. `PROGRESS_SESSIONS` then goes away.

## Low

**L1. Question-to-turn mapping relies on an implicit invariant** (`src/server/progress.ts:41-43`).
- "Question i is turn i+1" holds today:
  - turn 0 is the opening (`sessions.ts:99`);
  - main-branch indexes are contiguous, because `claimTurn` requires `expectedIndex === last+1` (`db/repo/turns.ts:64-66`);
  - the SQL filters to `kind = 'main'` and `index > 0`, and orders by index.
- Replay turns use their own branch and are excluded.
- Still, adding `'index', turns.index` to the `jsonb_build_object` (`sessions.ts:304`) and matching on it removes the coupling and the O(n²) `indexOf`. It costs about three lines.

**L2. The leading count differs from the result screen** (`progress.ts:40`). /progress counts every question labelled `leading`. The result screen shows a leading turn only when the verifier agreed it was novel (`reveal-types.ts:153`). This matches the spec ("as today's measure counts them"), but a learner can see "Câu dẫn dắt: 3" here and one leading comment on the result screen. This is informational. Decide deliberately.

**L3. The habit line repeats the third line** (`page.tsx:73,112`). In both views, `HabitLine` restates `ignoredHints`, which the "Lời gợi mở bị bỏ qua" line directly above already shows. The plan asks for both, but on screen it reads as a duplicate. Consider dropping one, or using the habit line only when the count went up.

**L4. Dead CSS** (`globals.css:1051`). `.prog-habit` is no longer used anywhere: the guide check uses `.guide-form` and `.guide-result`, not `.prog-habit`. The plan's note that it is "shared with the guide check" is wrong. Remove it.

**L5. List semantics** (`globals.css:1053`). `list-style:none` on `.prog-lines` makes Safari/VoiceOver drop the list role. Add `role="list"` to the two `<ul className="prog-lines">` (`page.tsx:66,87`).

**L6. Test gaps:**
- The int test (`guide-check.int.test.ts:131-152`) has one session. It does not prove:
  - replay-branch turns are excluded;
  - `findFirstProgressSource` returns the oldest when there are two or more;
  - another learner's sessions are filtered out.
- No unit test covers "same persona found → `first` ignored even when `first` is the same persona", or the totals-differ case from M1.
- The e2e test checks for "%" only in `main.innerText()` (the plan said `page.content()`; `main` is arguably better). It reaches the Trước/Sau quotes by CSS class, not by the visible "Trước"/"Sau" labels, and does not check the third line.

**L7. The plan's Architecture note is not followed:** "keep `HABITS` names for the habit line" (phase-08 Architecture). `HABITS` was removed. The habit line uses only ignored hints, so the names were not needed (YAGNI). This is an acceptable deviation, but record it in the plan.

## Requirement check (a)

| Requirement | Status |
|---|---|
| Baseline: previous same persona, else first | Met, within the 10-session window (M3) |
| Single view, "Buổi đầu", "Luyện lại với {persona}" → `/prep/{personaId}` | Met (`page.tsx:63-79`) |
| Three lines "trước → sau" plus a word, no % | Met; trend wording can contradict itself (M1) |
| Different personas: "Nhân vật kể: a/n → b/m điều" | Met |
| Words "Tốt hơn" / "Như cũ" / "Cần chú ý"; told higher is better, other two lower is better | Met (`progress.ts:59-60,84-86`) |
| Trước/Sau pair: novel leading preferred; first `confirm_grounded`/`boundary_probe`; rendered as text | Met |
| Habit line for the newest session, in counts, no average or % | Met in form. It replaces the "Thói quen cần sửa nhất" card (both views, `page.tsx:73,112`). Wording overclaims (M2) |
| Links "Xem các buổi" and "Kiểm tra bộ câu hỏi…" | Met (`page.tsx:117-124`) |
| Empty state unchanged | Met |
| No model call; pure; null analysis → counts and no pair | Met (unit test plus int test asserting `llm_call` is unchanged, the latter not run here) |
| `guess` removed from the source; "Nhận biết"/"Đoán đúng" dropped | Met. This matches D6/D7 (the user decision) |
| Sparkline deleted, old CSS removed | Met |

## Baseline and trend edge cases (b)

- Only one session: `first.sessionId === newest.sessionId` → single. Correct.
- The first session is also the same-persona baseline: `older.find` wins. `first` is unused, and `samePersona` is true. Correct.
- Same timestamps on `revealedAt`: both queries add `id` as the tie-breaker (desc/desc vs asc/asc). The order is total and consistent. Correct.
- Told trend as a share across personas: correct and tested (4/11 → 3/6 = better). The same-persona problem with different totals is M1.
- Example pair: `novelTurns` uses `reveal.leading[].turn`, which is the turn index (`reveal-compute.ts:179`, `reveal-claims.ts:146`). The mapping is correct (L1), and replay branches are excluded.

## SQL (c)

- `jsonb_build_object('text', learner_text, 'analysis', decision_json -> 'analysis')`: a missing key or a NULL `decision_json` becomes JSON `null`, which matches `analysis: … | null`. Correct.
- Main branch only, `index > 0`, `ORDER BY index` inside `jsonb_agg`, and the `user_id` filter are all present (`sessions.ts:300-311`).
- `$dynamic()` with `.orderBy().limit()` afterwards is the documented drizzle 0.45 pattern. Typecheck passes.
- The `revealedAt!`/`reveal!` non-null assertions are backed by `isNotNull` in the WHERE clause.
- The persona key is `scenarios.personaId` (stable across versions), not `sessions.personaId`. Correct.

## Leftover references (d)

`sessionProgress`, `progressOf`, `HABITS`, `Sparkline`, `prog-grid/tile/value/spark`, `SessionProgress`, `weakest`: no hits in src, tests or docs (outside plans/ and unrelated bmad text). The only leftover is the dead `.prog-habit` rule (L4).

## Page (e)

- No "%" in any string.
- Learner text is rendered through JSX interpolation (escaped).
- `<section aria-label>` gives each view a labelled region. Links and nav are labelled.
- `capitalizeFirst` is used at the start of lines and eyebrows. Mid-sentence persona names ("Luyện lại với chị Thu", "lần chị Thu gợi mở", "→ anh Tùng (…)") stay lowercase, which is correct Vietnamese.
- The wording is natural apart from M2.
- One nit: the different-persona eyebrow mixes a capitalised and a lowercase name, "Chị Thu (…) → anh Tùng (…)". That is acceptable, since the second name is mid-phrase.

## CSS variables (f)

`--surface-container`, `--primary`, `--error` and `--sans` exist (`globals.css:5,9,15,19`). `.pair*` and `.q2` exist, and the mobile rule at `globals.css:743-744` already stacks `.pair`.

## Stale docs (g)

- `docs/loi-thoai-thuyet-trinh-interviewlab.md:297` (untracked talk script, slide 22) still describes a 10-session trend: rates of leading and grounded questions, KHAI THÁC and NHẬN BIẾT, guess accuracy, and the "thói quen yếu nhất". It needs rewriting to the before/after view. Line 57 is generic and fine.
- README, docs/operations.md, docs/setup.md, docs/tech-stack.md and docs/launch-checklist.md: no /progress description found.
- docs/design/theme.css `/* progress */` refers to progress bars, not this page. Unaffected.

## Recommended actions

1. M1: choose the line form by equal totals, not by persona.
2. M2: soften the habit wording, or tighten the count to hooks with a following question.
3. M3: replace the 10-session scan with a targeted "previous same persona" query, and run the queries in parallel.
4. L4/L5: drop `.prog-habit`; add `role="list"`.
5. L6: after the e2e run finishes, run `pnpm vitest run --project int tests/server/guide-check.int.test.ts`. Consider an int case with two sessions plus a replay branch.
6. Update slide 22 of the talk script.

## Plan follow-ups (for the lead)

- Todo items "Query + first-session finder", "compareProgress", "Page + CSS, sparkline removed" and "Unit tests": done, subject to M1–M3.
- "e2e": written, but its result is pending the live run.
- "Tests green": not yet proven (int and e2e not run in this review).
- The plan should record the `HABITS` deviation and correct the `.prog-habit` "shared" claim.

## Unresolved questions

- Should "Câu dẫn dắt" count only verifier-confirmed (novel) leading turns, to match the result screen (L2)?
- Was the e2e run that was in progress during this review green?
