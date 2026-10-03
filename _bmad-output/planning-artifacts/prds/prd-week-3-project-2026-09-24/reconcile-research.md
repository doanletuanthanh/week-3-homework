---
title: 'Đối chiếu research.md với PRD (reconciliation)'
created: '2026-09-25'
input: 'research/competitive-ai-interview-practice-agent-positioning-2026-09-22/research.md'
against: 'prds/prd-week-3-project-2026-09-24/prd.md, addendum.md, .memlog.md'
---

# Đối chiếu research vs PRD

Phạm vi: chỉ đọc "Khuyến nghị", "Insight liên chiều", "Đánh giá các giả định trong forged-idea.md", §4–§7 của `research.md` (2026-09-22). Bỏ qua chi tiết phụ lục nguồn. Đối chiếu với `prd.md` + `addendum.md` (2026-09-24) cùng thư mục; quyết định đã log trong `.memlog.md` không tính là gap.

---

## 1. Gaps (research nói nhưng PRD bỏ sót hoặc mâu thuẫn)

### G1 — Beachhead (sinh viên HCI/UX VN) vẫn "chưa kiểm", nhưng PRD không mang cảnh báo này sang §11
**Severity: Cao**

Research đánh dấu đây là **"Lưu ý lớn nhất"** ngay trong Tóm tắt điều hành: *"beachhead (sinh viên HCI ở VN), nhu cầu BA/PM và khả năng trả tiền đều chưa được kiểm bằng dữ liệu... Cần 5–8 phỏng vấn người học thật trước khi khóa thông điệp."* Bảng "Đánh giá các giả định" xác nhận lại: *"Beachhead: sinh viên HCI/UX năm cuối ở VN — Chưa kiểm: không có tiếng nói người học VN."* Câu hỏi mở đầu tiên của research cũng là câu này.

PRD (`prd.md` §1, §11) lấy sinh viên HCI/UX VN làm "Người dùng ra mắt" và xây toàn bộ UJ-1 quanh Linh mà **không gắn [ASSUMPTION]** và **không liệt kê trong §11 "Giả định và câu hỏi mở"**. §11 chỉ có giả định #6 (BA/PM) và #8 (trả tiền) — hai giả định *khác* mà research cũng nêu, nhưng giả định về beachhead chính (nỗi đau có thật của đối tượng ra mắt) thì biến mất, dù nó là giả định rủi ro nhất trong toàn bộ research.

**Nên nằm ở đâu:** `prd.md` §11, thêm một dòng giả định/câu hỏi mở tương đương giả định #6 và #8, ví dụ: "Giả định #beachhead: nỗi đau của sinh viên HCI/UX VN — chưa kiểm bằng dữ liệu người dùng thật; cần 5–8 phỏng vấn nhanh trước khi khóa thông điệp trang chủ."

### G2 — Rủi ro "độ thật" (realism) của persona AI không được PRD ghi nhận ở đâu cả
**Severity: Trung bình–Cao**

Đây là **Insight liên chiều #3** của research: *"Độ thật là điểm yếu chung của mọi persona AI... Sinh viên đánh giá người thật 'thật và cuốn hút hơn' dù persona RAG dạy tốt hơn [8]. Synthetic users xu nịnh và phẳng [9][33]."* Bảng đánh giá giả định lặp lại điều này ở hai dòng: *"'Bổ trợ, không thay thế' con người — Ủng hộ: người thật được đánh giá thật hơn [8]"* và *"AI soạn kịch bản BA/PM... — Bị thách thức: độ thật là điểm yếu đã được đo [8][9]."*

PRD không có bất kỳ NFR, chỉ số ở §9, hay câu hỏi mở nào theo dõi độ thật/mức cuốn hút của persona. Trong khi đó, copy Màn 3 chủ động mời người học so sánh với người thật: *"không có câu trả lời đúng sẵn, cứ hỏi như đang gặp người thật"* — đúng điểm mà research cảnh báo là điểm yếu đo được, không phải giả thuyết. Rủi ro: nếu người học thấy persona kém thật, trải nghiệm "phòng tập" mất tín nhiệm dù engine mở khóa đúng kỹ thuật — và không có tín hiệu nào trong sản phẩm để phát hiện việc này.

**Nên nằm ở đâu:** `prd.md` §11 (câu hỏi mở mới) hoặc §9 (một chỉ số định tính/khảo sát ngắn "persona có đủ thật để luyện không"), hoặc một NFR mới ghi nhận đây là rủi ro đã biết, chưa có phép đo.

### G3 — Mốc giá "100–200k VND/prep-sprint" bị nâng cấp thành mốc thiết kế mà không mang theo cảnh báo "chưa kiểm, độ tin thấp" của research
**Severity: Trung bình**

Research §7 tự gắn nhãn rõ: *"Đọc tín hiệu (suy luận từ các mốc trên, **chưa kiểm**)... khoảng 100–200k VND cho một gói prep-sprint... Chưa có dữ liệu WTP trực tiếp nào."* Đây là một suy luận có độ tin thấp, không phải một benchmark đã kiểm chứng.

`addendum.md` §4 lại dùng con số này như một **mốc thiết kế đã chốt** cho bài toán chi phí: *"Nếu một gói prep-sprint có 3–5 buổi, tier trung tốn ~60–100k VND, **vẫn dưới mốc 100–200k**."* `prd.md` NFR-3 tham chiếu thẳng tới addendum §4 mà không gắn [ASSUMPTION]. So sánh: NFR-6 (tỉ lệ rò ~0,6/episode) được PRD tự tay caveat đúng cách — *"chỉ để tham chiếu, không dùng làm claim"* — cho thấy đội đã biết cách xử lý số liệu research đúng mức tin cậy ở chỗ khác, nhưng bỏ sót ở mốc giá.

**Nên nằm ở đâu:** `addendum.md` §4 (thêm dòng "mốc 100–200k VND là suy luận chưa kiểm từ research §7, không phải benchmark WTP thật") hoặc `prd.md` NFR-3 gắn [ASSUMPTION].

### G4 — Khuyến nghị #5 (kiểm BA thật cho danh mục kịch bản BA/PM) không có chỗ đứng trong roadmap Next
**Severity: Thấp**

Khuyến nghị 5 của research: *"Vẫn nên tìm 1–2 BA thật để kiểm tra nhẹ, vì độ thật là điểm yếu đã được đo [8]."* (Feeds: pipeline sinh kịch bản). `prd.md` §3 "Next" chỉ ghi: *"pipeline sinh kịch bản (CLI) → kịch bản BA/PM (sàn 8 item), kèm câu hỏi vai trò ở onboarding"* — không nhắc tới bước kiểm bằng BA thật trước khi publish kịch bản BA/PM. Vì BA/PM đã bị đẩy ra khỏi MVP nên mức độ khẩn cấp thấp, nhưng nếu không ghi lại ngay bây giờ, khuyến nghị này dễ bị quên khi triển khai Next.

**Nên nằm ở đâu:** `prd.md` §3 dòng "Next", thêm cụm "kèm 1–2 BA thật kiểm tra nhẹ nội dung trước publish".

---

## 2. Intentionally changed (đã log quyết định — không phải gap)

- **BA/PM bị đẩy ra khỏi ra mắt, chỉ ra mắt khi pass eval đầy đủ** — đúng tinh thần research (giả định #6 "bị thách thức về nhu cầu", "danh mục §6 lệch về y tế"). Logged: `.memlog.md` "Cuts: ... BA/PM notify button (assumption #6 has no in-product signal at launch, interviews only)".
- **Không tuyên bố replay có "bằng chứng khoa học"** (khuyến nghị #4) — PRD/addendum không nhắc OSCE/SP ở đâu cả, và §9 tự caveat "chỉ số tương tác, không chứng minh việc học". Nhất quán, không đối lập với research dù không trích dẫn trực tiếp.
- **"Bổ trợ, không thay thế" người thật** — logged qua việc loại "mọi đầu ra dạng insight về người dùng thật" khỏi phạm vi (§3 Ngoài phạm vi) và Ranh giới đạo đức §1. Khớp giả định "Ủng hộ" trong research.
- **Persona sinh từ câu hỏi nghiên cứu của người học** — bị loại hẳn khỏi phạm vi (§3), mạnh hơn cả đề xuất thận trọng "cùng lĩnh vực, khác câu hỏi" mà research chấp nhận cho neo giả thuyết [10][34]. Đây là lựa chọn an toàn hơn research yêu cầu, không phải gap.
- **Waitlist "mở thêm" giữ lại làm tín hiệu B2B2C duy nhất** — khớp trực tiếp khuyến nghị #6 và giả định #8 trong §11.

---

## 3. Covered (research feeds vào đúng chỗ trong PRD)

- **Khuyến nghị #1 (định vị "phòng tập phỏng vấn... có phản hồi kèm bằng chứng", tránh "UX interview practice", dùng cụm đầy đủ "phỏng vấn người dùng")** → tiêu đề PRD, headline trang chủ Màn 1 dùng đúng cụm đầy đủ, không rút gọn thành "phỏng vấn" đứng một mình.
- **Khuyến nghị #2 (headline phụ bằng ngôn ngữ người học, tránh từ "feedback")** → sản phẩm mô tả "kèm bằng chứng bạn sai ở đâu", Màn 1 "Xem chính xác bạn đã bỏ lỡ điều gì" — không dùng từ "feedback".
- **Khuyến nghị #3 (đưa tỉ lệ rò vào eval harness, lấy benchmark [7] làm mốc so sánh)** → NFR-4, NFR-6, FR-34 (20 run adversarial, 0 rò rỉ là ngưỡng nghiệm thu §10.2); NFR-6 trích rõ mốc 0,6/episode và caveat đúng cách.
- **Insight #1 (thông điệp khác biệt là "luyện kèm bằng chứng", không phải "luyện với AI")** → nguyên văn gần như được PRD lấy lại ở §1.
- **Insight #2 (tin cậy theo cấu trúc là điều kiện chạy được, không phải trang trí)** → toàn bộ §5 (2-call pipeline, code quyết định mở khóa), NFR-4, NFR-5, FR-12/13.
- **Insight #4 (định vị đạo đức = định vị cạnh tranh, không thay thế nghiên cứu thật)** → Ranh giới đạo đức §1, "Ngoài phạm vi" §3.
- **Insight #5 / khuyến nghị #6 (thử B2B2C song song B2C qua waitlist + phỏng vấn giảng viên)** → §11 giả định #8, nút waitlist FR-32.
- **Giả định "Replay là bằng chứng khác biệt duy nhất — chưa kiểm về hiệu quả học"** → §9 tự gắn caveat "chỉ số tương tác, không chứng minh việc học"; §11 lặp lại "kết quả replay chỉ đo tương tác".
- **Giả định "OSCE/SP... không nên nói 'đã chứng minh'"** → PRD không trích OSCE/SP ở đâu, không có nguy cơ overclaim.

---

## Ghi chú phương pháp

Không sửa `prd.md`, `addendum.md`, hay `.memlog.md`. Chỉ tạo file này.
