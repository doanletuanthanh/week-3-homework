---
title: 'Addendum PRD: InterviewLab'
created: '2026-09-24'
updated: '2026-09-25'
---

# Addendum cho PRD

Tài liệu này chứa phần kỹ thuật, phương án đã cân nhắc và ước tính lịch, dành cho bước kiến trúc và lập kế hoạch. PRD chỉ giữ phần năng lực. Addendum của brief (2026-09-22) vẫn có hiệu lực, trừ §3 (lịch), nay thay bằng §6, và §3b (chi phí), nay thay bằng §5 dưới đây.

## Thuật ngữ

- **Nhãn tốt:** `confirm_grounded` hoặc `boundary_probe`.
- **Không dẫn dắt:** nhãn tốt hoặc `open`.
- **Vòng đời hook:** được chọn → *đã thả* (khi dò thấy cụm neo hook) → *đã nhặt*, hoặc *đóng* khi item của nó mở. Hook ở trạng thái đã thả thì **còn nhặt được** cho tới khi bị nhặt hoặc đóng.
- **Snapshot t−1:** trạng thái đã lưu sau lượt trước (§4).

## 1. Một lượt, từ đầu tới cuối

1. **Call 1** phân tích câu của người học (§2).
2. **Code kiểm** output của Call 1 (§2).
3. **Luật mở khóa** chạy trên snapshot t−1 (§3.1).
4. **Cập nhật** openness và hook ledger, rồi **chọn hook** được thả ở lượt này (§3.2).
5. **Call 2** sinh câu trả lời của persona (§2).
6. **Dò cụm neo** trong câu trả lời để ghi hook đã thả và item đã nói ra (§3.2).
7. **Ghi lượt** (`turn` và `snapshot`) trong một transaction (§4).

Hai call chạy tuần tự, vì context của Call 2 phụ thuộc kết quả mở khóa.

## 2. Hợp đồng hai call

**Call 1 (phân tích)**

- Input: danh tính, fact bề mặt, nội dung các item đã mở, hook line đã thả (kèm ID), topic tag của mọi item, ràng buộc do-not-assert trung tính ở mức topic tag (kèm ID), transcript, và câu mới của người học.
- Input **không có** nội dung của item còn khóa, cụm neo nội dung, đường mở, ngưỡng hay trọng số. Call 1 không biết item nào đang chờ được mở.
- Câu của người học được bọc lại và coi là dữ liệu, không bao giờ coi là chỉ dẫn.
- Output JSON:

```json
{
  "question_type": "open | closed | hypothetical_future | past_specific | other",
  "label": "confirm_grounded | boundary_probe | open | leading",
  "grounded_turn_id": 5,
  "hook_id": "H3",
  "topic_tags": ["subscription"],
  "prev_persona_violations": ["DNA-7"]
}
```

**Code kiểm (không tốn LLM)**

- Nhãn tốt nhưng `grounded_turn_id` là null, trỏ tới lượt không phải của persona, hoặc lớn hơn chỉ số lượt hiện tại → hạ nhãn thành `leading`.
- `hook_id` không trỏ tới một hook đã thả và còn nhặt được → đặt thành null.
- Tag trong `topic_tags` không có trong kịch bản → bỏ tag đó. Nhiều hơn 1 tag → chỉ giữ tag đầu tiên.
- Có `prev_persona_violations` → gắn cờ lượt persona trước và ghi log.

**Call 2 (persona)**

- Input: danh tính, fact bề mặt, item đã mở (kể cả item vừa mở, kèm chỉ dẫn "nói ra điều này khi phù hợp"), tối đa 1 hook line cần thả, kèm cụm neo mà persona phải nói nguyên văn, ràng buộc do-not-assert trung tính ở mức topic tag, và transcript.
- Output: chỉ câu trả lời. Persona không khai báo gì; mọi sự kiện (hook đã thả, item đã nói ra) đều do code dò ra (§3.2).

## 3. Luật mở khóa và vòng đời hook (code)

### 3.1 Luật mở khóa

Mọi điều kiện đọc snapshot t−1.

**Openness** (tham số cho từng kịch bản; các giá trị mặc định dưới đây là `[ASSUMPTION]`): bắt đầu ở 3 trên thang 0–10. Nhãn tốt +1. `open` ±0. `past_specific` (khi không dẫn dắt) +1 thêm. `leading` −2. Giá trị kẹp trong [0, 10]. Mỗi item mở qua đường tin tưởng có `ngưỡng_I` riêng trong kịch bản, và CLI kiểm rằng ngưỡng này đạt được trong ≤20 lượt có nhãn tốt.

| Đường mở | Điều kiện mở item I |
|---|---|
| Bề mặt | `topic_tags` chứa tag của I VÀ không dẫn dắt |
| Follow-up | `hook_id` trỏ tới một hook của I VÀ hook đó đã thả và còn nhặt được VÀ nhãn tốt VÀ `grounded_turn_id` là lượt đã thả hook |
| Chuyện quá khứ | `question_type = past_specific` VÀ (tag của I có trong `topic_tags` HOẶC `hook_id` trỏ tới một hook của I) VÀ không dẫn dắt |
| Tin tưởng | `openness ≥ ngưỡng_I` VÀ tag của I có trong `topic_tags` VÀ không dẫn dắt |

- Mỗi lượt mở tối đa 1 item `[ASSUMPTION]`, để persona không kể nhiều điều cùng lúc. Nếu nhiều item cùng thỏa, mở item có trọng số cao nhất (trong replay: ưu tiên item mục tiêu). Item không được chọn không mất gì: hook của nó vẫn nhặt được, và câu hỏi sau vẫn mở được nó.
- Item có item tiên quyết chỉ được xét khi item tiên quyết đã mở.

### 3.2 Vòng đời hook

**Chính sách thả hook (code quyết định).** Mỗi lượt persona thả tối đa 1 hook. Một hook đủ điều kiện khi:
- item của nó còn khóa, và item tiên quyết (nếu có) đã mở;
- hook chưa được thả;
- `topic_tags` của lượt này chứa tag của item, hoặc lượt này vừa mở item tiên quyết.

Nếu nhiều hook đủ điều kiện, chọn theo trọng số, rồi theo thứ tự trong kịch bản.

**Dò cụm neo.** Sau Call 2, code chuẩn hóa dấu câu, hoa thường và khoảng trắng, rồi so khớp câu trả lời với các cụm neo:
- Có cụm neo của hook đã chọn: ghi hook là đã thả ở lượt này. Không có: hook vẫn chưa thả, và được chọn lại ở lượt đủ điều kiện kế tiếp.
- Có cụm neo nội dung của một item đã mở: ghi item đã nói ra.

**Hook ledger.** Mỗi hook đi từ `dropped@t` tới `picked@t'`, với t' là lượt đầu tiên sau t có `hook_id` trỏ tới hook đó. Nếu lượt t+1 không nhặt, ledger ghi chú thích `ignored@t+1`, nhưng hook vẫn nhặt được. Hook đóng khi item của nó mở theo bất kỳ đường nào.

## 4. Mô hình dữ liệu (phác thảo)

- `scenario(id, role, language, version, status=draft|published, json)`: JSON gồm persona, item (nội dung, cụm neo nội dung, topic tag, đường mở, tiên quyết, hook line, cụm neo hook, do-not-assert, trọng số, ngưỡng, câu hỏi mẫu) và pattern guide.
- `session(id, user_id, scenario_id, language, status=interviewing|revealed|replaying|done, started_at, ended_at, guess, revealed_at, verifier_json)`
- `turn(session_id, branch_id, index, learner_text, persona_text, analysis_json, hooks_dropped, items_disclosed, flagged)`
- `snapshot(session_id, branch_id, index, unlocked[{item_id, turn}], ledger[{hook_id, state, turn, ignored_at}], disclosed[], openness)`: chỉ ghi thêm, không sửa.
- `branch(id, session_id, kind=main|replay, fork_after_turn, target_item_id, fallback_level, result)`
- Mỗi lượt ghi `turn` và `snapshot` trong một transaction.
- Reveal đọc `branch=main` và đóng băng dữ liệu bằng `revealed_at`. Kết quả verifier lưu ở `verifier_json`, nên khi mở lại màn reveal, hệ thống không gọi lại LLM.

## 5. Ước tính chi phí (chưa đo)

- **Số call:** buổi dài nhất có 30 lượt × 2 = 60 call, replay 3 lượt × 2 = 6 call, verifier 1 call. Tổng **≤67 call** (trước đây ~135–150).
- **Token:** Call 1 lớn dần theo transcript, trung bình ~3k token vào. Call 2 ~2,5k vào. Verifier ~8k vào. Mỗi call ra ~150 token. Cả buổi khoảng 0,2M token vào và 10k token ra.

Giá lấy theo bảng giá giả định trong addendum của brief, tỷ giá ~26.000 VND/USD:

| Tier | USD/buổi | VND/buổi |
|---|---|---|
| Nhỏ (~0,5 / ~2 USD mỗi 1M token) | ~$0,12 | ~3k |
| Trung (~3 / ~15) | ~$0,75 | ~20k |

- **Phương án khả dĩ:** tier nhỏ cho Call 1, tier trung cho Call 2 nếu eval về độ chân thực của persona cho thấy cần.
- **Nguồn giá:** mốc 100–200k VND cho một gói prep-sprint là suy luận từ research §7, chưa kiểm. Giá khóa học đã kiểm: Capi Demy 9,99 triệu, ColorME 2,2 triệu, Keyframe 5,2–5,8 triệu. Giá ChatGPT tại VN, Synthetic Users, Yoodli và khóa BA tại VN chưa kiểm, và không được dùng trong copy.
- Nếu một gói có 3–5 buổi, tier trung tốn ~60–100k VND, vẫn dưới mốc 100–200k VND.
- Cache phần context cố định của kịch bản sẽ giảm thêm chi phí.

## 6. Lịch must-ship (tự ước tính từ dưới lên, chưa kiểm)

**Quyết định của PM (2026-09-25):** không cắt mục nào. PM có hơn 14 ngày để build, nên giữ cả bốn mục: 2 kịch bản lúc ra mắt (tiêu chí nghiệm thu vẫn là tối thiểu 1), dự phòng 1 của replay, verifier ở màn reveal, và đăng nhập bằng cả Google lẫn magic link. Kế hoạch: **~16,25 ngày**.

[NOTE FOR PM] 16,25 ngày là tổng công việc (15,25 + 1 cho kịch bản thứ hai), **chưa có buffer**. Review adversarial khuyên giữ ≥2 ngày buffer, tức lịch khoảng 18 ngày.

Forge ước tính 12,5 trên 14 ngày có sẵn cho danh sách must-ship cũ, nhưng không có bảng chi tiết. Bảng dưới đây ước tính lại sau review. Đơn vị là ngày dev.

| Hạng mục | Ngày |
|---|---|
| Schema, CLI `validate` (kể cả kiểm trùng từ nội dung và kiểm khả năng đến được), soạn kịch bản 1 (thêm cụm neo) | 2 |
| Engine: 2 call, luật mở khóa, openness, ledger, dò cụm neo, chính sách thả hook, snapshot, transaction, resume, xử lý lỗi | 3 |
| Đoán, reveal, verifier (lưu kết quả, thử lại), nhận xét theo template kèm lời khen | 1,5 |
| Replay: chọn khoảnh khắc, dự phòng, nhánh, niêm phong, resume, UI | 1,5 |
| Guide theo template, bản in | 0,5 |
| Đăng nhập, deploy, riêng tư, trang chủ, thư viện, màn chuẩn bị | 1,5 |
| Eval harness: run tốt/xấu ×3, 20 adversarial, judge rò rỉ, chỉ số, cổng publish, verifier lúc soạn | 3 |
| Test set phân loại tiếng Việt (≥100 câu, 4 nhãn) và tinh chỉnh | 1 |
| Cap chi phí, log sự kiện, nút waitlist | 0,5 |
| Trang "Buổi của tôi" (danh sách, header, trạng thái trống 0,25; chế độ chỉ đọc dùng lại reveal và guide 0,5) | 0,75 |
| **Tổng, 1 kịch bản** | **15,25** |
| Kịch bản thứ hai | +1 |

**Các lựa chọn cắt đã cân nhắc** (không chọn):

| Cắt | Tiết kiệm | Cái giá |
|---|---|---|
| Kịch bản thứ hai ra sau | 1 | SM-3 và SM-4 chưa đo được; Màn 9 hiện "Sắp có" |
| Dự phòng 1 của replay (hỏi lại lượt dẫn dắt) → chỉ hiện câu hỏi mẫu | 0,25 | Buổi không có hook bị bỏ qua sẽ không có replay |
| Verifier ở màn reveal → chỉ chạy trong eval | 0,5 | Lời khen có căn cứ không được kiểm lúc chạy (bỏ lời khen, hoặc chấp nhận rủi ro); NFR-8 chỉ đo trên eval. Mỗi buổi bớt 1 call |
| Chỉ đăng nhập bằng Google, bỏ magic link | 0,25 | Người không có tài khoản Google không vào được |

## 7. Phương án đã cân nhắc

### Engine

| Phương án | Kết quả | Lý do | Thay bằng |
|---|---|---|---|
| Call 1 trả về "item nào được mở" (đề xuất ban đầu của PM) | Bác | Đưa quyết định mở khóa trở lại model, trái với luật đã chốt ở forge ("cổng do logic agent"). Cách này buộc nội dung item còn khóa nằm chung context với văn bản thô của người học, nên một injection thành công sẽ mở item và persona sẽ nói ra item đó ở lượt sau. Nhãn và quyết định mở khóa sẽ sai cùng lúc, và không có bước nào kiểm độc lập | Call 1 chỉ trả bằng chứng; code quyết định (§3.1) |
| Self-check do-not-assert thành call riêng mỗi lượt | Bác | Vượt giới hạn 2 call | Kiểm trễ một lượt trong Call 1. Cách này phát hiện chứ không ngăn được. Chấp nhận được, vì nội dung item còn khóa không có trong context persona, nên rủi ro còn lại là persona nói trước hoặc nói ngược một item, không phải rò nguyên văn |
| Persona tự khai báo hook đã dùng (`hook_ids_used`) | Bác sau review | Lời khai không được kiểm, nên ledger có thể ghi một hook persona chưa từng nói rồi trách người học đã bỏ qua | Code chọn hook và dò cụm neo nguyên văn (§3.2) |
| Hook chỉ nhặt được ở lượt ngay sau | Bác sau review | "3 lượt" của replay thực chất chỉ còn 1 lần thử, và người học bị phạt khi quay lại một chi tiết ở lượt sau (một kỹ thuật tốt) | Hook còn nhặt được cho tới khi item mở; "bỏ qua" chỉ là chú thích |
| Ràng buộc do-not-assert viết theo nội dung item | Bác sau review | Đưa nội dung item còn khóa vào cả hai call | Luật hành vi ở mức topic tag; nội dung chỉ được judge kiểm ở eval |
| Ràng topic tag vào từ khóa trong câu của người học (chống injection) | Không làm | Neo từ khóa tiếng Việt sẽ chặn nhầm câu hỏi thật khi người học diễn đạt khác. Người học tự chèn injection chỉ làm hỏng buổi luyện của chính mình | Giới hạn 1 tag và 1 item mở mỗi lượt |
| Chỉ 3 nhãn cho mọi câu hỏi | Mở rộng (PM, 2026-09-25) | Bộ 3 nhãn đã chốt ở forge dành cho câu hỏi đóng, tức câu hỏi mang nội dung cần đối chiếu. Câu hỏi mở không thuộc nhãn nào; không có nhãn riêng thì mọi câu hỏi mở không trích lượt trước bị tính là dẫn dắt | Thêm nhãn `open`: lấp lỗ hổng của luật đã chốt chứ không phá nó |

### Trải nghiệm người học và phạm vi

| Phương án | Kết quả | Lý do | Thay bằng |
|---|---|---|---|
| Hiện cho người học "mở bằng phán đoán dễ dãi" | Bác (PM) | Gây rối, và khiến sản phẩm tự làm mất tin cậy trước mặt người dùng | Chỉ số nội bộ (NFR-8) |
| LLM diễn đạt feedback và guide lúc chạy | Hoãn sang Later | Template dựng từ ledger không tốn call, không bịa được, và verifier chạy một lần lúc soạn kịch bản | Template |
| Bộ đếm live số item đã mở | Bác | Không có tier để quyết định ai được thấy; con số live khuyến khích người học chơi để tăng số | Chỉ tổng niêm phong |
| Ô tự do "khoảnh khắc bạn thấy mình bỏ lỡ" | Bỏ | Không phần nào trong sản phẩm dùng tới; so khớp câu tự do với khoảnh khắc thật cần thêm một LLM call | Chỉ thanh trượt đoán số |
| Admin dashboard trong MVP | Ở lại Later (PM) | CLI đủ cho việc soạn kịch bản; thời gian dư ưu tiên cho phần người học dùng | CLI `validate` / `eval` / `publish` |
