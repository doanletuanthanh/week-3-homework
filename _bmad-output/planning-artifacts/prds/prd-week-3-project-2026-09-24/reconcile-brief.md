---
title: 'Reconciliation: brief.md vs prd.md/addendum.md'
input: '_bmad-output/planning-artifacts/briefs/brief-week-3-project-2026-09-22/brief.md'
against:
  - '_bmad-output/planning-artifacts/prds/prd-week-3-project-2026-09-24/prd.md'
  - '_bmad-output/planning-artifacts/prds/prd-week-3-project-2026-09-24/addendum.md'
memlog: '_bmad-output/planning-artifacts/prds/prd-week-3-project-2026-09-24/.memlog.md'
created: '2026-09-25'
---

# Reconciliation: brief.md → prd.md / addendum.md

Method: read brief.md fully, read prd.md and addendum.md fully, read .memlog.md for
logged decisions, then walked brief section by section checking whether each claim,
rule, metric, risk, or open question survives, is explicitly changed, or silently
disappears. "Gap" = dropped or contradicted with no decision recorded in .memlog.md
(or reasoned inline in addendum.md). "Intentionally changed" = memlog or addendum
shows the change was a deliberate call. This file is read-only research output; no
other file was modified.

## Gaps

### High severity

**1. Giả định then chốt (11-item assumption table with validation plan) — mostly dropped**

Brief §"Giả định then chốt" carries 11 numbered assumptions, each with a status
(SUPPORTED/VALIDATED/UNVALIDATED) and a concrete "kiểm bằng cách nào" validation
plan, e.g.:

> "5 | Sinh viên HCI/UX VN sẽ luyện 1–3 tuần trước buổi thật | UNVALIDATED: 0 tiếng
> nói người học VN | Ra mắt với 1–2 lớp HCI; số buổi mỗi người trước deadline"

> "11 | ChatGPT có prompt không giữ được trạng thái ẩn qua một buổi phỏng vấn |
> UNVALIDATED... | Chạy eval adversarial của chính mình trên một persona ChatGPT
> có prompt, so tỉ lệ rò với engine"

> "7 | Kịch bản BA/PM do AI soạn đủ thật | UNVALIDATED... | Link 'Người này có
> giống stakeholder thật không?' ship cùng BA/PM..."

PRD §11 "Giả định và câu hỏi mở" keeps only #6 and #8 (one line each) plus a note
on replay/#9. Assumptions #1 (no competitor combines the three mechanisms), #2
(feedback is the lever), #3 (scripted persona validated-but-less-real), #4 (pain
is big enough to drive opt-in), #5 (VN students will practice ahead of time), #7
(BA/PM realism check link), #10 (want to catch mistakes, not just feel less
scared), and #11 (ChatGPT can't hold hidden state — the core differentiation
claim) and their validation methods are gone, with no memlog entry cutting them.
**Where it should go:** PRD §11, as a restored (or explicitly reduced-scope)
assumption list, or at minimum a pointer back to brief's table with a note on
which ones the MVP's instrumentation (FR-38 event log) can actually measure.

**2. "Ai trả tiền?" (who pays) — monetization options collapsed to one line**

Brief §"Câu hỏi mở" lays out four paths with an explicit recommendation:

> "Đề xuất: thử B2C và B2B2C song song." ... B2C gói prep-sprint (tự hết hạn,
> cạnh tranh với free ChatGPT/mentor)... B2B2C (trung tâm/giảng viên mua theo lớp,
> "Hướng này phải giữ quyết định 'không làm sản phẩm cho giảng viên'")... Kịch bản
> custom trả phí... Hướng dự phòng "Panel Rehearsal" (mock interview trước hội
> đồng tuyển dụng, WTP có thể cao hơn).

PRD §11 reduces this to: "Giả định #8 (trả tiền) chỉ đo qua nút waitlist và 2–3
cuộc nói chuyện với giảng viên." The B2C/B2B2C parallel-test recommendation, the
constraint that B2B2C must not become a teacher-facing product, the custom-scenario
paid path, and the Panel Rehearsal fallback are all absent, with no logged cut.
**Where it should go:** PRD §11 "Câu hỏi mở", as its own subsection mirroring the
brief's four options and the B2C/B2B2C-parallel recommendation — this is a
monetization decision the PM/founder still needs surfaced, not just "waitlist
counts."

**3. "Điều gì kéo người học quay lại?" (retention open question) — entirely absent**

Brief §"Câu hỏi mở" #2 lists candidate retention loops (new-cohort seasonality,
pre-flight→interview→post-flight loop, revisit-a-moment after a week, habit-
targeting curriculum, per-project custom scenarios) and states no direction is
chosen yet, with "buổi thứ hai" rate as the first signal. PRD has no equivalent
section — it keeps the ≥30%-second-session metric (§9) but never states this is
an open strategic question with multiple untested retention hypotheses. **Where
it should go:** PRD §11, as an open question (not just a metric threshold), so
future roadmap work (currently Next/Later items like custom scenarios) is
understood as candidate answers to an unresolved question, not settled scope.

### Medium severity

**4. Risk "Kích hoạt" (activation) — dropped; PRD has no Risks section at all**

Brief §"Rủi ro chính":

> "Kích hoạt: khác biệt so với ChatGPT chỉ lộ đầy đủ ở cuối buổi đầu tiên. Người
> bỏ giữa buổi 1 sẽ không bao giờ thấy nó; bộ đếm niêm phong chỉ làm dịu một phần."

PRD has no "Rủi ro" section anywhere (only §11's short assumptions/open-questions
list). §9's counter-metric "buổi bỏ trước lượt 5" measures a symptom but never
states the underlying risk — that the product's entire differentiator (iceberg +
replay) is invisible until reveal, so early dropouts get a ChatGPT-roleplay
experience with no proof of value. No memlog entry addresses this. **Where it
should go:** a short Risks note in PRD (§11 or new §12), naming the activation
risk explicitly so it's tracked, not just inferred from a counter-metric.

**5. Copy rule "không dùng chữ 'feedback'" — not restated as a style rule**

Brief §"Giá trị lõi và khác biệt":

> "Copy dùng ngôn ngữ của nỗi sợ và của việc sửa kịp, không dùng chữ 'feedback'."

PRD's current learner-facing copy (Màn 1–10) happens to comply, but the rule
itself is never restated anywhere in PRD/addendum as guidance for future copy
work. (Note: PRD/addendum do use the word "feedback" once each, in the Later-list
item "feedback theo tier" / "LLM diễn đạt feedback" — internal roadmap jargon, not
learner-facing copy, so not a direct contradiction, but a sign the rule isn't
front-of-mind as a written constraint.) **Where it should go:** PRD §1 or a short
"Copy/tone rules" note, so it survives beyond the current UJ-1 screens.

**6. Comparison table / "moat thật" positioning — dropped without a decision**

Brief §"Giá trị lõi và khác biệt" has a 4-row competitive table (ChatGPT roleplay,
Synthetic Users/UXPressia, mom-test, senior/mentor) and states:

> "Moat thật: tốc độ thực thi, tiếng Việt, và thiết kế tin cậy theo cấu trúc.
> Không có moat công nghệ."

None of this appears in PRD/addendum. This is lower-stakes than #1–3 since it's
positioning rather than build scope, but it's the brief's explicit answer to "why
build this, why won't it be copied" and isn't carried or cut on purpose. **Where
it should go:** optional — PRD §1 preamble or a one-line pointer back to brief.md
if the PM wants to keep it out of the build doc deliberately.

### Low severity

**7. Launch tagline / flight-simulator metaphor replaced without being logged**

Brief: tagline *"Luyện trên kịch bản của chúng tôi. Tự tin bước vào buổi phỏng vấn
của bạn."* and metaphor *"buồng mô phỏng bay: bắt lỗi ở đây để không mắc lỗi đó
trước người thật."* PRD Màn 1 uses different copy: *"Luyện phỏng vấn người dùng.
Xem chính xác bạn đã bỏ lỡ điều gì."* No flight-simulator language anywhere in
PRD. Likely acceptable since memlog records UJ-1 as user-narrated ("(decision)
Entry: Journey-led; UJ-1 Linh narrated by user (9 screens)"), so the copy rewrite
plausibly came from the user directly — but it isn't logged as a copy decision
distinct from the journey narration. **Where it should go:** no action needed if
the user confirms the Màn-1 copy was an intentional replacement; otherwise flag
as a genuine copy gap.

**8. "Phỏng vấn người dùng" naming rationale not restated**

Brief explains *why* the Vietnamese phrase is "phỏng vấn người dùng" and not bare
"phỏng vấn" (job-interview confusion) or English "UX interview practice" (taken by
job-interview tools). PRD's title and copy comply in practice but never restate
the rationale. Low severity — behavior matches, documentation of *why* doesn't
carry over. **Where it should go:** optional footnote in PRD §1 if future
localization/rebrand work needs the reasoning.

**9. JTBD framing ("đáng tin khi có người nhìn", tied to assumption #10) dropped**

Brief §"Người dùng": JTBD is framed as "đáng tin khi có người nhìn, không chỉ học
kỹ thuật" and explicitly flagged as unvalidated, linked to assumption #10. PRD §1
states the user/journey but never restates this JTBD framing or its assumption
linkage (consistent with gap #1, the assumption table being mostly dropped).
**Where it should go:** folds into fixing gap #1; no separate action needed if #1
is addressed.

**10. A few brief out-of-scope items not repeated in PRD's shorter list**

Brief's "Ngoài phạm vi" includes "ghost run, lộ trình đối kháng, lịch pre-flight /
post-flight tự động" — PRD §3's out-of-scope list is shorter and omits these.
Not a contradiction (nothing in PRD tries to build them), just less explicit.
Lowest severity, likely fine to leave as-is.

## Intentionally changed

These are logged in .memlog.md and/or reasoned inline in addendum.md — not gaps:

- **Bilingual plumbing cut** from must-ship; `language` field kept on scenario schema for future EN pack (memlog: "Cuts: bilingual plumbing (keep language field on scenario)...").
- **Experience question + display tiers cut**; everyone sees the same sealed counter (memlog + PRD §2 table).
- **"Báo tôi khi BA/PM sẵn sàng" notify button cut**; assumption #6 (BA/PM demand) now has no in-product signal at launch, only interviews (memlog + PRD §3 cut table).
- **Guide personalization by real topic → Later**; launch copy may only promise a guide from the learner's *mistakes*, not their *topic* (memlog + PRD §2/§3, weakens the brief's tagline promise on purpose).
- **4 LLM calls/turn → 2 calls/turn**, with unlock decisions moved fully into code and do-not-assert check folded into Call 1 as a one-turn-lagged check instead of a separate call (memlog + PRD §2, §5.2; addendum §1, §5 documents the rejected alternative and why).
- **Admin dashboard → Later**; scenario authoring via CLI only for MVP (memlog + PRD §3; brief's own tripwire "chỉ làm dashboard nếu must-ship xong trước ngày 6" anticipated this).
- **Free-text "khoảnh khắc bạn thấy mình bỏ lỡ" box dropped** (memlog + PRD Màn 5 note + addendum §5, explicit rationale: nothing downstream uses it, would need an extra LLM call to match).
- **One scored session per scenario per user** (memlog + PRD FR-5).
- **"Bạn đã dùng 1 trong 2 buổi miễn phí" copy dropped** — MVP has no payment model, so the line would over-promise (memlog + PRD Màn 9).
- **Live unlocked-item counter → sealed total only**, unlocked count revealed only at reveal screen (memlog + PRD FR-7/FR-8 + addendum §5, rationale: no tier to gate on, live count invites gaming).
- **Replay target item stays sealed until replay ends** (memlog + PRD §6.6/FR-19, rationale: pre-reading the item turns replay into a copy exercise, not a test).
- **Zero-LLM reveal notes and guide**, built from ledger templates instead of an LLM call at runtime (memlog + PRD §5.3, FR-20/FR-28, addendum §5 rejected-alternative note).
- **"Buổi của tôi" learner dashboard added to must-ship** (not in brief at all), pushing the schedule estimate to ~14.75 days; **second UX scenario de-scoped from launch-blocking** (~13.75 days) as the trade-off (memlog: "(change) Added 'Buoi cua toi'..." + addendum §6 full reasoning and cost/benefit).
- **Cost/call-count re-estimate**: brief's ~135–150 calls/session (~5–8k/~35–47k VND) replaced by ~≤67 calls (~3k/~20k VND) — addendum §4 header explicitly says "thay thế addendum brief §3b".
- **Admin dashboard question deferred to party mode**, stays in Later (memlog).

## Covered

Content from brief.md that carries into prd.md/addendum.md with no material gap:

- Core loop: iceberg of 8–12 hidden items, sealed from turn 1, guess-before-reveal, turn-cited reveal, replay-from-the-missed-moment, take-home guide (brief summary → PRD §1, §4 UJ-1, §6).
- Ethics boundaries: never generate judgments about real users, personas never built from the learner's own research questions, quotes only from transcript, private-by-default data (brief "Ranh giới đạo đức" → PRD §1, §3 out-of-scope, NFR-9, NFR-13).
- Launch shape: production, 1 dev, ~2-week MVP, responsive web, deploy + end-to-end demo (brief → PRD §1, §10).
- Launch scope: UX-role only, Vietnamese-only, 2 scenarios target/1 minimum (brief → PRD §1, §3; schedule trade-off documented above under "Intentionally changed").
- Beachhead user: final-year HCI/UX students in VN prepping for real interviews (brief → PRD §1, UJ-1 Linh).
- Architecture serves 3 roles (UX/BA/PM) but only UX ships now; BA/PM ship after passing full eval (brief → PRD §1, §3 Next).
- "Thử với lớp học" — teacher just shares a normal signup link, no class accounts/teacher screens (brief → PRD §3 out-of-scope "sản phẩm cho giảng viên").
- Out-of-scope core items: group/workshop interviews, personas generated from learner's research questions, any "insight about real users" output, teacher product, payment, voice (brief → PRD §3).
- Success metrics: scenario ship gate (0 leaks/20 adversarial runs, good-run ≥2x bad-run and ≥3 items), classifier ≥85%/≤5%, leak-rate tracking, ≥60% reveal, ≥40% replay, ≥30% second session, waitlist clicks + ≥1 teacher/center referral, daily cost cap + end-to-end demo (brief "Tiêu chí thành công" → PRD §9, §10, NFR-1–3, NFR-6, NFR-7).
- Classifier judgment risk, including the exact edge-case example "luôn thấy bực, đúng không?" (brief "Rủi ro chính" → PRD NFR-7).
- Replay as evidence, not a proven pedagogy claim; interaction metrics explicitly marked as not proving learning (brief "Không tuyên bố replay... là đã được chứng minh" → PRD §9 counter-metric note, §11).
- ~0.6 leaks/episode benchmark used as a reference point, not a claim (brief assumption #11/evidence → PRD NFR-6).
- Cost-per-session estimate methodology and price-point ceiling (100–200k VND prep-sprint) reused with updated numbers (brief §"Chi phí mỗi buổi" → addendum §4).
- Schedule risk and must-ship estimate, refined bottom-up (brief "Lịch" risk, ~12.5/14 days → addendum §6, ~14.75 days with 2nd-scenario trade-off).
- UJ-1 journey (student practicing before a real interview) and UJ-2 equivalent (scenario authoring via CLI + eval gate) (brief hooks/persona/guide concepts → PRD §4).

Status: DONE
