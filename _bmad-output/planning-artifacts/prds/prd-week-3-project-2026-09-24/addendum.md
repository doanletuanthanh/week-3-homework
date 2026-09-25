---
title: 'Addendum PRD: Phòng tập phỏng vấn người dùng'
created: '2026-09-24'
updated: '2026-09-24'
---

# Addendum cho PRD

Phần kỹ thuật và phương án đã cân nhắc, dành cho bước kiến trúc. PRD chỉ giữ phần năng lực. Addendum của brief (2026-09-22) vẫn có hiệu lực, trừ những chỗ ghi "thay thế" dưới đây.

## 1. Hợp đồng hai call mỗi lượt

**Call 1 (phân tích).** Output JSON:

```json
{
  "question_type": "open | closed | hypothetical_future | past_specific | other",
  "label": "confirm_grounded | boundary_probe | leading",
  "grounded_turn_id": 5,
  "hook_id": "H3",
  "topic_tags": ["subscription"],
  "prev_persona_violations": ["DNA-7"]
}
```

- Input: danh tính, fact bề mặt, nội dung các item đã mở, hook line **đã thả** (kèm ID), topic tag của mọi item, ràng buộc do-not-assert (kèm ID), transcript, và câu mới của người học.
- Input **không có** nội dung item khóa, đường mở, ngưỡng hay trọng số. Call 1 không biết item nào đang chờ được mở.
- Câu của người học được bọc làm dữ liệu, không bao giờ là chỉ dẫn.

**Code kiểm (không tốn LLM):**
- Nhãn tốt mà `grounded_turn_id` là null, không phải lượt persona, hoặc lớn hơn lượt hiện tại → hạ thành `leading`.
- `hook_id` không nằm trong ledger ở trạng thái đã thả, hoặc thuộc item đã mở → đặt thành null.
- `topic_tags` không có trong kịch bản → bỏ.
- Có `prev_persona_violations` → gắn cờ lượt persona trước và ghi log.

**Call 2 (persona).** Output JSON: `{ "reply": "...", "hook_ids_used": ["H4"] }`.
- Input: danh tính, fact bề mặt, item đã mở (kể cả item vừa mở), danh sách hook **được phép thả** (hook của item khóa mà điều kiện tiên quyết đã thỏa), do-not-assert, và transcript.
- Code chỉ chấp nhận `hook_ids_used` nằm trong danh sách được phép. Hook nào bị khai báo mà thực ra không có trong câu trả lời thì bị bắt ở verifier lúc reveal (chỉ với khoảnh khắc replay) và ở eval.

Hai call chạy tuần tự, vì context của Call 2 phụ thuộc kết quả mở khóa. Gọi song song là không thể.

## 2. Luật mở khóa (code)

"Nhãn tốt" nghĩa là `confirm_grounded` hoặc `boundary_probe`.

| Đường mở | Điều kiện mở item I |
|---|---|
| Bề mặt | `topic_tags` chứa tag của I VÀ nhãn khác `leading` |
| Follow-up | `hook_id` thuộc I VÀ hook đó ở trạng thái đã thả VÀ nhãn tốt VÀ `grounded_turn_id` là lượt đã thả hook |
| Chuyện quá khứ | `question_type = past_specific` VÀ (tag của I có trong `topic_tags` HOẶC `hook_id` thuộc I) VÀ nhãn khác `leading` |
| Tin tưởng | `openness ≥ ngưỡng_I` VÀ tag của I có trong `topic_tags` VÀ nhãn khác `leading` |

Mỗi lượt mở tối đa 1 item `[ASSUMPTION]`. Nếu nhiều item cùng thỏa, mở item có trọng số cao nhất, để persona không đổ ra nhiều điều cùng lúc.

**Openness** (tham số cho từng kịch bản; giá trị khởi điểm là `[ASSUMPTION]`): bắt đầu ở 3 trên thang 0–10. Nhãn tốt +1. `past_specific` +1 thêm. `leading` −2. Giá trị kẹp trong [0, 10].

**Hook ledger:** mỗi hook có trạng thái `dropped@t` → `picked@t'` (nếu lượt t+1 trỏ `hook_id` vào nó) hoặc `ignored@t+1`. Hook thuộc item đã mở bằng đường khác sẽ đóng.

## 3. Mô hình dữ liệu (phác thảo)

- `session(id, user_id, scenario_id, language, status, started_at, ended_at, guess, revealed_at)`
- `turn(session_id, branch_id, index, learner_text, persona_text, analysis_json, persona_hooks, flagged)`
- `snapshot(session_id, branch_id, index, unlocked[{item_id, turn}], ledger[{hook_id, state, turn}], openness)`: chỉ ghi thêm, không sửa.
- `branch(id, session_id, kind=main|replay, fork_after_turn, target_item_id, fallback_level, result)`
- Mỗi lượt ghi `turn` và `snapshot` trong một transaction.
- Reveal đọc `branch=main` và đóng băng dữ liệu bằng `revealed_at`.

## 4. Ước tính chi phí (chưa đo; thay thế addendum brief §3b)

- **Số call:** buổi dài nhất 30 lượt × 2 = 60, replay 3 × 2 = 6, verifier 1. Tổng **≤67 call** (trước đây ~135–150).
- **Token:** Call 1 lớn dần theo transcript, trung bình ~3k token vào. Call 2 ~2,5k vào. Verifier ~8k vào. Mỗi call ra ~150 token. Cả buổi ra ≈0,2M token vào và ≈10k token ra.
- **Giá** (bảng giá giả định như addendum brief, ~26.000 VND/USD):

| Tier | Chi phí/buổi | VND/buổi |
|---|---|---|
| Nhỏ (~0,5 / ~2 USD mỗi 1M token) | ~$0,12 | ~3k |
| Trung (~3 / ~15) | ~$0,75 | ~20k |

- Cache phần context cố định của kịch bản sẽ giảm thêm chi phí.
- Nếu một gói prep-sprint có 3–5 buổi, tier trung tốn ~60–100k VND, vẫn dưới mốc 100–200k.
- Phương án khả dĩ: tier nhỏ cho Call 1, tier trung cho Call 2 nếu eval độ thật cần.

## 5. Phương án đã cân nhắc

- **Call 1 trả về "item nào được mở" (đề xuất ban đầu của người dùng): bác.** Phương án này đưa quyết định mở khóa trở lại model, trái với luật đã khóa ở forge ("cổng do logic agent"). Nó cũng buộc nội dung khóa nằm chung context với văn bản thô của người học, nên một injection thành công sẽ mở item và persona sẽ nói ra item đó ở lượt sau. Ngoài ra, nhãn và quyết định mở khóa sẽ sai cùng nhau, không có gì kiểm độc lập.
- **Self-check do-not-assert thành call riêng mỗi lượt: bác**, vì vượt giới hạn 2 call. Thay bằng kiểm trễ một lượt trong Call 1. Cách này phát hiện chứ không ngăn được. Chấp nhận được, vì nội dung khóa vốn không có trong context của persona, nên rủi ro còn lại chỉ là persona nói trước hoặc nói ngược một item, không phải rò nguyên văn.
- **Hiện cho người học "mở bằng phán đoán dễ dãi": bác** (quyết định của người dùng). Nó gây rối và khiến sản phẩm tự làm mất tin cậy trước mặt người dùng. Chỉ giữ làm chỉ số nội bộ.
- **LLM diễn đạt feedback và guide lúc chạy: hoãn** `[ASSUMPTION]`. Template dựng từ ledger không tốn call, không bịa được, và verifier chạy một lần lúc soạn kịch bản.
- **Bộ đếm live số item đã mở: bác.** Không có tier để quyết định ai được thấy, và một con số live khuyến khích người học chơi để tăng số.
- **Ô tự do "khoảnh khắc bạn thấy mình bỏ lỡ": bỏ** `[ASSUMPTION]`. Không có phần nào trong sản phẩm dùng tới nó. So khớp câu tự do với khoảnh khắc thật cần thêm một LLM call.
