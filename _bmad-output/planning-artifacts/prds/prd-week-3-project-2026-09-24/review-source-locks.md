---
title: 'Review: PRD vs locked upstream sources'
created: '2026-09-25'
target: prd.md, addendum.md (this folder)
sources:
  - _bmad-output/forge/ai-interview-practice-agent/forged-idea.md (HARDENED)
  - _bmad-output/planning-artifacts/briefs/brief-week-3-project-2026-09-22/brief.md + addendum.md
  - _bmad-output/brainstorming/brainstorm-ai-user-interview-practice-2026-09-22/brainstorm-intent.md (§2 locks) + .memlog.md
  - .memlog.md (this folder), _bmad-output/party-mode/2026-09-25-interviewlab-prd-party.html
---

# Review: PRD vs locked upstream sources

**Verdict:** Most of the reopenings the PRD claims are recorded. Three source locks are still weakened without a record: the guide's ethics filter, "every label shows evidence", and replay success semantics. On top of that, the supersession statement and the decision log still point readers to text that contradicts the PRD.

Counts: **critical 0 · high 3 · medium 7 · low 6**. SILENT reopenings: **7** (F2, F3, F4, F8, F11 in part, F12, F13), plus 2 silent record-keeping gaps (F1, F7).

Legend: RECORDED = the change appears in PRD §2/§3, the addendum §6/§7 tables, or the decision memlog. SILENT = no record anywhere.

---

## High

### F1. The addendum declares the brief addendum still in effect, but the PRD contradicts it in many places — SILENT (supersession)
- **Source:** brief `addendum.md` §1 is titled "Kiến trúc agent (đã khóa ở forge)", and it contains: "Classifier 3 nhãn"; "Số item 'đã mở' hiện live chỉ ở tier sinh viên"; "bước self-check kiểm từng lượt persona"; "Mọi câu hỏi trong guide chạy qua classifier 3 nhãn"; "Pre-flight card được gộp vào guide"; "Mọi LLM call nhận tham số ngôn ngữ". Brief addendum §2 contains: "Làm dạng CLI trước (0,5 ngày). Admin dashboard sau"; "Trường tùy chọn 'chủ đề phỏng vấn thật' … Nếu bỏ qua, hỏi lại ở cuối buổi"; "Eval là cổng". Brief addendum §6 contains: "Tone mềm cho người mới … Thay bằng khen có căn cứ."
- **PRD:** addendum.md l.9: "Addendum của brief (2026-09-22) vẫn có hiệu lực, trừ §3 (lịch) … và §3b (chi phí)". The PRD then changes every item quoted above: 4 labels (§5.1), no live counter (§3 l.73, addendum §7 l.222), a lagged check (addendum §7 l.203), manual review in place of the guide verifier (FR-30, FR-36), the pre-flight card rejected (addendum §7 l.229), no bilingual plumbing (§3 l.83), dashboard in Later (§3 l.86), the topic field cut (§3 l.77), publish as manual status only (FR-35), and praise cuttable (cut #3).
- **Status:** each change is recorded on its own. The statement that tells architects which document wins is wrong, so the architecture step will read two conflicting authorities.
- **Fix:** rewrite addendum l.9 so the PRD and this addendum take precedence over the brief addendum everywhere, or so it lists the superseded parts: §1 (labels, counter tiers, self-check cadence, guide verifier, pre-flight card, language param), §2 (dashboard, topic field, automated eval gate), §3, §3b, and the praise clause in §6.

### F2. The guide prints the learner's verbatim leading question, which breaks the forge guide/ethics lock, and FR-30's invariant is false — SILENT
- **Source:** forged-idea "Guide": "Verifier: cấm mọi câu khẳng định về người dùng thật (chỉ câu hỏi, ghi chú kỹ thuật, nhắc hành vi của người học); mọi câu hỏi trong guide chạy qua bộ phân loại 3 nhãn, câu thêm nội dung về người dùng = assumption, bị loại." brief.md l.68: "Guide chỉ chứa câu hỏi và ghi chú kỹ thuật. Câu hỏi nào tự thêm nội dung về người dùng thật đều bị loại."
- **PRD:** FR-28 (l.323): "câu dẫn dắt nguyên văn của người học ghép với pattern soạn sẵn". Màn 6 item 5 (l.119): "Thay vì hỏi" lấy nguyên văn … ("Chị có muốn một app nhắc chị tiết kiệm không?")". Both conflict with FR-30 (l.325): "Guide chỉ được lắp từ chuỗi cố định trong kịch bản … lúc chạy không có gì được sinh ra", with the named-responsibility paragraph (l.333), and with Màn 6 l.118: "không có câu hỏi về chuyện của chị Thu". The quoted example is a question about chị Thu.
- **Status:** SILENT. By definition the guide now carries `leading/assumption` questions, and they come from unreviewed runtime learner text that bypasses both the forge verifier and Thanh's manual review. The printed take-away can hold any text the learner typed.
- **Fix:** pick one path. (a) Keep the verbatim question only on the reveal screen, and let the guide/print carry only the fixed pattern plus the error-type name. (b) Record a deliberate reopening in addendum §7: learner text is allowed in the guide as a marked anti-example. Then amend FR-30 and the l.118 claim, and state the ethics rationale (the question is about a fictional persona and framed as "don't ask").

### F3. "Mọi nhãn hiện bằng chứng": `leading` labels are shown without their evidence form and without any check — SILENT
- **Source:** forged-idea "Cơ chế (đã khóa)": "Mọi nhãn hiện bằng chứng." brief addendum §1 rule 3: "Mọi nhãn đều hiện bằng chứng: câu persona làm căn cứ, hoặc 'bạn tự đưa ý này vào, persona chưa từng nói'." Forge must-ship #3: "nhãn kèm bằng chứng".
- **PRD:** the reveal shows leading labels in the trust card (l.117: "Lượt 2, 9, 15 làm chị dè dặt hơn (câu dẫn dắt)") and in the "Thay vì hỏi" pairs. FR-20 only requires that "Mỗi nhận xét trích ít nhất một lượt", and that citation is the learner's own turn. The verifier (§5.3 l.232) checks only "mỗi `grounded_turn_id` dùng làm bằng chứng". Leading labels have no grounded turn, so the verifier never checks them. No FR asks for the "persona chưa từng nói" evidence.
- **Status:** SILENT. The PRD itself calls this label error the trust-killer (NFR-7: "lỗi làm người học mất niềm tin"), yet it is the one label shown with neither evidence nor verification.
- **Fix:** add to FR-19/FR-20: every turn shown as `leading` displays the added content next to the line "persona chưa từng nói điều này" (the analysis JSON would need to output the introduced phrase). Alternatively, the reveal verifier re-checks each leading turn it displays. If you choose neither, record the weakening in addendum §7.

## Medium

### F4. Replay fallback 1 redefines "success" without unlocking anything — SILENT
- **Source:** forged-idea: "Replay = bằng chứng lõi … Thành công: 'Đã mở: item X'; thất bại: hiện item + 1 câu mẫu lẽ ra mở được." brief.md l.50: "Replay là phản chứng: quay lại khoảnh khắc đó, hỏi đúng thì điều bị lỡ mở ra."
- **PRD:** §6.5 l.266: "Dự phòng 1: thành công khi cả 3 lượt không có lượt nào bị gắn nhãn `leading` và ít nhất 1 lượt có nhãn tốt … Khi thất bại, màn hình hiện câu hỏi mẫu cho item quan trọng nhất còn khóa." The launch checklist (l.461) says a good interviewer may get *only* this path.
- **Status:** SILENT. The memlog records only how fallback 1 is *selected* ("fallback earliest leading turn"). It does not record that fallback 1 success no longer demonstrates "Đã mở: item X". Fallback 2, which skips replay, is recorded in the memlog.
- **Fix:** record the fallback 1 success rule in addendum §7 as a deliberate departure, or require fallback 1 to target a still-locked item so success means "Đã mở: item X".

### F5. "0 rò rỉ / 20 adversarial" became "0 rò rỉ đã xác nhận", adjudicated by the author — RECORDED (PRD §2 only)
- **Source:** forged-idea quality bar: "0 leak / 20 run adversarial". brief.md l.91: "Cổng ship kịch bản: … 0 rò rỉ trong 20 run adversarial".
- **PRD:** §2 l.34: "Cổng rò rỉ tính rò **đã xác nhận**" (reason: noisy judge). FR-34: "do judge của eval gắn cờ và **Thanh phân xử từng cờ**". Acceptance §10.2.
- **Status:** recorded in the PRD §2 table, but it has no row in the addendum §7 tables and is not labeled a forge-lock reopening. The same person authors, tunes, adjudicates and publishes, and there is no independence guard. The brief's success criterion still reads "0 rò rỉ".
- **Fix:** add an addendum §7 row marked "(PM, 2026-09-25, mở lại chuẩn chất lượng forge)". Require that each dismissed flag carries the persona turn text and a one-line reason in the report. Optionally, one of the 2 student testers or a proxy spot-checks the dismissed flags.

### F6. Grounded praise is removed under cut #3 or on verifier failure — RECORDED as a consequence, not reasoned against the lock
- **Source:** forged-idea: "Khen có căn cứ (turn được gắn nhãn tốt) được phép ở mọi mức." brief addendum §6: "Tone mềm cho người mới … Thay bằng khen có căn cứ" (praise is the stated replacement for soft tone).
- **PRD:** cut #3 (l.58, l.63): "lời khen lúc chạy bị bỏ theo … **không có lời khen có căn cứ** lúc chạy". §5.3 l.235: when the verifier fails, "bỏ mọi lời khen có căn cứ".
- **Status:** recorded as a consequence, but not as a departure from the forge/brief rationale. The coupling is also a choice rather than a requirement: unlock citations are shown without passing the verifier (§5.3 l.234), so praise that cites a code-resolved good turn could meet the same bar. Under cut #3 the reveal becomes entirely corrective.
- **Fix:** under cut #3 or verifier failure, keep ≤1 praise item that cites a code-resolved turn with a good label, the same trust level as unlock citations. Otherwise, record in addendum §7 that the forge/brief praise rule is reopened.

### F7. The decision log is stale and contradicts the current PRD — SILENT (record-keeping)
- **Source:** `.memlog.md` (this folder), last decisions: "(decision) No schedule cuts: 2 scenarios at launch …, replay fallback 1, reveal verifier, Google + magic link; plan ~16.25d". The file has no entries for the party-mode or advanced-elicitation decisions (W2–W6, T1–T4, L1–L4, D1–D4, day-11 tripwire, cut order, 4-label wording, FR-35/36→Next, guide merge, library hide, openness 4, closing-question hook, confirmed-leak gate).
- **PRD:** these decisions exist only in the PRD §2 table, the addendum §6/§7 tables and the party HTML. The party HTML cut order ("2 Runtime verifier … 3 'Buổi của tôi' → 'Buổi gần nhất'") is the reverse of the PRD. The swap is recorded in addendum §7 l.234.
- **Fix:** append memlog decision entries for every party-mode and elicitation change. Mark the "No schedule cuts … magic link" entry as superseded.

### F8. Agent property "có mục tiêu" is met only by reframing, and the brainstorm assignment was dropped without a record — SILENT
- **Source:** brainstorm-intent §2 item 7: "có mục tiêu, có trạng thái, tự quyết bước tiếp theo, dùng tool, tự kiểm tra". Brainstorm memlog: "Iceberg + adversarial curriculum = the genuine-agent core: iceberg is persistent hidden STATE, curriculum is GOAL-aware planning across sessions, reveal needs grounded tool lookups". Note that brainstorm-intent §4 already omits "goal", and the curriculum was put in LATER (§5; brief "Ngoài phạm vi … lộ trình đối kháng").
- **PRD:** §5.0 table: "Có mục tiêu | Giữ tảng băng cho tới khi người học hỏi đúng cách; ở replay, nhắm một item mục tiêu cụ thể".
- **Status:** SILENT. §5.0 cites brainstorm item 7 but never says that goal-awareness was assigned to the adversarial curriculum, or that the curriculum was deferred. "Giữ tảng băng" is an invariant the controller enforces, not a goal it pursues. The replay target is chosen by a fixed rule (§6.2).
- **Fix:** add one line to §5.0 saying that cross-session goal-aware planning (adversarial curriculum) was the brainstorm's carrier for this property, that it was deferred at brainstorm/brief, and that the MVP claim is the narrower within-session goal. Or move a minimal goal behaviour (for example, pick the replay target from the learner's weakest unlock path) into scope.

### F9. Agent property "dùng tool" is reframed as code functions; the brainstorm's reveal lookups are only a contingency — RECORDED (as contingency)
- **Source:** brainstorm memlog: "reveal needs grounded tool lookups". brainstorm-intent §4: "tool (phân loại câu hỏi, tra tảng băng, xác minh trích dẫn)".
- **PRD:** §5.0 l.168: "Các tool này **cố ý không cho model gọi**". l.175: "Dự phòng có tên … verifier ở màn reveal thành một vòng gọi tool có giới hạn (`get_turn(id)`, `get_ledger_event(id)`) … Chưa làm cho tới khi có câu chữ của rubric." Addendum §7 l.213 records it.
- **Status:** the deferral is recorded. Two risks remain. (1) No artifact in the repo contains the project-brief rubric text, and `grep rubric` finds only skills and this PRD, so the trigger condition cannot currently be evaluated. (2) The only planned tool-call site is the reveal verifier, which is cut #3, so the cut order can remove the last route to satisfying a §2 lock marked "không mở lại".
- **Fix:** get the rubric wording now. If the rubric requires model-invoked tools, remove the verifier from the cut order (as §5.0 already says) and put the 0.25 d into the committed plan.
- **Mapping summary (task 2):**
  - *Có trạng thái*: met in substance (iceberg, ledger, openness and immutable snapshots, all outside the model).
  - *Tự kiểm tra*: met in the MVP through anchor detection, the lagged do-not-assert check, the reveal verifier and the end check. It is weakened under cut #3, and the PRD says so. The brainstorm's "persona nhất quán với fact sheet" check was already narrowed to do-not-assert at the forge (forge memlog: "consistency self-check verifies persona turns against them"). The PRD keeps only an eval metric (FR-34 "tỉ lệ mâu thuẫn … sau khi một item mở"), so surface-fact contradictions such as "24yo freelancer → team of 15" are checked neither at runtime nor explicitly in eval.
  - *Tự quyết bước tiếp theo*: met as a deterministic policy. The PRD is candid about this: "một máy trạng thái cố định có lớp LLM bên ngoài".
  - *Có mục tiêu*: reframed (F8).
  - *Dùng tool*: reframed (this finding).

### F10. brief.md body contradictions are left unacknowledged — RECORDED individually, brief never superseded
- **Source (brief.md):**
  - l.18: "Đầu ra mang về là một bộ câu hỏi (guide) cho buổi phỏng vấn thật của chính mình."
  - l.20: headline "Tự tin bước vào buổi phỏng vấn của bạn."
  - l.46: "Trước khi hiện phản hồi, mọi trích dẫn được đối chiếu với transcript đã lưu".
  - l.91–92: "0 rò rỉ"; "≥85% đồng thuận".
  - l.101: "Google hoặc email magic link".
  - l.103: demo "→ tải guide".
  - l.112: must-ship #7 "một câu hỏi kinh nghiệm"; #10 "Plumbing song ngữ"; #11 "Báo tôi khi BA/PM sẵn sàng".
  - l.118: Next "→ admin dashboard" and the "Tripwire … ngày 6".
  - l.126: "khoảng 4 LLM call mỗi lượt".
- **PRD:** every item is changed and recorded (§2 table, §3 "Cắt và hệ quả", addendum §6/§7). The PRD header l.10 lists `brief.md` as a source with no precedence rule, and addendum l.9 supersedes only brief-addendum §3/§3b.
- **Nuance on l.46:** PRD cut #3 (l.58) says the brief "không được nói 'mọi trích dẫn được đối chiếu trước khi hiện' nữa". FR-21 still drops unresolvable IDs even after cut #3, so the brief's literal claim ("claim nào không trỏ được về một lượt cụ thể thì bị bỏ") survives. What the reveal actually loses is *semantic* verification. Also, even without the cut, unlock citations the verifier rejects are still shown (§5.3 l.234), so "mọi trích dẫn được đối chiếu" is already only partly true.
- **Day-6 tripwire:** the PRD never mentions it. Dashboard→Later is recorded (addendum §7 l.224) and is the tripwire's own fallback, so it is consistent.
- **Fix:** add a precedence line under the PRD header: "PRD và addendum này thay brief.md ở mọi chỗ khác nhau; xem §2, §3 và addendum §7". Optionally, list the superseded brief lines above.

## Low

### F11. The forge counter/tier lock was cut with a weak rationale, and the tier/onboarding item left Next without a record — RECORDED (cut) / SILENT (Next)
- **Source:** forged-idea Cơ chế: "Bộ đếm 'đã mở' live chỉ cho mức sinh viên; mức khác chỉ thấy tổng niêm phong." Forge Next: "onboarding vai trò + kinh nghiệm + dữ liệu tier".
- **PRD:** addendum §7 l.222: "Không có tier để quyết định ai được thấy". PRD Next (l.85) keeps only "câu hỏi vai trò ở onboarding". Later keeps only "feedback theo tier".
- **Issue:** the launch audience is all students, so under the forge rule everyone would see the live counter. The "no tier" reason does not hold, and only the gaming reason does. Dropping experience/tier data from Next is not recorded anywhere.
- **Fix:** restate the §7 row with the gaming reason, and label it as reopening a Cơ chế lock. Either restore "kinh nghiệm + dữ liệu tier" in Next or record why it was dropped.

### F12. The BA quality bar "câu xác nhận đóng" is not carried forward — SILENT
- **Source:** forged-idea: "run BA tốt có câu xác nhận đóng đúng lúc". brief addendum §2 has the same line.
- **PRD:** FR-33/FR-34 and the Next line (l.85) carry the BA/PM realism mitigations but not this eval criterion.
- **Fix:** add it to the Next BA/PM entry as a publish criterion for the BA role.

### F13. The brief JTBD is dropped — SILENT
- **Source:** brief.md l.39: "bước vào buổi thật mà không lúng túng, và biết cách gỡ khi lệch kịch bản, tức 'đáng tin khi có người nhìn'". brainstorm-intent §3 has the same JTBD.
- **PRD:** no JTBD statement. No feature or metric addresses recovery ("gỡ khi lệch kịch bản"). Only assumption #10 survives.
- **Fix:** add the JTBD to §1 and say which part the MVP serves (catching errors) and which it does not (recovery or being credible under observation, which belong in Later: Exam mode and audience lens).

### F14. The framing of the `open` label is inconsistent across records — RECORDED
- **Source:** forged-idea: "Luật câu hỏi chung mọi vai trò … `confirm-grounded` … `boundary-probe` … `leading/assumption`". The source says nothing about restricting these labels to closed questions.
- **PRD:** addendum §7 l.214: "Bộ 3 nhãn đã chốt ở forge dành cho câu hỏi đóng … lấp lỗ hổng của luật đã chốt chứ không phá nó". The memlog says "extends forge 3-label lock", and the party HTML stars W5 as "reopened a decision locked at the forge". PRD §5.1 l.198 says "thêm nhãn `open` vào bộ 3 nhãn của forge".
- **Fix:** label the row "(PM, 2026-09-25, mở lại khóa forge)" like the headline and grounding rows. Drop the reinterpretation that the forge set was scoped to closed questions, because the source does not say that.

### F15. Other forge-lock changes are recorded as scope cuts but not labeled as lock reopenings — RECORDED
- Bilingual plumbing is forge must-ship #10 (PRD §3 l.83).
- "Trường tùy chọn 'chủ đề phỏng vấn thật'" and the overlap check are forge Kịch bản items (PRD §3 l.77).
- Persona sees ≤1 hook line per turn, where forge trust rule 1 says "hook line của item khóa" (memlog "code picks hooks"; addendum §7 l.204).
- Persona sees do-not-assert only for the matched tag (addendum §7 l.208).
- The substance is recorded in each case. Only the "(mở lại khóa forge)" marker used elsewhere is missing, and the party HTML stars only W5 and L3 as forge reopenings.
- **Fix:** add the marker to these rows so a lock audit can grep for them.

### F16. Incidental internal inconsistencies a reviewer would notice
- PRD §11 "Lịch" (l.492): "Phần cam kết là ~16,6 ngày, vượt mốc ~0,6 ngày … buffer còn lại chỉ ~0,15 ngày". This contradicts PRD §3 l.53 and addendum §6 l.142/l.164, which give "~16,0 ngày". §11 is stale (pre-first-principles).
- PRD §1 l.18: "mang về một bộ câu hỏi dựa trên lỗi của chính mình". The guide was retitled as habits rather than a question set (FR-28), so the wording is loose.
- **Fix:** update §11 to 16.0 and state the buffer rule from addendum §6. Reword §1 to "thói quen hỏi của chính mình".

---

## Claimed reopenings checked as RECORDED (no finding)

| Claimed reopening | Where recorded |
|---|---|
| Unresolvable grounding → `open` not `leading` | addendum §7 l.209 "(PM, 2026-09-25, mở lại luật forge)"; PRD §2 l.33; §5.1 l.198 |
| 4th label `open` | addendum §7 l.214; memlog "4th label 'open' accepted" (framing issue: F14) |
| Headline replaced | PRD §3 l.75; addendum §7 l.235 "(PM, 2026-09-25, mở lại khóa forge)"; NFR-14 |
| Guide retitled, sample questions removed | addendum §7 l.229; PRD §2 l.33; FR-28 |
| Openness start 3→4 | addendum §7 l.211. This was not a source lock: the forge/brief never fixed the start value, and 3 was the PRD's own `[ASSUMPTION]` |
| Closing-question hook rule | addendum §7 l.212. Consistent with forge "câu chung chung chỉ mở item bề mặt", because it opens nothing |
| Trust card without numbers | addendum §7 l.230. Not a source lock |
| Verifier moved to cut #3 | addendum §7 l.234; PRD §2 l.34, §3 l.51 |
| FR-35/FR-36 → Next with manual review | addendum §7 l.226 "(… mở lại must-ship #8 của forge)"; PRD §3 l.81; §7 l.333 (but see F2) |
| Guide merged into reveal | addendum §7 l.225; PRD §3 l.80 |
| Library hidden at 1 scenario | addendum §7 l.227; PRD §3 l.82; FR-4 |
| Magic link cut | PRD §3 l.76; addendum §6 l.140, l.188 (memlog still says kept: F7) |
| Bilingual plumbing cut | PRD §2 l.32, §3 l.83; memlog "Cuts: bilingual plumbing" |
| Experience question / tier counter cut | PRD §3 l.73; memlog (rationale: F11) |
| "Báo tôi khi BA/PM sẵn sàng" cut | PRD §3 l.74; §11 #6; memlog |
| "Chủ đề phỏng vấn thật" field cut | PRD §3 l.77 (includes the overlap check) |
| Admin dashboard → Later | addendum §7 l.224; memlog. Consistent with the forge/brief day-6 tripwire fallback |

## Source locks verified as kept (no finding)

- **brainstorm-intent §2, items 1–3:**
  - no fake findings (PRD §1, NFR-13);
  - learner-only, with no instructor product ("Ngoài phạm vi");
  - private by default (FR-3, NFR-9).
- **brainstorm-intent §2, item 4:** errors typed by the missing question type. Each missed item carries its unlock path (FR-19), and `question_type` is stored per turn.
- **brainstorm-intent §2, items 5–6:** one agent (one controller and two calls, with no second agent); "giỏi thật" (the unlock table rewards non-leading and past-specific questions).
- **Forge gate:** unlocks are decided by agent logic, and follow-up items need a dropped hook (§5.2, addendum §3.1, §10.4).
- **Forge "LLM chỉ diễn đạt":** the PRD is stricter, with zero-LLM templates (addendum §7 l.221).
- **Citations by reference:** unresolvable citations drop the claim (FR-21).
- **Quality bar:** "≥2 item chỉ mở bằng chuyện/tin tưởng" is equivalent to FR-33 "≥2 item thuộc đường chuyện quá khứ hoặc tin tưởng". Each item has exactly one unlock path (§5.1 "một đường mở"), and the past-story and trust rules (addendum §3.1) both need `past_specific` or openness≥threshold. No other path opens those items.
- **Other quality-bar items:** 8–12 items, all 4 paths, good ≥2× bad and ≥3 items, eval interviewer blind to the iceberg (FR-33/34, §10.2).
- **Ethics:** no persona is generated from the learner's research question ("Ngoài phạm vi"); citations come only from the transcript. The guide/ethics exception is F2.
- **Multi-role:** UX-only launch with BA/PM in Next matches both the forge Next order and brief l.37. `role` is a schema field (FR-33).
- **Forge "Replay 'cắt đầu tiên nếu trễ'" rejected:** the main replay path is in "Không bao giờ cắt".

**File:** `D:\Tekmium\week-3\_bmad-output\planning-artifacts\prds\prd-week-3-project-2026-09-24\review-source-locks.md`
