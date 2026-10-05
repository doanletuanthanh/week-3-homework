---
title: "Phase 6: Reveal pipeline and screen"
status: todo
phase: 6
priority: P1
effort: "6d"
dependencies: [5]
---

# Phase 6: Reveal pipeline and screen

## Overview

Everything between "Kết thúc buổi" and the replay offer: replay-moment selection, the three reveal calls, the frozen `reveal_json`, server-side sealing, the guess screen, and Màn 6 in its computing and replay-offer modes with the transcript drawer and "Mang về".

## Context links

- PRD Màn 5, Màn 6, §8.3, §9.2, FR-18–22, FR-28–32, FR-47–49, FR-48a, NFR-2; §12.2 items 5 (sealing), 6, 13.
- Addendum §2.3–2.5, §3.3, §4 (`reveal_json`). Artboards: `Guess`, `RevealComputing`, `Reveal`, `RevealDrawer`, `RevealMobile`, `RevealStates`, `GuidePrint`; canvas note `d4`.

## Requirements

- [ ] Replay moment chosen by code before any reveal call (primary → fallback 1 → fallback 2).
- [ ] Exactly 3 sequential calls start at session end; the guess never enters a call.
- [ ] Each call's output is resolved by code: canvas ranges cut by index, broken or empty ranges dropped, duplicate items counted once, claims with broken references dropped.
- [ ] Verifier results applied: rejected claims, praise and "Hãy hỏi" hidden; rejected unlock or disclosure keeps credit and is counted for NFR-8.
- [ ] Failure of a call after 2 retries produces the degraded screen defined in Màn 6, not an error page.
- [ ] Results stored once; reopening reads stored data and calls no model. A second runner can never overwrite or repeat a completed call.
- [ ] No reveal data leaves the server before the guess is stored. A no-replay session reaches `done` whichever of guess and reveal finishes last.
- [ ] Full-profile eval episodes run the reveal graph and report verifier disagreement per claim kind.
- [ ] Sealed data is absent from every browser payload until replay ends.
- [ ] Canvas explanations come only from the FR-48a fixed strings; the judge's `reason` is never shown.
- [ ] "Tải về" prints only the takeaway section as A4 and is disabled until the session is `done`.

## Architecture

Pure (`src/engine/`):

- `select-replay.ts`: PRD §9.2 exactly; returns `{level, forkAfterTurn, targetItemId?, leadingTurn?}`.
- `reveal-compute.ts`: from final state + judge output → items with state `told | missed | held`, canvas matches with kind `told | unconfirmed | unrevealed | never_said` and `string_key`, counts (`told`, `recognizedFull`, `total`, `revealedCount`), comment triggers (addendum §3.3 table and ordering).
- `diagnosis.ts`: the five-branch rule of Màn 6 item 2 → a `diagnosis_key`.
- `seal.ts`: `toBrowserReveal(reveal, status)` and `toBrowserTranscript(turns, reveal, status)`, **default-deny**. `done`: full data. `revealed` or `replaying`: remove the target item everywhere (content, sample question, tag, path, weight, hook id), canvas ranges matching it, claims flagged `sealed`, labels on the target's hook turn (or turn *l* for fallback 1), and subtract it from the shown NHẬN BIẾT. Any other status (`interviewing`, `withdrawn`, ...): no reveal at all and a transcript of plain texts with no labels.

Graph (`src/graphs/reveal-graph.ts`): `judge` (role `END_JUDGE`, sees all items and the frozen canvas as data) → `afterJudge` (code) → `generate` (role `FEEDBACK`; receives the sealed target's id only, never its content, sample question or hook line) → `afterGenerate` (code: resolve references, mark `sealed`) → `verify` (role `VERIFIER`) → `afterVerify` (code: apply verdicts, pick diagnosis key, assemble `reveal_json`).

Runner (`src/server/reveal.ts`): the end-session route (and the freeze fallback) calls `after(() => runReveal(sessionId))` with `maxDuration = 300`.

- **Ownership:** the runner claims with one conditional update (`reveal_run_token` null, or heartbeat older than 150 s, and attempts < 3) returning its token and incrementing `reveal_run_attempt`. Every later write (heartbeat, call output, final result, status) is conditional on the token still being ours and the result not yet final.
- **Heartbeat** on a 15 s timer while the runner lives. Each model call has the 45 s timeout from `callModel`.
- **Resume:** each call's processed output is stored as it completes (`reveal_parts.judge`, `.generator`, `.verifier`); a new runner starts at the first missing part, so the three logical calls happen once each.
- **Finalise** in one conditional transaction: write `reveal_json`, `reveal_ready_at`, then `maybeFinish`. When attempts are exhausted the same step writes the degraded result. Nothing writes after a final result exists.
- `maybeFinish(sessionId)` (called under the session row lock from the guess POST and from finalise): if the guess is stored, the reveal is ready and the replay level is `none`, set `done`.
- `GET /api/sessions/[id]/reveal` (`maxDuration = 300`) returns `{ready: false}` unless the status is `revealed`, `replaying` or `done` and results exist; otherwise the sealed-filtered reveal. When results are missing and the heartbeat is stale it starts a runner through the same claim, so two polling tabs start at most one.

Eval wiring (`src/eval/run-episode.ts`): full-profile episodes end by running the reveal graph on the in-memory store with an empty canvas; the report gains verifier disagreement per claim kind (NFR-8) and the publish gate reads it.

Screens:

- Màn 5 `GuessScreen`: slider with no initial value, arrow/Home/End keys, `aria-valuetext` "X trên N"; `POST /api/sessions/[id]/guess` stores `guess`, sets `revealed`.
- Màn 6 `RevealScreen` with modes `computing` (poll every 2 s; after 30 s add the "Vẫn đang đối chiếu" line) and `offer` (fixed section order 1–7). Section 7 in S1: the "Bạn đã luyện mọi persona" string and the waitlist button (`waitlist` unique per user and context).
- `TranscriptDrawer`: right panel on desktop, full screen under 768 px; opens from any "Lượt N" link, scrolls to the turn and highlights it for 2 s.
- Print: `@media print` stylesheet from `GuidePrint.dc.html`; blank line "Câu của bạn, cho đề tài của bạn: ______" under each "Hãy hỏi"; praise excluded; `document.title` set to `thoi-quen-hoi-[persona]-[ngay]` so the saved PDF gets that name.

## Related code files

- Create: `src/engine/select-replay.ts`, `reveal-compute.ts`, `diagnosis.ts`, `seal.ts`, `src/llm/prompts/end-judge.ts`, `feedback-generator.ts`, `verifier.ts`, `src/graphs/reveal-graph.ts`, `src/server/reveal.ts`, `src/db/repo/reveal.ts`
- Create: `src/app/api/sessions/[id]/guess/route.ts`, `ket-qua/route.ts`, `ban-ghi/route.ts` (transcript), `src/app/api/danh-sach-cho/route.ts` (waitlist)
- Create: `src/components/guess/guess-screen.tsx`, `src/components/reveal/reveal-screen.tsx`, `two-numbers.tsx`, `replay-offer.tsx`, `told-list.tsx`, `missed-list.tsx`, `notes-review.tsx`, `takeaway.tsx`, `transcript-drawer.tsx`, `next-step.tsx`, `src/app/print.css`
- Create tests: `tests/engine/select-replay.test.ts` (3 fixed transcripts), `reveal-compute.test.ts` (10 fixed canvases), `seal.test.ts`, `diagnosis.test.ts`, `tests/server/reveal.int.test.ts`, `tests/server/reveal-runner-fencing.int.test.ts`, `tests/server/sealed-payloads.int.test.ts`, `tests/server/sealed-page-props.test.ts`
- Create: `evalsets/canvas-judge.jsonl`, `evalsets/leading-novelty.jsonl` (starter sets), wired into `judgement-eval`
- Modify: `src/eval/run-episode.ts`, `src/eval/report.ts`, `src/eval/publish-gate.ts` (verifier disagreement)
- Modify: `src/db/schema.ts` (session reveal columns, `waitlist`), `src/app/api/sessions/[id]/end/route.ts`, `src/server/turns.ts` (turn-30 trigger), `src/app/sessions/[id]/page.tsx`, `src/strings/product-strings.ts` (FR-48a set, diagnosis lines, path labels, trust template)

## Implementation steps

1. `select-replay` with tests on three fixed transcripts (primary, fallback 1, fallback 2), including tie-breaks.
2. Judge prompt and schema; `reveal-compute` with the ten fixed canvases: paraphrase, topic-only touch, negation, invention, repeated mention, out-of-range and empty ranges.
3. Generator prompt (claims schema, comment rules as input, sealed-target instruction) and reference resolution.
4. Verifier prompt (claim kinds per addendum §2.5) and verdict application; `diagnosis`.
5. `seal.ts` and its tests; then the payload tests that hit every route (reveal, transcript, session list stub, turn) before replay ends and assert the target's content, sample question, tag, path, weight, hook id, matching canvas range, sealed claims and full NHẬN BIẾT are absent. Also: the reveal route before the guess returns not-ready; the transcript route during `interviewing` has no labels; and the props the session page passes to client components go through the same seal function (asserted on the serialised props, since they travel in the RSC payload).
6. Reveal graph and the fenced runner. Fencing tests with a scripted slow model: two runners started together make three model calls in total; a runner whose token was taken over writes nothing; a restart after the judge completed makes two calls; a degraded result is never overwritten; guess-then-reveal and reveal-then-guess both end `done` for a fallback-2 session.
7. Guess screen and API.
8. Reveal screen sections in order, both modes, empty and degraded variants from `RevealStates.dc.html`; mobile from `RevealMobile.dc.html`.
9. Transcript drawer and API with seal filter.
10. Takeaway, print stylesheet, waitlist.
11. Reveal events (FR-38): guess, told, true recognised count, total, revealed count, replay level, reveal latency.
12. Run the reveal graph in full-profile eval episodes; add verifier disagreement to the report and gate; add the two starter sets.

## Todo

- [ ] `select-replay` + tests
- [ ] Judge + `reveal-compute` + 10 canvases
- [ ] Generator + reference resolution
- [ ] Verifier + diagnosis
- [ ] `seal` + payload tests
- [ ] Graph, runner, heartbeat, degraded mode
- [ ] Màn 5
- [ ] Màn 6 computing + offer + drawer
- [ ] Takeaway + print + waitlist
- [ ] Events
- [ ] Runner fencing tests
- [ ] Eval wiring + two starter sets

## Success criteria

- [ ] §12.2 item 5 bullets on selection, sealing payloads and diagnosis branches pass as tests; item 13 highlighting and explanation bullets pass.
- [ ] Empty canvas shows "Không có ghi chú trong buổi này" and hides the notes section; a non-matching canvas shows the "chưa có điều quan trọng nào" line.
- [ ] Reopening a `revealed` session issues zero LLM calls (test counts calls).
- [ ] Closing the tab during reveal still ends with stored results (runner test without a client).
- [ ] Log shows exactly 3 logical reveal calls.

## Risk assessment

- **Reveal p95 ≤ 15 s is unlikely with three sequential reasoning calls of ~10k tokens.** The guess screen hides part of the wait; the computing mode covers the rest. Measure in phase 10; lower effort on the verifier first if over.
- **`after()` work lost on a cold crash.** Mitigation: timer heartbeat, token-fenced restart from the poll endpoint, resume from stored parts.
- **Sealing by exclusion** reveals which note matched the target; PRD accepts this.
- **Generator paraphrasing the sealed item from the transcript.** It never receives the content, but the hook turn is in the transcript. Mitigation: claims citing the target's hook turn are sealed by code regardless of text.

## Security considerations

- Sealing is enforced in the server functions that build payloads, not in components. The payload tests are the guard.
- Canvas text is learner input: wrapped as data in the judge prompt, escaped on render; highlights are built from ranges, never from HTML.
