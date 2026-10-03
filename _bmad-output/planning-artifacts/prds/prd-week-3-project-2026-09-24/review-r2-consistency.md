# Review r2: internal consistency (prd.md + addendum.md)

**Verdict: NOT CONSISTENT YET.** No critical findings, but 5 high-severity contradictions affect the mechanism and data model. Fix them before architecture. The slice arithmetic is correct.

Scope: internal inconsistency only. PM decisions in `.memlog.md` are treated as final. Locations use PRD line numbers ("P:L") and addendum line numbers ("A:L") as of 2026-10-02.

Counts: critical 0 · high 5 · medium 13 · low 15

## Arithmetic check (passes)

- Addendum §6 subtotals recomputed: S1 = 24.25 (21 rows), S2 = 8.25, S3 = 8.75, S5 = 5, S4 = 9.75, cross-cutting = 2.5. **Total 58.5.** This matches PRD §3 (P:64–70), PRD §13 (P:643) and memlog line 87.
- S2 persona count (5 hand-authored UX + 1 from S1 = 6) matches the interim gate's "6 persona" (P:72, A:213, A:235). The S2-before-S3 penalty is 5 × (1.25 − 0.9) = 1.75, which matches A:234.
- Call counts: 30×2 + 3×3 + 3 = 72. This matches NFR-1 (P:475), PRD §8.3 (P:319, P:326) and A:161. Full eval = 3+3+20 = 26 sessions (FR-34, A:170). The reduced eval has 7 runs, consistently stated in FR-54, Màn 11, NFR-2 and A:171.
- Token and cost math in A:162–167 checks out (~0.22M input → ~$0.15 / ~$0.90).
- One arithmetic slip (L1 below).

---

## High

### H1. Hook pickability is defined two ways
- A:17 (Thuật ngữ): "Hook đã thả **còn nhặt được tới khi bị nhặt hoặc đóng**."
- P:303 (§8.1): "Hook còn nhặt được tới khi item của nó mở." A:124 (§3.2): "Lượt t+1 không nhặt → … hook vẫn nhặt được. Hook đóng khi item của nó mở." P:342 (§9.4): "Hook của item mục tiêu nhặt được ở cả 3 lượt."
- Under the glossary definition, a pick that fails to unlock (for example a non-good label) ends pickability. Replay then collapses back to one attempt, which is the bug memlog line 26 fixed ("hooks stay pickable until item unlocks").
- **Fix:** change A:17 to "Hook đã thả còn nhặt được tới khi đóng (item của nó mở); nhặt không làm hook hết nhặt được."

### H2. Moderation is said to run in two different places
- Màn 10 (P:212–213) says the button stays in the processing state "tới khi buổi `generating` được tạo, rồi chuyển sang Màn 11". The same screen also shows the moderation rejection **inline on Màn 10** ("Chủ đề này không tạo được… Lần thử này không bị tính").
- A:35 and FR-54 (P:429) put moderation **inside the worker pipeline** that runs on the `generating` session: "kiểm duyệt → phân loại trọng tâm → generator…".
- So a rejection would arrive after the learner is already on Màn 11. Màn 11's failure reasons (P:217) have no moderation case.
- The data model makes this worse. A:155 says "Mỗi lần thử tạo một `session` mới", but FR-55/FR-56 say rejected attempts "không tính". A rejected attempt would leave a `failed_eval` session that shows "Chưa qua kiểm tra" in Màn 9 and counts toward Màn 2's "mọi lần thử đều `failed_eval`".
- **Fix:** run moderation (and focus classification) synchronously in the request, before creating the session. Change A:35 to "(request) kiểm duyệt → tạo session `generating` → (worker) phân loại → generator…". Make `generation_attempt.session_id` nullable for rejected attempts, and state that no session is created on rejection.

### H3. A custom-topic session has no link to its topic while generating
- A:145: the status of a custom topic is "suy ra từ các buổi của nó (PRD §7)". Màn 2 (P:145) derives "Đang chuẩn bị" / "Chưa qua kiểm tra" from the sessions. Màn 11 (P:217) says "Thử lại" creates "buổi mới trong cùng chủ đề riêng".
- `session` (A:147) has only `scenario_id`, which is null until the generator finishes. `generation_attempt` (A:155) has `topic_text` but no `topic_id`. A `generating` or `failed_eval` session therefore cannot be tied to its topic row.
- **Fix:** add `topic_id` to `session` (or to `generation_attempt`). Also state when the custom `topic` row is created (on the first attempt that passes moderation).

### H4. The generator's trigger depends on the verifier, which runs after it
- A:133 (§3.3) triggers the leading-question comment on "≥1 lượt `leading` có tính mới **được verifier đồng ý**".
- But the reveal order is judge → **generator** → **verifier** (P:319–322, FR-22, A:31). The generator cannot see a verifier result that does not exist yet.
- **Fix:** trigger on "≥1 lượt `leading` sau khi code kiểm". The verifier then drops the claim if it disagrees on novelty (this already exists in A:84 and P:323).

### H5. Fallback 1 has no target item, but the reveal and replay specs assume one
- A:287 says fallback 1 "không có item mục tiêu". §9.2 (P:335) agrees: the target is "hỏi lại mà không dẫn dắt".
- Even so:
  - Màn 6 item 2 (P:182) always shows "thẻ **Giữ lại để bạn thử (1)** với item mục tiêu niêm phong".
  - The sealing rule (P:174–177) is written for a target item.
  - Màn 7 results (P:201) only have item-based copy ("Đã mở khóa: [item]…", "Một câu đã mở được nó").
  - §12.2 mục 10's "không còn item niêm phong" assumes a target.
  - The fallback-1 result defined in §9.5 (P:348: "thành công khi cả 3 lượt không `leading` và ≥1 lượt có nhãn tốt") has no screen copy.
- Related problem: §9.2 picks fallback 1 from the code-checked label "không chờ verifier" (P:335), and the diagnostic line "Lượt 2: thử hỏi lại mà không dẫn dắt." has no verifier branch (P:186). Meanwhile FR-19 and Màn 6 item 4 show a turn as leading "chỉ khi verifier đồng ý". If the verifier rejects novelty, the replay block calls turn 2 leading while the reveal does not.
- **Fix:** add a fallback-1 variant to Màn 6 (no sealed card, no sealing) and to Màn 7 (success and fail copy). Either pick fallback 1 only from verifier-agreed leading turns, or add a neutral line for when the verifier disagrees.

---

## Medium

### M1. Two-person adjudication has no tool in S1–S2
- The interim gate (P:72, FR-35 P:441) requires "cờ rò rỉ đã đóng bởi hai người phân xử". §12.4 (P:593) has the second adjudicator rule on 10 flags before persona 1's first full eval in S1.
- Adjudication is only specified in C6 (Console, S3). The estimate puts "Phân xử hai người 0,75" in S3 (A:211). No CLI adjudication command appears in §3 S1 or FR-44/45.
- **Fix:** add a CLI `adjudicate` command (or a file-based verdict format written into `adjudication`) to S1 scope and estimate. Otherwise state how S1 verdicts are recorded.

### M2. Product-level strings have no approval path before S3, and no place in the data model
- C7 (P:247) and FR-36 (P:442) cover "chuỗi cố định cấp sản phẩm" (FR-48a, diagnostic lines, FR-63). These ship in S1.
- The interim gate only covers persona strings that Thanh approves into the **persona's eval report** (P:72).
- `string_approval(scenario_id, version, string_path, …)` (A:153) is keyed by scenario, so product-level strings cannot be stored.
- **Fix:** make `scenario_id` nullable or add a `product_string_approval` table. Extend the interim gate to product-level strings, recorded in a release note.

### M3. "Thẻ thói quen" means two different things
- FR-36 (P:442) and C7 (P:246) call "thẻ thói quen" a **fixed persona string** that is approved at authoring time.
- §8.3, A:78 (`kind: "habit"`) and A:136 make it **runtime generator text** that the verifier checks. The scenario JSON (A:146) only holds "ngưỡng thẻ thói quen".
- **Fix:** remove "thẻ thói quen" from the FR-36 and C7 lists, or say that only the habit card's *title/label* is a fixed string.

### M4. §12.4 says "not counted in the build estimate", but the estimate counts its items
- P:590 heads §12.4 "(không tính vào ước tính build)". Its items include 5–8 student tests, the second adjudicator, the interim re-gate and the methodology page.
- These are counted in the estimate: A:230 (2.5 d "5–8 buổi thử sinh viên, người phân xử thứ hai"), A:213 (0.25 d interim re-gate), A:228 (BA/PM reader coordination), and PRD §3 "Xuyên suốt ~2,5".
- **Fix:** change the heading to "(phần dev đã tính trong addendum §6; thời gian chờ người ngoài không tính)", or remove those rows from the estimate.

### M5. The S1 topic table conflicts with S2 "migrate scripts under topic"
- PRD §3 S1 (P:64): "bảng `topic` có một dòng duy nhất". A:180: "Schema (có `topic_id`)".
- PRD §3 S2 (P:65) lists "`topic` trên persona" as S2 work. A:202 S2: "Mô hình `topic`, di chuyển kịch bản dưới chủ đề 0,5".
- **Fix:** rename the S2 row to "Mở rộng `topic` (nhiều chủ đề, vai trò, trạng thái)", or drop the S1 claim that the table exists.

### M6. Sealing is not applied to Màn 9 or to the reveal event
- Sealing covers "dữ liệu gửi về trình duyệt" (§12.2 mục 5, P:545), with NHẬN BIẾT excluding the target.
- Màn 9 (P:205) and FR-39 show "Kể 3/11 · Nhận biết 4" for every session, including `revealed` ones. If that list computes the unsealed value (5), it leaks the match that Màn 6 is hiding.
- FR-38 (P:459) logs "NHẬN BIẾT" at reveal without saying whether it is sealed. SM-8 (NHẬN BIẾT / exposed items) is biased if the logged value is the sealed one.
- **Fix:**
  - Extend the sealing rule to Màn 9 (sealed value while `revealed`/`replaying`).
  - Have FR-38 log the unsealed (true) value.
  - Add Màn 9 to the §12.2 mục 5 test.

### M7. Replay turns get two verdicts
- In replay, judge replay outputs `prev_turn_verdict` for each replay turn "ngay sau câu trả lời" (A:86, P:326). The next replay turn's Call 1 also outputs `prev_turn_verdict` for the same turn (§8.2, run unchanged per §9.4).
- FR-14 (P:397) lists both as sources, with no precedence.
- **Fix:** in replay, Call 1's `prev_turn_verdict` is ignored (judge replay wins), or judge replay runs only on the last replay turn. Note that the second option changes the 3-call count.

### M8. "Confirmed by two adjudicators" conflicts with "disagreement = confirmed"
- §12.2 mục 2 (P:523) reads "0 rò rỉ **đã xác nhận bởi hai người phân xử**", which implies a leak counts only if both confirm.
- C6 (P:243) and A:312 say "bất đồng thì cờ tính là rò đã xác nhận".
- **Fix:** reword mục 2 to "0 rò rỉ đã xác nhận (hai người phân xử; bất đồng tính là rò, C6)".

### M9. Where a `done` session opens is ambiguous
- §7 (P:270) says `done` → "Bản xem lại chỉ đọc (Màn 9)". Màn 6 "Tải" (P:196) says a direct open "ở `revealed`/`done` → tải chuẩn" renders Màn 6.
- **Fix:** pick one. Either the review is Màn 6 read-only (then §7 says "Màn 6 chỉ đọc"), or remove `done` from Màn 6's loading line.

### M10. The FR-63 notice is only placed on the Màn 3 path
- FR-63 (P:365) shows the notice on "Lần đăng nhập đầu… trước khi vào buổi". §12.2 mục 9 tests "trước buổi đầu".
- Only Màn 3 (P:157) places it. The header "Đăng nhập" (Màn 1), Màn 9 and Màn 10 (custom topic, where topic text becomes admin-visible) can also trigger a first login.
- **Fix:** show the notice right after any first Google sign-in, before any page that writes learner data.

### M11. Custom topics have no `role`
- `topic.role=ux|ba|pm` (A:145) is required, and the generator's input includes "vai trò" (A:92). FR-31 picks the next persona by "chủ đề khác cùng vai trò". FR-64 applies to "persona BA/PM".
- Màn 10 and FR-52 never collect a role.
- **Fix:** make `role` nullable for `custom` (FR-31 then falls back to "Khác"), or derive it from the learner's current filter.

### M12. Unclear whether system-error attempts count toward the daily limit
- FR-56 (P:431): "qua hay trượt đều tính". §7 `failed_eval` (P:264) includes "lỗi hệ thống", and Màn 11 lists "lỗi hệ thống" as a reason.
- Charging a learner's 3/day quota for an infrastructure failure is unspecified, and §12.2 mục 14 does not test it.
- **Fix:** state that `failed_eval` with reason `system_error` does not count, or that it does.

### M13. FR-5 is tagged S2, but S1 depends on it
- FR-5 (one scored session per persona, which is also the per-person cost limit) sits under "Thư viện, chủ đề và vai trò (S2)" (P:367–369).
- S1 ships a playable persona, §7 routing and FR-45 demo exemptions, all of which presuppose FR-5.
- **Fix:** tag FR-5 as S1.

---

## Low

- **L1 (cost arithmetic).** A:171 gives ~6–12 USD per attempt × "~1,5 lần thử mỗi kịch bản qua", which is **9–18 USD**. The text says "~8–16 USD", repeated at P:633. Fix the range or the multiplier.
- **L2.** §12.2 mục 10 (P:552) says "5 cách kết thúc replay", but §9.5 (P:345–349) lists success, partial, fail, fallback-1 (pass/fail), Dừng and Bỏ qua. Enumerate them.
- **L3.** NFR-1 (P:475) says "Console … không gọi LLM", but C3/C4/C5 trigger the generator, AI critic and eval. Reword to "không gọi LLM trong web request; generator/eval chạy trên worker".
- **L4.** NFR-14 (P:497) calls "Mắc lỗi ở đây, đừng mắc trước người thật." the **headline**. Màn 1 (P:140) uses it as the sub-line, with headline "Luyện phỏng vấn người dùng. Xem chính xác bạn đã bỏ lỡ điều gì." Align them.
- **L5.** FR-49 (P:392): an empty canvas makes the diagnostic use "câu 'hook bị bỏ qua' hiện có". Màn 6 (P:184–185) still branches on the verifier, giving the neutral line if it disagrees or fails. Add "theo nhánh verifier của Màn 6 mục 2".
- **L6 (stale wording).**
  - P:76 "Không bao giờ bỏ khỏi một lát" is cut-order language.
  - A:296 "~58 ngày" should be 58.5.
  - A:252 "Thay bằng" still says "dò cụm neo nguyên văn (§3.2)". The row is marked superseded, but §3.2 no longer has anchors; add "→ thay ở vòng 2 bằng verdict".
  - A:288 still says "SM-6, SM-7 thay SM-3, SM-4 khi chỉ có 1 kịch bản" with no supersession mark.
  - Both frontmatters say `updated: '2026-10-01'`, but the content is from 2026-10-02.
- **L7 (data model gaps).**
  - No `event` table for FR-38/SM-12.
  - No waitlist table for FR-32.
  - `turn` has no timestamp, which SM-C1 ("24 giờ") needs.
  - `branch.result` and `generation_attempt.outcome` enums are undefined (only `passed` is named).
  - `topic` has no adjacency-note field (C3).
  - The persona photo and one-liner (Màn 2b) are not in the FR-33 / scenario JSON list.
  - `eval_run` has a single `cost_usd`, but C5 shows estimated vs actual.
- **L8.** The §12.1 table (P:506–515) does not map §12.2 mục 15 (methodology) or mục 16 (interim gate).
- **L9.** The §12.2 mục 5 test (P:545) checks claims with the target `item_id` but not claims that "trích lượt thả hook của nó" (Màn 6, A:78). This includes the "chuyển chủ đề" habit card, which counts the target's ignored hook.
- **L10.** FR-65 (P:446) "quy tắc sinh của §6" is ambiguous: PRD §6 is screens, and the rules are in research.md §6. Write "research.md §6".
- **L11 (term clash).** "lượt" means a turn (1–30), but is also used for quotas: "Hôm nay đã hết lượt luyện" (Màn 3), "lượt miễn phí", "lượt thử". Prefer "buổi", "kịch bản miễn phí" and "lần thử" in UI copy.
- **L12.** The PRD §3 S2 wording "phần còn lại của UX: 2 chủ đề × 3 persona" reads as 6 *more* personas. The real count is 5 (A:205).
- **L13.** FR-7 (P:375): "số lượt trên 30 và bộ đếm niêm phong, không đổi suốt buổi". The turn count does change; scope "không đổi" to the counter.
- **L14.** PRD §8.2 step 1 (P:310) Call 1 input omits "hook được chọn ở lượt persona trước (kèm ID)", which A:40 includes and the verdict needs.
- **L15.** §4 (P:94): the focus values `no_leading` and `general` have no "đường mở tương ứng" for the generator to bias toward. The mapping from focus to "nhận xét thuộc trọng tâm" (FR-20, A:138) is also undefined.

## Checked and consistent (no action)

- §7 state table vs Màn 2, 2b, 3, 9, 11 labels and transitions, FR-10, and the §7 notes on demo accounts, one `generating` session, and retry = new session.
- §8.3 / §9.2 / Màn 6: the replay moment is chosen before the 3 reveal calls, and the verifier only picks the wording.
- The UJ-1 numbers (3/11, Nhận biết 4 → 5 after unseal, Bỏ lỡ 7 + sealed 1 + told 3 = 11) match the sealing rule.
- Interim-gate wording is consistent across §3, FR-35, §12.2 mục 16, §12.4, C8, A:146 `interim_gate` and A:235.
- Privacy copy: no "riêng tư" or similar promises outside history and supersession rows. The FR-63 text matches NFR-9.
- FR/NFR/§/Màn/C cross-references resolve correctly, except L10.
