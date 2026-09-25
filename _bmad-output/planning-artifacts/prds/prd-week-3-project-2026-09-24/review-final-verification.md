# Final Verification: InterviewLab PRD rewrite

- **Files checked:** `prd.md` (515 lines), `addendum.md` (299 lines), against `validation-report.md` and `git diff HEAD -- prd.md`
- **Date:** 2026-09-25
- **Result:** 13 PASS / 2 FAIL on the 15 rewrite targets; 3 medium and 9 low other findings. Nothing critical or high outside the two FAILs.

Line references are `prd:N` / `add:N` in the current working copy.

---

## Part A: Rewrite targets 1–15

### 1. Schedule: PASS
- PRD §10 "Lịch" (prd:497): "~16,25 ngày (16,0 nếu FR-35/36 tiết kiệm mức cao)". PRD §3 (prd:36): "~16,25 ngày trên mốc 16". Add:174 and add:197 agree.
- I re-summed the addendum §6 table (add:180–196): 2 + 0,5 + 3 + 0,1 + 1,25 + 1,5 + 0,25 + 1,15 + 2,75 + 0,25 + 1 + 0,5 + 0,5 + 0,25 + 0,25 + 0,25 + 0,75 = **16,25**.
- Tripwire "≤3,9 ngày (16 − 11 − 1,1)" (add:207). Scenario 2 is "+1,1" (add:198, add:215).
- The old-tripwire arithmetic now checks out: the listed items sum to 10,35, 16,25 − 10,35 = 5,9, and 16,25 − 3,9 = 12,35.
- The only remaining "~16,0" is at add:172, a dated historical decision that add:174 explicitly supersedes. That is acceptable.

### 2. No "Sắp có" card: PASS
- "Sắp có" appears only in negations: prd:59 "Không có thẻ 'Sắp có'" and add:207 "không có thẻ 'Sắp có'".

### 3. Call 2 never gets the do-not-assert rule of an item that just unlocked: PASS
- PRD §5.2 step 3 (prd:193): "chỉ khi item của tag đó vẫn còn khóa sau quyết định mở khóa của lượt này (item vừa mở không bao giờ đi kèm ràng buộc 'không tự kể' của chính nó)".
- FR-15 (prd:270), NFR-4 (prd:351) "không bao giờ của item vừa mở", §9.2 mục 3 (prd:388) and addendum §2 (add:69) all agree.

### 4. Leak rule (b), hook events, confirmation criteria: PASS
- FR-34 (prd:316) says (b) is "persona nêu một topic còn khóa **bằng lời của chính nó**, ngoài hook line được phép ở lượt đó". It adds that hook drops "không bao giờ là rò rỉ; mỗi lần thả được ghi thành sự kiện hook và đưa cho judge làm danh sách được phép", and gives a "**Tiêu chí xác nhận:**" clause.
- Addendum §7 (add:284) records the change.

### 5. `leading` carries `introduced_content`: FAIL (the rule is specified correctly; the worked example breaks it)
The rule itself is complete and consistent:
- PRD §5.1 (prd:176), §5.2 (prd:187, prd:198), §5.3 (b) (prd:202), FR-19 (prd:276) and §9.2 mục 4 (prd:393) all carry it.
- So do the addendum code checks (add:57, "kể cả lượt 0") and the verifier contract (add:75, add:80).

**The defect:** the PRD's only worked `leading` example fails the PRD's own code check.
- prd:92: Linh asks "Chị có muốn một app nhắc **chị** tiết kiệm không?", and Call 1 returns `introduced_content` "app nhắc tiết kiệm".
- Add:57 requires `introduced_content`, after the anchor normalization in §3.2, to be a substring of the learner's sentence.
- Normalized, the learner's text contains "app nhac chi tiet kiem". It does not contain "app nhac tiet kiem".
- Under the spec, this label would be downgraded to `open`. Openness would not drop, the reveal and guide would show no leading error for turn 2, and "Lượt 2, 9, 15 làm chị dè dặt hơn" (prd:104) would not happen.
- The same phrase is repeated at prd:107 ("bạn tự thêm 'app nhắc tiết kiệm'").
- An implementer writing a fixture from UJ-1 would get a failing test.

**Fix:** change `introduced_content` to "app nhắc chị tiết kiệm" at prd:92 and prd:107.
- prd:92: `Call 1 gắn nhãn \`leading\`, loại giả định-tương-lai, kèm nội dung Linh tự thêm: "app nhắc chị tiết kiệm".`
- prd:107: `"Lượt 2, bạn tự thêm 'app nhắc chị tiết kiệm'; chị Thu chưa từng nói điều này."`

Alternative: change Linh's question to "Chị có muốn một app nhắc tiết kiệm không?" at prd:92 and in the quote at prd:107.

### 6. FR-30 wording and the Màn 6 item 5 exclusion: FAIL (the requirement text is exact; the guide example violates it)
- FR-30 (prd:292) matches the required wording character for character.
- Màn 6 item 5 (prd:109) excludes only "câu hỏi về **nội dung chuyện của persona**" and allows the learner's own words. That part is correct.

**The defect:** the guide example in the same section quotes the persona's LLM-generated reply.
- prd:107: "Câu trả lời 'cũng được đó em' không phản ánh hành vi thật."
- "cũng được đó em" is Call 2 output. It is neither (a) a fixed approved string nor (b) the learner's own question, so it breaks FR-30's "Không có nội dung nào được LLM sinh ra lúc chạy".
- Addendum §3.3 (add:129) specifies the leading-error display as the pair plus "bạn tự thêm ‘…’" only, with no persona quote, so the example also contradicts the addendum.

**Fix (prd:107):** replace the evidence sentence with:
> Dòng giải thích kèm bằng chứng: "Lượt 2, bạn tự thêm 'app nhắc chị tiết kiệm'; chị Thu chưa từng nói điều này. Câu trả lời cho một câu dẫn dắt không phản ánh hành vi thật."

The second sentence is then a fixed template string.

### 7. Demo accounts: PASS
- FR-45 (prd:344): `DEMO_ACCOUNT_EMAILS`, real Google accounts that sign in like any learner; `seed-demo <email> --guess <n>` accepts only listed emails, uses the real engine, stops at `revealed`, and "thất bại, in lý do và khoảnh khắc đã chọn" unless the moment is the primary candidate.
- FR-2 (prd:251): "không có đường đăng nhập riêng cho demo".
- FR-5 exemption (prd:256). Excluded from metrics: FR-38 (prd:324) and §9.3 (prd:422).
- Data model: add:139 has `user(id, google_sub, email)` and add:141 has `session.is_demo`.
- See medium finding M1: the exemption has no UI path to a new session.

### 8. Named responsibility replaces FR-35 and FR-36, and "no second reader" is a named risk: PASS
- prd:300: "**Trách nhiệm có tên (thay FR-35 và FR-36 trong MVP), người chịu trách nhiệm: Thanh.**" It covers the thresholds (FR-35's role) and the string review (FR-36's criteria).
- Referenced from §3 (prd:50, prd:68), FR-4 (prd:255), §9.2 mục 2 (prd:380) and FR-36 (prd:320).
- The named risk is at prd:486: "không có người đọc thứ hai… Đây là rủi ro chấp nhận". Addendum §7 (add:285) agrees.

### 9. PRD §9 "Tiêu chí đánh giá thành công": PASS
- The section has 9.1 (goal → gate → signal → limit table, plus one "1 kịch bản hay 2 kịch bản" paragraph at prd:375 that states SM-3, SM-4 and #9 are unmeasurable and that SM-6 and SM-7 are used instead), 9.2 (gates), 9.3 (SM-1..7 and SM-C1..7) and 9.4.
- The 9.1 table covers every 9.2 item (1–12).
- Other mentions are pointers: prd:59 "(§9.1)", add:215, and assumption #9 (prd:472).
- §2 (prd:28–30) is one paragraph that ends with a pointer to addendum §8.

### 10. Screens renumbered 1–9: PASS
- UJ-1 has Màn 1–9 in order (prd:84–122).
- Every reference resolves: Màn 1 (prd:86), Màn 2 and Màn 8 (prd:37), Màn 3 (prd:84), Màn 6 mục 5 (prd:289), Màn 8 (prd:111, prd:120; add:172, add:187, add:198).
- No "Màn 10" and no stub screen remain.

### 11. Section renumbering: PASS
I resolved every "§n" and "§9.2 mục n" in both files:
- §9.2 mục 2 means Kịch bản (prd:138, prd:301). Mục 3 is Cô lập (prd:157). Mục 4 is Cổng mở khóa (prd:39, prd:151, add:233). Mục 5 is Replay (prd:149). Mục 6 is Số call (add:230). Mục 8 is Độ trễ (add:201). Mục 10 is Buổi của tôi (add:222).
- §10 is Giả định/rủi ro (prd:353, prd:369, add:239, add:285).
- §9.1, §9.3 and §9.4 are cited correctly (prd:59, prd:324, prd:356; add:215).
- No "§11" remains in either file.
- The "Nếu cắt #2" block (add:219–223) cites FR-39, FR-42, FR-43 and PRD §9.2 mục 10 correctly. The "Nếu cắt #3" block (add:225–231) cites FR-19–22, FR-16, NFR-1, §9.2 mục 6 and §5.0 correctly.
- Minor gaps are logged as L3 and L5.

### 12. Routing by session status: PASS
- FR-4 (prd:255): "**tiếp tục** buổi (FR-10) nếu buổi chưa ở trạng thái `done`; bản xem lại chỉ đọc (FR-40) chỉ khi buổi đã `done`".
- FR-42 (prd:338) defers to FR-4.
- Màn 1 (prd:84) uses "Tiếp tục buổi luyện" for an unfinished session and "Xem lại kết quả" for a finished one.
- §9.2 mục 10 (prd:413) tests `interviewing`, `revealed` and `replaying`.

### 13. Turn 0 rule: PASS
It is consistent across §5.1 (prd:161), §6.1 (prd:214), FR-7 (prd:260), §9.2 mục 4 (prd:392), addendum §2 (add:56–57) and §4 (add:142). All say: no LLM call, no hook, not counted in the 30, and not a valid `grounded_turn_id`.

### 14. Label names: PASS
- Only `confirm_grounded`, `boundary_probe`, `open` and `leading` appear.
- A grep for `leading/`, `confirm-grounded` and `boundary-probe` finds no hits in either file.
- "assumption" appears only in the addendum §7 history row (add:282), describing the forge rule.

### 15. Addendum supersession header: PASS
- add:11: "PRD và addendum này thay `brief.md`, addendum của brief (2026-09-22) và `forged-idea.md` ở **mọi** điểm khác nhau". It then lists the superseded brief-addendum sections.
- See L2 for a small scope mismatch with the PRD header.

---

## Part B: Other findings

### Medium

**M1. The demo exemption from FR-5 has no UI path to start a second session (FR-4, FR-5, FR-45, §9.4)**
- Location: prd:255 (FR-4), prd:256 (FR-5), prd:449–456 (§9.4).
- The problem: FR-4 routes the home button to resume or review whenever the account already has a session for the scenario. A demo account that has been seeded ("seed vài buổi cho buổi tập và dự phòng") therefore always lands on an existing session.
- The demo plan's step "Chạy live khoảng 5 lượt" needs a fresh session. The FR-5 exemption allows one, but no screen or FR provides the button.
- FR-4 also does not say which session opens when a demo account has several sessions of the same scenario.
- Fix: append to FR-4:
  > Với tài khoản demo (FR-45), trang chủ luôn có thêm nút "Bắt đầu buổi mới"; nút chính dẫn tới buổi gần nhất của kịch bản.

**M2. NFR-14 lost two copy rules that appear nowhere else (lost content)**
- Location: prd:361 (NFR-14). HEAD NFR-14 had:
  - "Dùng ngôn ngữ của nỗi sợ và của việc sửa kịp."
  - "Không dùng tone mềm để chiều lòng người mới."
  - the rationale "(dễ hiểu nhầm là phỏng vấn xin việc)".
- A grep of both files for "nỗi sợ", "tone mềm" and "xin việc" finds nothing. Nothing in addendum §7/§8 records these as cut. The headline change covers the "tự tin" promise but not the tone rule.
- Fix: in NFR-14, after "không dùng chữ 'feedback';", insert:
  > dùng ngôn ngữ của nỗi sợ và của việc sửa kịp, không dùng tone mềm để chiều lòng người mới;

**M3. Some `leading` turns have no guide pattern (addendum §3.3)**
- Location: add:129 and add:134.
- The "Lỗi dẫn dắt" row picks "pattern của kịch bản cho `question_type` của lượt đó", but patterns are declared only for `closed`, `hypothetical_future` and `other`.
- A `leading` turn with `question_type` `open` (e.g. "Chị kể em nghe vì sao app nào cũng phiền?") or `past_specific` has no "Hãy hỏi" pattern, so the pair cannot render.
- Fix (add:134):
  > Pattern guide trong kịch bản được khai báo theo `question_type` (`closed`, `hypothetical_future`, `other`); lượt `leading` thuộc loại khác (`open`, `past_specific`) dùng pattern của `other`. Mọi pattern phải qua trách nhiệm duyệt có tên.

### Low

**L1. Two FR groups both say they are placed last (prd:334, prd:342)**
- "Buổi của tôi" says "ID được giữ nguyên nên đứng cuối", but "Vận hành: trace và demo" follows it with "ID được giữ nguyên nên nhóm đứng cuối". A grader will notice.
- Fix (prd:334): `Nhóm này thuộc luồng người học; ID được giữ nguyên nên nhóm đứng sau các nhóm vận hành.`

**L2. The two headers claim different supersession scope, and some addendum §-refs are ambiguous (prd:10, add:11)**
- PRD:10 says it replaces "các nguồn trên", which includes `research.md` and `brainstorm-intent.md`. Add:11 names only `brief.md`, the brief addendum and `forged-idea.md`. Superseding research evidence was probably not intended.
- In add:11, "§3 (lịch → §6)" and "mệnh đề lời khen ở §6" mix brief-addendum section numbers with this addendum's own numbers.
- Fix (prd:10): `**PRD này và \`addendum.md\` cùng thư mục thay \`brief.md\`, addendum của brief và \`forged-idea.md\` ở mọi điểm khác nhau**`.
- Fix (add:11): write "§3 của brief addendum (lịch → addendum này §6)" and "mệnh đề lời khen ở §6 của brief addendum".

**L3. The "Nếu cắt #3" block misses one dependent PRD statement (add:225–231 vs prd:484)**
- The §10 risk "Phán đoán của Call 1" lists the mitigation "verifier kiểm lại nhãn `leading` trước khi hiện". That mitigation disappears under cut #3.
- Fix: add a bullet to add:231:
  > **PRD §10 rủi ro "Phán đoán của Call 1":** bỏ giảm nhẹ "verifier kiểm lại nhãn `leading` trước khi hiện"; chỉ còn kiểm `introduced_content` bằng code.

**L4. The `grounded_turn_id` bound is off by one (add:56)**
- "lớn hơn chỉ số lượt hiện tại" lets the current turn through, and the current turn has no persona reply yet when Call 1 runs.
- Fix: `…hoặc bằng hoặc lớn hơn chỉ số lượt hiện tại → hạ nhãn thành \`open\``.

**L5. The gate test for `leading` does not name turn 0 (prd:393)**
- Add:57 says "kể cả lượt 0", but the test bullet omits it, so a test could skip it.
- Fix: `…hoặc có trong lời persona trước đó (kể cả lời mở đầu ở lượt 0) bị hạ thành \`open\`, openness không bị trừ;`

**L6. The "Grounding bịa" risk misattributes the effect (prd:485)**
- Surface and past-specific unlocks never need `grounded_turn_id`; "không dẫn dắt" is enough, and `open` qualifies. A fabricated grounding only inflates openness (+1/+2 instead of ±0), which can bring a trust item forward.
- Fix:
  > **Grounding bịa:** một `grounded_turn_id` bịa (trỏ tới lượt persona có thật bất kỳ) làm openness tăng như câu tốt, nên có thể mở sớm item tin tưởng. Follow-up vẫn được bảo vệ vì phải đúng lượt đã thả hook.

**L7. Minor content dropped since HEAD and absent from both files (lost content, confirm it was deliberate)**
- Next: "kịch bản BA/PM (sàn 8 item), kèm câu hỏi vai trò ở onboarding" (HEAD Next line). Current prd:40 has neither.
- Open question "Ai trả tiền?": "(người trả không thấy kết quả của người học)" (a privacy stance for B2B2C), "gắn ngày phỏng vấn thật", and "Brief đề xuất thử B2C và B2B2C song song".
- Open question "quay lại": the candidate "lộ trình nhắm thói quen xấu".
- Assumptions: #4 "trước khi chốt copy"; #5 "số buổi mỗi người".
- Fix (if not deliberate), prd:504: `- B2B2C qua giảng viên hoặc trung tâm (người trả không thấy kết quả của người học);`. Restore "(sàn 8 item)" after "kịch bản BA/PM" at prd:40.

**L8. FR-38 overclaims (prd:324)**
- It says the events are "đủ để tính mọi chỉ số ở §9.3". SM-C2, SM-C3 and SM-C5 come from stored data (`turn.flagged`, `verifier_json`, the cost log), not from the listed events.
- Fix: `Hệ thống ghi các sự kiện sau; cùng dữ liệu đã lưu (turn, \`verifier_json\`, log chi phí), đủ để tính mọi chỉ số ở §9.3 …`

**L9. "Mọi nhãn phải có bằng chứng" is too broad (prd:176)**
- `open` needs no evidence.
- Fix: `**Nhãn tốt và nhãn \`leading\` phải có bằng chứng**, nếu không bị hạ thành \`open\` …`

---

## Structure and prose pass (prd.md)
- **Tables:** all tables render: §3 scope, consequences, §5.0, §9.1, §9.3, §10 assumptions.
- **Numbering:** contiguous for FR-1..45, NFR-1..14, SM-1..7, SM-C1..7, §9.2 items 1–12, UJ-1 screens 1–9 and the 11 MVP items.
- **UJ-1 counts:** 3 + 7 + 1 = 11. Fork after turn 5, re-ask turn 6, show turns 4–5. All consistent.
- **Sentences:** no garbled sentences found.
- **Duplication:** the "1 vs 2 kịch bản" consequence appears as a pointer at prd:59 and add:215 and is stated once at prd:375. That is acceptable.
- **Remaining stumbling points:** L1 (two "đứng cuối" notes) and the two UJ-1 example defects under items 5 and 6.
