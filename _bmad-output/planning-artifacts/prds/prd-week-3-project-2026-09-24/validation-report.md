# Validation Report — InterviewLab PRD

- **PRD:** `D:\Tekmium\week-3\_bmad-output\planning-artifacts\prds\prd-week-3-project-2026-09-24\prd.md` (+ `addendum.md`)
- **Rubric:** `.claude/skills/bmad-prd/assets/prd-validation-checklist.md`
- **Run at:** 2026-09-25T20:20:00+07:00
- **Grade:** Fair

## Overall verdict

This PRD is well above the usual bar. The unlock gate, context isolation, replay spec, cut order and trade-offs are tight enough to build and test, and §5.0 defends the agent claim honestly. The weaknesses are what four rounds of sequential edits leave behind, not structural flaws. §11 still quotes the superseded 16.6-day schedule. The Call 2 prompt can tell the persona to withhold and disclose the same topic in the unlock turn. The topic-map leak definition counts the product's own hook drops as leaks. The verifier, on which three launch gates depend, has no input/output contract.

The three ad-hoc reviewers move the grade to Fair. M4 (library hidden at 1 scenario) left requirements pointing at a scenario card and a Screen 9 that no longer exist. `seed-demo` creates accounts nobody can sign into under Google-only login. The guide prints the learner's verbatim leading question, which contradicts FR-30's own "fixed strings only" rule and breaks a forge ethics lock without a record. The addendum still says the brief addendum is in force, although the PRD overrides most of it. For the submission, the product and main experience are strong. MVP scope and success criteria are scattered and conditional, and nothing in the success criteria tests the learning goal once the likely single-scenario launch removes SM-3 and SM-4.

## Dimension verdicts

- Decision-readiness — adequate
- Substance over theater — strong
- Strategic coherence — adequate
- Done-ness clarity — adequate
- Scope honesty — strong
- Downstream usability — adequate
- Shape fit — adequate

## Submission requirements (grader reading only the PRD)

- Product to be built — strong (§1)
- MVP scope — adequate: scattered across ~8 places, conditional, contradicted by §11
- Main experience — strong (UJ-1), dense, with a vestigial Màn 8 and conditional screens
- Agent mechanism — adequate: §5.0 is good, but the unlock table lives only in the addendum
- Success criteria — adequate: split between §9 and §10, and nothing measures the learning goal at 1 scenario

## Findings by severity

_Duplicates merged: the §11 schedule finding appeared in all four reviews and is listed once, under Decision-readiness._

### Critical (0)

### High (15)

**[Decision-readiness]** — Stale schedule risk contradicts the committed plan (prd §11 l.492)
"~16,6 ngày … cả hai cắt đều có khả năng xảy ra … buffer ~0,15" vs §3 l.53 and addendum §6 (16,0; the addendum table re-sums to 16,0). Under the stale text the verifier is likely cut; under the current plan it is not. Flagged by all four reviewers.
Fix: Rewrite to 16,0 days with no spare days: a slip of up to ~0,25 day is absorbed by cut #2, then cut #3.

**[Done-ness clarity]** — Contradictory instructions to the persona in the unlock turn (§5.2 step 3 l.219/221; FR-15)
Call 2 gets the do-not-assert rule of the matched tag ("không tự kể"), and on a surface/past/trust unlock that tag belongs to the item it is told to disclose now. FR-16 would then flag the correct disclosure.
Fix: Send do-not-assert only for tags whose items are still locked after this turn's unlock decision, and add a §10 item 3 test.

**[Done-ness clarity]** — The topic-map leak definition makes hook drops leaks (FR-34 (b) l.344)
"persona nhắc tới topic của một item còn khóa mà người học chưa từng chạm tới" describes every hook, and especially the untagged closing-question hook. The 0-confirmed-leak gate would pass only if Thanh overrides the written rule each time.
Fix: Exclude authored hook lines (detected by hook-anchor match) from type (b) and tell the judge.

**[Edit-drift consistency]** — seed-demo creates accounts nobody can sign into (FR-45 vs FR-2)
Google-only login; a CLI cannot mint Google identities, and there is no user/demo entity in addendum §4 for FR-37's demo reserve.
Fix: `seed-demo <google-email>` attaches an `is_demo` session exempt from FR-5; add `user(id, google_sub, is_demo)`.

**[Edit-drift consistency]** — Screen 9 "Sắp có" vs "no card at all" (prd l.56; add. l.174, l.182 vs prd l.133)
After M4, Screen 9 does not exist with one scenario, yet three places still promise a "Sắp có" card, and none of it is budgeted.
Fix: Drop "Màn 9 ghi Sắp có" everywhere; keep only the waitlist line.

**[Source-lock reconciliation]** — The guide prints the learner's verbatim leading question (SILENT) (FR-28, Màn 6.5 vs FR-30, l.118)
This breaks the forge guide/ethics lock ("câu thêm nội dung về người dùng = assumption, bị loại") and makes FR-30's "chỉ lắp từ chuỗi cố định … không có gì được sinh ra" false. The example is a question about chị Thu, which l.118 excludes.
Fix: Either keep the verbatim question on screen only (the print carries the pattern and error type), or record a deliberate reopening and amend FR-30.

**[Source-lock reconciliation]** — The supersession statement points architects to conflicting text (SILENT) (add. l.9)
It says the brief addendum is in force except §3/§3b, but the PRD overrides its §1 (labels, tiers, self-check, guide verifier, pre-flight, language param), its §2 and the praise clause in §6.
Fix: Make the PRD and this addendum take precedence everywhere, or list what is superseded; add a matching line to the PRD header for brief.md.

**[Source-lock reconciliation]** — "Mọi nhãn hiện bằng chứng" not met for leading labels (SILENT) (FR-19/20; §5.3)
Leading labels show neither "persona chưa từng nói" evidence nor any verifier check. This is the label the PRD itself calls the trust-killer.
Fix: Show the introduced phrase next to "persona chưa từng nói", or have the verifier re-check displayed leading turns, or record the weakening.

**[Testability and submission coverage]** — Persona voice rule never tested (§5.2 step 3; addendum §2)
"nói thoải mái, lan man" has no eval metric, and the 2-student trial has no pass bar.
Fix: Add a non-evasiveness report metric and 2–3 yes/no trial questions recorded as an artifact.

**[Testability and submission coverage]** — The author alone adjudicates the launch gate (FR-34; §10.2)
Confirmation has no criteria and no second reader.
Fix: A content-anchor match is always a confirmed leak; other flags stand unless overruled with a written reason.

**[Testability and submission coverage]** — FR-38 events cannot compute the §9 metrics (FR-38; §9)
SM-C4, SM-C7, SM-4, part of SM-5, SM-C1 and SM-C6 are not computable, and "mở guide" is undefined. FR-38 also has no acceptance item.
Fix: Add an event → payload → metric table and a §10 item that computes the metrics from one seeded session.

**[Testability and submission coverage]** — The production leak metric has no detector (NFR-6; SM-C4)
Leaks are only judged in eval.
Fix: Sample N production sessions weekly, or limit the metric to eval.

**[Testability and submission coverage]** — MVP scope scattered and conditional (§1, §2, §3, §7, §11)
Scope is spread across about 8 places and depends on two conditions (1 or 2 scenarios, verifier or not).
Fix: One scope box at the top of §3 (Cam kết / Nếu kịp / Nếu trễ / Next); move the conditional rewrites to the addendum.

**[Testability and submission coverage]** — No single "how we judge success" section (§9 vs §10)
Nothing ties the goal to the gates and signals, and nothing measures skill with 1 scenario.
Fix: Add a goal → gate → signal → known-limit table plus one learning proxy.

**[Testability and submission coverage]** — Length and density work against the "too heavy" feedback (whole doc)
About 13k words; §2 is a 732-word process log placed right after §1.
Fix: Move §2 and the conditional detail to the addendum; add a 2-page submission view.

### Medium (28)

**[Decision-readiness]** — Rubric-wording dependency not tracked as an open question (§5.0 l.175; add. §7)
Whether a controller around two LLM calls satisfies the course brief is the largest acceptance risk, and no repo artifact contains the rubric text.
Fix: Add to §11 Câu hỏi mở with an owner and a decision date (before day 9), plus the default if the wording is ambiguous.

**[Strategic coherence]** — No thesis-validating metric survives a 1-scenario launch (§9 l.403–409; add. l.174)
Replay success rate (primary candidate) and the guess-vs-actual gap would test the thesis using data already collected.
Fix: Add both as SMs; neither needs new instrumentation beyond an enriched reveal event.

**[Done-ness clarity]** — The verifier has no contract, and its scope drifts (§5.3; FR-22; NFR-8)
§5.3 says it checks that grounded_turn_id content matches, NFR-8 says it re-checks labels, and surface/trust unlocks may have no grounded turn. FR-20/21, NFR-8 and §10.2 all depend on it.
Fix: Add an input/output contract to addendum §2 and define "disagree" for unlocks with no grounded turn.

**[Done-ness clarity]** — Comment/guide selection rules and empty state unspecified (FR-20, FR-28)
Nothing says which comments make the ≤3, how they are ranked, the habit thresholds, the error taxonomy that picks a pattern, or what shows when there is nothing to say.
Fix: Add a small table to the addendum: observation type, threshold, priority, empty state.

**[Done-ness clarity]** — FR-5 is silent on abandoned sessions (FR-5, FR-10)
With one scenario, whether a quit-at-turn-3 session can be restarted decides whether a learner gets a real attempt.
Fix: State resume-only (or restart) and any idle auto-end.

**[Downstream usability]** — Label enums differ between PRD and addendum (§5.1 vs add. §2)
`confirm-grounded`/`leading/assumption` in the PRD vs `confirm_grounded`/`leading` in the addendum JSON.
Fix: Declare the addendum values canonical in §5.1.

**[Edit-drift consistency]** — Old-tripwire arithmetic sums to 15.5 (add. l.174)
9,75 + 5,75 comes from an older total. The conclusion still holds.
Fix: Recompute from the current table (~10,35 / ~5,65).

**[Edit-drift consistency]** — Scenario 2 cost ignores the library screen and Screen 9 (add. l.155/165/174)
Passing the tripwire also means building Màn 2, Màn 9 and FR-31 (~+0,1).
Fix: "+1,1" and a tripwire of ≤3,9, or state that the 0,1 is absorbed.

**[Edit-drift consistency]** — FR-5, FR-42 and cut #2 assume a scenario card (FR-5, FR-42, prd l.57)
No card exists with 1 scenario; "buổi cũ hơn qua thẻ kịch bản" cannot happen after cut #1.
Fix: Route via the home CTA and rewrite the cut #2 consequence.

**[Edit-drift consistency]** — Home CTA can open unfinished sessions read-only (FR-4, Màn 1 vs FR-40/41)
"đã luyện" is undefined against the status enum, so a revealed/replaying session could expose the sealed target.
Fix: Only `done` goes to review; any other status resumes per FR-10.

**[Edit-drift consistency]** — §10.2 still cites FR-33–36 and "cổng publish" (prd l.426)
FR-35/36 are Next.
Fix: Cite FR-33, FR-34 and the named review.

**[Edit-drift consistency]** — The FR-35 replacement is never defined (prd l.81 vs l.333)
The named responsibility covers only the FR-36 string review, not "all thresholds passed before publish".
Fix: Extend the block to FR-35.

**[Edit-drift consistency]** — Grounded praise has no slot in the merged reveal/guide (FR-20 vs Màn 6.5, FR-28)
The section is defined as leading/pattern pairs plus the habit card.
Fix: State the composition and whether praise counts toward the 3 and appears in print.

**[Edit-drift consistency]** — Turn 0 (opening_line) undefined (FR-7 vs §5.1 "đánh số từ 1")
Is it a valid grounded_turn_id? If yes, turn 1 can be grounded, which undercuts the openness-4 rationale.
Fix: One rule in addendum §4.

**[Edit-drift consistency]** — seed-demo is non-deterministic (FR-45, §10.12)
Real calls may miss the hook anchor, so the session lands on a fallback; no guess is seeded.
Fix: Fail unless fallback_level = primary; add --guess.

**[Edit-drift consistency]** — Cut #2 has no rewrite block (prd l.57 vs §10.10)
Unlike cut #3, the requirements cut #2 affects have no pre-written replacements.
Fix: Add a "Nếu cắt #2" block.

**[Source-lock reconciliation]** — Fallback-1 replay "success" unlocks nothing (SILENT) (§6.5)
The forge success rule is "Đã mở: item X".
Fix: Record it, or make fallback 1 target a locked item.

**[Source-lock reconciliation]** — Confirmed-leak adjudication not recorded as a forge reopening (PRD §2 only)
The same person authors, tunes, adjudicates and publishes.
Fix: Add an addendum §7 row and require a reason per dismissed flag.

**[Source-lock reconciliation]** — Praise removal on cut #3 / verifier failure not argued against the lock (l.58, l.235)
Code-resolved good turns could keep ≤1 praise item.
Fix: Keep one praise item, or record the reopening.

**[Source-lock reconciliation]** — Decision log is stale (.memlog.md)
It has no party-mode or elicitation entries, and its last entry still says magic link and no cuts.
Fix: Append the decisions and supersede the old entry.

**[Source-lock reconciliation]** — "Có mục tiêu" met only by reframing (SILENT) (§5.0)
Goal-aware planning belonged to the deferred adversarial curriculum.
Fix: Say so in one line and claim the narrower within-session goal.

**[Source-lock reconciliation]** — "Dùng tool" contingency cannot be triggered (§5.0 l.175)
No repo artifact holds the rubric text, and the only tool-call site is the verifier (cut #3).
Fix: Get the rubric wording now.

**[Source-lock reconciliation]** — brief.md contradictions never superseded as a whole (prd header l.10)
Each change is recorded individually, but there is no precedence rule.
Fix: Add a precedence line.

**[Testability and submission coverage]** — Agent mechanism depends on the addendum (§5; l.191)
The unlock table and the turn steps live only in the addendum; "câu hỏi phù hợp" is vague.
Fix: Copy the 4-row unlock table and the 7-step turn into §5.

**[Testability and submission coverage]** — Rubric hedging inside the submission (l.168, l.175)
Speculating about the rubric reads as uncertainty.
Fix: State the design plainly and keep the contingency in the addendum.

**[Testability and submission coverage]** — Untested reveal layout, sealed target, 360px, copy greps, atomicity/resume (FR-19, NFR-11, NFR-14, NFR-10, FR-10/11)
These are self-testable, but no §10 item checks them.
Fix: Add targeted §10 bullets.

**[Testability and submission coverage]** — §10.5 tests something no FR requires (§10.5 bullet 3)
No FR says a sample question must unlock its own item.
Fix: Add it to FR-34 and use a mocked Call 1 in the unit test.

**[Testability and submission coverage]** — "nói khi phù hợp" affects the score (§5.2; §5.1)
An item that unlocked but was never said counts as missed, so the learner pays for the model's timing.
Fix: Force disclosure on the next tag match, or report the case.

### Low (9)

**[Decision-readiness]** — No [NOTE FOR PM] callouts (whole doc)
Tensions are resolved in prose; the rubric item is the one place a callout would do work.
Fix: Optional.

**[Strategic coherence]** — "≥30 người học" has no time window (§9 l.401)
There is no window and no plan for reaching 30 from 1–2 classes.
Fix: State the window.

**[Done-ness clarity]** — NFR-2 is both a gate and provisional (l.376 vs §10.8)
"mức khởi điểm, sẽ chỉnh".
Fix: Say who may relax it and by when.

**[Done-ness clarity]** — revealed→done with no replay is not stated (§6.6)
Fallback 2 path is missing from the state machine.
Fix: Add one sentence.

**[Done-ness clarity]** — "mở guide" event no longer maps to an action (FR-38 l.354; #10)
The guide is now a section of the reveal.
Fix: Redefine as print click or scroll-into-view.

**[Downstream usability]** — Process history in the PRD body (§2; §3 l.51–53)
A story-writer extracting §3 gets history mixed with scope.
Fix: Move to the addendum with a pointer.

**[Edit-drift consistency]** — Six low items (see file)
Stale addendum §7 l.221 verifier rationale; §5.0 lists "kiểm cuối buổi" as a base-plan check; brainstorm-intent ref should be "mục 2, ràng buộc 7"; Màn 10 never mentions interviews #3/#5; "mở guide" undefined; label spelling drift.
Fix: See review-consistency.md.

**[Source-lock reconciliation]** — Six low items (see file)
The counter/tier cut rationale; BA "câu xác nhận đóng" bar dropped; JTBD dropped; `open` label framed as not reopening; forge-lock markers missing on several rows; §1 "bộ câu hỏi" wording.
Fix: See review-source-locks.md.

**[Testability and submission coverage]** — Seven low items (see file)
FR-5/FR-9 untested; NFR-2 provisional; NFR-9 "no training" belongs in the checklist; §10.11 "hết guide"; baseline support criterion; jargon before the glossary.
Fix: See review-testability-submission.md.

## Mechanical notes

- Schedule drift: prd l.492 (16,6) vs l.53 / add. l.142, l.164 (16,0). Four reviewers flagged it.
- add. §7 l.221 still justifies templates with "verifier chạy một lần lúc soạn kịch bản" (now Next).
- §10.2 header "(FR-33–36)" and "cổng publish" cite Next requirements.
- NFR-1 "tối đa 1 call" vs §10.6 "đúng 1 call" for the verifier: pick one.
- The five inline [ASSUMPTION] tags (NFR-3, NFR-7, NFR-8, add. §3.1 ×2) have no index.
- Terms not defined in §5.1: "call logic", "episode", "buổi chấm điểm", session states.
- §5.0 cites brainstorm-intent.md, which is not in the source header; the correct locator is "mục 2, ràng buộc 7".
- SM-C6 "độ trễ p95" casing.
- Arithmetic verified: addendum §6 table = 16,0; 67 calls per session; 3 + 1 + 7 = 11 in UJ-1.

## Reviewer files

- `review-rubric.md`
- `review-consistency.md`
- `review-source-locks.md`
- `review-testability-submission.md`
