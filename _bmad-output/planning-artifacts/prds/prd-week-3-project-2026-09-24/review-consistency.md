---
title: 'Consistency review: InterviewLab PRD + addendum (post party-mode / advanced-elicitation / first-principles rounds)'
reviewed: '2026-09-25'
scope: 'prd.md, addendum.md (uncommitted working copy vs HEAD 18b3654)'
mode: read-only, adversarial
---

# Consistency review

Verdict: the schedule table itself adds up (16.0 verified), but the edits did not reach every place that depended on them. One risk paragraph still carries the pre-first-principles numbers. The M4 change (1 scenario = no library) breaks several requirements that still assume a scenario card or Screen 9. The seed-demo flow conflicts with Google-only login. The FR-35 replacement is named but never defined.

Counts: critical 0 · high 3 · medium 10 · low 6

Line numbers refer to the current working copy.

---

## HIGH

### H1. PRD §11 "Lịch" risk still quotes the pre-first-principles schedule
- **Location:** prd.md:492
- **Quote:** "Phần cam kết là ~16,6 ngày, vượt mốc ~0,6 ngày; … Cắt #2 và #3 bù được ~0,75 ngày, nên nếu mọi ước tính đúng, **cả hai cắt đều có khả năng xảy ra**, và buffer còn lại chỉ ~0,15 ngày"
- **What's wrong:** This is the intermediate number from before the first-principles savings. Current state: committed = 16.0 (addendum:164, table re-adds to 16.0), PRD §3 line 53 says "~16,0 ngày", and addendum:176 says the verifier is cut only on a slip greater than ~0.25 day. The risk section tells the reader both cuts are likely to happen. The rest of the document says neither is pre-planned (addendum:142: "Không cắt trước"). A PM reading §11 will get the wrong go/no-go picture.
- **Fix:** Rewrite: "Phần cam kết ~16,0 ngày = mốc (15,75 nếu FR-35/36 tiết kiệm mức cao); không có ngày dư. Trễ ≤0,25 ngày → cắt #2; trễ hơn → cắt #3 (addendum §6)."

### H2. `seed-demo` creates accounts nobody can log into (Google-only auth)
- **Location:** prd.md:371 (FR-45), prd.md:461, prd.md:456 (§10 item 12) vs prd.md:282 (FR-2), prd.md:76
- **Quote:** FR-45 "chạy … vào một tài khoản demo mới … Chạy nhiều lần được, mỗi lần một tài khoản mới"; FR-2 "người học phải đăng nhập bằng Google. MVP không có phân quyền và không có magic link."
- **What's wrong:** Magic link was cut, so every account is a Google identity. A CLI cannot create a new Google account on each run. Nothing says how the demo operator signs in as the seeded account to run the replay live. The demo-day plan depends on exactly that step (checklist line 460–461). There is also no account/user entity in the addendum §4 data model to carry a "demo" flag, and FR-37's reserved demo cap needs one.
- **Fix:** Specify one of these. (a) `seed-demo <google-email>` attaches a new seeded session to an existing Google account and gives it a separate FR-5 allowance (e.g. `is_demo` sessions do not count toward FR-5). (b) Add a demo-only login path, and say how it is protected in production. Add `user(id, google_sub, is_demo)` to addendum §4.

### H3. Screen 9 says "Sắp có" in three places and "no card at all" in a fourth
- **Location:** prd.md:56 (cut #1), addendum:182 (cut table #1), addendum:174 (tripwire) vs prd.md:133 (Màn 9)
- **Quote:** prd:56 "Màn 9 ghi rõ 'Sắp có'"; addendum:174 "Không đạt thì Màn 9 ghi 'Sắp có'"; prd:133 "Màn 9: Sau buổi (chỉ có khi thư viện có ≥2 kịch bản) … Nếu chỉ có 1 kịch bản (cắt #1, §3), không có thẻ nào; chỉ còn dòng waitlist."
- **What's wrong:** After M4, Screen 9 does not exist with a single scenario. So the fallback for cut #1 and a failed tripwire cannot be a Screen 9 "Sắp có" state. An implementer cannot tell whether to build a "Sắp có" teaser. It is also unbudgeted: addendum:155 says Screen 9 is not built in the committed plan.
- **Fix:** Pick one. Either drop "Màn 9 ghi 'Sắp có'" from prd:56, addendum:174 and addendum:182 (the waitlist line alone), or define a "Sắp có" line inside Màn 6 item 6 and budget it.

---

## MEDIUM

### M1. The old-tripwire arithmetic is stale (it sums to 15.5, not 16.0)
- **Location:** addendum:174
- **Quote:** "phần đó chỉ khoảng 9,75 ngày việc, để lại 5,75 ngày việc cho 5 ngày còn lại"
- **What's wrong:** 9.75 + 5.75 = 15.5. The committed total is now 16.0. From the current table, "engine done + scenario-1 eval passes" is about 10.35 (schema 2 + tuning 0.5 + engine 3 + closing hook 0.1 + eval 2.75 + baseline 0.25 + test set 1 + party-mode fixes 0.75), which leaves about 5.65. The conclusion (the old tripwire can pass while behind schedule) still holds, but the numbers are left over from an earlier total. The new-tripwire arithmetic (16 − 11 − 1 = 4; about 12 days done after 11) is correct.
- **Fix:** Recompute from the current table, or state which rows make up the "engine + eval" subtotal.

### M2. The second scenario is budgeted at +1, but the library screen and Screen 9 were removed from the committed plan
- **Location:** addendum:155, addendum:165, addendum:174
- **Quote:** addendum:155 "màn thư viện và Màn 9 chỉ có khi ≥2 kịch bản, nên chưa dựng trong phần cam kết 1 kịch bản"; addendum:165 "Kịch bản thứ hai (chỉ khi đạt tripwire) | +1"; tripwire "(16 − 11 − 1 ngày cho kịch bản thứ hai)"
- **What's wrong:** Passing the tripwire now also means building Screen 2, Screen 9 and FR-31 (the 0.1 returned by first principles). So the second-scenario cost is ~1.1, not 1, and the tripwire threshold should be ≤3.9. It is a small amount, but it is the same double-count pattern the addendum itself corrects at line 176.
- **Fix:** "+1,1 (kịch bản + thư viện + Màn 9)" and adjust the tripwire, or state explicitly that the 0.1 is absorbed.

### M3. Scenario-card behaviour (FR-5, FR-42, cut #2) assumes a library that no longer exists
- **Location:** prd.md:287 (FR-5), prd.md:363 (FR-42), prd.md:57 (cut #2)
- **Quote:** FR-5 "Sau đó thẻ chuyển sang 'Xem lại kết quả'"; FR-42 "Thẻ kịch bản ở trạng thái 'Đã luyện · Xem lại kết quả' dẫn thẳng tới bản xem lại"; cut #2 "buổi cũ hơn chỉ còn qua thẻ kịch bản hoặc bản PDF"
- **What's wrong:** With 1 scenario (the committed plan) there is no card: FR-4 and Màn 1 route the home CTA instead. The cut #2 consequence is also self-contradictory given the cut order. Cut #1 happens first, so each learner has exactly one session. "Buổi gần nhất" is then that session, there are no "older sessions", and there is no card to reach them through.
- **Fix:** FR-5/FR-42 should say "thẻ (khi có thư viện) hoặc nút ở trang chủ (FR-4)". Rewrite the cut #2 consequence: with 1 scenario the cut costs almost nothing; with 2 scenarios the older session is reachable through its library card.

### M4. The home CTA and "bản xem lại" route non-finished sessions into the read-only view
- **Location:** prd.md:97 (Màn 1), prd.md:286 (FR-4) vs prd.md:294 (FR-10), prd.md:361 (FR-40), prd.md:362 (FR-41)
- **Quote:** FR-4 "hoặc tới bản xem lại nếu người học đã luyện nó"; Màn 1 "nếu Linh đã luyện kịch bản đó, nút thành 'Xem lại kết quả' và mở bản xem lại"
- **What's wrong:** "Đã luyện" is undefined against the status enum `interviewing|revealed|replaying|done` (addendum:112). The read-only review exists only for finished sessions (FR-40), and FR-41 says nothing stays sealed there. If a learner in `interviewing`/`revealed`/`replaying` lands on the read-only review, it either leaks the sealed target item (violating the replay design) or shows a half-built page. FR-10 resume has no entry point in the single-scenario flow other than FR-39's list, and that list is itself cut #2.
- **Fix:** In FR-4: status `done` → review; any other status → resume per FR-10 (CTA "Tiếp tục buổi luyện"). Also define where resume lives after cut #2 ("Buổi gần nhất" resumes rather than always opening the review).

### M5. §10 item 2 still gates launch on FR-35/36, which are now Next
- **Location:** prd.md:426
- **Quote:** "**Kịch bản** (FR-33–36): … persona nói đúng cụm neo khi được yêu cầu ≥95% (cổng publish)"
- **What's wrong:** FR-35 and FR-36 are marked "(Next …)" at prd:349–350. With FR-35 deferred, "cổng publish" no longer exists as a mechanism. The acceptance criterion cites deferred requirements.
- **Fix:** Change to "(FR-33, FR-34, trách nhiệm duyệt có tên)" and "≥95% (ngưỡng Thanh xác nhận trước `publish`)".

### M6. The FR-35 replacement is claimed but never defined; the named responsibility covers only FR-36
- **Location:** prd.md:81, prd.md:46 vs prd.md:333
- **Quote:** prd:81 "Không có máy nào chặn một kịch bản fail ngưỡng hay một câu soạn sẵn vi phạm ranh giới đạo đức. Thay bằng trách nhiệm duyệt thủ công có tên của Thanh (§7)"; prd:333 "**Trách nhiệm có tên (thay FR-36 trong MVP):** … duyệt thủ công từng chuỗi theo hai tiêu chí của FR-36"
- **What's wrong:** The §7 block covers only string review (FR-36). Nothing assigns responsibility for "every eval threshold passed before `publish`" (FR-35). That requirement exists only as narrative in UJ-2 step 3 (prd:155). FR-4 then relies on it: "đã pass eval và được duyệt, §7".
- **Fix:** Extend the named-responsibility block: "(thay FR-35 và FR-36) … Thanh xác nhận mọi ngưỡng của §10 mục 2 trong báo cáo eval trước khi chạy `publish`, và ghi xác nhận vào báo cáo."

### M7. Grounded praise (FR-20) has no place in the new reveal layout, and FR-28 excludes it
- **Location:** prd.md:308 (FR-20) vs prd.md:118–121 (Màn 6 item 5), prd.md:323 (FR-28)
- **Quote:** FR-20 "nhận xét có ít nhất một lời khen có căn cứ"; Màn 6 item 5 "(đây là guide … phần nhận xét cách hỏi và guide là một) … Mỗi nhận xét là một cặp: … 'Thay vì hỏi' … 'Hãy hỏi'"; FR-28 "Guide … chỉ gồm … câu dẫn dắt nguyên văn của người học ghép với pattern …; thẻ thói quen"
- **What's wrong:** After M2 the comments section and the guide are one section. By FR-28 and Màn 6 that section can hold only leading-quote/pattern pairs plus the habit card. Praise does not fit that form, nor do comments that have no leading quote (e.g. ignored hooks, closed questions). It is also unclear whether praise and the habit card count toward "tối đa 3". FR-20 is now unplaceable as written, and the schedule row (addendum:152) still budgets "nhận xét … kèm lời khen".
- **Fix:** State the composition explicitly, e.g. "≤3 nhận xét (gồm lời khen nếu có) + thẻ thói quen không tính vào 3; lời khen hiện trên màn nhưng không vào bản in". Relax FR-28 so it allows non-pair comments, or state that every comment type maps to a pattern.

### M8. Turn 0 (`opening_line`) is undefined against the turn model and grounding rules
- **Location:** prd.md:179, prd.md:291 (FR-7), prd.md:245, addendum:111, addendum:52, addendum:211, prd.md:430
- **Quote:** prd:179 "Lượt: một câu của người học cộng một câu trả lời của persona. Lượt đánh số từ 1"; FR-7 "hiện như lời persona ở lượt 0"; addendum:211 "lượt 1 không thể grounded"
- **What's wrong:** It is unclear whether turn 0 is a `turn` row with null `learner_text`, and whether it counts as "một lượt persona có thật" for `grounded_turn_id` (addendum:52). If it counts, a turn-1 question can be grounded on the opening line, which contradicts addendum:211's justification for starting openness at 4. It also changes §10 item 4's "Câu hỏi mở ở lượt 1 nhận nhãn open". Snapshot 0 is defined as the scenario's initial state, but the transcript pointer is not.
- **Fix:** Add one rule: "Lượt 0 lưu thành `turn(index=0, learner_text=null)`; không phải đích hợp lệ của `grounded_turn_id`" (or the opposite, with addendum:211 updated to match).

### M9. The `seed-demo` outcome is non-deterministic, but demo-day and §10 item 12 assume a primary replay candidate
- **Location:** prd.md:371 (FR-45), prd.md:456, prd.md:459–461
- **Quote:** FR-45 "chạy một transcript soạn sẵn qua **engine thật** (call thật)"; checklist "cố ý bỏ qua một hook để buổi rơi vào đường replay chính"
- **What's wrong:** A hook counts as dropped only if the real Call 2 output contains the anchor (FR-14). With real calls, a replayed script can miss the anchor, so there is no ignored hook and the session falls back to fallback 1 or 2. The "Bạn đoán 7. Thực tế: 3" opening also needs a stored `guess`, which FR-45 does not seed. Nothing checks that the seeded session actually has a primary candidate.
- **Fix:** FR-45 should fail loudly (non-zero exit, and print the chosen replay moment and fallback level) unless the resulting branch has `fallback_level = primary`. It should take a `--guess` value. §10 item 12 should assert primary-candidate selection.

### M10. Cut #2 has no rewrite block, unlike cut #3
- **Location:** prd.md:57 vs prd.md:449–454 (§10 item 10), prd.md:363 (FR-42), prd.md:135–141 (Màn 10)
- **Quote:** cut #2 "bỏ trang danh sách (FR-39) và trạng thái trống (FR-43)"; §10 item 10 "(FR-39–43) … Danh sách hiện đúng số … Người học mới thấy trạng thái trống"
- **What's wrong:** If cut #2 fires, two §10 bullets become untestable, FR-42's header link target changes, and FR-10 resume loses its list entry point (see M4). The document pre-writes the rewrite for cut #3 (prd:62–67) but not for cut #2, which is the cut more likely to fire first.
- **Fix:** Add a "Nếu cắt #2" block covering FR-42, FR-10's entry point, and §10 item 10's replacement bullets.

---

## LOW

### L1. Stale justification in addendum §7: it cites the authoring-time verifier that moved to Next
- **Location:** addendum:221
- **Quote:** "Template dựng từ ledger không tốn call, không bịa được, và verifier chạy một lần lúc soạn kịch bản"
- **Fix:** Replace with "…và chuỗi cố định đã duyệt thủ công (PRD §7, trách nhiệm có tên)".

### L2. §5.0 lists "kiểm cuối buổi" as a current self-check, but it exists only if cut #3 fires
- **Location:** prd.md:169
- **Quote:** "Tự kiểm tra | … verifier ở màn reveal; kiểm cuối buổi"
- **What's wrong:** In the base plan the verifier checks the last persona turn (§5.3). The end-of-session call exists only under cut #3, where it replaces the verifier. The list overclaims one self-check leg.
- **Fix:** "verifier ở màn reveal (hoặc call kiểm cuối buổi nếu cắt #3)".

### L3. The §5.0 source reference points to the wrong section of brainstorm-intent.md
- **Location:** prd.md:161
- **Quote:** "(`brainstorm-intent.md` mục 7)"
- **What's wrong:** In `_bmad-output/brainstorming/brainstorm-ai-user-interview-practice-2026-09-22/brainstorm-intent.md`, "## 7" is "Câu hỏi mở". The five agent attributes are in §2 "Ràng buộc đã chốt", item 7 (line 21).
- **Fix:** "mục 2, ràng buộc 7".

### L4. The cut #2 consequence cites content that Screen 10 does not contain
- **Location:** prd.md:57, addendum:183
- **Quote:** "cách Linh dùng ở Màn 10 (đọc lại guide trước buổi thật thứ 3 và thứ 5)"
- **What's wrong:** Màn 10 (prd:135) says "trước buổi phỏng vấn thật đầu tiên". The 3rd and 5th real interviews are not mentioned anywhere in UJ-1, and HEAD never had them either.
- **Fix:** Add that usage to Màn 10, or reword to "đọc lại trước các buổi thật tiếp theo".

### L5. The FR-38 event "mở guide" (and assumption #10's "lượt mở guide") has no definition now that the guide is not a screen
- **Location:** prd.md:354, prd.md:479
- **What's wrong:** No screen transition exists to log. Candidates are scrolling section 5 into view, a click on "Tải về", or opening it from review. Without a definition, assumption #10 is unmeasurable.
- **Fix:** Define it, e.g. "mục 5 vào viewport ≥2 giây, hoặc bấm 'Tải về'", and log print separately.

### L6. Label spelling drifts between the PRD and the addendum's JSON contract
- **Location:** prd.md:193–196, prd.md:350 vs addendum:13, addendum:42
- **Quote:** PRD `confirm-grounded`, `boundary-probe`, `leading/assumption`; addendum JSON `confirm_grounded`, `boundary_probe`, `leading`
- **What's wrong:** The addendum JSON is the machine contract. FR-36 and the §5.1 text use hyphenated names and `leading/assumption`, so an implementer writing validators or test fixtures from the PRD will produce values that do not match the enum.
- **Fix:** Add one line in PRD §5.1: "tên trong dữ liệu: `confirm_grounded`, `boundary_probe`, `open`, `leading`".

---

## Checked and consistent (no finding)
- The addendum §6 table re-adds to exactly **16,0**. The 15,75 variant and the buffer statement (≤0,25 day slip absorbed by cut #2; ≤0,5 at the high-savings end) check out. The new tripwire arithmetic (16 − 11 − 1 = 4; about 12 days done by end of day 11) checks out.
- The cut order #1 second scenario / #2 "Buổi gần nhất" / #3 verifier is consistent across PRD §2 row 34, §3 (lines 51, 56–58), addendum:176, addendum:180–184 and addendum §7:234.
- The "Nếu cắt #3" block (FR-20/21/22, NFR-1, §10 item 6) matches FR-16, §5.3 line 237 and addendum:184.
- Openness starts at 4 everywhere (prd:200, prd:433, addendum:74, addendum:211); nothing still says 3.
- Reveal order is identical in Màn 6, FR-19/20 and addendum:231.
- The `revealed` status exists in the addendum §4 enum, so the FR-45 target state is valid.
- NFR-7 hard gate vs the reported ≥85% is consistent in NFR-7, §10 item 7 and the addendum day-13 milestone.
- All §5.0 table references (§6.1, §6.2, §10 items 3/4/5, NFR-5, NFR-10, FR-14/16/22/34/44, addendum §7 row 1) resolve. Bare "§7" in the PRD always means PRD §7 (FRs); the addendum qualifies it as "PRD §7". No ambiguous uses found.
