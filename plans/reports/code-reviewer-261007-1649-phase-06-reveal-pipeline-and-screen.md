# Code review: phase 6, reveal pipeline and screen

Advisory only. No source, test or plan file was changed.

## Scope

- Files: 38 modified, ~45 untracked (engine, prompts, graph, runner, repo, routes, page, UI, eval, tests, migration 0007).
- Focus: uncommitted working tree against `a7a8ccb`.
- Checks run: `pnpm typecheck` clean, `pnpm lint` clean, `pnpm test` 33 files / 676 tests pass.
- Not run (database in use by another process): `pnpm test:int`, `pnpm test:e2e`. Every finding about runner, routes or database behaviour is from reading code, not from a run.
- Verified by a scratchpad probe (pure engine, no database): findings H1 and H2 below. Everything else is from reading.

## Overall assessment

The seal is default-deny and has only three readers of `reveal_json` (`server/reveal.ts:197`, `:207`, `server/session-view.ts:90`), all through `engine/seal.ts`. No item id, `reason`, `reveal_parts` or stored reveal reaches a route body or page props. Runner fencing (claim, heartbeat, per-part save, finalise) is sound for the cases in the plan.

Two defects in claim resolution are worth fixing before this ships: one lets a "Hãy hỏi" written for the fallback-1 replay turn reach the browser while sealed, the other shows a mismatched "Thay vì hỏi / Hãy hỏi" pair. One fix closes both. Three medium issues follow: withdrawn sessions can be flipped to `done`, the eval silently loses the reveal under rate limits, and the habit card's seal rule cannot trigger.

## Critical

None.

## High

### H1. Fallback 1: a "Hãy hỏi" for the replayed turn leaks when the claim does not cite that turn

- Where: `src/engine/reveal-claims.ts:84-90` (sealing by citation only), `src/llm/prompts/feedback-generator.ts` rule for `leading` ("thay cho câu ở lượt đầu tiên của ô").
- In fallback 1 the `leading` slot's first turn is always the replay turn `l`, and the prompt tells the generator to write `suggested_question` as a rewrite of that first turn. Code seals only when `cited_turns` contains `l`. `resolveClaims` does not require a `leading` or `hypothetical_future` claim to cite `slot.turns[0]` (it does for the note slot, line 79).
- Scenario: leading turns 1 and 3, replay turn 1. Generator returns `cited_turns: [3]`. Probe output, status `revealed`:
  `stored claims [{"slot":"leading","cited":[3],"sealed":false,"shown":true}]`, and the browser payload carries `suggestedQuestion` (the rewrite of turn 1) paired with the quote of turn 3.
- Impact: breaks acceptance criterion 8 for fallback 1 (a non-leading rewrite of the question the learner is about to replay). Needs only a generator that cites a subset; a learner question can also ask for that.
- Fix: for every slot that needs a suggestion, drop the claim unless `citedTurns.includes(slot.turns[0])`. Then the fallback-1 leading comment is always sealed until `done`.
- No test covers it: `reveal-claims.test.ts:124` and the fallback fixtures always cite `[1, 3]`.

### H2. Leading comment shows the wrong pair after the verifier filters turns

- Where: `src/engine/reveal-claims.ts:191` and `:205`.
- `citedTurns` of a leading claim is filtered to turns the verifier found novel, and `quote` is taken from the new first turn. `suggestedQuestion` stays the one written for the slot's original first turn.
- Scenario (no model misbehaviour needed): leading turns 1 and 3, generator cites both, verifier disagrees on novelty of turn 1 and agrees on turn 3. Probe output, status `done`: `turns: [3]`, `quote` = question of turn 3, `addedWords` of turn 3, `suggestedQuestion` = rewrite of turn 1. The takeaway prints "Thay vì hỏi: Q3 / Hãy hỏi: rewrite of Q1".
- Impact: wrong feedback in the one artifact the learner takes away (FR-28, FR-30); FR-20 says a leading comment whose novelty was rejected is not shown.
- Fix: hide a leading claim when the turn its suggestion rewrites (`draft.citedTurns[0]` after the H1 fix) is not novel.

## Medium

### M1. A runner that finishes after a takedown turns a `withdrawn` session into `done`

- Where: `src/db/repo/reveal.ts:117-127` (`finaliseReveal` checks token and `revealReadyAt`, not status), `src/server/reveal.ts:70-72` (`finishIfComplete` sets `done` by id alone). `saveRevealPart` has the same gap.
- Scenario: learner guessed, session `revealed` and computing, replay level `none`. Operator runs unpublish with stop (`src/db/repo/eval.ts:233` sets `withdrawn`). The runner finishes seconds later: writes `reveal_json`, a `reveal` event, and status `done`.
- Impact: the learner gets the full reveal of a pulled persona; the session counts for FR-5 again, so the learner cannot start over when the persona returns (PRD §7). If the learner already restarted, the update hits the unique index and the runner throws instead.
- Fix: in `finaliseReveal` and `saveRevealPart` return false unless status is `interviewing` or `revealed`; in `finishIfComplete` add `status = 'revealed'` to the update.
- Not covered: `reveal.int.test.ts:126` only checks that a runner does not start on a withdrawn session.

### M2. Full eval: rate limits on reveal calls are swallowed, the last turn loses its verdict

- Where: `src/eval/run-episode.ts:175-177`, `src/graphs/reveal-graph.ts:59-66`.
- `withRateLimitBackoff` retries only when an `LlmCallError` is thrown. `runRevealGraph` turns every `LlmCallError` into a failed part and never throws one, so the wrapper is dead code here.
- Scenario: a 429 on `END_JUDGE` in a full run. Before this change the turn judge was retried with backoff, or the episode failed. Now the episode continues: no final verdict (`parts.judge.ok` false), so hook transmission and contradictions miss the last turn, and `verifier` is null so the episode drops out of NFR-8. The gate can pass on the few episodes that were measured.
- Fix: in eval, treat a failed judge, generator or verifier part as an error (rethrow the cause so backoff applies, resuming with the stored `parts`), or fail the episode.

### M3. Habit card: the PRD seal rule cannot trigger, and cited turns are not checked against the verifier

- Where: `src/engine/reveal-compute.ts:206-207` (habit slot turns are `ignoredAt`), `src/engine/reveal-claims.ts:87-90`, `:191`, `:199`.
- PRD Màn 6 and §12.2 item 5 hold back a habit card that "cites the turn the target's hook was dropped in". The habit slot only offers `ignoredAt` turns (h+1), and a claim may cite only slot turns, so the condition is never true. In the main fixture the offer payload carries the habit card citing turn 3, the turn that ignored the target's hook (`seal.test.ts:275` asserts this). Keeping the generator from restating the hook rests on the prompt line alone.
- Second part: for `habit` and `heard_not_followed`, `citedTurns` keeps turns whose `hook_ignored` the verifier rejected; only the count is checked. With three ignored hooks and one rejected, the card still cites the rejected turn.
- Hook lines are in the transcript, so no item content leaks. This is a spec decision: either seal a habit claim that cites the target's `ignoredAt` turn, or drop that turn from the habit slot, or record that the card is allowed. Filter cited turns by agreed entries either way.

## Low

- L1. Deterministic defect never ends. `src/server/reveal.ts:104-140`: a non-LLM throw (`loadMainBranch`, `assembleReveal`) leaves the token held; each retry waits 150 s; the exhausted runner runs the same code and throws again. The session stays on "Đang đối chiếu" for good, and each poll past the stale limit starts another runner. Consider writing an all-failed result when the exhausted run throws.
- L2. FR-16 applied unevenly. A flagged hook turn is excluded from missed-item hooks and comment slots, but `selectReplay` can still pick a target whose hook turn is flagged, `buildChecks` still asks `hook_ignored` for it, and an item told in a flagged turn still counts and links to that turn. Confirm intent.
- L3. NFR-8 gate pools unlock and disclosure (`src/eval/report.ts:66-69`); PRD says tracked per claim kind. A high disclosure rate can hide behind many unlock checks. Checks the verifier did not answer are counted nowhere.
- L4. `Ctrl+P` on a `revealed` session prints the takeaway sheet although "Tải về" is disabled (`takeaway.tsx:183` always renders `PrintSheet`; `print.css` is global). Sealed claims are not in it. Render the sheet only when `canDownload`. The global `@page{margin:0}` and hidden header/footer also apply to printing any other page.
- L5. Transcript drawer: focus lands on the close button, not the requested turn; the jump is visual only (`transcript-drawer.tsx:79-88`). Slider has no PageUp/PageDown. Guess screen shows "Không kết nối được" for a 409 on a withdrawn session.
- L6. Time to a degraded result can reach about 10 minutes (three calls of 3 x 45 s exceed `maxDuration` 300, then a 150 s stale wait). Within the plan's stated risk; worth measuring in phase 10.
- L7. `toBrowserResult` (`seal.ts:223`) has no production caller yet; only tests use it.

## Tests

- `seal.test.ts:138-146`: the "no claim cites the hook turn" check cannot fail for the habit card (see M3).
- `reveal-runner-fencing.int.test.ts:280`: "guess and result at the same moment" runs on one postgres connection (`src/db/client.ts:9`, `max: 1`), so it is sequential, not a lock race.
- Sealed-payload tests call the view functions, not the HTTP handlers; the handlers are thin and the e2e spec reads responses, so the gap is small.
- Missing: H1, H2, M1 (withdrawn mid-run), M2 (failed reveal part in an eval episode).
- No existing test was weakened. Changed expectations follow real behaviour changes (call counts, guess screen heading, product string count).

## Checked and found sound

- Seal: `toBrowserReveal`, `toBrowserTranscript`, `buildSessionView` and all callers; nothing before the guess; unknown status gets nothing.
- Ownership: single conditional claim, token plus `revealReadyAt` on every write, one `reveal` event whichever of guess and result is last (both under the row lock).
- Resume: `settle` and `applyVerdict` are idempotent, so slots, checks and ids are the same on a resumed run.
- PRD §9.2 order and tie-breaks, diagnosis branches, KHAI THÁC / NHẬN BIẾT / revealed counts, canvas range handling.
- Guess never read by `toRevealBasis`; exactly three calls.
- Prompts: notes, transcript, slots and checks all inside `dataBlock`; learner and model text flattened to one line, so a forged slot or check line is not possible; in-line forgery only gets a claim dropped.
- XSS: no `dangerouslySetInnerHTML`; all learner and model text is text nodes.
- AuthZ: every route checks owner; `runReveal` is only started after an owner check.

## Plan follow-ups

- Requirements 1-7 and 9-11 appear met; requirement 8 (sealing) is met except H1. Phase can be marked done once H1/H2 are fixed and M1-M3 are decided.
- Plan text differs from code (update the plan, not the code): routes are `reveal`, `transcript`, `waitlist` (plan says `ket-qua`, `ban-ghi`, `danh-sach-cho`); `maybeFinish` is `finishIfComplete`; `src/eval/publish-gate.ts` and `src/server/turns.ts` were not modified (the turn-30 trigger is in the turns route).
- Deploy: `LLM_END_JUDGE`, `LLM_FEEDBACK`, `LLM_VERIFIER` are required at boot; only `.env.example` lists them. Fourteen new product strings need `il check-strings product` and approval before the next publish.

## Unresolved questions

1. M3: should the habit card be held back when it cites the turn that ignored the target's hook?
2. L2: is an item told in a flagged turn still credited, and may a flagged hook turn be the replay moment?
3. Until phase 7, "Quay lại lượt" and "Bỏ qua" are disabled, so any session with a replay moment stays `revealed` and "Tải về" never unlocks. Is phase 6 meant to reach learners before phase 7?
