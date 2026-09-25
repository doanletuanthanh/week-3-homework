---
title: 'Review: testability and submission coverage, InterviewLab PRD'
reviewed: 'prd.md (498 lines, ~13,000 words), addendum.md (235 lines, ~5,200 words)'
date: '2026-09-25'
mode: read-only on PRD
---

# Review: testability and submission coverage

**Verdict:** The core mechanism (context isolation, unlock gate, replay, trace/seed) is unusually well covered by concrete §10 gates, but the experience-quality rules added in the latest round (persona voice, reveal layout, guide habit card, copy, responsive) and most of the success metrics have no acceptance check or cannot be computed from the FR-38 events. For a grader, scope and success criteria are scattered, and §11 contradicts §3.

Severity counts (Part A + Part B): **critical 0 · high 8 · medium 15 · low 7**.

Legend for coverage: `§10#n` = acceptance item n; `self` = the requirement text is an observable pass/fail, but no §10 item checks it; `partial` = only part of the requirement is checked; `NONE` = no §10 item, and the wording is not objectively checkable (or the needed data does not exist).

---

## Part A: Testability

### A.1 Coverage map

#### Functional requirements

| Req | Test coverage | Problem (if any) | Sev |
|---|---|---|---|
| FR-1 | §10#1 (partial), self | Guest access is only implied by the demo flow | low |
| FR-2 | §10#1 | none | — |
| FR-3 | §10#9 | none | — |
| FR-4 | §10#1 partial ("chọn kịch bản, chỉ khi có ≥2"), self | The 1-scenario direct route and the "Xem lại kết quả" route for a scenario already practised are not asserted. "đã pass eval và được duyệt" cannot be enforced, since `publish` only sets status in MVP (FR-35 is Next) | low |
| FR-5 | self | One scored session per scenario is also the per-user cost limit, yet no §10 item checks it | low |
| FR-6 | self; `validate` checks only that `research_goal` exists (FR-33) | Nothing checks that the prep screen shows the goal, the 30-turn limit, the rule, or the "một điều" definition. Whether `research_goal` is "câu hỏi mà tảng băng thật sự trả lời được" is judged only by the author rubric (addendum line 194), and no artifact records the result | medium |
| FR-7 | self | The opening line "không gọi LLM, không thả hook" is a unit-testable claim with no test. "không đổi trong suốt buổi" is observable | low |
| FR-8 | self | none | low |
| FR-9 | self | Auto-end after turn 30 is not tested | low |
| FR-10 | self | Resuming during the interview, after reveal, and mid-replay has no §10 check. UJ-1 lists these as the main deviations | medium |
| FR-11 | self | "không làm thay đổi trạng thái" on an LLM error has no fault-injection test (see NFR-10) | medium |
| FR-12 | §10#3 | none | — |
| FR-13 | §10#4 | none | — |
| FR-14 | §10#4 | none (the normalization bullet is good) | — |
| FR-15 | §10#3 (context contents) | The context test checks only what is excluded. The **voice rule** ("nói thoải mái, có thể lan man", §5.2 step 3, addendum §2) is not tested by eval, §10, or the 2-student trial (no pass bar). "nói khi phù hợp" for items unlocked earlier but not yet disclosed cannot be measured, and it affects scoring, because "đã khai thác" requires disclosure (§5.1) | high (voice) / medium (khi phù hợp) |
| FR-16 | self (can be tested with a mocked Call 1) | No §10 item checks that flagged turns are excluded from reveal evidence. The last-turn check by the verifier or the end-of-session call is also untested | medium |
| FR-17 | §10#5 partial ("snapshot không đổi" after replay) | Immutability during the main session is not tested | low |
| FR-18 | §10#1 | none | — |
| FR-19 | self | Reveal **order**, **collapsed** missed items, the **sealed** target (no content, no sample question before replay ends), and the trust card "bằng lời, không hiện con số" have no §10 check. §10#10 checks only that nothing is sealed **after** replay | medium |
| FR-20 | self, partial | No rule decides **which** 3 comments appear when more qualify. "lời khen có căn cứ" depends on the verifier (and disappears under cut #3) | medium |
| FR-21 | self | Rendering by turn ID and click-to-jump are not tested | low |
| FR-22 | §10#6 | The failure path (2 retries, then render without praise) is not tested | low |
| FR-23 | §10#5 | none | — |
| FR-24 | §10#5 partial | No test shows that the replay context excludes post-fork content. §10#3 covers "mọi lượt của eval", which does not include replay branches | medium |
| FR-25 | §10#5 partial | The "exactly 3 turns" cutoff is not asserted | low |
| FR-26 | §10#5 partial | Only the success display is asserted. Partial success, failure, and fallback-1 success ("không lượt nào `leading` và ≥1 nhãn tốt") are not | low |
| FR-27 | §10#5 | none | — |
| FR-28 | §10#1 (the section exists) | "thẻ thói quen hiện khi ledger vượt ngưỡng": **the threshold is not defined anywhere** (UJ-1 gives only "ví dụ ≥2 hook bị bỏ qua"). "pattern soạn sẵn cho loại lỗi đó": the error-type taxonomy that maps to patterns is not defined (is it by label `leading`, or by `question_type` such as `hypothetical_future`?) | medium |
| FR-29 | §10#1 ("và in") | The blank line in the print view is self-testable | low |
| FR-30 | §10#2 (manual review recorded in the eval report) | The check is the author's judgement, but it produces an artifact. Acceptable for MVP | low |
| FR-31 | self (only when ≥2 scenarios) | none | low |
| FR-32 | self | Nothing checks that the click is recorded | low |
| FR-33 | §10#2 | "kiểm trùng từ nội dung" needs a definition (stopwords, stemming) to be deterministic | low |
| FR-34 | §10#2 | Leak adjudication is done by the author alone and has no criteria (finding A2) | high |
| FR-35/36 | n/a (Next) | §10#2 still cites "FR-33–36" and "(cổng publish)" | low |
| FR-37 | §10#11 | "đi tới hết guide": the guide sits inside the reveal, while replay comes after the reveal, so it is unclear whether a replay after the cap is allowed. UJ-1 says reveal, replay **and** guide finish. The way demo accounts are marked is not specified | low |
| FR-38 | **NONE** | No acceptance item. The event list is also not enough to compute several §9 metrics (finding A3) | high |
| FR-39–41, FR-43 | §10#10 | none | — |
| FR-42 | §10#10 (by range only) | No bullet checks it | low |
| FR-44 | §10#12 | none | — |
| FR-45 | §10#12 | Seeding uses real LLM calls, so it is not deterministic. §10#12 does not assert that the seeded session lands on the **primary** replay candidate, which the demo checklist requires (§10 checklist, line 459) | medium |

#### Non-functional requirements

| Req | Test coverage | Problem | Sev |
|---|---|---|---|
| NFR-1 | §10#6 | none | — |
| NFR-2 | §10#8 | The text says "Đây là mức khởi điểm, sẽ chỉnh sau khi đo", yet it is a launch gate. It is unclear whether it can be relaxed before launch | low |
| NFR-3 | partial (§10#11 covers the cap; cost target none) | The target depends on a 100–200k VND band tagged `[ASSUMPTION]`. It does not gate launch, which is acceptable | low |
| NFR-4 | §10#3 | none | — |
| NFR-5 | §10#4 (last bullet) + §10#3 | none | — |
| NFR-6 | **NONE** | "theo dõi tỉ lệ rò rỉ mỗi episode" in production: leaks are detected only by the eval judge plus author adjudication. No production detector or sampling plan exists, so the metric cannot be computed | high |
| NFR-7 | §10#7 | The test set is labelled by the author. No inter-rater agreement is required, so the "≤5%" hard gate is only as good as those labels. The `[ASSUMPTION]` tag covers the test-set composition, not the thresholds | low |
| NFR-8 | §10#2 | The ≤10% threshold is tagged `[ASSUMPTION]` **and gates launch**. The verifier has **no call contract** (addendum §2 defines only Call 1 and Call 2). NFR-8 says the verifier "kiểm lại nhãn", while §5.3 says it checks whether `grounded_turn_id` "có thực sự chứa nội dung" | medium |
| NFR-9 | §10#9 partial | "không dùng để huấn luyện model" is a provider or config setting and cannot be tested by the product. It should be a checklist item | low |
| NFR-10 | self (no §10 item) | Transaction atomicity (all or nothing per turn) has no fault-injection test, though FR-11 and resume depend on it | medium |
| NFR-11 | self, **no §10 item** | 360px is the stated reason for the reveal redesign (addendum line 231), yet nothing checks it | medium |
| NFR-12 | self | Trivial with one language | low |
| NFR-13 | partial via FR-30 | Covers only the fixed strings | low |
| NFR-14 | partial self / **NONE** for tone | The banned strings ("feedback", "tự tin", bare "phỏng vấn") can be checked with grep, but no gate does it. "Dùng ngôn ngữ của nỗi sợ và của việc sửa kịp" and "Không dùng tone mềm" cannot be measured | medium |

#### Success metrics (post-launch, read after ≥30 learners). Can each be computed from the FR-38 events?

FR-38 events: session start, turn, end, reveal, replay start, replay result, "mở guide", waitlist click.

| SM | Computable? | Problem | Sev |
|---|---|---|---|
| SM-1 reveal / started ≥60% | yes | none | — |
| SM-2 revealed sessions that use replay ≥40% | yes (replay start) | "dùng" is not defined as started or finished. Sessions on fallback 2 cannot replay, yet they sit in the denominator | low |
| SM-3 second session on another scenario ≥30% | yes, if the start event carries `scenario_id` (not stated) | Needs ≥2 scenarios. Addendum line 174 says the second scenario "nhiều khả năng sang Next", so this metric is likely dead at launch | medium (see B3) |
| SM-4 unlock rate in session 2, replay vs no replay | partial | Needs the per-session exploited count. The reveal event payload is not specified. Needs ≥2 scenarios | medium |
| SM-5 waitlist count; "≥1 giảng viên hoặc trung tâm chia sẻ link" | count: yes; second clause: **NONE** | No referral or source tracking exists to observe who shared the link | medium |
| SM-C1 abandoned before turn 5 | partial | "bỏ" is undefined, because resume is always possible (FR-10). A time window is needed | medium |
| SM-C2 flagged persona turns | yes (from `turn.flagged`, not an event) | none | — |
| SM-C3 verifier disagreement | yes (`verifier_json`) | none | — |
| SM-C4 leaks per episode | **NONE** | Depends on NFR-6, which has no production detector | high (with NFR-6) |
| SM-C5 cost per session | yes (NFR-3 logging) | none | — |
| SM-C6 production p95 latency | partial | §10#8 measures eval only. The turn event carries no latency field | low |
| SM-C7 replay falls to fallback 2 | **no, from the listed events** | Fallback 2 creates no branch and no replay event. `branch.fallback_level` exists only when a branch is created | medium |
| Assumption #10 "lượt mở guide" | **undefined** | The guide is now inside the reveal (FR-28), so "mở guide" has no clear trigger (scroll? print click?) | medium |

**Requirements with NONE coverage** (no §10 item and not objectively checkable): **FR-38, NFR-6, SM-C4** (3). NONE sub-clauses: FR-15 voice rule and "khi phù hợp", FR-28 habit threshold, NFR-14 tone bullets, SM-5 lecturer-share clause, SM-C7 via the listed events. A further 20 requirements are self-testable but have **no §10 item**: FR-5–11, FR-16, FR-19–21, FR-31, FR-32, FR-38, NFR-6, NFR-10–14.

### A.2 Findings

**A1 (high): The persona voice rule is never tested.** Location: §5.2 step 3 (line 218), §5.1 openness (line 200), addendum §2 line 61, §11 risk "Độ thật" (line 489). Of the four mitigations for the activation risk (SM-C1) and the realism risk, "persona nói thoải mái ngoài item" is one, and it is new in this round. The FR-34 eval metrics measure leaks, anchor compliance, and contradictions, but not whether the persona is evasive on surface topics. The 2-student trial (addendum line 162) "kiểm persona" has no pass criterion and no recorded artifact. A chatty persona is also the more likely one to leak the topic map, which is a real trade-off. *Fix:* add an FR-34 report metric, for example "share of persona replies to `open` surface questions judged non-evasive" or a minimum mean reply length on surface topics. Record the trial as a short artifact against 2–3 yes/no questions (did the student get stuck in the first 5 turns? did the persona feel like a person?).

**A2 (high): The author adjudicates the gate that decides launch.** Location: FR-34 (line 344), §10#2 (line 426), UJ-2 step 2 (line 154). "0 rò rỉ **đã xác nhận**" is the hardest scenario gate, and confirmation is Thanh ruling on the judge's flags. No confirmation criteria and no second reader are defined. The report records the verdict, which gives an artifact, but no reproducible basis. *Fix:* define a confirmed leak mechanically where possible: (a) any content-anchor match for a locked item is a confirmed leak and cannot be overruled; (b) otherwise the flag is kept unless overruled with a written reason. Require the flagged turn text, the verdict and the reason in the report.

**A3 (high): FR-38 cannot compute several §9 metrics and has no acceptance check.** Location: FR-38 (line 354), §9 (lines 399–421). See the SM table: SM-C7 (fallback 2 emits nothing), SM-C4 (no source), SM-4 (no exploited count), SM-5 second clause, SM-C1 ("bỏ" undefined), SM-C6 (no latency field), and "mở guide" (the guide was merged into the reveal). *Fix:* replace the event sentence with a small table (event → payload fields → metrics fed). Add `reveal{exploited, total, replay_candidate_level}`, `turn{latency_ms}`, and print or reveal-scroll for the guide. Add a §10 item: "log of one seeded session computes SM-1, SM-2, SM-C1, SM-C7".

**A4 (high): The production leak metric has no detector.** Location: NFR-6 (line 385), SM-C4 (line 418), FR-34 "Episode … hoặc một buổi trong production" (line 344). *Fix:* either state "judge runs on a weekly sample of N production sessions, flags adjudicated as in eval", or limit NFR-6 and SM-C4 to eval.

**A5 (medium): The habit-card threshold and the error taxonomy are undefined.** Location: FR-28 (line 323), UJ-1 Màn 6 item 5 (line 120). *Fix:* name the habits and thresholds (for example "hook bỏ qua ≥2", "`hypothetical_future` ≥2", "`leading` ≥3") as scenario config, and state that patterns are keyed by `question_type`/label.

**A6 (medium): FR-20 has no selection rule when more than 3 comments qualify.** Location: FR-20 (line 308). *Fix:* order by count descending, then by earliest turn, and put the grounded praise first when it exists.

**A7 (medium): "nói khi phù hợp" affects the score.** Location: §5.2 step 3 (line 219), addendum line 62, §5.1 "Đã khai thác" (line 205). An item unlocked earlier but never disclosed counts as missed, so the learner is penalized for the model's timing. *Fix:* make disclosure mandatory on the next turn whose tag matches, or report "unlocked but undisclosed" in the eval report and on the reveal.

**A8 (medium): The sealed target and the reveal layout are untested.** Location: FR-19 (line 307), §10#10 (line 452). *Fix:* add to §10#5: "trước khi replay kết thúc, response của reveal không chứa nội dung, cụm neo hay câu hỏi mẫu của item mục tiêu; thứ tự khối đúng FR-19; thẻ tin tưởng không chứa số".

**A9 (medium): NFR-11 (360px) has no gate.** *Fix:* in §10#1, add "chạy ở 360px và desktop".

**A10 (medium): The NFR-14 copy rules have no gate, and two of them cannot be measured.** *Fix:* add a §10 copy check that greps the UI strings for "feedback", "tự tin", and bare "phỏng vấn". Move the tone bullets to a style note that does not gate launch.

**A11 (medium): The support for starting a session (FR-6, FR-7) has no pass criterion.** Location: FR-6/7, §11 "Người học không biết bắt đầu" (line 491), rubric (addendum line 194). "Kiểm bằng buổi thử với sinh viên" has no bar, and the rubric check is never recorded. *Fix:* record the rubric result in the eval report (same place as the manual string review), and give the trial one observable question: "sent a first question within 60s without asking what to do".

**A12 (medium): §10#5 tests something no FR requires.** Location: §10#5 bullet 3 (line 442). "Câu hỏi mẫu gửi ở lượt replay thứ 2 vẫn mở được item mục tiêu": no FR requires sample questions to unlock their item (FR-33 does not check it), and the result depends on Call 1's LLM judgement inside a list of automated tests. It also matters for the product: a failed replay shows the sample question as "Một câu đã mở được nó" (line 129). *Fix:* add to FR-34: "mỗi câu hỏi mẫu mở được item của nó (tỉ lệ ≥X% qua N lần)". Keep the §10#5 bullet with a mocked Call 1 for determinism.

**A13 (medium): FR-45 does not assert the primary candidate.** Location: §10#12 (line 456), checklist (line 459). *Fix:* "`seed-demo` fails loudly unless the resulting session's replay candidate is the primary candidate".

**A14 (medium): NFR-8 is an assumption-level gate on a component with no contract.** Location: NFR-8 (line 387), §5.3 (line 232), addendum §2. *Fix:* add a verifier contract (input, output) to addendum §2, align the definition in NFR-8 with the one in §5.3, and either make ≤10% report-only or keep the gate and state why 10%.

**A15 (medium): Atomicity, resume, and LLM-error behaviour are untested.** Location: NFR-10, FR-10, FR-11. *Fix:* add a §10 item: kill the process between Call 2 and the write, and check that no partial turn exists and that the session resumes at the same turn. Also check mid-replay resume.

**A16 (medium): SM-C1 "bỏ" is undefined.** *Fix:* "không có lượt mới trong 24h và chưa kết thúc".

**A17 (low):** §10#2 references "FR-33–36" and "(cổng publish)", although FR-35/36 are Next and `publish` does not gate. *Fix:* use "FR-33–34", and call it the "ngưỡng trước khi Thanh publish".

**A18 (low):** NFR-2 says "mức khởi điểm, sẽ chỉnh sau khi đo" while it is a launch gate. *Fix:* "cố định cho MVP; chỉnh sau ra mắt".

**A19 (low):** §10#11 says "đi tới hết guide". *Fix:* "đi tới hết reveal và replay".

**A20 (low):** FR-5 (one session per scenario) and FR-9 (auto-end) are untested. FR-4 "đã pass eval và được duyệt" cannot be enforced in MVP. *Fix:* add them to §10#1, or add one API test.

**A21 (low):** The baseline is report-only, but §5.0 (line 173) uses it as "bằng chứng so sánh" without saying what result supports assumption #11. *Fix:* "hỗ trợ #11 nếu baseline có rò đã xác nhận > engine trên cùng 20 đòn".

**A22 (low):** "không dùng để huấn luyện" in NFR-9 is a provider setting and cannot be tested. *Fix:* move it to the launch checklist.

---

## Part B: Submission requirements (grader reads only the PRD)

| # | Required content | Where | Verdict |
|---|---|---|---|
| 1 | Product to be built | §1, lines 14–24 | **strong** |
| 2 | MVP scope | §3, lines 36–87, but also §1 line 20, §2 lines 28–34, §7 FR-35/36, §11 line 492, and addendum §6 | **adequate** (buried, conditional, contradicted) |
| 3 | Main experience | §4 UJ-1, lines 93–147 (+ UJ-2, lines 149–155) | **strong** (dense) |
| 4 | Agent mechanism | §5.0–5.3, lines 157–239; §6, lines 241–276 | **adequate** (depends on the addendum) |
| 5 | Criteria for judging success | §9, lines 399–421; §10, lines 423–462 | **adequate** (split, and weak on the goal) |

**(1) Product: strong.** Line 16 states the problem and product in two sentences, and line 18 states the core loop (interview → guess → reveal with turn citations → replay → take-away). Context (1 dev, ~16 days, VI only, UX role only) and ethics sit in lines 20–24. Minor issue: "tảng băng" and "khoảnh khắc bị lỡ" are used before any definition, but they read clearly in context.

**(2) MVP scope: adequate, but a grader has to assemble it.** The 11-item "Trong MVP" list (lines 38–49) is clear. Around it, scope is restated or changed in: the §2 change log (line 32: "Cắt khỏi must-ship…"; line 34), the scope rationale paragraph (line 51), the schedule paragraph (line 53), the 3-step cut order (lines 55–58), "Nếu cắt #3" with **conditional rewrites of FR-20/21/22, NFR-1 and §10#6** (lines 62–67), the 11-row cut-and-consequence table (lines 71–83), Next/Later/out (lines 85–87), FR-35/36 inside §7, and the stale §11 schedule risk (finding B1). Scope is also conditional in two dimensions: 1 or 2 scenarios, and verifier or no verifier. §1 line 20 says "Thư viện có 2 kịch bản (tối thiểu 1)", while addendum line 174 says the second scenario "nhiều khả năng sang Next".

**(3) Main experience: strong.** UJ-1 is concrete and has example dialogue (lines 105–107, 126–127). A grader may be confused by the vestigial "Màn 8: … Đã gộp vào Màn 6. Số màn được giữ nguyên để các tham chiếu cũ vẫn đúng" (line 131), which is an internal concern. Màn 2 and Màn 9 are conditional, and in the committed 1-scenario build neither exists. The reveal screen alone (lines 113–122) runs to about 500 words.

**(4) Agent mechanism: adequate.** §5.0 maps the five agent properties to mechanisms and evidence (lines 163–169), which is exactly what a grader wants, and "Đây không phải là…" (line 171) is honest. But:
- The rule that defines "hỏi đúng cách" (the 4-row unlock table) and the openness table exist **only in the addendum** (§3.1). The PRD version of the trust path is "openness đạt ngưỡng và câu hỏi phù hợp" (line 191), which is vague.
- §5.0 cites `brainstorm-intent.md` mục 7 (line 161). That file is not in the source list (line 10) and a grader does not have it.
- The "Dùng tool" row (line 168) describes code functions the model **cannot** call. A grader who defines an agent as an LLM calling tools may read this as "not an agent". The "Dự phòng có tên" paragraph (line 175) openly hedges against the course rubric's wording, which reads as uncertainty inside the submission itself.
- The mechanism has no diagram of one turn. Addendum §1 has a 7-step list that would serve.

**(5) Criteria for success: adequate but split.** §10 has 12 concrete, mostly automatable launch gates, a real strength. However:
- No single place links the **product goal** (the learner catches their mistakes before a real interview) to a criterion. §9 is engagement measured after ≥30 learners, and SM-2 itself says "không chứng minh việc học". §10 is engineering correctness. Learning improvement (assumptions #2 and #9) is explicitly not measured.
- With one scenario, which is likely per addendum line 174, SM-3 and SM-4 cannot be measured (line 56). That leaves 3 of 5 success metrics, and none of them measures skill.
- The one human check before launch (2 students, addendum line 162) lives only in the addendum and has no criterion.
- §9 and §10 are separated by headings and never cross-referenced as "how we judge success".

### B findings

**B1 (high): §11 contradicts §3 and the addendum on schedule and cuts.** Location: prd.md line 492 ("Phần cam kết là ~16,6 ngày, vượt mốc ~0,6 ngày … **cả hai cắt đều có khả năng xảy ra**, buffer … ~0,15 ngày") vs line 53 ("~16,0 ngày trên mốc 16 ngày") and addendum lines 142 and 164 ("~16,0 ngày … Không cắt trước"). A grader cannot tell whether "Buổi của tôi" and the runtime verifier are in MVP. *Fix:* update line 492 to 16,0, with the cut order as a contingency only.

**B2 (high): MVP scope is scattered and conditional.** See (2). *Fix:* put one box at the top of §3: **Cam kết** (1 scenario + the 11 items), **Nếu kịp** (scenario 2), **Nếu trễ, cắt theo thứ tự** (3 one-liners), **Next**. Move "Nếu cắt #3" and the cut-consequence table to the addendum. Change §1 line 20 to "1 kịch bản (thứ hai nếu kịp)".

**B3 (high): There is no single "how we judge success" section, and the criteria are weak on the product goal.** See (5). *Fix:* add a short table at the top of §9: *Mục tiêu → cổng ra mắt (§10 #) → tín hiệu sau ra mắt (SM) → giới hạn đã biết*. Add one learning-proxy check within reach of the MVP, for example the "đoán vs thực tế" gap narrowing between the main session and the replay, or the 2-student trial with a written outcome. Move the trial into §10 or the checklist.

**B4 (high): Length and density work against the reviewer's "too heavy" feedback.** The PRD is ~13,000 words (~500 lines) plus ~5,200 in the addendum. The first thing after §1 is a 732-word reviewer-response log (§2, lines 26–34) full of process jargon ("party-mode", "advanced elicitation", "first principles", "forge", "tripwire", "mở lại khóa forge", "W4" in addendum line 230). §3 alone is ~1,500 words, and §5–§6 ~2,850. The document shows how much was cut, but still reads as heavy. *Fix:* move §2 to the addendum or a changelog, leaving 3 bullets ("4→2 calls; guide from templates; bilingual/tier/admin cut"). Move the conditional FR rewrites, the cut table, and the §5.3 failure-path detail to the addendum. A 2-page submission view (§1, the scope box, the UJ-1 core loop, the §5.0 table + the unlock table, the success table) would answer all five items.

**B5 (medium): The agent mechanism depends on the addendum.** See (4). *Fix:* copy the 4-row unlock table (addendum §3.1) and the 7-step turn list (addendum §1) into §5. Replace "câu hỏi phù hợp" (line 191) with the actual condition. Drop the `brainstorm-intent.md` reference, or quote the five properties inline (they are already listed).

**B6 (medium): Rubric hedging and the "tool" framing.** Location: line 168, line 175, addendum line 192 and line 213. *Fix:* state plainly that the controller uses deterministic tools and that the LLMs are deliberately given no tools so the gate stays in code. Remove the speculation about the rubric's wording from the submission copy, and keep it in the addendum.

**B7 (medium): Vestigial and conditional screens in UJ-1.** Location: line 131 (Màn 8), Màn 2 and Màn 9. *Fix:* renumber the screens and mark conditional ones once. Add a 5-step loop summary at the top of §4.

**B8 (low): Heavy jargon before definitions.** Tảng băng, niêm phong, hook, ledger, openness, cụm neo and do-not-assert all appear in §1–§4, while §5.1 defines them (line 91 forward-references). *Fix:* add a 6-line glossary after §1.

---

## Top 5

1. **A3/A4 (high):** The FR-38 events cannot compute SM-C4, SM-C7, part of SM-5, or SM-4, and "mở guide" is undefined after the guide merge. NFR-6 has no production leak detector.
2. **A1 (high):** The new persona voice rule ("nói thoải mái, lan man") is tested nowhere. The 2-student trial has no pass bar.
3. **B1 (high):** §11 line 492 still says 16,6 days and "cả hai cắt đều có khả năng xảy ra", which contradicts §3 and the addendum (16,0, no pre-cut).
4. **B2/B3 (high):** MVP scope is spread across about 8 places and is conditional. Success criteria are split between §9 and §10 with no link to the learning goal, and SM-3/SM-4 are likely dead with 1 scenario.
5. **A2 (high):** The launch-gating "0 rò rỉ đã xác nhận" rests on the author adjudicating flags without criteria or a second reader.
