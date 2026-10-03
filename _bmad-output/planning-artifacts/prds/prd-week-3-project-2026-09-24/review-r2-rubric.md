# PRD Quality Review — InterviewLab (reviewer round 2, post-reconcile)

Reviewed: `prd.md` (updated 2026-10-01, 650 lines) and `addendum.md`, against `.claude/skills/bmad-prd/assets/prd-validation-checklist.md`. PM decisions in `.memlog.md` are treated as final; where a finding touches one, it states the cost and does not recommend reversing it.

## Overall verdict
This PRD can be built from. Its thesis is clear: evidence of where you went wrong, plus replay. Reopened locks and accepted risks are stated openly (§2, §13). The mechanism is specified tightly enough to test (§8–§9, §12.2 items 3–5), and almost every screen has an empty, loading and error state. The risk sits in the newer parts that were added quickly. The custom-topic path (S5) has a launch gate that passes even if no topic is ever generated successfully. Its auto-fail-on-any-leak-flag rule clashes with the addendum's own evidence that leak judges over-flag. Three LLM judgements that protect users have no accuracy bound (moderation, "claims about real users", focus classification). Data retention and deletion are never mentioned, even though admins can read everything.

## Decision-readiness — strong

The PRD states its decisions as decisions and says what each one cost. §2 lists every lock reopened this round, including the privacy lock ("Khóa riêng tư … → quản trị viên xem được mọi thứ") and the anchoring lock ("bị thử thách ở đường tạo chủ đề riêng"). It also separates schedule-driven cuts from product-driven cuts ("Vẫn cắt, vì lý do sản phẩm"), which a reader pushing back will look for. Addendum §6 and §7 record what was given up, for example "Chênh ~1,75 ngày, ghi lại như cái giá của thứ tự đã chốt". §13 states the cost of PM overrides plainly ("câu dẫn dắt … là thứ người ta ngại để người khác thấy nhất"). The three Open Questions are real, and each has an owner or a reason for deferral.

The one place where framing hides a number is the schedule. §1 says "khoảng 2 tháng build", but §3 and addendum §6 add up to ~58,5 dev-days with no buffer, against ~42–44 working days. That is roughly 3 months. The PM has accepted this (memlog, addendum §6), and that is final. The opening "Bối cảnh" line still tells a reader 2 months, though, and the real number only appears in §13. The PRD has no `[NOTE FOR PM]` callouts at all. That is acceptable here because the memlog records the PM's rulings.

### Findings
- **low** Opening context understates the build length (§1 "Bối cảnh") — "khoảng 2 tháng build" conflicts with the ~58,5-day bottom-up estimate in §3 and §13. Readers who stop at §1 will plan for the wrong date. *Fix:* in §1, state "~58,5 ngày dev chưa buffer (≈3 tháng); không có ngày ra mắt cứng" and point to §13.
- **low** Cost of the slice order is not stated where it applies (§3 slice table) — S4 (BA/PM) comes last, yet assumption #7 is "một trong các giả định rủi ro nhất". The realism signal (practising-BA readers, round-2 student test) therefore arrives at the very end of the build. This is a PM decision and stands. *Fix:* add one line under the §3 table naming this cost, as addendum §6 already does for S2-before-S3.

## Substance over theater — strong

Every element earns its place. Each of the three protagonists drives specific requirements. Linh drives the reveal/replay/canvas sequence. Minh drives the custom-path states and quota copy. Thanh drives the Console gates. The NFRs are specific to this product: p95 ≤6 s per turn measured on a deployed full eval, ≤5 % good questions mislabelled `leading`, call counts per turn and per reveal, and the NFR-14 copy bans tied to the admin-visibility decision. The vision paragraph could not be swapped into another PRD ("phòng tập phỏng vấn … kèm bằng chứng bạn sai ở đâu"). The differentiation claims are hedged against their sources (Màn 12: "chúng tôi chưa tìm thấy", unfavourable finding [8] stated).

The only furniture-like content is §2. It is a change log of reviewer feedback inside the capability document, and addendum §8 already holds that history. It helps reviewers this round, but it will go stale.

### Findings
- **low** Change log sits in the PRD body (§2) — the "Thay đổi sau phản hồi reviewer" table and the reopened-locks list duplicate addendum §7 and §8. Downstream extractors will see them as requirements. *Fix:* after reviewer sign-off, move §2 to addendum §8. Keep only the "Vẫn cắt, vì lý do sản phẩm" list in the PRD, or merge it into §3 "Ngoài phạm vi".

## Strategic coherence — adequate

The thesis is explicit, and the core arc follows from it: sealed iceberg → guess → two-number reveal → replay of the missed moment → takeaway habits. Counter-metrics exist (SM-C1..C8). §12.1 maps each goal to its gate, its post-launch signal and its known limits, and the PRD says honestly that #9 can only be shown as correlation ("Tương quan, không nhân quả").

Coherence weakens at the custom-topic path (S5). On the PRD's own evidence, this path:
- relaxes the anchoring lock (§13, "rủi ro còn lại được chấp nhận");
- costs ~8–16 USD per playable scenario, which is "cao hơn cả mốc giá gói prep-sprint" (§13);
- has no reviewer ("Kiểm tra nhẹ nghĩa là chưa ai đọc").

The PM chose to ship it at launch, and that decision stands. Its success signals, though, are only "Theo dõi" (SM-10, SM-C8). Nothing defines what result would count as the path failing. So a launch-scope feature with a known negative unit cost and an accepted ethical risk has no thesis-level check. The adoption metrics SM-1..SM-3 also carry thresholds with no stated consequence if missed.

### Findings
- **high** Custom path has no success or kill threshold (§12.1 row "Đường tạo chủ đề riêng dùng được", §12.3 SM-10, SM-C8) — the most expensive and most ethically exposed launch feature is measured with "Theo dõi" only. A decision-maker cannot tell from the PRD when to pull or re-gate it. *Fix:* give SM-10 a pass-rate floor and give SM-C8 a cost ceiling per playable scenario, each with an action ("review S5 pipeline / tighten FR-56 quota if …"). Tag them `[ASSUMPTION]` if the numbers are provisional.
- **medium** Thresholds without consequences (§12.3 SM-1 ≥60 %, SM-2 ≥40 %, SM-3 ≥30 %) — the numbers are set, but nothing says what happens if one is missed. Only SM-9 and SM-11 name an action. *Fix:* add a one-line "if below → …" for each threshold, as SM-9 already does.

## Done-ness clarity — adequate

This is the PRD's strongest structural feature. §12.2 turns most FRs into automated, checkable gates. Item 3 covers context isolation, item 4 the unlock gate with adversarial Call 1, item 5 replay sealing (down to "dữ liệu gửi về trình duyệt không chứa …"), and item 13 the canvas against 10 fixed canvases. Fixed strings are given verbatim (FR-48a, FR-63, Màn 6 diagnostic lines). Very few adjectives remain.

The gaps cluster in S5 and in the safety judgements that were added this round:

- **Gate 14 cannot fail on quality.** "10 chủ đề mẫu cho kết quả qua hoặc trượt với mã lý do" passes even if all 10 fail. The addendum shows this risk is real, not theoretical. Addendum §7 records that "Judge LLM gắn cờ nhầm làm cổng 0 rò phần lớn fail vì judge", which is why curated personas only count adjudicated leaks. FR-54 brings back exactly that rule for custom scenarios ("mọi cờ là trượt"), using 1 good run and 1 bad run. Meanwhile, the cost model (addendum §5) assumes "~1,5 lần thử mỗi kịch bản qua", and FR-56 limits learners to 3 attempts per day. If the false-flag rate is high, learners use up their attempts on a path that never produces a scenario, and the cost model is wrong.
- **Three safety-critical LLM judgements have no accuracy bound.** NFR-7 covers the label classifier, the verdict judge, the canvas judge and `leading` novelty. It does not cover:
  - FR-55 moderation, which gate 14 only tests on one category ("tên người thật");
  - FR-36 / verifier detection of "khẳng định về người dùng thật", the core ethical boundary (§1, NFR-13);
  - the FR-53 focus classifier.
- The NHẬN BIẾT value is ambiguous across surfaces (see the finding below).

### Findings
- **high** Custom-path gate has no pass-rate bound (§12.2 item 14, FR-54) — as written, a pipeline that rejects every topic passes the gate. "0 cờ rò rỉ, mọi cờ là trượt" with no adjudication contradicts the addendum §7 evidence that judges over-flag, and it undermines the cost assumption of ~1,5 attempts per pass (addendum §5). *Fix:* add to gate 14 a minimum pass rate on the 10 sample topics (e.g. ≥N/10 `[ASSUMPTION]`), and record the leak-judge false-flag rate on those runs. If the rate is high, the fix belongs in the judge or the eval profile, not in learner quota.
- **high** Safety classifiers without bounds (FR-55, FR-36, FR-53, NFR-7) — moderation and real-user-claim detection enforce the product's ethical boundary, but have no test set or threshold. Gate 14 checks moderation on a single real-name example. *Fix:* add NFR-7 bullets: moderation test set across all 6 `reason_code`s, with a false-allow ceiling on `minor`/`sexual`/`self_harm`; a "claims about real users" test set for FR-36 and the verifier; a minimal accuracy check for focus mapping (or explicitly accept `general` fallback as harmless and say so).
- **medium** NHẬN BIẾT has two values, and the PRD does not say which one is stored, logged or listed (Màn 6 "con số NHẬN BIẾT cập nhật … chỉ là thay đổi hiển thị", UJ-1 step 7 "NHẬN BIẾT tăng lên 5", Màn 9 "Nhận biết 4", FR-38 reveal event, §12.2 item 10 "đúng số của buổi chính") — the sealed count (4) and the true count (5) both exist. UJ-1 makes it look as though replay *earned* the point, which reads as contradicting §9.7 "không đổi … NHẬN BIẾT". SM-8 is computed from the FR-38 reveal event, so it may be understated systematically. *Fix:* define one stored value (the unsealed, true count). State that the sealed display is presentation only, that FR-38, SM-8 and Màn 9 use the true value, and reword UJ-1 step 7 ("con số NHẬN BIẾT hiện đầy đủ: 5").
- **medium** Generation latency is not in a gate (NFR-2 "p95 ≤ 10 phút", §12.2 item 8) — gate 8 checks only turn and reveal latency. The custom-path p95 is never verified before launch. *Fix:* add it to gate 8 or gate 14, measured on the 10 sample topics.
- **medium** No default values for cost caps (NFR-3, FR-37, FR-56) — caps are "cấu hình được không cần deploy", but there is no starting value or monthly budget. Gate 11 tests only the cap mechanics. Ops cannot launch without these numbers. *Fix:* state initial daily session cap, generation budget and demo reserve in the §12.4 checklist (`[ASSUMPTION]` acceptable), derived from addendum §5.
- **low** Learner-facing contradiction after a successful replay (UJ-1 step 7, FR-48a) — the persona has just told the item in replay, yet the note shows "chị Thu chưa xác nhận". This is technically right for the main branch, but a learner will read it as a bug. *Fix:* add a FR-48a string variant for "đã lộ, xác nhận ở luyện lại", or a rule that the replay result card explains it.
- **low** "Thường mất vài phút" (Màn 11) and FR-65 "AI critic chấm riêng độ hợp bối cảnh VN" — these are the only unbounded phrases left. The second has no output format or threshold. *Fix:* tie the Màn 11 copy to NFR-2. Define the critic's output as a report section with no gate effect, and say so.

## Scope honesty — adequate

Omissions are mostly explicit. §3 has "Later" and "Ngoài phạm vi" lists, plus "Không bao giờ bỏ khỏi một lát". §2 relabels the remaining cuts by their real reason. §13 lists 13 brief assumptions with how each will be measured, plus a roundtripped index of inline `[ASSUMPTION]` tags. Open-items density is ~13 inline assumptions and 3 open questions, which is acceptable for launch stakes because the PM has accepted the inline ones as starting values (2026-10-02).

There is one silent omission that matters for a production launch handling personal data. The PRD widened visibility to "quản trị viên xem được mọi buổi" and stores transcripts, canvas and free-text project ideas. Yet it never covers:
- how long that data is kept;
- whether a learner can delete their sessions or account;
- what lawful basis or consent the FR-63 notice represents.

Vietnam's personal-data rules (Decree 13/2023/ND-CP, and the newer Personal Data Protection Law) are the obvious check here. The PRD neither covers this nor marks it as a non-goal. Accessibility is also absent; it is lower stakes, but launch-relevant.

### Findings
- **high** Data retention and deletion are not addressed (NFR-9, FR-63, addendum §4 data model) — there is no retention period, no learner delete or export path, and no statement on legal basis. This matters more now that admins see everything and custom topics "có thể lộ ý tưởng dự án" (§13). *Fix:* add an NFR (retention period; learner can delete sessions and account; what deletion does to eval or aggregate data), or an explicit `[NON-GOAL for MVP]` plus a §12.4 checklist item to confirm applicability of VN personal-data law before launch.
- **medium** Accessibility is not mentioned (§11) — this is a consumer launch with a chat, a slider (Màn 5) and colour-coded canvas highlights (Màn 6 item 5 uses three colours as the only distinction). *Fix:* add a minimal NFR (keyboard-operable slider and chat; highlight kinds distinguishable without colour, e.g. the FR-48a string already present), or state it as a non-goal.
- **low** The header defines `[ASSUMPTION]` as "đề xuất chưa được duyệt" (PRD header line 12), but §13 says the PM accepted them as starting values on 2026-10-02 — the tag means two different things. *Fix:* reword the header: "giá trị khởi đầu PM đã chấp nhận hoặc suy luận chưa kiểm; xem lại sau eval đầy đủ đầu tiên".

## Downstream usability — adequate

The PRD feeds UX, architecture and stories, and it is mostly ready for that.
- FR IDs 1–65 are all present, plus FR-48a. They are non-contiguous by section, but the PRD says why ("ID được giữ ổn định").
- §7 maps each state to the screen it routes to, which story writers can lift directly.
- §8.1 and addendum "Thuật ngữ" work as a glossary.
- Cross-references resolve (spot-checked §8.0 → §12.2 item 5, FR-19 → Màn 6, addendum §2 → PRD §8.1 and §9.2).

The weaknesses are term drift around the persona/scenario/custom entities and a screen numbering gap. A third weakness: the PRD contains UX-spec-level detail (copy strings, the 60/40 mobile split) alongside an existing Stitch prototype (commit f1184c6), so two sources may drift.

### Findings
- **medium** Entity naming drift: persona / kịch bản / scenario / chủ đề riêng (§4 "Persona (kịch bản)", FR-56 "1 kịch bản riêng chơi được", Màn 10 "Còn 1 kịch bản miễn phí", addendum `scenario`, UJ-2 "tạo chủ đề riêng") — quotas count scenarios, the UI says topics, and the data model says scenario rows under a custom topic. Story writers will split "free custom scenario" and "custom topic" inconsistently. *Fix:* add a §8.1 entry: "persona = kịch bản = `scenario` row; chủ đề riêng = `topic(kind=custom)`; quota counts playable personas", and use one learner-facing word.
- **low** Screen numbering gap (§6: Màn 1, 2, 2b, 3–7, 9–12; Màn 6 item 7 "trước đây Màn 8") — it is harmless, but extractors will look for Màn 8. *Fix:* renumber or add "Màn 8: gộp vào Màn 6 mục 7".
- **low** Addendum §1 "Kết thúc buổi" pipeline omits the replay-moment selection that PRD §8.3 says runs before all three reveal calls. Architecture reading the addendum alone will order it wrongly. *Fix:* add "chọn khoảnh khắc replay (code)" as step 0.

## Shape fit — adequate

The PRD is a consumer product with an admin back office and sits at the top of the chain, so UJs with named protagonists are load-bearing, and they are present. The Console is specified as screens (C1–C10) rather than over-formalised with journeys, which suits a single-operator tool (UJ-3 is enough). Shape has drifted in two places:
- **Over-formalised in UX detail.** Exact copy for nearly every state, plus layout ratios, is UX-spec work. It is useful, but it duplicates the design artifact and costs effort every time copy changes.
- **Under-formalised for one learner type.** There is no UJ for a BA/PM learner, although S4 is ~9,75 days and adds FR-64 and BA/PM-specific eval criteria. UJ-2's Minh is a PM, but on the custom path only.

### Findings
- **low** No BA/PM learner journey (§5) — S4's learner-facing behaviour (role filter → BA topic → reveal → FR-64 realism link) appears in no journey. *Fix:* add a 4–5-step UJ-4, or extend UJ-1's step 8 with a BA example.
- **low** UJ-3 protagonist lacks context (§5 UJ-3 "Thanh") — there is no line saying who Thanh is (sole dev/admin) or who the second adjudicator is. *Fix:* add one context sentence, as UJ-1 and UJ-2 have.

## Mechanical notes
- **ID continuity:** FR-1..65 plus FR-48a complete; NFR-1..14 complete; SM-1..12 (with 4a/4b) and SM-C1..C8 complete; §12.2 items 1–16 contiguous. No duplicates found.
- **Assumptions roundtrip:** every inline `[ASSUMPTION]` in PRD (Màn 10, C6, §7, FR-65, NFR-2 ×2, NFR-3, NFR-7, NFR-8, §12.2 item 2 ×2, SM-9, SM-11) and addendum §3.1 (openness, 1 item/turn) appears in the §13 inline index. The index has no orphan entries.
- **Stale cross-refs in addendum §7:** pre-2026-10-01 rows cite old numbering (e.g. "rủi ro có tên (PRD §10)", "PRD §7, trách nhiệm có tên", "cắt #2/#3"). The section header discloses this, which is acceptable. Readers still have to translate.
- **Glossary drift:** "guide" vs "Mang về" (FR group heading "Guide 'Mang về'"); "Ba vai trò" (§1) vs four filter options including "Khác" (§4). Minor.
- **Required sections:** all present for a launch-stakes consumer PRD (vision, users, journeys, FR, NFR, success metrics with counter-metrics, scope and non-goals, risks, assumptions, open questions). The only gap is data lifecycle (see Scope honesty).
