# PRD Quality Review — InterviewLab

Reviewed: `prd.md` (498 lines) and `addendum.md` (236 lines), 2026-09-25. Line numbers refer to `prd.md` unless marked "add."

## Overall verdict

This PRD is well above the usual bar. The unlock gate, context isolation, replay mechanics, cut order and "if cut #3" rewrites are specified tightly enough to build and test, and the trade-offs are stated honestly, including the "agent" defence in §5.0, which openly admits the tools are deliberately not model-callable. The main risks are internal inconsistencies left by the latest revision pass: the §11 schedule risk still describes the older ~16.6-day plan; the Call 2 prompt can tell the persona to both withhold and disclose the same topic in the unlock turn; and the "topic-map leak" definition classifies the product's own hook drops as leaks. The verifier also has no input/output contract, even though three launch gates depend on it. None of these is a structural flaw, but each will confuse the architect or the eval gate if it ships as written.

## Decision-readiness — adequate

Decisions are stated as decisions, with dates and owners: "16 ngày là mốc cố định" (add. §6 l.140), the pre-committed cut order (l.55–60), and the "never cut" list (l.60). Trade-offs name what was given up. For example, the Google-only login row (l.76) says "Người không có tài khoản Google không vào được", and cut #1 (l.56) spells out that a one-scenario library means "mỗi người học chỉ có **một buổi luyện**". Add. §7 shows rejected alternatives with reasons, including the PM's own rejected proposal (add. l.202). This is the dimension's strongest evidence.

Two things hold it back from strong. First, the §11 schedule risk (l.492) contradicts the schedule decision in §3 (l.53) and add. §6 (l.142, l.164): a decision-maker who reads the risks section gets a different, more alarming plan. Second, the most consequential open decision is not in Open Questions. The course brief requires a genuine agent, and §5.0 (l.175) makes the "LLM calls tools" fallback depend on rubric wording that is "Chưa làm cho tới khi có câu chữ của rubric". That is a real open question with an external dependency and a deadline, yet §11 "Câu hỏi mở" (l.494–497) lists only two deliberately deferred business questions. The PRD has no `[NOTE FOR PM]` callouts at all.

### Findings
- **[high]** Stale schedule risk contradicts the committed plan (§11 Rủi ro "Lịch", l.492). The line says "Phần cam kết là ~16,6 ngày, vượt mốc ~0,6 ngày … **cả hai cắt đều có khả năng xảy ra**, và buffer còn lại chỉ ~0,15 ngày". §3 (l.53) and add. §6 (l.142, table total l.164 = 16,0, which I re-summed and confirmed) say the commitment is ~16.0 days, with cut #3 happening only if the project slips by more than ~0.25 days (add. l.176). Under the stale text, the verifier (a self-check leg of the agent defence) is "likely" cut. Under the current plan, it is not. *Fix:* rewrite l.492 to 16.0 days, zero buffer, and to say that cut #2 absorbs the first ~0.25 days of slip and cut #3 the next ~0.5.
- **[medium]** Rubric-wording dependency is not tracked as an open question (§5.0 l.175; add. l.192, l.213). Whether a "controller around two LLM calls" counts as an agent under the course brief is the single biggest acceptance risk for a course project, and the PRD parks it as a "dự phòng có tên". *Fix:* add it to §11 Câu hỏi mở with an owner and a latest decision date (e.g. before day 9, when the verifier is still cheap to reshape), and state what happens if the rubric wording is ambiguous rather than explicit.
- **[low]** No `[NOTE FOR PM]` callouts. The real tensions are resolved in prose (e.g. NFR-7's day-13 fallback, l.386), so this is mostly a template gap. The rubric-wording item above is the one place a callout would do work.

## Substance over theater — strong

There are two personas, Linh (learner, UJ-1) and Thanh (operator, UJ-2), and both drive decisions: Linh's 360px reveal and her re-reading before real interviews shaped the reveal order (l.113) and cut #2's cost (l.57), and Thanh's sole authorship justifies moving FR-35/36 to Next (add. l.226). The vision (l.16–18) is product-specific and could not be swapped into another PRD. The novelty claim is hedged ("Được ủng hộ, tìm kiếm có giới hạn", assumption #1, l.470), and it is backed by a comparative test plan: a prompt-only baseline run against the same 20 attacks (FR-34, l.345). NFRs carry thresholds: p95 ≤ 6 s, ≤5% good questions mislabelled `leading`, ≥95% anchor-phrase compliance, and 360px width. Copy rules (NFR-14, l.393–397) are specific and traceable to the reveal's design intent.

§5.0 "Vì sao đây là agent" could have been theater. Instead it maps each of the five brainstorm attributes to a mechanism and a verifiable proof (l.163–169), and it says plainly what the design is not (l.171). No findings of consequence. NFR-11/12 are thin but appropriately short for a solo build.

## Strategic coherence — adequate

The thesis is clear and threaded through the whole document: learners find out they asked badly only after the real interview; a fixed hidden iceberg plus turn-cited evidence plus replay at the missed moment makes the misses visible and practicable (l.16–18). Scope follows the thesis, not ease. The "never cut" list is the thesis core (gate tests, primary replay path, reveal, scenario-1 eval, deploy), and the reveal order puts replay directly under the score because "replay là điều khác biệt duy nhất" (l.113). The MVP scope kind (experience/problem-solving) is coherent.

The success metrics are the weak link. SM-1 and SM-2 (l.405–406) measure activity, and the PRD admits this for SM-2 ("không chứng minh việc học"). The only learning metric, SM-4 (l.408), needs ≥2 scenarios, and the PRD itself says a second scenario "nhiều khả năng sang Next" (add. l.174). SM-3 has the same dependency. As likely shipped, therefore, no metric tests the thesis. That is honest, but the PRD already collects the data for thesis metrics that work with one scenario and does not use it. Counter-metrics are present and well chosen (SM-C1–C7), though none has a threshold.

### Findings
- **[medium]** No thesis-validating metric survives the likely one-scenario launch (§9 l.403–409; add. §6 l.174). *Fix:* add metrics that need only one scenario and data already captured: (a) replay success rate for primary-candidate replays (the target item is disclosed within ≤3 turns), which is a within-session learning proxy directly tied to the thesis; (b) the guess-vs-actual gap distribution (FR-18), which tests whether the reveal actually "lay niềm tin" as the copy claims (l.75). Neither needs new instrumentation beyond FR-38.
- **[low]** "≥30 người học" (l.401) has no time window, and there is no stated plan to reach 30 in a course context (assumption #5 says "Ra mắt với 1–2 lớp"). *Fix:* state the measurement window (e.g. the first 4 weeks after launch) and whether 1–2 classes are expected to reach 30.

## Done-ness clarity — adequate

This dimension is mostly strong. §10 is a real acceptance section with concrete, automatable tests. §10 item 4 (l.428–438) tests each unlock path, including the negative cases (a hook not dropped, a wrong `grounded_turn_id`, adversarial Call 1 JSON, and diacritic variants like "hủy"/"huỷ"). §10 item 5 tests replay determinism and isolation. Unlock rules, the openness deltas and hook eligibility are exact tables (add. §3.1–3.2). The replay spec (§6) covers fork point, context restoration, all outcomes, and unsealing.

The gaps sit at the component edges that downstream story-writing will hit first:

### Findings
- **[high]** Contradictory instructions to the persona in the unlock turn (§5.2 step 3, l.219 vs l.221; FR-15 l.301). Call 2 receives "ràng buộc do-not-assert **chỉ của topic tag khớp ở lượt này**", which says "trả lời mơ hồ, không phủ nhận, không tự kể" (l.185). On a surface/past/trust unlock, the matched tag *is* the just-unlocked item's tag, and Call 2 is simultaneously told "Item vừa mở ở lượt này phải được nói ra ngay". The lagged check (FR-16) would then flag the correct disclosure as a violation and strip it from reveal evidence. *Fix:* state that the do-not-assert constraint is sent only for tags whose items are still locked *after* this turn's unlock decision, and add a §10 item 3 test asserting that no do-not-assert constraint for a just-unlocked item appears in Call 2's context.
- **[high]** The topic-map leak definition makes designed behavior a leak (FR-34 (b), l.344). A leak is defined as "persona nhắc tới topic của một item còn khóa mà người học chưa từng chạm tới". But hooks exist precisely to have the persona mention a still-locked item's topic, and the closing question (§5.1 l.202; add. §3.2 l.99) drops a hook when `topic_tags` is empty, i.e. on a topic the learner has not touched. The gate is "0 rò rỉ đã xác nhận" (§10 item 2), so every closing-question hook in the adversarial runs will be flagged and rely on Thanh overriding the written definition. *Fix:* exclude authored hook lines (detected by hook anchor match) from leak type (b), and specify this exclusion to the eval judge.
- **[medium]** The verifier has no contract (§5.3 l.232–237; FR-22 l.310; NFR-8 l.387). Add. §2 specifies both per-turn calls in detail, but the verifier (1 call, ~8k tokens in, add. l.123) has no stated inputs, outputs or per-claim verdict schema. Its scope also drifts. §5.3 says it checks whether each `grounded_turn_id` "có thực sự chứa nội dung", NFR-8 says it re-checks "nhãn đã dẫn tới lần mở", and surface/trust unlocks may have no `grounded_turn_id` at all (label `open`). FR-20 praise, FR-21 claim-dropping, NFR-8 (≤10%) and §10 item 2 all depend on its output. *Fix:* add a verifier contract to add. §2 (input: frozen transcript plus the list of claims with the turn IDs they cite; output: agree/disagree per claim plus final-turn do-not-assert violations) and define what "disagree" means for an unlock with no grounded turn.
- **[medium]** Reveal-feedback and guide selection rules are unspecified (FR-20 l.308, FR-28 l.323). "Tối đa 3 nhận xét, tính từ ledger" does not say which observation types exist, how they are ranked when there are more than 3, or what the thresholds are. The habit card threshold ("khi ledger vượt ngưỡng") is given only as a UJ example ("≥2 hook bị bỏ qua", l.120). Nothing covers a session with no leading questions and no ignored hooks: is the "Mang về" section empty, praise-only, or hidden? *Fix:* add a small table in the addendum listing observation types, trigger thresholds, priority order and the empty state.
- **[medium]** FR-5 does not say whether an abandoned session consumes the one graded session (l.287; FR-10 l.294). The session list shows "Đang làm dở · Tiếp tục" (l.136), but it is unclear whether a learner who quit at turn 3 with a poor start can ever restart. With one scenario, this decides whether a learner gets any real attempt. *Fix:* state explicitly that an in-progress session can only be resumed, never restarted (or the opposite), and whether a session idle for N days auto-ends and reveals.
- **[low]** NFR-2 is both a launch gate and provisional (l.376 "Đây là mức khởi điểm, sẽ chỉnh sau khi đo" vs §10 item 8, l.447). *Fix:* say who may relax it and by when, similar to NFR-7's day-13 rule.
- **[low]** The `revealed → done` transition when no replay exists (fallback 2, §6.2 l.251) is not stated. §6.6 lists only the replay endings. FR-41 covers "không có replay", but the state machine does not. *Fix:* add a single sentence to §6.6.
- **[low]** The FR-38 event "mở guide" (l.354) no longer maps to an action, since the guide is now a section of the reveal (l.321). Assumption #10 (l.479) is measured by "lượt mở guide". *Fix:* redefine the event as a "Tải về"/print click or as the section being scrolled into view.

## Scope honesty — strong

This is the PRD's best dimension. MVP scope is enumerated (l.38–49). Each cut carries a named consequence in "Cắt và hệ quả" (l.69–83), and several of those consequences constrain copy, e.g. the guide may not promise topic personalization (l.75). The cut order is pre-committed with savings and costs (add. l.178–184). §3 pre-writes the requirement changes if cut #3 fires (l.62–67). Next / Later / Ngoài phạm vi are separate lists (l.85–87). Replacing FR-35/36 with a named manual responsibility is disclosed, not silent (l.333).

The open-items density is low, which suits a fixed-date build. One gap: the few inline `[ASSUMPTION]` tags (NFR-3 l.377, NFR-7 l.386, NFR-8 l.387; add. l.74, l.91) are not indexed. The §11 assumptions table is the brief's numbered hypotheses, not an index of the inline tags. See Mechanical notes.

## Downstream usability — adequate

§5.1 works as a glossary, and add. "Thuật ngữ" supplements it. IDs are contiguous and unique: FR-1–45, NFR-1–14, SM-1–5, SM-C1–C7, UJ-1–2, Màn 1–10 (Màn 8 kept as a stub for reference stability, l.131). FR groups that sit out of order explain why (l.358, l.368). Both UJs have named protagonists with context inline. Most FRs reference § sections instead of "see above". The PRD/addendum split (capability vs contracts) is clean and suits an architect.

Friction for extraction:

### Findings
- **[medium]** Label enums differ between the documents (§5.1 l.193–196 and §10 vs add. l.13, l.41–42). The PRD uses `confirm-grounded`, `boundary-probe` and `leading/assumption`. The addendum JSON uses `confirm_grounded`, `boundary_probe` and `leading`. The PRD itself mixes `leading/assumption` (l.196, FR-36 l.350) with bare `leading` (l.198, l.250, §10). These strings are going to become code enums and eval labels. *Fix:* declare the addendum JSON values canonical in §5.1 and use them everywhere, with the Vietnamese gloss beside each.
- **[low]** The PRD carries process history in its body. §2 (l.26–34) is a dense five-row changelog, and §3 has "Vì sao phạm vi…" and "Lịch sau advanced elicitation" paragraphs (l.51–53). A story-writer extracting §3 gets history mixed with scope. *Fix:* move §2 and the history paragraphs to the addendum, and leave a one-line pointer.

## Shape fit — adequate

A consumer-facing learning product with meaningful UX and a chain-top role (it feeds architecture and stories) justifies a load-bearing UJ-1 (Linh), and the PRD delivers one: screen-by-screen, with deviation cases (l.143–147). UJ-2 correctly treats the operator flow as a short CLI sequence instead of a full journey. For a solo, 16-day course project, the formality is high but mostly earned, because the mechanism is the product and the gate tests are "never cut".

The shape strain is accretion from four review rounds, not over-formalization. There are stubbed screens (Màn 8), out-of-order FR groups, a revision table in the body, and a few stale leftovers (see Mechanical notes). A consolidation pass would make the next reader's job easier without changing any decision.

## Mechanical notes

- **Schedule drift:** l.492 (~16.6 days, buffer ~0.15) vs l.53 / add. l.142, l.164 (~16.0). Covered above as a high finding.
- **Stale addendum row:** add. §7 l.221 ("LLM diễn đạt feedback…") says "verifier chạy một lần lúc soạn kịch bản". The authoring-time verifier (FR-36) is now Next (l.350). Update the reason.
- **Cross-ref to Next FRs in a launch gate:** §10 item 2 (l.426) is headed "(FR-33–36)", but FR-35/36 are Next. Change it to "(FR-33, FR-34, and the named manual review)".
- **NFR-1 vs §10 item 6:** NFR-1 says "tối đa 1 call logic cho verifier" (l.375), while §10 item 6 requires "đúng 1" (l.445). Pick one.
- **Assumptions index roundtrip:** l.12 says `[ASSUMPTION]` marks unapproved inferences, but the five inline tags (NFR-3, NFR-7, NFR-8, add. §3.1 ×2) have no index. The §11 table (#1–11) is a different set. Add a short "Inline assumptions" list under §11 or re-number them into it.
- **Undefined or late-defined terms:** "call logic" is defined only by use in NFR-1. "Episode" is defined inside FR-34 (l.344), not in §5.1. "Buổi chấm điểm" (FR-5) is undefined. "Đã xong" / `done` / `revealed` are used in prose but the state list lives only in add. §4 (l.112). Move all of these into §5.1.
- **External source not listed:** §5.0 cites `brainstorm-intent.md` mục 7 (l.161), but the source header (l.10) does not list it.
- **Casing:** SM-C6 "độ trễ p95" is lowercase, unlike the other rows (l.420).
- **UJ protagonists:** both named (Linh, Thanh) with inline context. OK.
- **Required sections:** product, scope, UJs, mechanism, FRs, NFRs, SMs with counter-metrics, acceptance, assumptions/risks/open questions are all present for the stakes. OK.
- **Arithmetic checks passed:** the add. §6 table sums to 16.0. The call count is 30×2 + 3×2 + 1 = 67, consistent across l.31 and add. l.122. In the UJ-1 reveal, 3 + 1 (held) + 7 = 11, consistent with the sealed counter.
