# Phase 10 hardening: e2e, unit, test quality

Scope: verification only. No source, test, config or doc changed.

## Results

| Suite | Run | Pass | Fail | Notes |
|---|---|---|---|---|
| Playwright `pnpm test:e2e` | full, both projects | 232 | 1 | 233 total, 12.4 min |
| - desktop | 230 | 229 | 1 | all specs |
| - mobile | 3 | 3 | 0 | `responsive.spec.ts` only (testMatch) |
| Playwright rerun of failed test | 1 | 0 | 1 | fails again: deterministic |
| Unit `pnpm test` | final rerun | 920/920 | 0 | 47 files, 14.3 s |

- e2e webServer ran `next build` + `next start` successfully. No build warnings in the log. Standalone `pnpm run build` not run separately.
- Typecheck, lint, int tests: not re-run here (controller already green).
- Hardening spec (15 tests, desktop) passed in full run.
- No flakes seen: only failure reproduced 2/2.

## Failed test

`tests/e2e/interview-screen.spec.ts:66` "shows nothing sealed and nothing about labels, hooks or opened items".

Error: `strict mode violation: locator('main') resolved to 2 elements` at `interview-screen.spec.ts:74`:
1. `<main class="reveal" aria-busy="true">` = `SessionSkeleton` (`src/components/ui/page-skeletons.tsx:77-79`, Suspense fallback at `src/app/sessions/[id]/page.tsx:198`)
2. `<main class="iv">` = real interview screen

Evidence:
- Failure snapshot shows only the interview `main`. Skeleton is absent from the accessibility tree, so it is still in DOM but hidden or not yet detached.
- Retained trace (`test-results/.../trace.zip`, frame snapshots) shows skeleton and interview `main` coexisting after `page.reload()`. Skeleton detaches ~180 ms after content appears.
- Trace has no console messages and no CSP refusals. Suspense swap completes, so the new CSP is not blocking it.
- Test reads `page.locator("main")` right after `.bubble-p` count check (line 72-74), without waiting for the fallback to detach.

Root cause: test-side race and unscoped locator. The test queries `main` while the reload's Suspense fallback still exists.

Caused by this phase? Probably not directly:
- Skeleton element and Suspense structure unchanged. Phase only removed `aria-label` and added `<p class="sr" role="status">` inside it (`page-skeletons.tsx`, `skeleton.tsx:18`). Element count is the same.
- `interview-screen.spec.ts` not modified by this phase.
- Not proven pre-existing: no run at HEAD.

Not fixed (per instructions). Likely fix: scope to `.iv` or wait for `main[aria-busy]` to detach before reading.

## Acceptance criteria coverage

| Criterion | Covered by | Status |
|---|---|---|
| Cap lowered: new session blocked with message | `tests/server/cost-cap.int.test.ts:45-55`; message UI in pre-existing `turn-engine.spec.ts:192-193` | Covered; message UI not in this phase's specs |
| Running sessions finish reveal and replay | `cost-cap.int.test.ts:79-98` | Covered |
| Demo accounts still start | `cost-cap.int.test.ts:100-111` | Covered |
| Custom sessions blocked at first turn | `cost-cap.int.test.ts:113-130`, `:132-143` | Covered |
| Generation budget blocks attempts, not sessions | `cost-cap.int.test.ts:149-161` | Covered |
| Security headers incl. CSP | `hardening.spec.ts:41-112` | Covered |
| Fonts, own API, sign-in still work | `hardening.spec.ts:114-170` | Covered |
| Learner HTML escaped: question, canvas, topic | `escape-render.test.tsx`, `hardening.spec.ts:188-248` | Covered (notes = canvas) |
| `/phuong-phap` 404, no footer link | `hardening.spec.ts:173-186` | Covered, weaker (see below) |
| Delete dialog `aria-describedby` | `hardening.spec.ts:251-257` | Covered |
| Skip and stop dialogs `aria-describedby` | `hardening.spec.ts:259-273` | Covered |
| End dialog `aria-describedby` | none | GAP, see below |
| Skeleton `role="status"` | `tests/components/loading-and-dialog-a11y.test.tsx:17-24` (markup only) | Markup only; announcement not tested |
| "Tải thêm" announced, focus on first new row | `hardening.spec.ts:275-300` | Covered for one load only |
| Withdrawn and drawer share row component | `escape-render.test.tsx` imports it; both screens import `transcript-turn.tsx` | Structural only, no test asserts sharing |
| Latency measured on deployed app | `measure-latency` tested locally (`hardening.spec.ts:317`) | Not measured on deployed app: user task |
| CI typecheck, lint, unit, build | `.github/workflows/ci.yml` | Present; not run here |
| Supabase Auth deleted-account check | plan checklist | Not done: needs deployed project, user task |

Gaps and defects found:
1. End-session dialog (`src/components/interview/end-session-dialog.tsx:18`) has no consequence sentence and no `describedBy`. Only the headline "Kết thúc và đóng băng ghi chú?" exists. Criterion says the end dialog must tie its consequence sentence. Either add a sentence with `describedBy`, or record that the headline counts. Needs a decision.
2. "Tải thêm" live line (`session-list.tsx`, `Đã thêm ${count} buổi.`): on a second load with the same count the text is identical. React does not mutate an unchanged text node, so the screen reader likely does not announce it again. Reasoned from DOM behaviour, not run. Untested: the e2e only clicks once.

## Test quality

`tests/e2e/hardening.spec.ts`
- Strong: nonce enforcement test (`:100`) uses real browser violations. Escape tests check `textContent` via `hasText` on raw HOSTILE string, so HTML rendering fails them.
- `:114-155` `watchCsp` reads `violations` right after awaits, with no wait for in-flight binding calls. A late violation can be missed. Low risk.
- `:178` `linksToIt` searches the whole page, not `contentinfo`. Passes if the link moves elsewhere on the page. Criterion is footer-specific; scope to `getByRole("contentinfo")`.
- `:157` JS-disabled sign-in test is a real check of `form-action`. Good.
- `:275` "Tải thêm" tests one load only (see gap 2).
- `:329` measure-latency asserts output format only, not plausibility of numbers.

`tests/server/cost-cap.int.test.ts`
- `:57` name "one cent under it a learner still starts" is wrong: the assertion raises cap by one cent and expects start. Exact boundary (spend equal to cap minus reserve blocked) is not asserted.
- `:53` `expect(SESSION_CAP_REACHED).toContain(...)` checks a constant against itself. Would pass with any string containing the substring. Weak; UI check lives elsewhere.
- Otherwise strong: each test asserts a state change (sessions, turn rows, model call count).

`tests/server/escape-render.test.tsx`
- `:41-57` "underlined" test builds its fragment by hand. The real underline `LearnerText` is internal to `transcript-drawer.tsx` and not exported, so this test does not exercise real underline code. It tests a copy.
- `expectEscaped` (`:19-22`) compares exact escaped string and counts occurrences: can fail.
- `:108-120` grep guard catches only the listed patterns. Acceptable as a guard.

No assertion found that cannot fail in the cost-cap or hardening specs, apart from the watchCsp timing note.

## Performance

- e2e: 12.4 min for 233 tests (single worker, shared DB, build included).
- Unit: 14.3 s.
- No slow-test analysis run beyond the Playwright list output.

## Critical issues

- None blocking beyond the single failing e2e test. Phase cannot be called green until `interview-screen.spec.ts:66` is fixed or explained.

## Recommendations (priority)

1. Fix `interview-screen.spec.ts:74` to scope to the interview screen or wait for the skeleton to detach. Re-run desktop e2e.
2. Decide end-dialog consequence sentence (gap 1). Add `describedBy` if kept.
3. Fix "Tải thêm" repeat-announcement (gap 2), and add a two-load test.
4. Scope `linksToIt` to `contentinfo` in `hardening.spec.ts:178`.
5. Rename `cost-cap.int.test.ts:57` and add an exact-boundary assertion.
6. Replace the hand-built underline fragment in `escape-render.test.tsx:41-57` with a render of the real component, or export `LearnerText` for test.
7. Consider a unit/e2e check that the skeleton `role="status"` text is present in the DOM at load.

## Next steps

1. Fix item 1 above and re-run `tests/e2e/interview-screen.spec.ts`.
2. Decide gap 1 (end dialog) and gap 2 (announcement) with the user; they change behaviour.
3. Run the deployed-only checks (latency, Supabase Auth audit query) on the Vercel deploy. Not runnable locally.

## Unresolved questions

- Does `interview-screen.spec.ts:66` pass at HEAD (pre-phase)? Not run. Would need a separate worktree run, which conflicts with the shared DB rule unless run alone.
- Is the ~180 ms skeleton-plus-content overlap after reload a visible UI glitch, or only a streaming-DOM artifact? Not verified visually.
- Does the acceptance criterion for the end dialog require a separate consequence sentence, or does the headline suffice?
- Should "Tải thêm" re-announce when the count is unchanged? Current behaviour is probably silent.

Status: DONE_WITH_CONCERNS
Summary: Full e2e 232/233 (one deterministic failure, `interview-screen.spec.ts:66`, a test-side race not caused by this phase's CSP). Unit 920/920. Two acceptance gaps (end-dialog description, repeat "Tải thêm" announcement) need a decision or a fix.
Concerns/Blockers: e2e failure unresolved; the end-dialog and announcement gaps need user decisions.
