---
title: 'Addendum PRD: InterviewLab'
created: '2026-09-24'
updated: '2026-10-02'
---

# Addendum cho PRD

Tài liệu này chứa phần kỹ thuật, phương án đã cân nhắc, ước tính và lịch sử thay đổi, dành cho bước kiến trúc và lập kế hoạch. PRD chỉ giữ phần năng lực.

**Thứ tự ưu tiên:** PRD và addendum này thay `brief.md`, addendum của brief (2026-09-22), `forged-idea.md` gốc và forge ghi chú (`forge/notes-panel-vs-guess-slider/forged-idea.md`) ở **mọi** điểm khác nhau. Forge ghi chú được áp nguyên vẹn, trừ một lựa chọn hiện thực để reveal giữ 3 call (§7 vòng 2). Lý do từng thay đổi: §7; lịch sử: §8.

## Thuật ngữ

Khái niệm gốc (item, hook, do-not-assert, openness, ledger, KHAI THÁC, NHẬN BIẾT, ứng viên chính, dự phòng 1/2, lượt *l*) ở PRD §8.1 và §9.2. Mục này chỉ thêm định nghĩa vận hành.

- **Nhãn tốt:** `confirm_grounded` hoặc `boundary_probe`. **Không dẫn dắt:** nhãn tốt hoặc `open`.
- **Verdict:** phán đoán về một lượt persona (hook được chọn đã thả chưa, item đã mở nào đã kể, do-not-assert nào bị vi phạm), do một call **khác** với call đã viết lượt đó đưa ra.
- **Vòng đời hook:** được chọn → *đã thả* (verdict dương) → *đã nhặt*, hoặc *đóng* khi item của nó mở. Hook đã thả **còn nhặt được** tới khi đóng; một lần nhặt không mở được item không làm hook mất khả năng được nhặt.
- **Token:** mỗi câu được lưu kèm mảng token tách theo khoảng trắng, đánh số từ 0; mọi trích dẫn đoạn là `[start, end]` trên mảng này, code cắt theo chỉ số.
- **Snapshot t−1:** trạng thái đã lưu sau lượt trước (§4).
- **Tên gọi:** persona = kịch bản = một dòng `scenario` (phiên bản), gom theo `persona_id` ổn định; chủ đề tự tạo = `topic(kind=custom)`.
- **Niêm phong:** mọi phần reveal nhắc tới item mục tiêu của replay (hoặc lượt *l* ở dự phòng 1) được lưu với cờ `sealed` và chỉ gửi về trình duyệt sau khi replay kết thúc. Khác với "bộ đếm niêm phong" (tổng số item, hiện suốt buổi).
- **topic trong "dò bản đồ topic", "topic còn khóa":** topic tag của item, không phải bảng `topic` (chủ đề).

## 1. Luồng xử lý

**Một lượt buổi chính** (2 call, tuần tự vì context của Call 2 phụ thuộc vào kết quả mở khóa):
1. **Call 1** phân tích câu người học và phán đoán lượt persona trước (§2).
2. **Code** ghi verdict vào lượt trước, rồi kiểm output của Call 1 (§2).
3. **Luật mở khóa** chạy trên snapshot t−1 (§3.1).
4. **Cập nhật** openness và ledger, **chọn hook** thả ở lượt này (§3.2).
5. **Call 2** sinh câu trả lời persona (§2).
6. **Ghi lượt**: câu và token, phân tích, verdict lượt trước, snapshot, trong một transaction (§4).

**Kết thúc buổi:** (0) code chọn khoảnh khắc replay (PRD §9.2); (1) canvas đóng băng; (2) worker chạy tuần tự judge cuối buổi → generator → verifier trong khi Màn 5 hiện; kết quả lưu vào buổi.

**Một lượt replay:** như buổi chính, cộng judge replay ngay sau Call 2 (3 call). Ở replay, verdict lấy từ judge replay; `prev_turn_verdict` trong output Call 1 bị bỏ qua.

**Chủ đề tự tạo:** trong request: kiểm duyệt và phân loại trọng tâm (một call) → nếu qua: tạo `topic(kind=custom)` (lần thử đầu) và `session` `generating`, giữ trước chi phí tối đa trong ngân sách sinh. Trên worker (ưu tiên cao hơn eval Console; thứ tự bên dưới): generator kịch bản → `validate` → kiểm an toàn đầu ra → eval rút gọn (7 run song song, mỗi run ≤10 lượt) → `interviewing` hoặc `failed_eval`; trả lại phần ngân sách giữ thừa. Quá 10 phút (hết thời gian chờ) → `failed_eval` mã `system_error`.

**Ưu tiên worker và quota LLM:** lượt đang chạy > reveal > sinh chủ đề > eval Console.

## 2. Hợp đồng các call

Mỗi call theo cùng thứ tự: Input → Không nhận → Output → Code kiểm / Xử lý.

### 2.1 Call 1 (phân tích)
- **Input:** danh tính, fact bề mặt, nội dung item đã mở, hook line đã thả (kèm ID), hook line được chọn ở lượt persona trước (kèm ID, để phán đoán đã thả chưa), topic tag của mọi item, ràng buộc do-not-assert trung tính (kèm ID), transcript dạng token, câu mới của người học (bọc như dữ liệu).
- **Không nhận:** nội dung item còn khóa, đường mở, ngưỡng, trọng số, canvas.
- **Output JSON:**

```json
{
  "prev_turn_verdict": {
    "hook_dropped": true,
    "disclosed_item_ids": ["I4"],
    "violations": ["DNA-7"]
  },
  "question_type": "open | closed | hypothetical_future | past_specific | other",
  "label": "confirm_grounded | boundary_probe | open | leading",
  "grounded_turn_id": 5,
  "introduced_span": [4, 8],
  "hook_id": "H3",
  "topic_tags": ["subscription"]
}
```

- **Code kiểm (không tốn LLM)**, theo thứ tự:
  - Ghi `prev_turn_verdict` vào lượt t−1: `hook_dropped` chỉ có nghĩa nếu lượt đó có hook được chọn; `disclosed_item_ids` chỉ giữ item đã mở mà chưa kể; violation ID không có trong kịch bản thì bỏ. Có violation → gắn cờ lượt và ghi log.
  - Nhãn tốt mà `grounded_turn_id` null, 0, không phải lượt persona, hoặc ≥ lượt hiện tại → `open`.
  - Nhãn `leading` mà `introduced_span` null, rỗng, hoặc ngoài phạm vi token của câu người học → `open`. Cụm hiện ra là đúng các token được cắt, nên luôn nguyên văn. Tính mới ("persona chưa từng nói ý này") do verifier kiểm ở reveal.
  - `hook_id` không trỏ tới một hook vừa đã thả (sau khi ghi verdict) vừa còn nhặt được → null.
  - Tag không có trong kịch bản → bỏ; nhiều hơn 1 → giữ tag đầu.

### 2.2 Call 2 (persona)
- **Input:** danh tính, fact bề mặt, transcript, openness theo 3 mức; luật giọng cố định (nói thoải mái, lan man được về fact bề mặt và đời sống); item đã mở (vừa mở: "nói ra điều này ngay trong câu trả lời này"; mở từ trước mà chưa kể: "nói ra khi phù hợp"); tối đa 1 hook line cần thả; do-not-assert của topic tag đã qua kiểm ở lượt này (chỉ khi item của tag vẫn khóa sau quyết định mở khóa); một luật chung: tránh mọi chủ đề được dặn tránh.
- **Không nhận:** danh sách do-not-assert của mọi item khóa, canvas, số đoán.
- **Output:** chỉ câu trả lời.

### 2.3 Judge cuối buổi (reveal call 1)
- **Input:** transcript nhánh chính dạng token; hook được chọn ở lượt persona cuối; item đã mở (nội dung) và item đã lộ; **nội dung mọi item** (buổi đã kết thúc, không còn gì để rò); fact bề mặt; ràng buộc do-not-assert; canvas đóng băng dạng token, bọc như dữ liệu.
- **Output:** `last_turn_verdict` (như `prev_turn_verdict`); `canvas_matches: [{range: [s,e], kind: "item" | "never_said", item_id?, reason}]`.
- **Code kiểm:** cắt range, bỏ range hỏng, gộp item trùng, rồi tính kết quả theo PRD §8.1 (item đã kể / chỉ đã lộ / chưa từng lộ); đoạn chỉ khớp fact bề mặt tính là không có match. Trường `reason` chỉ lưu nội bộ (trace, Console); câu hiện cho người học lấy từ tập chuỗi cố định FR-48a.

### 2.4 Generator (reveal call 2)
- **Input:** ID item mục tiêu của replay (hoặc lượt *l* ở dự phòng 1; *l* là lượt `leading` sớm nhất, PRD §9.2) kèm chỉ dẫn "đang niêm phong, không viết gì về nó". Input còn gồm: dữ liệu reveal đã tính (ledger, lượt `leading` kèm cụm, lượt nhãn tốt, item bỏ lỡ, kết quả canvas), luật chọn nhận xét (§3.3), trọng tâm luyện nếu là chủ đề tự tạo, pattern theo loại lỗi của kịch bản làm ví dụ.
- **Không nhận:** nội dung, câu hỏi mẫu hay hook line của item mục tiêu, để không claim nào diễn đạt lại được nó.
- **Output:** `claims: [{claim_id, kind: "praise" | "comment" | "habit", text, cited_turns, item_id?, canvas_range?, suggested_question?}]`, tối đa 3 `praise`/`comment` cộng 1 `habit`.
- **Code kiểm:** resolve mọi tham chiếu; tham chiếu hỏng thì bỏ claim. Claim được lưu với cờ `sealed` và chỉ gửi về trình duyệt sau khi replay kết thúc (PRD Màn 6) nếu: có `item_id` là item mục tiêu; trích lượt thả hook của item mục tiêu; hoặc (dự phòng 1) trích lượt *l*.

### 2.5 Verifier (reveal call 3)
- **Input:** transcript đã đóng băng; claim cần kiểm, mỗi claim có `claim_id`, `kind` (`unlock` | `disclosure` | `leading_novelty` | `hook_ignored` | `praise` | `comment` | `habit` | `suggested_question`), lượt hoặc range được trích, và dữ liệu liên quan.
- **Output:** `{"claims": [{"claim_id", "verdict": "agree | disagree", "reason", "label?"}]}`; với `suggested_question`, `label` là nhãn câu hỏi.
- **Ý nghĩa của disagree:** `unlock` = nhãn hoặc loại câu hỏi không thỏa luật đường mở; `disclosure` = lượt không kể item; `leading_novelty` = persona đã nói ý đó; `hook_ignored` = lượt sau thực ra có hỏi tiếp; claim của generator = lượt không chứa điều được nói, hoặc claim khẳng định về người dùng thật. `suggested_question` có `label = leading` → loại.
- **Xử lý:** `unlock` và `disclosure` bị bác chỉ được tính vào chỉ số NFR-8 (người học vẫn giữ tín dụng); mọi loại khác bị bác thì không hiện. Kết quả `hook_ignored` của khoảnh khắc replay quyết định câu chữ của dòng chẩn đoán (PRD Màn 6 mục 2), không đổi khoảnh khắc.

### 2.6 Judge replay
- **Input:** như Call 1 nhưng không có câu người học mới.
- **Output:** `prev_turn_verdict` cho lượt replay vừa xong; ở dự phòng 1 thêm nhãn và cụm người học tự thêm (`introduced_span`) của câu người học, để chọn chuỗi kết quả ở PRD Màn 7.
- **Xử lý:** đây là nguồn verdict duy nhất của lượt replay.

### 2.7 Kiểm duyệt và phân loại trọng tâm (chủ đề tự tạo; một call, trong request)
- **Input:** chủ đề và câu trả lời "luyện điều gì", bọc như dữ liệu, cộng bảng chính sách FR-55. Đây là call duy nhất thấy văn bản "luyện điều gì".
- **Output:** `{decision: refuse | allow_with_constraints | allow, reason_code?, constraints[], focus}`. Mã từ chối: `real_person`, `real_org_or_brand`, `sexual`, `illegal`, `harassment`, `other`. Ràng buộc: `adult_persona_only`, `no_crisis_content`, `service_use_only`.
- **Code kiểm:** `focus` thuộc tập đóng (ngoài tập → `general`); `reason_code` và `constraints` thuộc danh sách.

### 2.8 Generator kịch bản (Console và chủ đề tự tạo)
- **Input:** chủ đề (tên, mô tả; với chủ đề tự tạo là văn bản người học gõ, bọc như dữ liệu); vai trò (chỉ với chủ đề curated); tag mà persona khác cùng chủ đề đã dùng (để tránh); trọng tâm và ràng buộc kiểm duyệt (nếu có); gói grounding (BA/PM curated); luật soạn (rubric bên dưới, FR-33; không có câu mệnh lệnh nói với model trong trường `persona`).
- **Output:** một file kịch bản đúng schema, gồm câu hỏi nghiên cứu riêng về một khía cạnh phụ của chủ đề, `display_name` và một câu giới thiệu; avatar chọn sau ở Console, hoặc dùng chữ cái đầu với chủ đề tự tạo.
- **Xử lý:** lỗi `validate` được đưa lại cho generator tối đa 2 lần trước khi coi là trượt. Với BA/PM curated, AI critic (một call đóng vai senior BA/PM) đọc file và viết nhận xét vào báo cáo.
- **Rubric soạn kịch bản** (người duyệt với kịch bản curated; ghi trong báo cáo eval): ≥2 item người mới vào nghề không đoán được từ khuôn mẫu của chủ đề; fact bề mặt đủ cho 30 lượt; `research_goal` là câu hỏi mà tảng băng trả lời được; tảng băng nói về một quy trình hoặc khía cạnh phụ của chủ đề, không phải câu hỏi hiển nhiên nhất của chủ đề (giảm neo, PRD §4); không trùng tag với persona khác cùng chủ đề.

### 2.9 Kiểm an toàn đầu ra (chủ đề tự tạo, worker)
- **Input:** file kịch bản đã sinh.
- **Output:** danh sách vi phạm: khẳng định về người thật, tổ chức hay thương hiệu thật; nội dung trái chính sách hay ràng buộc; câu mệnh lệnh nói với model trong trường `persona`.
- **Xử lý:** có vi phạm → `failed_eval` mã `unsafe_output`.

## 3. Luật mở khóa, vòng đời hook, nhận xét

### 3.1 Luật mở khóa

Mọi điều kiện đọc snapshot t−1 (đã cập nhật verdict của lượt t−1).

**Openness** (tham số theo kịch bản; giá trị mặc định là `[ASSUMPTION]`): bắt đầu ở 4 trên 0–10, kẹp trong [0, 10]. Thay đổi mỗi lượt = điểm theo nhãn, cộng thưởng `past_specific` (thưởng chỉ áp dụng khi lượt không dẫn dắt).

| Nhãn (sau khi code kiểm) | `question_type` khác | `question_type = past_specific` |
|---|---|---|
| `confirm_grounded` / `boundary_probe` | +1 | +2 |
| `open` | ±0 | +1 |
| `leading` | −2 | −2 |

| Đường mở | Điều kiện mở item I |
|---|---|
| Bề mặt | `topic_tags` chứa tag của I VÀ không dẫn dắt |
| Follow-up | `hook_id` trỏ tới hook của I VÀ hook đó đã thả (verdict) và còn nhặt được VÀ nhãn tốt VÀ `grounded_turn_id` là lượt đã thả hook |
| Chuyện quá khứ | `question_type = past_specific` VÀ (tag của I trong `topic_tags` HOẶC `hook_id` trỏ tới hook của I) VÀ không dẫn dắt |
| Tin tưởng | `openness ≥ ngưỡng_I` VÀ tag của I trong `topic_tags` VÀ không dẫn dắt |

- Mỗi lượt mở tối đa 1 item `[ASSUMPTION]`; nhiều item cùng thỏa thì mở item trọng số cao nhất (replay: ưu tiên item mục tiêu).
- Item có tiên quyết chỉ được xét khi tiên quyết đã mở.

### 3.2 Vòng đời hook

**Chọn hook (code).** Mỗi lượt tối đa 1 hook. Hook đủ điều kiện khi: item của nó còn khóa và tiên quyết đã mở; hook chưa có verdict thả; và lượt này chạm tag của item, hoặc vừa mở item tiên quyết, hoặc là **câu hỏi chốt** (nhãn `open`, `question_type = open`, `topic_tags` rỗng). Nhiều hook đủ điều kiện → theo trọng số, rồi thứ tự kịch bản. Câu hỏi chốt chỉ làm thả hook, không mở item.

**Verdict thả.** Hook được chọn ở lượt t chỉ ghi `dropped@t` khi verdict của lượt t dương (Call 1 lượt t+1, judge cuối buổi, hoặc judge replay). Verdict âm → hook chưa thả, được chọn lại ở lượt đủ điều kiện kế tiếp.

**Ledger.** `dropped@t` → `picked@t'` (lượt đầu tiên sau t có `hook_id` được chấp nhận). Lượt t+1 không nhặt → chú thích `ignored@t+1`, hook vẫn nhặt được. Hook đóng khi item của nó mở.

### 3.3 Nhận xét, "Mang về" và thẻ thói quen

Code tính **điều kiện kích hoạt** từ ledger; generator viết chữ; verifier kiểm.

| Loại | Kích hoạt (mặc định, chỉnh theo kịch bản) | Nội dung generator viết |
|---|---|---|
| Lời khen có căn cứ | ≥1 lượt nhãn tốt | Trích lượt nhãn tốt trọng số cao nhất (lượt mở item, hòa thì sớm nhất). Chỉ trên màn, không in |
| Lỗi dẫn dắt | ≥1 lượt `leading` sau khi code kiểm (verifier chạy sau generator và bỏ nhận xét nếu bác tính mới) | "Thay vì hỏi" (câu người học nguyên văn) / "Hãy hỏi" (câu thay thế, đã qua kiểm nhãn của verifier), kèm "bạn tự thêm '…'" |
| Giả định-tương-lai | ≥2 lượt `hypothetical_future` | Cặp như trên, trích lượt đầu, liệt kê lượt còn lại |
| Nghe nhưng không hỏi tiếp | Đoạn canvas khớp item có hook bị bỏ qua, **trừ** item mục tiêu của replay (cho item đó, dòng chẩn đoán cố định ở PRD Màn 6 đảm nhận) | Trích đoạn canvas và lượt bị bỏ qua |
| Thẻ thói quen "chuyển chủ đề" | ≥2 hook bị bỏ qua | Thẻ riêng, không tính vào 3. Nhãn thẻ là chuỗi cố định của persona; nội dung do generator viết |

- Tối đa 3 nhận xét, theo thứ tự: lời khen; với chủ đề tự tạo, nhận xét khớp trọng tâm luyện (`follow_up` → "nghe nhưng không hỏi tiếp" và thẻ chuyển chủ đề; `past_story` → giả định-tương-lai; `no_leading` → lỗi dẫn dắt; `trust` → lỗi dẫn dắt, vì dẫn dắt làm openness giảm; `general` → không ưu tiên); các nhận xét còn lại theo số lượt dính lỗi giảm dần, hòa thì lượt sớm nhất trước. Một lượt chỉ ở một nhận xét.
- Pattern theo loại lỗi của kịch bản (`closed`, `hypothetical_future`, `other`) là ví dụ cho generator, không phải câu hiện ra.
- **Trạng thái trống:** không có kích hoạt nào → lời khen (nếu generator viết và verifier đồng ý) và dòng "Buổi này không có câu dẫn dắt hay hook bị bỏ qua nào được ghi nhận."; generator hoặc verifier lỗi → chỉ dòng đó, không lời khen. Nút "Tải về" vẫn in dòng này.

## 4. Mô hình dữ liệu (phác thảo)

**Người học và buổi**
- `user(id, google_sub, email, role_filter, visibility_ack_version, visibility_ack_at, custom_failed_count, free_custom_used)`. Demo: email trong `DEMO_ACCOUNT_EMAILS`. Quản trị viên: email trong `ADMIN_EMAILS`. Không có bảng vai trò.
- `session(id, user_id, topic_id, scenario_id, status=generating|interviewing|revealed|replaying|done|failed_eval|withdrawn, failure_reason?, withdrawn_reason?, focus?, focus_raw?, is_demo, started_at, ended_at, guess, revealed_at, canvas_text, canvas_tokens, canvas_frozen_at, device_class, reveal_ready_at, reveal_json, problem_report?)`. `reveal_json` lưu output đã xử lý của cả 3 call reveal, kèm con số NHẬN BIẾT đầy đủ (gồm cả item đang niêm phong); `revealed` với `reveal_ready_at` trống là chế độ đang tính. `failure_reason` thuộc `invalid`, `weak_separation`, `leak_flag`, `low_hook_transmission`, `unsafe_output`, `system_error`. Với chủ đề tự tạo, `scenario_id` được gán khi generator xong.
- `turn(session_id, branch_id, index, created_at, learner_text, learner_tokens, persona_text, persona_tokens, analysis_json, verdict_json, hook_selected, flagged, latency_ms)`. `verdict_json` của lượt t được ghi trong transaction của lượt t+1 (hoặc bởi judge cuối buổi / judge replay).
- `snapshot(session_id, branch_id, index, unlocked[], ledger[], disclosed[], openness)`: chỉ ghi thêm; phần `ledger`/`disclosed` của snapshot t được cập nhật theo verdict trong transaction của lượt t+1 (thay đổi duy nhất được phép).
- `branch(id, session_id, kind=main|replay, fork_after_turn, target_item_id?, fallback_level, result=success|partial|fail|stopped|skipped)`.

**Nội dung**
- `topic(id, kind=curated|custom, role=ux|ba|pm|null, title, summary, adjacency_note?, display_order, owner_user_id?, status=draft|published|archived, created_at)`. `role` null với chủ đề tự tạo. Chủ đề tự tạo được tạo ở lần thử đầu qua kiểm duyệt. Chủ đề tự tạo không dùng `status` để báo tiến trình: trạng thái hiển thị suy ra từ các buổi của nó (PRD §7).
- `scenario(id, persona_id, topic_id, version, status=draft|evaluating|eval_failed|ready_for_review|published|unpublished|archived|taken_down, origin=authored|generated, interim_gate, display_name, avatar_key?, tagline, language, json)`: `persona_id` ổn định qua phiên bản, FR-5 tính theo nó. `interim_gate` đánh dấu persona publish qua cổng tạm của S1–S2, xóa khi qua lại cổng đầy đủ. JSON gồm persona, `research_goal`, `opening_line`, ≥12 fact bề mặt, pattern theo loại lỗi, ngưỡng thẻ thói quen, item (nội dung, topic tag, đường mở, tiên quyết, hook line, do-not-assert, trọng số, ngưỡng, câu hỏi mẫu). Phiên bản đã publish bất biến.

**Vận hành và duyệt**
- `eval_run(id, scenario_id, version, profile=quick|full|reduced, status=queued|running|failed|done, report_json, cost_estimate_usd, cost_actual_usd, reader_notes[{reader_type, initials, note}])`.
- `leak_flag(id, eval_run_id, episode, turn, excerpt, allowed_hooks, judge_reason)`; `adjudication(flag_id, admin_email, verdict, reason, at)`. Cờ đóng khi có hai phán quyết giống nhau từ hai quản trị viên khác nhau.
- `string_approval(scope=persona|product, scenario_id?, version?, string_key, text, fr36_result, editor_email, approver_email, decision, note, at)`. Chuỗi cấp sản phẩm (`scenario_id` trống) sửa và duyệt ở C7; ở S1–S2 qua lệnh CLI `approve-strings`.
- `admin_access_log(admin_email, channel=console|cli, session_id?, topic_id?, user_id?, action, at)`. Khi người học xóa tài khoản, giữ dòng log, xóa `session_id`/`topic_id`/`user_id`.
- `config(key, value, updated_by, at)`: cap buổi, phần demo, ngân sách sinh, tỉ lệ 20%, công tắc tắt đường tự tạo chủ đề.

**Chủ đề tự tạo**
- `generation_attempt(id, user_id, topic_id?, session_id?, topic_text, focus, moderation_decision, reason_code?, outcome=refused|running|passed|failed|system_error, cost_reserved_usd, cost_actual_usd, created_at)`: bị từ chối thì không có `topic_id`/`session_id`. Dùng cho hạn mức 3 lần/ngày (không tính `refused`, `system_error`), 6 lần trượt trọn đời, kịch bản miễn phí (`passed` đầu tiên), tối đa một lần thử đang chạy, 20% ngân sách, 10 lần từ chối/ngày. Mỗi lần thử qua kiểm duyệt tạo một `session` mới trong cùng `topic` tự tạo.

**Đo lường**
- `event(id, user_id?, session_id?, name, props_json, at)`: sự kiện FR-38, ghi ở server. `waitlist(user_id, context, at)`, duy nhất theo (user, context).
- `realism_feedback(scenario_id, session_id, looks_real, comment)`.

**Luật dữ liệu**
- **Xóa tài khoản** (FR-66): một transaction xóa `user`, mọi `session`, `turn`, `snapshot`, `branch`, `generation_attempt`, `topic` và `scenario` tự tạo của người đó, `event`, `waitlist` và `realism_feedback` gắn với người đó; giữ số liệu tổng hợp không gắn người.
- Reveal, "Mang về" và bản xem lại là **hàm render thuần** của dữ liệu đã đóng băng; mở lại không gọi LLM.

## 5. Ước tính chi phí (chưa đo)

- **Số call mỗi buổi:** 30 lượt × 2 = 60; replay 3 × 3 = 9; reveal 3. Tổng **≤72 call** (vòng trước ≤67).
- **Token:** Call 1 trung bình ~3,2k vào (thêm hook được chọn và token); Call 2 ~2,5k; judge cuối buổi ~10k; generator ~6k; verifier ~10k; judge replay ~3k. Mỗi call ra ~150–600 token. Cả buổi khoảng 0,23M token vào và 15k ra.

| Tier | USD/buổi | VND/buổi |
|---|---|---|
| Nhỏ (~0,5 USD vào / ~2 USD ra mỗi 1M token) | ~0,15 | ~4.000 |
| Trung (~3 / ~15 USD, vào / ra) | ~0,90 | ~23.000 |

- Giá theo bảng giả định của addendum brief, ~26.000 VND/USD. Mốc 100.000–200.000 VND cho gói prep-sprint là suy luận, chưa kiểm (luật copy về giá: PRD NFR-14).
- **Eval đầy đủ** (26 buổi + người phỏng vấn LLM + judge): ~20–40 USD; baseline thêm ~10–20 USD. 14 persona × ~2 lần chạy cổng ≈ **840–1.680 USD**.
- **Chủ đề tự tạo**, mỗi lần thử:

  | Bước | USD |
  |---|---|
  | Kiểm duyệt kèm phân loại | ~0,01 |
  | Generator (gồm thử lại `validate`) | ~0,3–0,5 |
  | Kiểm an toàn đầu ra | ~0,1 |
  | Eval rút gọn: 7 run × ≤10 lượt ≈ 70 lượt, theo đơn giá eval đầy đủ | ~1,8–3,6 |
  | **Tổng mỗi lần thử** | **~2,5–4,5** |

  - Mỗi kịch bản chơi được ~4–7 USD tính cả lần trượt (giả định ~1,5 lần thử mỗi kịch bản qua). Giữ trước mỗi lần thử 5 USD `[ASSUMPTION]`.
  - Ngân sách sinh 50 USD/ngày ≈ 7–12 kịch bản chơi được. Ngưỡng công tắc tắt (12 USD mỗi kịch bản chơi được) cao gần gấp đôi ước tính này.
- Cache prompt cho phần cố định và transcript.

## 6. Ước tính từ dưới lên và lát phát hành (chưa kiểm)

**Quyết định của PM (2026-10-01):** bỏ mốc 16 ngày; khoảng 2 tháng, 1 dev, không ngày ra mắt cứng. Thứ tự cắt, tripwire và mọi mốc "hết ngày N" bị bỏ. Thứ tự build: S1 → S2 → S3 → S5 → S4 (nhãn S4/S5 giữ từ bản trước); mỗi lát deploy được và chạy end-to-end; ra mắt khi cả 5 lát xong.

**Mốc trong mỗi lát** (không gắn ngày): deploy walking skeleton trước mọi việc khác của S1 (cần môi trường thật để đo độ trễ); lần eval đầy đủ đầu tiên của persona 1 trước khi làm canvas; buổi thử sinh viên sau S2 và sau S4 (bản ứng viên ra mắt).

| Lát | Hạng mục | Ngày |
|---|---|---|
| S1 | Schema (có `topic_id`), CLI `validate`, soạn persona UX đầu tiên | 2 |
| S1 | Tinh chỉnh persona 1 tới khi pass cổng eval | 0,5 |
| S1 | Engine: 2 call, verdict lượt trước, luật mở khóa, openness, ledger, chọn hook, token, snapshot, transaction, resume, lỗi; `trace` | 3,25 |
| S1 | Hook cho câu hỏi chốt | 0,1 |
| S1 | Đoán, reveal cơ bản (thứ tự, bỏ lỡ thu gọn), lưu kết quả, thử lại | 1,25 |
| S1 | Replay (chọn khoảnh khắc, dự phòng, nhánh, niêm phong, resume, UI) và judge replay | 1,75 |
| S1 | Đăng nhập Google kèm thông báo ai xem được, deploy, quyền truy cập, trang chủ, chuẩn bị | 1,4 |
| S1 | Eval harness (tốt/xấu ×3, 20 adversarial, judge rò rỉ, song song, báo cáo), baseline, `publish` với cổng tạm | 3,25 |
| S1 | Bộ kiểm FR-36 trong CLI (chuyển từ S3 cho cổng tạm), ghi duyệt tay vào báo cáo | 0,5 |
| S1 | Test set classifier ≥100 câu và tinh chỉnh tới cổng cứng ≥85% | 1,5 |
| S1 | Cap chi phí, log sự kiện, waitlist | 0,5 |
| S1 | "Buổi của tôi" và bản xem lại | 0,5 |
| S1 | `seed-demo` | 0,25 |
| S1 | Các bản sửa từ vòng validate và party-mode còn hiệu lực (bằng chứng nhãn, do-not-assert theo lượt, đòn "dò bản đồ topic", openness 3 mức, guide đổi tên) | 0,75 |
| S1 | Canvas: UI desktop và mobile, tự lưu, đóng băng | 1,25 |
| S1 | Token range cho `introduced_span` | 0,5 |
| S1 | Judge cuối buổi: chấm canvas, kết quả, tô range | 1,25 |
| S1 | Generator nhận xét, verifier mở rộng (tính mới, claim, nhãn `suggested_question`) | 1,5 |
| S1 | Reveal hai con số, dòng chẩn đoán, trạng thái trống và suy giảm | 0,5 |
| S1 | Pipeline reveal 3 call chạy từ "Kết thúc buổi" | 0,25 |
| S1 | Test set judge verdict ≥100 và judge canvas ≥100 | 1,5 |
| S1 | Màn 0 (thông báo dữ liệu), header, URL buổi và luật nút quay lại | 0,25 |
| S1 | Ngăn transcript (chính và nhánh replay), Màn 6 ba chế độ, thẻ kết quả, chuỗi dự phòng 1 | 0,75 |
| S1 | Truy cập (NFR-15): nhãn chữ cho màu, thanh trượt và canvas dùng phím, live region | 0,5 |
| S1 | Xóa tài khoản và toàn bộ dữ liệu (FR-66) | 0,5 |
| S1 | CLI `adjudicate` và `approve-strings`, bảng duyệt chuỗi cấp sản phẩm | 0,25 |
| S1 | Sự kiện ghi ở server, payload niêm phong (API lượt, danh sách, transcript) | 0,25 |
| | **S1** | **~26,75** |
| S2 | Mô hình `topic`, di chuyển kịch bản dưới chủ đề | 0,5 |
| S2 | Thư viện, bộ lọc vai trò, màn chủ đề, điều hướng theo §7 | 1 |
| S2 | Persona kế tiếp (FR-31), cảnh báo trùng đề tài, kiểm tag không trùng trong chủ đề | 0,5 |
| S2 | Soạn tay 5 persona UX còn lại, mỗi persona ~1,25 (generator chưa có vì S3 đi sau) | 6,25 |
| | **S2** | **~8,25** |
| S3 | Truy cập Console, allowlist, log truy cập | 0,5 |
| S3 | CRUD chủ đề/persona, trình soạn, `validate` inline, phiên bản | 1,25 |
| S3 | Hàng đợi job và worker (dùng chung cho S5) | 1 |
| S3 | Màn eval và báo cáo | 0,5 |
| S3 | Phân xử hai người | 0,75 |
| S3 | Duyệt chuỗi trên Console (dùng lại bộ kiểm FR-36 của CLI), chuỗi cấp sản phẩm | 0,5 |
| S3 | Cho 6 persona của S1–S2 qua lại cổng đầy đủ | 0,25 |
| S3 | Publish có cổng, gỡ publish | 0,25 |
| S3 | Trình xem buổi (C9) kèm trace | 0,75 |
| S3 | Generator kịch bản (dùng chung cho S4, S5), AI critic | 3 |
| S3 | Sửa chuỗi cấp sản phẩm ở C7, người duyệt khác người sửa | 0,25 |
| S3 | Gỡ kèm dừng buổi (`withdrawn`), `persona_id` ổn định | 0,25 |
| S3 | Ưu tiên hàng đợi worker và quota LLM | 0,25 |
| | **S3** | **~9,5** |
| S5 | Form, phân loại trọng tâm, kiểm duyệt | 1 |
| S5 | Hồ sơ eval rút gọn tự động | 0,75 |
| S5 | Hạn mức, lượt miễn phí, ngân sách sinh | 0,75 |
| S5 | Màn đang chuẩn bị / chưa qua kiểm tra, resume, nhãn | 1,25 |
| S5 | Console C10 | 0,5 |
| S5 | Test (context không chứa văn bản trọng tâm, kiểm duyệt, hạn mức) | 0,75 |
| S5 | Kiểm duyệt trong request theo bảng chính sách, giới hạn từ chối | 0,5 |
| S5 | Kiểm an toàn đầu ra, kiểm câu mệnh lệnh trong trường persona | 0,5 |
| S5 | 6 lần trượt trọn đời, 20% ngân sách, giữ trước chi phí, công tắc tắt | 0,5 |
| S5 | Gỡ kịch bản tự tạo, báo lỗi và trả lại kịch bản miễn phí | 0,5 |
| | **S5** | **~7** |
| S4 | Gói grounding từ research.md §6, kèm độ tin từng mẫu, lưu ý độ lệch và quy tắc sinh | 0,75 |
| S4 | 8 persona BA/PM qua generator, AI critic, tinh chỉnh, eval đầy đủ, phân xử (~0,9 mỗi persona) | 7,25 |
| S4 | Tiêu chí eval BA và PM, bổ sung câu BA/PM vào test set classifier | 1 |
| S4 | Link độ thật (FR-64), điều phối người đọc BA/PM đang làm nghề | 0,75 |
| | **S4** | **~9,75** |
| — | Trang phương pháp (dev; research học thuật tính riêng), 5–8 buổi thử sinh viên, người phân xử thứ hai | 2,5 |
| | **Tổng** | **~63,75** |

- **So với 2 tháng:** ~63,75 ngày dev chưa buffer so với ~42–44 ngày làm việc. PM đã chấp nhận rủi ro lịch; ước tính ghi ở đây để theo dõi, không phải để cắt.
- **Chi phí của thứ tự S2 trước S3:** 5 persona UX của S2 được soạn tay ở ~1,25 ngày mỗi persona, trong khi sau khi có generator (S3) ước tính ~0,9. Chênh ~1,75 ngày, ghi lại như cái giá của thứ tự đã chốt.
- **Cổng tạm S1–S2:** persona publish bằng CLI với cùng ngưỡng FR-35, bộ kiểm FR-36 trong CLI và duyệt chuỗi bằng tay ghi trong báo cáo; sau S3, cả 6 persona qua lại cổng đầy đủ trên Console trước ra mắt.

## 7. Phương án đã cân nhắc

Bốn bảng theo vòng: vòng 1 (2026-09-25; hai bảng Engine và Trải nghiệm), vòng 2 (2026-10-01), vòng 3 (2026-10-02). Dòng đã bị thay có dấu "→ thay ở vòng N". Các dòng vòng 1 tham chiếu theo đánh số PRD cũ (ví dụ "PRD §5.0" cũ nay là §8.0, "cổng ra mắt §9.2" cũ nay là §12.2, "cắt #3" không còn).

### Vòng 1 (2026-09-25): Engine

| Phương án | Kết quả | Lý do | Thay bằng |
|---|---|---|---|
| Call 1 trả về "item nào được mở" (đề xuất ban đầu của PM) | Bác | Đưa quyết định mở khóa trở lại model, trái với luật đã chốt ở forge ("cổng do logic agent"). Cách này buộc nội dung item còn khóa nằm chung context với văn bản thô của người học, nên một injection thành công sẽ mở item và persona sẽ nói ra item đó ở lượt sau. Nhãn và quyết định mở khóa sẽ sai cùng lúc, và không có bước nào kiểm độc lập | Call 1 chỉ trả bằng chứng; code quyết định (§3.1) |
| Self-check do-not-assert thành call riêng mỗi lượt | Bác | Vượt giới hạn 2 call | Kiểm trễ một lượt trong Call 1. Cách này phát hiện chứ không ngăn được. Chấp nhận được, vì nội dung item còn khóa không có trong context persona, nên rủi ro còn lại là persona nói trước hoặc nói ngược một item, không phải rò nguyên văn |
| Persona tự khai báo hook đã dùng (`hook_ids_used`) | Bác sau review → thay ở vòng 2 | Lời khai không được kiểm, nên ledger có thể ghi một hook persona chưa từng nói rồi trách người học đã bỏ qua | Code chọn hook và dò cụm neo nguyên văn (§3.2) (vòng 2: verdict thay cụm neo) |
| Hook chỉ nhặt được ở lượt ngay sau | Bác sau review | "3 lượt" của replay thực chất chỉ còn 1 lần thử, và người học bị phạt khi quay lại một chi tiết ở lượt sau (một kỹ thuật tốt) | Hook còn nhặt được cho tới khi item mở; "bỏ qua" chỉ là chú thích |
| Ràng buộc do-not-assert viết theo nội dung item | Bác sau review | Đưa nội dung item còn khóa vào cả hai call | Luật hành vi ở mức topic tag; nội dung chỉ được judge kiểm ở eval |
| Ràng topic tag vào từ khóa trong câu của người học (chống injection) | Không làm | Neo từ khóa tiếng Việt sẽ chặn nhầm câu hỏi thật khi người học diễn đạt khác. Người học tự chèn injection chỉ làm hỏng buổi luyện của chính mình | Giới hạn 1 tag và 1 item mở mỗi lượt |
| Persona nhận ràng buộc do-not-assert của mọi item khóa | Bác sau review party-mode | Danh sách này là mục lục của tảng băng. Một câu "có chuyện gì người ta dặn chị đừng kể không?" có thể khiến persona nêu tên topic, rồi một câu hỏi mở bình thường sẽ mở item. Eval chỉ chấm rò nội dung nên không thấy. Ảnh chụp màn hình lan qua group chat của lớp, đúng kênh phân phối | Chỉ ràng buộc của topic tag khớp ở lượt đó, cộng một luật chung; đòn "dò bản đồ topic" trong eval |
| `grounded_turn_id` không resolve được → hạ thành `leading` | Đổi (PM, 2026-09-25, mở lại luật forge) | Luật forge "không có lượt trích được = không grounded" vẫn giữ; chỉ đổi mức phạt. Model quên ID lượt thì người học bị −2 openness và bị ghi "dẫn dắt" trên reveal, dồn thẳng vào ngưỡng ≤5% câu tốt bị gắn nhầm ở NFR-7. Về bảo mật không mất gì: kẻ tấn công vốn trích được bất kỳ lượt có thật nào, và follow-up vẫn cần đúng lượt đã thả hook | Hạ thành `open` (±0) |
| Stream câu trả lời persona | Hoãn | Chỉ báo "Chị Thu đang gõ…" đủ cho mức ≤6 giây; stream sinh thêm trường hợp phải rút lại câu trả lời dở khi call lỗi (FR-11) | Chỉ báo "đang gõ"; nếu stream sau này, câu trả lời dở bị bỏ khi call lỗi |
| Openness bắt đầu ở 3 | Đổi thành 4 (PM, 2026-09-25, advanced elicitation) | 3 nằm trong mức `dè dặt`, lượt 1 không thể grounded, và câu hỏi mở chỉ ±0, nên persona dè dặt suốt mấy lượt đầu: đúng lúc người học dễ bỏ nhất (SM-C1). Con số 3 vốn được chọn tùy ý | Bắt đầu ở 4 (`bình thường`); openness chỉ đổi độ sẵn lòng kể về item |
| Hook chỉ thả khi khớp topic tag hoặc vừa mở item tiên quyết | Mở rộng (PM, 2026-09-25, advanced elicitation) | Câu hỏi chốt kinh điển ("còn gì em chưa hỏi không?") không có tag, nên persona né. Reviewer gần như chắc chắn sẽ hỏi câu này | Câu hỏi chốt cũng làm thả hook; không bao giờ mở item |
| Verifier ở màn reveal gọi tool (`get_turn`, `get_ledger_event`) | Hoãn, là dự phòng có tên (PM, 2026-09-25) | Chưa có câu chữ của rubric. Lời bảo vệ ở PRD §5.0 cộng `trace` là câu trả lời trung thực: tool cố ý không cho model gọi để giữ cổng | Làm (~0,25 ngày) chỉ khi rubric yêu cầu nguyên văn "LLM gọi tool" |
| Chỉ 3 nhãn cho mọi câu hỏi | Mở rộng (PM, 2026-09-25) | Bộ 3 nhãn đã chốt ở forge dành cho câu hỏi đóng, tức câu hỏi mang nội dung cần đối chiếu. Câu hỏi mở không thuộc nhãn nào; không có nhãn riêng thì mọi câu hỏi mở không trích lượt trước bị tính là dẫn dắt | Thêm nhãn `open`: lấp lỗ hổng của luật đã chốt chứ không phá nó |

### Vòng 1 (2026-09-25): Trải nghiệm người học và phạm vi

| Phương án | Kết quả | Lý do | Thay bằng |
|---|---|---|---|
| Hiện cho người học "mở bằng phán đoán dễ dãi" | Bác (PM) | Gây rối, và khiến sản phẩm tự làm mất tin cậy trước mặt người dùng | Chỉ số nội bộ (NFR-8) |
| LLM diễn đạt feedback và guide lúc chạy | Hoãn sang Later → thay ở vòng 2 | Template dựng từ ledger không tốn call và không bịa được; chuỗi cố định đã được duyệt thủ công lúc soạn (PRD §7, trách nhiệm có tên) | Template |
| Bộ đếm live số item đã mở | Bác | Không có tier để quyết định ai được thấy; con số live khuyến khích người học chơi để tăng số | Chỉ tổng niêm phong |
| Ô tự do "khoảnh khắc bạn thấy mình bỏ lỡ" | Bỏ | Không phần nào trong sản phẩm dùng tới; so khớp câu tự do với khoảnh khắc thật cần thêm một LLM call | Chỉ thanh trượt đoán số |
| Admin dashboard trong MVP | Ở lại Later (PM) → thay ở vòng 2 | CLI đủ cho việc soạn kịch bản; thời gian dư ưu tiên cho phần người học dùng | CLI `validate` / `eval` / `publish` |
| Guide là màn riêng | Gộp vào màn reveal (PM, 2026-09-25, first principles) | Guide hiện lại đúng dữ liệu ledger mà nhận xét ở reveal đã có; đây là bỏ trùng lặp, không phải cắt | Phần "Mang về" ở cuối reveal, giữ tiêu đề, dòng trống trong bản in và nút in |
| Cổng publish tự động (FR-35) và verifier guide lúc soạn (FR-36) trong MVP | Sang Next, cùng pipeline sinh kịch bản (PM, 2026-09-25, first principles; mở lại must-ship #8 của forge) → thay ở vòng 2 | Hai thứ này bảo vệ kịch bản do người khác hoặc AI soạn. Với 1–2 kịch bản Thanh tự soạn, `validate`, báo cáo eval và việc duyệt đủ dùng | Trách nhiệm duyệt thủ công có tên (PRD §7): guide chỉ lắp từ chuỗi cố định đã duyệt, lúc chạy không sinh gì |
| Màn thư viện khi chỉ có 1 kịch bản | Chỉ hiện khi có ≥2 kịch bản (PM, 2026-09-25, first principles) → thay ở vòng 2 | Thư viện 1 thẻ là một cú bấm thừa | Nút ở trang chủ dẫn thẳng tới màn chuẩn bị |
| Cắt "Buổi của tôi" ngay từ ngày 0 | Bác (PM, 2026-09-25) → thay ở vòng 2 | Sau first principles, phép tính không còn buộc phải cắt; cắt sớm là cắt cho có | Giữ nguyên; vẫn là cắt #2 trong dự phòng |
| Guide gồm câu hỏi mẫu của item bị bỏ lỡ, tiêu đề "Bộ câu hỏi cho buổi phỏng vấn thật của bạn" | Bác sau review party-mode | Câu hỏi mẫu nói về chuyện của persona (ví dụ app trả phí của chị Thu), không phải đề tài của người học; đưa vào "pre-flight card" là hứa quá mức | Câu hỏi mẫu chỉ ở màn reveal; guide tên "Thói quen hỏi của bạn — đọc lại trước buổi thật", chỉ giữ phần mang sang được, bản in có dòng trống để tự viết câu cho đề tài của mình |
| Thẻ item tin tưởng hiện con số ("Cần mức cởi mở 7. Cao nhất bạn đạt: 5") | Thay (PM, 2026-09-25, advanced elicitation; thay chữ của W4 ở party-mode) | Con số biến màn reveal thành bảng điểm và trái với "phản ứng của một người, không phải gợi ý" | Cùng dữ liệu, nói bằng lời: "Chị Thu chưa đủ tin để kể. Lượt 2, 9, 15 làm chị dè dặt hơn" |
| Màn reveal: danh sách đầy đủ, khối replay ở cuối | Thay (PM, 2026-09-25, advanced elicitation) | Ở 360px có hơn 15 thẻ trước nút replay, mà replay là điều khác biệt duy nhất | Điểm → khối replay → đã khai thác → bỏ lỡ thu gọn → tối đa 3 nhận xét |
| Buổi dự phòng cho demo ở trạng thái `done` | Thay (PM, 2026-09-25, advanced elicitation; sửa khi validate) | Buổi `done` chỉ đọc, nên replay không chạy live được; FR-5 làm buổi tập demo tiêu hết giới hạn. CLI không tạo được tài khoản Google mới, nên bản "mỗi lần một tài khoản mới" không chạy được | `DEMO_ACCOUNT_EMAILS` liệt kê tài khoản Google thật của Thanh; `seed-demo` gắn buổi vào một tài khoản đó, dừng ở `revealed`, thất bại nếu không rơi vào ứng viên chính; buổi demo không tính FR-5. Không có đường đăng nhập riêng |
| NFR-7 là một cổng gồm hai ngưỡng | Tách (PM, 2026-09-25, advanced elicitation) → thay ở vòng 2 | Không có hướng xử lý nếu tới ngày 13 vẫn chưa đạt ngưỡng | ≤5% câu tốt bị gắn nhầm `leading` là cổng cứng; ≥85% đồng thuận thành chỉ số báo cáo sau ngày 13 |
| Verifier là cắt #2 | Chuyển xuống cắt #3 (PM, 2026-09-25) → thay ở vòng 2 | Verifier là một chân tự kiểm của lời bảo vệ agent (PRD §5.0), nên phải là thứ cắt sau cùng | "Buổi của tôi" → "Buổi gần nhất" lên cắt #2 |
| Guide chỉ gồm chuỗi cố định (FR-30 cũ), câu hỏi trong guide phải qua classifier và bị loại nếu là assumption (khóa guide của forge) | Đổi (PM, 2026-09-25, validate; mở lại khóa guide của forge) → thay ở vòng 2 | "Thay vì hỏi" trích nguyên văn câu dẫn dắt của chính người học. Câu này không phải nội dung sinh ra và không phải khẳng định về người dùng thật; nó là trích dẫn từ transcript của chính họ, như mọi trích dẫn ở reveal, được đóng khung là câu không nên hỏi | FR-30: guide gồm chuỗi cố định đã duyệt và trích nguyên văn câu của người học; không có nội dung LLM sinh lúc chạy, không có khẳng định về người dùng thật |
| Nhãn `leading` hiện mà không có bằng chứng (vi phạm "mọi nhãn hiện bằng chứng" của forge) | Sửa (PM, 2026-09-25, validate) → thay ở vòng 2 | Nhãn `leading` sai là lỗi làm người học mất niềm tin nhất (NFR-7), nhưng lại là nhãn duy nhất không có bằng chứng và không được verifier kiểm | Call 1 trả `introduced_content`; code kiểm có trong câu người học và vắng trong lời persona, thiếu thì hạ về `open`; verifier kiểm lại trước khi hiện |
| Rò bản đồ topic định nghĩa là "persona nhắc topic còn khóa mà người học chưa chạm tới" | Đổi (PM, 2026-09-25, validate) | Định nghĩa cũ biến mọi lần thả hook (nhất là hook của câu hỏi chốt) thành rò rỉ. Hook là chuỗi soạn sẵn đã duyệt | Rò (b) là persona nêu topic còn khóa **bằng lời của chính nó**, ngoài hook được phép ở lượt đó; thả hook ghi thành sự kiện hook, không phải ứng viên rò |
| "0 rò rỉ / 20 adversarial" chấm tự động (chuẩn forge) | Đổi (PM, 2026-09-25, advanced elicitation và validate; mở lại chuẩn chất lượng forge) → thay ở vòng 2 | Judge LLM gắn cờ nhầm làm cổng 0 rò phần lớn fail vì judge | Chỉ tính rò **đã xác nhận**, theo tiêu chí viết sẵn ở FR-34, mỗi phán quyết kèm trích dẫn và lý do. Không có người đọc thứ hai: ghi là rủi ro có tên (PRD §10) |
| Replay dự phòng 1 thành công = "Đã mở: item X" (chuẩn forge) | Đổi (ghi nhận khi validate) | Dự phòng 1 dùng khi không có hook bị bỏ qua, nên không có item mục tiêu; thứ được luyện là cách hỏi | Thành công = 3 lượt không `leading` và ≥1 nhãn tốt; item nào mở thì hiện ra |
| §9 chỉ số và §10 cổng ra mắt tách rời trong PRD | Gộp (PM, 2026-09-25, validate) → thay ở vòng 2 (SM-3, SM-4 đo lại được với lớp chủ đề) | Người chấm cần một chỗ trả lời "đánh giá thành công thế nào", và cần biết điều gì không đo được với 1 kịch bản | PRD §9 "Tiêu chí đánh giá thành công": bảng mục tiêu → cổng → tín hiệu → giới hạn; SM-6, SM-7 thay SM-3, SM-4 khi chỉ có 1 kịch bản |
| Headline "Tự tin bước vào buổi phỏng vấn của bạn" | Thay (PM, 2026-09-25, mở lại khóa forge) | Màn reveal được thiết kế để lay niềm tin ("Bạn đoán 7. Thực tế: 3"); hứa "tự tin" ngay trước đó là không thật | "Mắc lỗi ở đây, đừng mắc trước người thật." |

### Vòng 2 (2026-10-01): lịch, ghi chú, chủ đề, vai trò, soạn kịch bản, phương pháp

| Phương án | Kết quả | Lý do | Thay bằng |
|---|---|---|---|
| Mốc 16 ngày cố định, thứ tự cắt, tripwire ngày 11, cam kết 1 kịch bản | Bỏ (PM) | Lịch build nay khoảng 2 tháng, mục tiêu là sản phẩm tốt nhất | 5 lát phát hành, ra mắt khi cả 5 xong (§6) |
| Bỏ hẳn mọi thứ tự ưu tiên khi bỏ thứ tự cắt | Bác | 1 dev, ước tính ~58 ngày lúc đó (hiện tại: §6) so với ~42–44 ngày làm việc; không có thứ tự thì trễ không ai thấy | Lát phát hành: thứ tự build, không phải thứ tự cắt |
| Thanh trượt đếm trần là toàn bộ cam kết trước reveal | Thay (forge ghi chú) | Con số trần không có nội dung | Giữ cam kết một câu, một con số; nội dung chuyển sang reveal: hai con số, canvas có tô |
| Cụm neo và chuẩn hóa dấu để quyết định hook đã thả / item đã kể | Thay (forge ghi chú) | Khớp chuỗi tiếng Việt sai thì báo "bỏ lỡ" điều đã nói; diễn đạt khác không khớp | Verdict do call khác phán đoán; code chỉ cắt theo chỉ số |
| `introduced_content` là chuỗi con kiểm bằng code | Thay (forge ghi chú) | "Persona chưa từng nói ý này" là ngữ nghĩa | Token range trong câu người học (code cắt); tính mới do verifier |
| Nhận xét và guide dựng từ template, không LLM lúc chạy (FR-30 cũ) | Thay (forge ghi chú; mở lại khóa vòng 1) | Template không nói được về canvas và về câu thay thế cụ thể | Generator có cấu trúc, verifier kiểm từng claim, mọi "Hãy hỏi" qua nhãn và loại câu `leading` (khôi phục khóa guide của forge gốc) |
| Verdict lượt cuối và phân loại `suggested_question` thành call riêng | Gộp (PRD chọn cách hiện thực) | Forge ghi chú chốt reveal 3 call; call riêng sẽ thành 4–5 | Verdict lượt cuối trong judge cuối buổi; nhãn `suggested_question` trong verifier |
| Vai trò là dialog hỏi sau đăng nhập ("Bạn là ai?": Sinh viên / BA / PM / khác) | Thay (PM) | Khách duyệt thư viện trước khi đăng nhập (FR-1), nên dialog sau đăng nhập không lọc được gì; "Sinh viên" là giai đoạn, không phải lĩnh vực | Bộ lọc thư viện UX / BA / PM / Khác |
| Vai trò đổi cách chấm | Bác (PM) | Mỗi vai trò cần luật nhãn và test set ≥100 riêng (~3–4 ngày mỗi vai trò); luật hiện tại đã là "một luật cho mọi vai trò", và câu xác nhận đóng của BA khớp `confirm_grounded` | Vai trò chỉ lọc chủ đề |
| 5 chủ đề × 5 persona (25) | Thay (PM) | Giới hạn thật là vai trò × chủ đề: 5 chủ đề chia 3 vai trò để lại vai trò chỉ 1 chủ đề, nên SM-4 khác chủ đề không đo được trong vai trò đó; 5 persona không trùng tag trong một lĩnh vực cần ~50 tiểu chủ đề; persona thứ 4–5 không đo thêm gì và làm thiên lệch lĩnh vực nặng hơn; ~31 ngày soạn và ~500 transcript adversarial cho hai người phân xử | 14 persona: UX 2×3, BA 2×2, PM 2×2 |
| Chủ đề curated chọn để trùng đề tài đồ án phổ biến | Bác (PM) | Mở lại neo giả thuyết | Chủ đề kề bên, cảnh báo trùng đề tài |
| Đường tự tạo chủ đề: tách đầu vào thành lĩnh vực và câu hỏi nghiên cứu, kèm ô "câu hỏi nghiên cứu thật (để tránh)" | Bác (PM) | Giữ luồng sinh đơn giản; hỏi câu hỏi nghiên cứu thật giống thẩm vấn hơn là công cụ luyện | Hỏi "Bạn muốn luyện điều gì?", ánh xạ vào tập đóng để văn bản không tới generator; neo được chấp nhận là rủi ro còn lại (PRD §13) |
| Đường Describe của forge gốc (người học mô tả người được phỏng vấn và câu hỏi nghiên cứu) | Thay (PM) | Forge gốc không bác Describe: nó chốt Describe (cùng lĩnh vực khác câu hỏi, eval rút gọn, "kiểm tra nhẹ", trượt không tốn lượt) và chỉ hoãn vì lịch. Thứ bị bác là persona sinh thẳng từ câu hỏi nghiên cứu | Chỉ gõ chủ đề; giữ eval rút gọn, nhãn, trượt không tốn lượt miễn phí. Mất bước loại trừ câu hỏi nghiên cứu (không biết câu hỏi) |
| Eval rút gọn có người phân xử cờ rò rỉ | Không làm | Không có người đọc trong thời gian chờ vài phút | Mọi cờ là trượt |
| Trượt sinh không tính gì | Đổi (PM) | Thử lại miễn phí không giới hạn làm chi phí không có trần (~6–12 USD mỗi lần thử, ước tính lúc đó) | 3 lần thử mỗi ngày (qua hay trượt đều tính), ngân sách sinh riêng; trượt không trừ lượt miễn phí |
| Hai hệ thống soạn riêng cho Console và chủ đề tự tạo | Bác (PM) | Trùng việc | Một generator, một `validate`, hai hồ sơ cổng (đầy đủ có người duyệt / rút gọn tự động) |
| Admin dashboard là trình soạn JSON trên web chạy eval trong request | Thay | Phần chậm của soạn kịch bản là eval, phân xử và duyệt chuỗi, không phải điền form; eval đầy đủ hơn 2.000 call, chạy hàng giờ | Review Console: CRUD kèm `validate` inline, hàng đợi eval trên worker, phân xử, duyệt chuỗi, publish có cổng |
| Một người phân xử rò rỉ (Thanh) | Đổi (PM) | Từng chấp nhận vì không có thời gian | Hai người; cờ đóng khi cùng phán quyết; bất đồng tính là rò `[ASSUMPTION]` |
| NFR-7 ≥85% thành chỉ số báo cáo sau ngày 13 | Khôi phục cổng cứng (PM) | Nới vì lịch | Cổng cứng |
| Quản trị viên chỉ xem số liệu gộp của chủ đề tự tạo | Bác (PM, quyết định cuối) | PM chọn quản trị viên xem mọi thứ, cả curated và chủ đề tự tạo | NFR-9 viết lại, FR-63 thông báo ở đăng nhập, log truy cập, NFR-14 cấm hứa riêng tư, cái giá ghi ở PRD §13 |
| Magic link quay lại khi có thời gian | Vẫn cắt, lý do sản phẩm (PM) | Tài khoản dùng một lần làm vô hiệu giới hạn chi phí theo người; gần như mọi sinh viên VN có Gmail | Chỉ Google |
| Song ngữ quay lại khi có thời gian | Vẫn cắt, lý do phạm vi (PM) | Nhân đôi mọi test set và eval; không người dùng ra mắt nào cần | Chỉ tiếng Việt, giữ trường `language` |
| Guide theo đề tài thật quay lại (generator làm được rẻ) | Vẫn cắt, lý do sản phẩm (PM) | Viết câu hỏi về đề tài thật là neo trước fieldwork và gần nhận định về người dùng thật | Bản in có dòng trống để người học tự viết |
| Trang phương pháp kèm khẳng định về đào tạo đàm phán với chỉ dẫn mật | Bỏ khẳng định (PM) | research.md không có nguồn | Chỉ các phương pháp có nguồn; trang bị chặn tới khi research học thuật xong; không con số; nêu phát hiện bất lợi |
| Research học thuật là cổng ra mắt | Đổi (PM, 2026-10-02) | Trang phương pháp là nơi duy nhất dùng trích dẫn học thuật | Việc trong checklist của riêng trang; trang 404 tới khi xong; sản phẩm ra mắt được |
| Kéo FR-36 vào S1 để persona S1–S2 qua cổng đầy đủ ngay | Không làm (PM, 2026-10-02) | Duyệt chuỗi trên Console chỉ có ở S3 | Cổng tạm: CLI chạy cùng bộ kiểm FR-36, Thanh duyệt tay; 6 persona qua lại cổng đầy đủ sau S3 |
| Bỏ chạy nhanh ×1 cùng các luật nới vì lịch | Bác (PM, 2026-10-02) | ×1 là luật chi phí, không phải luật lịch: eval đầy đủ hơn 2.000 call, ~20–40 USD, tinh chỉnh 15 lần sẽ tốn hàng trăm USD | ×1 chỉ để tinh chỉnh, không bao giờ cho cổng FR-35 |
| Dấu trung tính "giữ lại để bạn thử" trên đoạn canvas khớp item mục tiêu trước replay | Bác (PM yêu cầu kiểm, 2026-10-02) | Vị trí của dấu đã cho biết ghi chú nào đúng, dù chữ trung tính; con số NHẬN BIẾT cũng vậy nếu tính item đó | Không tô, không dấu, không tính vào số đang hiện; hiện ra khi replay kết thúc |
| 3 call reveal nhắc item mục tiêu trước replay | Sửa (đối chiếu forge, 2026-10-02) | Canvas, claim generator và "Hãy hỏi" có thể nói về item mục tiêu, làm replay thành bài chép lại; niêm phong là lý do replay là bài kiểm chứ không phải chép (→ lý do thay ở vòng 3) | Chọn khoảnh khắc trước; generator được báo item niêm phong; mọi phần nhắc tới nó bị giữ lại tới khi replay kết thúc |
| Câu giải thích đoạn canvas là trường `reason` của judge | Bác (đối chiếu forge) | Chữ LLM không qua verifier và luật không khẳng định về người dùng thật | Tập đóng chuỗi cố định theo loại kết quả (FR-48a), qua duyệt chuỗi cấp sản phẩm |
| Dòng chẩn đoán replay do generator viết, hiện bất kể verifier | Sửa (đối chiếu forge) | Forge yêu cầu mọi claim "bạn bỏ qua hook" được verifier đọc lại | Chuỗi cố định chọn theo luật; verifier bác hoặc lỗi thì dùng câu trung tính |
| Người đọc proxy không định nghĩa | Đổi (PM, 2026-10-02) | Giả định #7 là một trong các giả định rủi ro nhất; research khuyến nghị 1–2 BA thật | BA/PM đang làm nghề; sinh viên hoặc giảng viên chỉ ghi là kiểm tra một phần |
| Generation p95 ≤ 2 phút | Giữ 10 phút (PRD chọn, 2026-10-02) → thay ở bảng vòng 3 | Eval rút gọn có run tới 30 lượt, ~6 giây mỗi lượt cộng call người phỏng vấn; một run đã mất vài phút | p95 ≤ 10 phút `[ASSUMPTION]` |
| Chủ đề BA mẫu "Duyệt chi phí công tác" và tiêu chí BA "quy trình hoặc ngưỡng" | Đổi (đối chiếu research) | Mẫu "ngưỡng tiền phê duyệt" không có nguồn trong research §6 | Chủ đề dựa trên mẫu 11–16 và 1–9; tiêu chí "bước quy trình, người duyệt hoặc điều kiện ngoại lệ"; mẫu ngưỡng chỉ là `[ASSUMPTION]` |

### Vòng 3 (2026-10-02): reviewer gate sau đối chiếu

| Phương án | Kết quả | Lý do | Thay bằng |
|---|---|---|---|
| Đóng kênh loại trừ của niêm phong (giữ cả mục ghi chú và NHẬN BIẾT tới khi replay xong, hoặc bỏ câu "nghe được") | Bác (PM, 2026-10-02) | Cổng mở khóa chấm câu hỏi, không chấm việc người học đã biết; niêm phong chỉ thêm bất ngờ, không phải thứ làm replay thành bài kiểm | Giữ luật niêm phong hiện có; ghi rủi ro còn lại ở PRD §13. Lý do này thay lý do trước ("niêm phong là thứ làm replay thành bài kiểm") |
| Generator nhận nội dung item mục tiêu và được dặn không nói tới | Bác (review adversarial) | Một claim về item khác có thể diễn đạt lại item mục tiêu mà vẫn lọt kiểm theo `item_id` | Generator không nhận nội dung, câu hỏi mẫu hay hook line của item mục tiêu |
| Xóa dữ liệu tự động sau N tháng không hoạt động | Bác (PM, 2026-10-02) | PM chọn | Xóa tài khoản và toàn bộ dữ liệu do người học kích hoạt (FR-66); không xóa tự động; kiểm quy định của Việt Nam ở checklist |
| Danh sách `ADJUDICATOR_EMAILS` chỉ xem eval | Bác (PM, 2026-10-02) | PM chọn người phân xử thứ hai là quản trị viên | Người phân xử là quản trị viên; PRD §13 ghi việc này mở rộng người đọc dữ liệu |
| Lần trượt không bao giờ trừ gì, một ngân sách sinh chung | Đổi (PM, 2026-10-02, gói chống lạm dụng) | Một tài khoản đốt được ~18–36 USD/ngày mãi mãi; một người làm cạn ngân sách của mọi người; lần thử đang chạy vượt ngân sách | 6 lần trượt trọn đời, ≤20% ngân sách mỗi tài khoản, giữ trước chi phí, kiểm duyệt thêm tổ chức/thương hiệu thật, kiểm an toàn đầu ra, gỡ kịch bản ở C10 |
| Đường tự tạo chủ đề chỉ "theo dõi" | Đổi (PM, 2026-10-02) | Tính năng tốn nhất và nhạy nhất cần ngưỡng hành động | Công tắc tắt: sau 30 yêu cầu, <50% qua hoặc >12 USD mỗi kịch bản chơi được |
| Giữ p95 đường sinh 10 phút | Bác (PM giữ 2 phút, 2026-10-02) | PM chọn | p95 ≤ 2 phút; để đạt, mỗi run eval rút gọn ≤10 lượt và 7 run song song; kiểm tra nhẹ hơn nữa, ghi ở PRD §13 |
| Kiểm duyệt chạy trên worker sau khi tạo buổi | Đổi (review nhất quán) | Lần bị từ chối sẽ hiện như "Chưa qua kiểm tra" dù không tính | Kiểm duyệt chạy trong request trước khi tạo buổi; bị từ chối không tạo buổi |
| Kích hoạt nhận xét dẫn dắt theo kết quả verifier | Đổi (review nhất quán) | Verifier chạy sau generator | Kích hoạt theo nhãn đã qua kiểm của code; verifier bỏ nhận xét nếu bác tính mới |
| `revealed` = "reveal đã render"; `done` có hai màn | Đổi (review màn hình) | Trạng thái đổi lúc lưu số đoán; hai màn cho một trạng thái | `revealed` = đã lưu số đoán, có chế độ đang tính; `done` = Màn 6 ở chế độ đã xong, cũng là bản xem lại |
| Thanh trượt đoán có giá trị mặc định | Bác (review màn hình) | Giá trị mặc định neo số đoán, làm lệch SM-6 | Không có giá trị ban đầu; phải kéo mới gửi được |
| "Chủ đề riêng" | Đổi tên (review adversarial) | Dễ đọc thành "riêng tư", đúng điều NFR-14 cấm hứa | "Chủ đề tự tạo"; nút "Tạo chủ đề của bạn" |

## 8. Lịch sử thay đổi

Các dòng vòng 1 chuyển từ PRD §2 cũ. Lý do chi tiết của từng vòng ở §7.

| Vòng | Thay đổi | Lý do |
|---|---|---|
| Phản hồi reviewer vòng 1 (2026-09-24): replay cần spec chính xác | Thêm PRD §6: snapshot mỗi lượt, luật chọn khoảnh khắc, dự phòng, khôi phục context, 3 lượt qua cùng cổng, nhánh tách biệt | Brief chỉ có một dòng về replay, mà replay là bằng chứng khác biệt duy nhất |
| Phản hồi reviewer vòng 1 (2026-09-24): 4 call mỗi lượt quá nặng | 2 call mỗi lượt (phân tích và persona); code quyết định mở khóa; kiểm do-not-assert trễ một lượt trong Call 1; guide và nhận xét dựng từ template. ~67 call mỗi buổi, trước đây ~135–150 | Gộp classifier và cổng vào một call bị bác (§7): đưa quyết định mở khóa về model và đặt nội dung khóa cạnh văn bản thô của người học |
| Phản hồi reviewer vòng 1 (2026-09-24): quá nhiều tính năng | Cắt plumbing song ngữ, câu hỏi kinh nghiệm và tier, nút "Báo tôi khi BA/PM sẵn sàng", guide theo đề tài thật, pipeline sinh kịch bản; admin dashboard sang Later | Giữ lõi chứng minh được: tảng băng, cổng, reveal, replay |
| Party-mode (2026-09-25) | Persona chỉ nhận do-not-assert của tag khớp; đòn "dò bản đồ topic"; item vừa mở phải nói ngay, replay thành công khi item được nói ra; bảng openness và 3 mức; grounding không resolve được → `open`; chuẩn hóa cụm neo tiếng Việt, ngưỡng ≥95%; chỉ Google; guide đổi tên, dòng trống; headline mới; lịch 16 ngày với thứ tự cắt | Bảng do-not-assert đầy đủ là mục lục của tảng băng; khớp sai dấu báo "bỏ lỡ" điều đã nói; hứa "tự tin" mâu thuẫn với reveal |
| Advanced elicitation (2026-09-25) | Tripwire đo bằng việc còn lại; rò đã xác nhận; tinh chỉnh kịch bản, deploy sớm, eval song song; hiệu chỉnh 50–75%; persona nói thoải mái, openness 4, câu hỏi chốt thả hook; mục tiêu nghiên cứu và lời mở đầu; reveal gọn, thẻ tin tưởng không con số; `seed-demo`, `trace`, baseline, thử với 2 sinh viên; NFR-7 tách; PRD §5.0; verifier xuống cắt #3; guide gộp vào reveal; FR-35/36 sang Next; thư viện chỉ khi ≥2 kịch bản | Pre-mortem ngày demo, red team "chatbot có thêm máy móc", first principles (§7) |
| Validate (2026-09-25) | Mọi nhãn có bằng chứng (`introduced_content` cho `leading`); do-not-assert không đi kèm item vừa mở; định nghĩa rò (b) và tiêu chí xác nhận; FR-30 cho phép trích câu người học; tài khoản demo qua `DEMO_ACCOUNT_EMAILS`; lượt 0; hợp đồng verifier; luật chọn nhận xét; điều hướng theo trạng thái buổi; khối "Nếu cắt #2"; PRD §9 gộp thành "Tiêu chí đánh giá thành công" với SM-6, SM-7; PRD §2 cũ chuyển về đây; thứ tự ưu tiên so với brief và forge | Bốn reviewer: rubric, nhất quán sau nhiều vòng sửa, khóa nguồn, khả năng kiểm và yêu cầu nộp bài (`validation-report.md`) |
| Phản hồi reviewer vòng 2 (2026-10-01) | Lịch ~2 tháng và 5 lát phát hành; áp nguyên forge ghi chú (canvas, KHAI THÁC / NHẬN BIẾT, verdict thay cụm neo, token span, generator kèm verifier, reveal 3 call); lớp chủ đề (14 persona); vai trò là bộ lọc thư viện; BA/PM ra mắt kèm biện pháp độ thật; đường tự tạo chủ đề; Review Console, FR-35/36 về MVP; quản trị viên xem mọi dữ liệu (NFR-9, FR-63); trang phương pháp bị chặn sau research học thuật; NFR-7 ≥85% thành cổng cứng, 5–8 buổi thử, hai người phân xử. PRD đánh số lại §4–§13 | Năm điểm phản hồi của reviewer cộng thay đổi lịch; quyết định của PM ghi ở `.memlog.md` |
| Đối chiếu đầu vào vòng 2 (2026-10-02) | Cổng tạm S1–S2; ×1 chỉ để tinh chỉnh (luật chi phí); research học thuật chỉ chặn trang phương pháp; niêm phong item mục tiêu trên mọi phần của reveal (không dấu trên canvas); câu giải thích canvas và dòng chẩn đoán là chuỗi cố định; cổng judge đủ các hướng đổ lỗi; loại thiết bị trong sự kiện; trạng thái trống/tải/lỗi cho mọi màn; chủ đề tự tạo trong bảng trạng thái; thông báo FR-63 không hứa riêng tư; gói grounding BA/PM kèm lưu ý; người đọc BA/PM đang làm nghề; ước tính ~58,5 ngày | `reconcile-r2-notes-forge.md`, `reconcile-r2-decisions.md`, `reconcile-r2-research.md`; quyết định của PM ở `.memlog.md` |
| Reviewer gate vòng 3 (2026-10-02) | Quyết định PM D1–D5 (`.memlog.md`) và p95 2 phút; Màn 0, ngăn transcript, Màn 6 ba chế độ, trạng thái `withdrawn`, luật URL và nút quay lại, truy cập (NFR-15); kiểm duyệt trong request theo bảng chính sách, kiểm an toàn đầu ra, gói chống lạm dụng, công tắc tắt; xóa tài khoản; log truy cập gồm CLI; sự kiện ở server; generator không nhận nội dung item mục tiêu; mô hình dữ liệu bổ sung; ước tính ~63,75 ngày | `review-r2-rubric.md`, `review-r2-consistency.md`, `review-r2-adversarial.md`, `review-r2-screen-readiness.md`; quyết định của PM ở `.memlog.md` |