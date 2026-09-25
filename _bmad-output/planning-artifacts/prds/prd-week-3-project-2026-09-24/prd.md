---
title: 'PRD: Phòng tập phỏng vấn người dùng (tên tạm)'
status: draft
created: '2026-09-24'
updated: '2026-09-24'
---

# PRD: Phòng tập phỏng vấn người dùng (tên tạm)

> Nguồn: `brief.md` và `addendum.md` của brief (2026-09-22), `forged-idea.md`, `research.md`.
> Chi tiết kỹ thuật (hợp đồng từng LLM call, luật mở khóa dạng giả mã, mô hình dữ liệu snapshot, ước tính chi phí): `addendum.md` cùng thư mục.
> Thẻ `[ASSUMPTION]` đánh dấu chỗ suy luận hoặc đề xuất chưa được duyệt.

## 1. Sản phẩm

Người mới học phỏng vấn người dùng thường chỉ biết mình hỏi sai **sau khi** buổi phỏng vấn thật đã qua, ví dụ hỏi câu dẫn dắt, không hỏi sâu, hoặc bỏ qua một chi tiết người kia vừa nhắc. Sản phẩm là **phòng tập phỏng vấn người dùng, kèm bằng chứng bạn sai ở đâu**.

Người học phỏng vấn một persona AI. Persona giữ một **tảng băng** gồm 8–12 điều chưa nói. Tảng băng cố định từ lượt đầu, và một điều chỉ mở ra khi người học hỏi đúng cách. Cuối buổi, người học đoán mình khai thác được bao nhiêu. Sau đó tảng băng lộ ra, mỗi điều kèm trích dẫn đúng lượt trong transcript. Người học quay lại **khoảnh khắc bị lỡ** để hỏi lại, rồi mang về một bộ câu hỏi dựa trên lỗi của chính mình.

**Bối cảnh:** sản phẩm production thật, 1 dev, MVP khoảng 2 tuần, responsive web app, deploy và demo end-to-end trên URL thật. Bản ra mắt chỉ có vai trò UX và chỉ tiếng Việt. Thư viện có 2 kịch bản (tối thiểu 1).

**Người dùng ra mắt:** sinh viên HCI/UX năm cuối ở VN sắp có phỏng vấn người dùng cho đồ án, ví dụ Linh ở UJ-1. BA và PM dùng chung kiến trúc nhưng chỉ ra mắt khi kịch bản của họ pass eval đầy đủ (Next).

**Ranh giới đạo đức** (thực thi bằng cấu trúc sản phẩm, không bằng disclaimer): sản phẩm chỉ đánh giá kỹ năng của người học và không bao giờ tạo nhận định về người dùng thật. Mọi trích dẫn đều lấy từ transcript. Dữ liệu của người học là riêng tư theo mặc định.

## 2. Thay đổi sau phản hồi reviewer

| Phản hồi | Thay đổi | Lý do |
|---|---|---|
| Replay cần spec cơ chế chính xác | Thêm §6: snapshot mỗi lượt, luật chọn khoảnh khắc, đường dự phòng, khôi phục context, 3 lượt qua cùng cổng, nhánh tách biệt | Brief chỉ có một dòng về replay, mà replay là bằng chứng khác biệt duy nhất |
| 4 LLM call mỗi lượt là quá nặng | Giới hạn **2 call mỗi lượt**: Call 1 "phân tích" (chỉ trả bằng chứng) và Call 2 "persona". **Code** quyết định mở khóa. Self-check do-not-assert chạy trễ một lượt, nằm trong Call 1. Guide và nhận xét ở màn reveal dùng template dựng từ ledger `[ASSUMPTION]`. Cả buổi còn ~67 call, trước đây ~135–150 | Lúc đầu định gộp classifier và cổng thành một call trả về "item nào được mở". Phương án này bị bác, vì nó đưa quyết định mở khóa trở lại model và buộc nội dung item khóa nằm chung context với văn bản thô của người học (mặt tấn công injection). Cách hiện tại: Call 1 không bao giờ thấy nội dung khóa, và mọi lần mở khóa phải có một sự kiện trong ledger làm chứng |
| Quá nhiều tính năng | Cắt khỏi must-ship: plumbing song ngữ (vẫn giữ trường `language` trong kịch bản), câu hỏi kinh nghiệm cùng bộ đếm theo tier, nút "Báo tôi khi BA/PM sẵn sàng", guide cá nhân hóa theo chủ đề thật, pipeline sinh kịch bản. Admin dashboard chuyển sang Later; soạn kịch bản bằng CLI | Giữ lõi chứng minh được: tảng băng, cổng, reveal, replay. Mỗi mục bị cắt đều ghi rõ hệ quả ở §3 |

## 3. Phạm vi MVP

**Trong MVP**
1. Schema kịch bản và 2 kịch bản UX tiếng Việt (tối thiểu 1). Mỗi kịch bản có hook line, ràng buộc do-not-assert, trọng số, câu hỏi mẫu và pattern cho guide.
2. Engine mỗi lượt: 2 call, luật mở khóa bằng code, openness, hook ledger, snapshot.
3. Đoán, reveal và verifier chạy lúc reveal.
4. Replay từ khoảnh khắc bị lỡ.
5. Guide dựng từ ledger cùng nội dung soạn sẵn trong kịch bản.
6. Bộ đếm niêm phong: chỉ hiện tổng số, không hiện số đã mở trong lúc phỏng vấn.
7. Đăng nhập tối thiểu, lưu trữ riêng tư, deploy.
8. CLI kiểm schema, eval harness làm cổng publish, verifier guide chạy lúc soạn.
9. Cap chi phí theo ngày.
10. Nút waitlist "mở thêm".

**Cắt và hệ quả**

| Mục | Hệ quả |
|---|---|
| Câu hỏi kinh nghiệm và tier | Mọi người thấy cùng một bộ đếm (chỉ tổng niêm phong) |
| Nút "Báo tôi khi BA/PM sẵn sàng" | Giả định #6 (nhu cầu BA/PM) **không có tín hiệu trong sản phẩm lúc ra mắt**, chỉ đo được qua phỏng vấn |
| Guide cá nhân hóa theo chủ đề thật | Lời hứa "Tự tin bước vào buổi phỏng vấn của bạn" yếu đi. Copy ra mắt chỉ được hứa guide dựa trên **lỗi của bạn**, không được hứa guide theo **đề tài của bạn** |
| Plumbing song ngữ | Chỉ có tiếng Việt. Trường `language` trong kịch bản giúp bản tiếng Anh sau này không phải migrate dữ liệu |

**Next:** pipeline sinh kịch bản (CLI) → kịch bản BA/PM (sàn 8 item), kèm câu hỏi vai trò ở onboarding → đường "Describe" (kịch bản custom) → thư viện tiếng Anh.
**Later:** admin dashboard, guide cá nhân hóa theo chủ đề, feedback theo tier, timeline câu hỏi và tỉ lệ nói, trình soạn kịch bản trực quan.
**Ngoài phạm vi:** phỏng vấn nhóm/workshop; persona sinh từ câu hỏi nghiên cứu của người học; mọi đầu ra dạng insight về người dùng thật; sản phẩm cho giảng viên; thanh toán; voice.

## 4. Hành trình chính

### UJ-1: Linh luyện trước buổi phỏng vấn thật đầu tiên

Linh là sinh viên HCI năm cuối. Trong 10 ngày tới cô có 5 buổi phỏng vấn người dùng cho đồ án, và chưa từng phỏng vấn ngoài role-play trên lớp. Một bạn cùng lớp gửi link vào group chat. Linh mở trên laptop lúc 11 giờ đêm, hơi lo vì tuần sau phải gặp người đầu tiên.

**Màn 1: Trang chủ.** Một câu: "Luyện phỏng vấn người dùng. Xem chính xác bạn đã bỏ lỡ điều gì." Bên dưới là ảnh chụp màn reveal: một dòng transcript được highlight, kèm chú thích "Chị ấy vừa nhắc tới một cách xoay xở. Bạn chuyển chủ đề." Nút "Bắt đầu một buổi luyện". Chưa cần đăng nhập. Màn này phải cho Linh hiểu ngay đây không phải chatbot, vì nó biết cô đã bỏ lỡ gì.

**Màn 2: Chọn kịch bản.** Có 2 thẻ. Mỗi thẻ gồm ảnh đại diện, tên và một câu bối cảnh về persona, bối cảnh nghiên cứu, và bộ đếm niêm phong ở góc ("Đang giữ 11 điều chưa nói"). Ví dụ: "Chị Thu, 26 tuổi, nhân viên văn phòng. Bối cảnh: bạn đang nghiên cứu cách sinh viên và người đi làm trẻ quản lý chi tiêu. Chị Thu từng dùng vài app rồi bỏ." Nếu Linh đã luyện một kịch bản, thẻ đó chuyển sang "Đã luyện · Xem lại kết quả" `[ASSUMPTION]`.

**Màn 3: Chuẩn bị** (đọc khoảng 20 giây). Ba dòng: bạn có tối đa 30 lượt hỏi, khoảng 15–20 phút; chị Thu chỉ nói ra những điều đó nếu bạn hỏi đúng cách; không có câu trả lời đúng sẵn, cứ hỏi như đang gặp người thật. Khi Linh bấm "Bắt đầu", hệ thống yêu cầu đăng nhập (Google hoặc magic link), kèm lý do: "để lưu lại buổi này cho bạn xem lại".

**Màn 4: Phỏng vấn.** Khung chat chiếm phần lớn màn hình. Thanh trên cùng luôn hiện tên persona và bối cảnh nghiên cứu, "Lượt 4/30", và "Chị Thu đang giữ 11 điều chưa nói" (số cố định). Màn này không có gợi ý, không hiện nhãn và không có bộ đếm số điều đã mở.

> Lượt 2. Linh: "Chị có muốn một app nhắc chị tiết kiệm không?" Chị Thu: "Ừ, cũng được đó em." Câu hỏi này bị gắn nhãn dẫn dắt (nó thêm nội dung mới) và có loại giả định-tương-lai. Openness giảm. Linh không được báo gì.
> Lượt 5. Linh: "Lần gần nhất chị thấy hết tiền trước cuối tháng là khi nào ạ?" Chị Thu: "Tháng trước. Chị nhớ là có lần chị định ghi lại nhưng rồi cũng bỏ." Câu trả lời mở item bề mặt "từng thử ghi chép rồi bỏ" và thả hook của item "đang trả phí cho một app gần như không mở".
> Lượt 6. Linh: "Dạ vâng. Còn chuyện ăn uống thì sao chị?" Ledger ghi hook ở lượt 5 bị bỏ qua.

Linh bấm "Kết thúc buổi" ở lượt 22. Nếu đi đủ tới lượt 30, buổi tự kết thúc.

**Màn 5: Đoán trước khi xem.** "Trước khi xem chị Thu giấu gì, bạn đoán xem: bạn khai thác được bao nhiêu trong 11 điều?" Linh trả lời bằng thanh trượt 0–11 và kéo tới 7. Ô tự do "khoảnh khắc bạn thấy mình bỏ lỡ" bị bỏ, vì không có phần nào trong sản phẩm dùng tới nó `[ASSUMPTION]`.

**Màn 6: Tảng băng lộ diện.** "Bạn đoán 7. Thực tế: 3 trên 11."
- **Đã khai thác (3):** mỗi mục kèm lượt đã mở nó.
- **Bỏ lỡ (7):** mỗi mục có thẻ đường mở cần dùng ("hỏi tiếp một chi tiết chị vừa nhắc", "chuyện đã xảy ra", "cần sự tin tưởng"). Mục nào có hook đã thả thì hiện lượt gần nhất, câu persona nói và câu Linh hỏi ngay sau đó.
- **Giữ lại để bạn thử (1):** mục gắn với khoảnh khắc replay **vẫn niêm phong** cho tới khi replay xong. Thẻ chỉ ghi "Lượt 5: chị Thu vừa nhắc tới một điều. Bạn đã chuyển chủ đề." `[ASSUMPTION]` Lý do: nếu Linh đã đọc nội dung item trước replay, replay chỉ còn là bài chép lại chứ không còn là phép thử.
- **Nhận xét cách hỏi,** dựng từ ledger theo template. Ví dụ: "Bạn hỏi 3 câu giả định tương lai (lượt 2, 9, 15). Ở lượt 2 bạn hỏi 'Chị có muốn một app nhắc chị tiết kiệm không?', chị Thu trả lời 'cũng được đó em'. Câu trả lời này không phản ánh hành vi thật." Mọi trích dẫn đều bấm được để nhảy tới lượt đó.

Cuối màn là một khối nổi bật: "Khoảnh khắc đáng tiếc nhất là lượt 5–6. Thử lại?" và nút "Quay lại lượt 6".

**Màn 7: Luyện lại.** Màn hình hiện lượt 4–5, dừng ở câu chị Thu vừa nói ("…chị định ghi lại nhưng rồi cũng bỏ"). Có một liên kết "xem toàn bộ transcript trước đó" và dòng chữ nhỏ "Bạn có 3 lượt."

> Linh: "Chị định ghi lại kiểu gì ạ?" Chị Thu: "Chị tải một cái app, ghi được hai tuần. Xong thấy phiền quá nên thôi. Mà chị quên hủy, giờ vẫn trừ tiền hàng tháng."
> Hệ thống hiện: "Đã mở khóa: Chị đang trả phí cho một app chị gần như không mở. Đây chính là điều bạn bỏ lỡ."

Nếu sau 3 lượt Linh vẫn chưa mở được, màn hình hiện nội dung item kèm một câu hỏi mẫu: "Một câu đã mở được nó: 'Chị định ghi lại kiểu gì ạ?'"

**Màn 8: Mang về.** Tiêu đề "Bộ câu hỏi cho buổi phỏng vấn thật của bạn". Một trang, dựng từ lỗi của Linh:
- "Thay vì hỏi" lấy nguyên văn câu dẫn dắt của Linh; "Hãy hỏi" lấy pattern soạn sẵn cho loại lỗi đó ("Lần gần nhất bạn … là khi nào? Chuyện gì đã xảy ra?").
- Thẻ "Thói quen cần để ý" chỉ hiện khi ledger cho thấy thói quen đó, ví dụ ≥2 hook bị bỏ qua: "bạn hay chuyển chủ đề khi người kia nhắc tới một chi tiết nhỏ. Khi nghe thấy 'chị có cách riêng', 'chị từng thử', hãy hỏi tiếp trước khi đi tiếp."

Nút "Tải về" dùng bản in thân thiện với PDF của trình duyệt `[ASSUMPTION]`.

**Màn 9: Sau buổi.** Thẻ kịch bản thứ hai ("Anh Dũng, chủ quán cà phê nhỏ, đang giữ 9 điều") và nút "Luyện tiếp với anh Dũng". Bên dưới, cỡ chữ nhỏ hơn: "Muốn luyện với người trong lĩnh vực của bạn?" và nút waitlist "mở thêm". Dòng "Bạn đã dùng 1 trong 2 buổi miễn phí" bị bỏ, vì MVP không có thanh toán và câu này ngầm hứa một mô hình giá chưa có `[ASSUMPTION]`.

**Tình huống lệch hướng chính**
- Linh đóng tab ở lượt 12. Khi mở lại, buổi tiếp tục đúng lượt 12.
- Hệ thống chạm cap chi phí trong ngày. Buổi đang chạy vẫn đi tới hết reveal, replay và guide. Chỉ buổi mới bị chặn, kèm thông báo "quay lại sau [giờ reset]".
- Một LLM call lỗi. Lượt đó không được tính, Linh thấy "Chị Thu chưa nghe rõ, bạn gửi lại nhé", và không có trạng thái nào bị ghi dở.

### UJ-2: Thanh publish một kịch bản mới

Thanh soạn file JSON của kịch bản "Anh Dũng" (có hỗ trợ AI, ngoài sản phẩm), rồi chạy CLI `validate`. Lệnh này báo lỗi schema cùng các vi phạm chuẩn: thiếu một đường mở, chỉ có 1 item chuyện/tin tưởng, hoặc một topic tag lộ nội dung item. Sau khi sửa, Thanh chạy `eval`. Lệnh này chạy run tốt (mù tảng băng), run xấu, 20 run adversarial và verifier trên câu hỏi mẫu, pattern guide. Báo cáo cho thấy 0 rò rỉ, run tốt mở 6 item so với 2 của run xấu, và các chỉ số khác. Khi mọi ngưỡng pass, `publish` đưa kịch bản lên thư viện. Nếu có ngưỡng fail, `publish` từ chối và in lý do.

## 5. Cơ chế agent

### 5.1 Khái niệm

- **Lượt:** một câu của người học cộng một câu trả lời của persona. Lượt đánh số từ 1 tới tối đa 30.
- **Item:** một điều nằm trong tảng băng. Mỗi item có nội dung (bí mật), một **topic tag công khai** (không lộ nội dung), một đường mở, một hoặc nhiều hook line, một ràng buộc do-not-assert, một trọng số quan trọng và một câu hỏi mẫu.
- **Đường mở:**
  - *bề mặt:* chạm đúng chủ đề mà không dẫn dắt.
  - *follow-up:* hỏi tiếp đúng hook persona đã thả.
  - *chuyện quá khứ:* hỏi về một lần cụ thể đã xảy ra.
  - *tin tưởng:* openness đạt ngưỡng và câu hỏi phù hợp.
- **Nhãn 3 loại**, một luật chung cho mọi vai trò:
  - `confirm-grounded`: tốt.
  - `boundary-probe`: tốt.
  - `leading/assumption`: xấu.

  Một nhãn tốt phải kèm `grounded_turn_id` resolve được tới một lượt persona có thật. Nếu không, nhãn bị coi là leading.
- **Loại câu hỏi:** mở / đóng / giả định-tương-lai / chuyện-quá-khứ-cụ-thể / khác. Loại câu hỏi dùng cho luật mở khóa và cho nhận xét ở màn reveal.
- **Openness:** một số nguyên của persona. Code cập nhật nó theo nhãn của mỗi lượt. Tham số nằm trong từng kịch bản.
- **Hook ledger:**
  - *thả:* một hook được ghi là đã thả ở lượt persona đó.
  - *nhặt:* hook được nhặt khi lượt kế tiếp của người học trỏ `hook_id` vào nó.
  - *bỏ qua:* lượt kế tiếp của người học không trỏ vào hook nào thả ở lượt trước.

### 5.2 Mỗi lượt: đúng 2 LLM call

1. **Call 1, phân tích.** Input chỉ gồm những thứ persona cũng được thấy: danh tính, fact bề mặt, item đã mở, hook line đã thả, topic tag, ràng buộc do-not-assert, transcript, cộng câu mới của người học. Call 1 **không bao giờ thấy nội dung item khóa.** Output là bằng chứng có cấu trúc:
   - loại câu hỏi, nhãn, `grounded_turn_id`, `hook_id`, topic tag khớp;
   - danh sách ràng buộc do-not-assert mà **lượt persona trước đó** vi phạm (kiểm trễ một lượt).
2. **Kiểm bằng code** (không tốn LLM):
   - Nhãn tốt mà không có turn resolve được thì hạ thành leading.
   - `hook_id` không có trong ledger ở trạng thái đã thả thì bị bỏ.
   - Tiếp theo, code cập nhật openness, cập nhật ledger và **quyết định mở khóa theo luật của từng đường mở** (bảng luật ở addendum §2).
3. **Call 2, persona.** Context chỉ gồm danh tính, fact bề mặt, item đã mở (kể cả item vừa mở ở lượt này), hook line được phép thả, ràng buộc do-not-assert và transcript. Output là câu trả lời, cộng `hook_ids` persona đã dùng. Code chỉ chấp nhận ID nằm trong danh sách được phép.
4. **Lưu snapshot** của lượt đó (§6.1).

Mọi lần mở khóa phải có một sự kiện trong ledger hoặc openness làm chứng. Model không thể tự tuyên bố một item được mở.

### 5.3 Ngoài lượt

- **Verifier ở màn reveal (1 call):** kiểm lại theo nghĩa rằng mọi `grounded_turn_id` được dùng làm bằng chứng thực sự chứa nội dung được nói tới, và rằng lượt persona được chọn làm khoảnh khắc replay thực sự chứa hook. Bằng chứng nào không qua được thì bị bỏ khỏi màn hình. Nếu verifier không đồng ý với nhãn đã dẫn tới một lần mở khóa, **người học không thấy gì khác**: item vẫn tính là đã mở, còn sự bất đồng chỉ được ghi thành chỉ số nội bộ (NFR-8).
- **Nhận xét ở màn reveal và guide:** template dựng từ ledger, không gọi LLM `[ASSUMPTION]`. Câu hỏi mẫu và pattern đã qua verifier guide lúc soạn kịch bản.
- **Replay:** 2 call mỗi lượt, qua đúng pipeline §5.2.

## 6. Replay: spec cơ chế

### 6.1 Snapshot mỗi lượt

Sau mỗi lượt *t* của buổi chính, hệ thống lưu một snapshot bất biến gồm: `turn_index`, danh sách item đã mở (kèm lượt mở), hook ledger (mọi hook đã thả, kèm trạng thái chờ / nhặt / bỏ qua và lượt), `openness`, và con trỏ tới transcript tính tới hết lượt *t*. Snapshot của lượt 0 là trạng thái khởi đầu của kịch bản.

### 6.2 Chọn khoảnh khắc (tất định, không dùng LLM)

1. **Ứng viên chính:** mọi hook có trạng thái *bỏ qua*, thả ở lượt *h*, thuộc một item đường follow-up hoặc chuyện quá khứ vẫn còn khóa khi buổi kết thúc. Chọn ứng viên có trọng số item cao nhất; nếu bằng nhau, chọn *h* sớm nhất. Điểm rẽ nhánh là **sau lượt h**, và người học hỏi lại thay cho lượt *h+1*.
2. **Dự phòng 1:** nếu không có ứng viên chính, chọn lượt sớm nhất bị gắn nhãn leading (lượt *l*). Điểm rẽ nhánh là **sau lượt l−1**, và người học hỏi lại lượt *l*. Mục tiêu hiển thị là "hỏi lại mà không dẫn dắt"; replay vẫn có thể mở bất kỳ item nào.
3. **Dự phòng 2:** nếu cũng không có lượt leading nào, bỏ replay. Màn reveal hiện một câu hỏi mẫu của item quan trọng nhất còn khóa. Nếu mọi item đều đã mở, không hiện gì.
4. Nếu verifier ở màn reveal bác hook của ứng viên (lượt persona đó thực ra không chứa hook), loại ứng viên này và xét ứng viên kế tiếp.

### 6.3 Khôi phục context

Nhánh replay bắt đầu từ bản sao snapshot tại điểm rẽ nhánh: item đã mở, ledger, openness, transcript. Mọi thứ xảy ra sau điểm rẽ nhánh trong buổi chính **không có mặt** trong context của cả hai call. Màn hình hiện 2 lượt cuối trước điểm rẽ nhánh, và cho mở xem toàn bộ transcript trước đó.

### 6.4 Ba lượt qua cùng cổng

Người học có đúng 3 lượt. Mỗi lượt chạy pipeline §5.2 không đổi: cùng luật, cùng ngưỡng, cùng 2 call. Replay không có luật nới lỏng nào. Item mục tiêu (với ứng viên chính) vẫn niêm phong trên màn reveal cho tới khi replay kết thúc `[ASSUMPTION]`. Mỗi buổi chỉ có 1 lần replay.

### 6.5 Thành công và thất bại

- **Thành công (ứng viên chính):** item mục tiêu mở trong ≤3 lượt. Replay dừng ngay, và màn hình hiện "Đã mở khóa: [item]. Đây chính là điều bạn bỏ lỡ."
- **Thành công một phần:** replay mở item khác nhưng không mở item mục tiêu. Màn hình hiện item vừa mở, rồi xử lý như thất bại với item mục tiêu.
- **Thất bại:** hết 3 lượt. Màn hình hiện nội dung item mục tiêu, kèm câu hỏi mẫu soạn sẵn cho nó.
- **Dự phòng 1:** thành công khi cả 3 lượt không có lượt nào bị gắn leading và ít nhất 1 lượt có nhãn tốt. Item nào mở trong lúc đó thì hiện ra. Khi thất bại, màn hình hiện câu hỏi mẫu cho item quan trọng nhất còn khóa.
- Người học có thể dừng replay giữa chừng; khi đó xử lý như thất bại.

### 6.6 Cô lập

Replay là một **nhánh riêng** gắn với buổi chính và điểm rẽ nhánh. Replay không bao giờ ghi đè transcript, ledger, snapshot, danh sách đã mở, điểm reveal hay chỉ số của buổi chính. Kết quả reveal được đóng băng trước khi replay bắt đầu. Chỉ số replay được ghi riêng.

## 7. Yêu cầu chức năng

### Truy cập và tài khoản
- **FR-1** Khách xem được trang chủ và thư viện kịch bản mà không cần đăng nhập.
- **FR-2** Trước khi bắt đầu một buổi, người học phải đăng nhập bằng Google hoặc email magic link. MVP không có phân quyền.
- **FR-3** Người học chỉ xem được các buổi của chính mình.

### Thư viện kịch bản
- **FR-4** Thư viện chỉ hiện kịch bản đã publish (đã pass eval, FR-40). Mỗi thẻ gồm tên và một câu về persona, bối cảnh nghiên cứu, và tổng số item niêm phong.
- **FR-5** Mỗi kịch bản cho mỗi người học chỉ có một buổi chấm điểm. Sau đó thẻ chuyển sang "Xem lại kết quả" `[ASSUMPTION]`.

### Buổi phỏng vấn
- **FR-6** Màn chuẩn bị nêu giới hạn 30 lượt và luật "chỉ nói nếu hỏi đúng cách".
- **FR-7** Người học chat với persona bằng tiếng Việt. Màn hình luôn hiện bối cảnh nghiên cứu, số lượt đã dùng trên 30, và tổng số item niêm phong không đổi trong suốt buổi.
- **FR-8** Trong lúc phỏng vấn, màn hình không hiện nhãn, gợi ý hay số item đã mở.
- **FR-9** Người học kết thúc buổi được bất cứ lúc nào. Buổi tự kết thúc sau lượt 30.
- **FR-10** Buổi bị gián đoạn thì tiếp tục được đúng lượt đã dừng.
- **FR-11** Lượt mà LLM call bị lỗi không được tính và không làm thay đổi trạng thái; người học được mời gửi lại.

### Engine mỗi lượt
- **FR-12** Hệ thống tạo bằng chứng phân tích cho mỗi câu của người học (§5.2 bước 1) mà không đưa nội dung item khóa vào bước này.
- **FR-13** Hệ thống quyết định mở khóa chỉ bằng luật theo đường mở, dựa trên bằng chứng đã qua kiểm của code, ledger và openness.
- **FR-14** Hệ thống cập nhật openness và hook ledger (thả, nhặt, bỏ qua) sau mỗi lượt.
- **FR-15** Context của persona chỉ gồm những gì liệt kê ở §5.2 bước 3.
- **FR-16** Hệ thống kiểm lượt persona trước đó theo các ràng buộc do-not-assert. Lượt vi phạm bị gắn cờ, bị loại khỏi bằng chứng ở màn reveal và được ghi log.
- **FR-17** Hệ thống lưu snapshot bất biến sau mỗi lượt (§6.1).

### Đoán và reveal
- **FR-18** Trước reveal, người học đoán số item mình đã khai thác, trên thang từ 0 tới tổng số.
- **FR-19** Màn reveal hiện số đoán cạnh số thật, danh sách đã khai thác (kèm lượt mở), danh sách bỏ lỡ (kèm đường mở cần dùng và bằng chứng lượt gần nhất nếu có), và item mục tiêu của replay ở trạng thái niêm phong.
- **FR-20** Màn reveal hiện nhận xét cách hỏi, tính từ ledger. Mỗi nhận xét trích ít nhất một lượt.
- **FR-21** Mọi trích dẫn được render từ transcript đã lưu theo turn ID. Trích dẫn không resolve được hoặc bị verifier bác thì claim của nó bị bỏ. Bấm vào trích dẫn sẽ nhảy tới lượt đó.
- **FR-22** Verifier chạy đúng một lần mỗi buổi, trước khi render reveal (§5.3).

### Replay
- **FR-23** Hệ thống chọn khoảnh khắc replay theo §6.2 và đề xuất nó trên màn reveal.
- **FR-24** Replay khôi phục context theo §6.3.
- **FR-25** Replay cho đúng 3 lượt, qua cùng pipeline với buổi chính (§6.4).
- **FR-26** Replay hiện kết quả thành công, thành công một phần hoặc thất bại theo §6.5.
- **FR-27** Replay không bao giờ sửa dữ liệu hay chỉ số của buổi chính (§6.6).

### Guide
- **FR-28** Guide gồm: câu dẫn dắt nguyên văn của người học ghép với pattern soạn sẵn cho loại lỗi đó; thẻ thói quen hiện khi ledger vượt ngưỡng; và câu hỏi mẫu của các item bị bỏ lỡ.
- **FR-29** Người học mở lại được guide và in hoặc lưu nó thành PDF.
- **FR-30** Guide không chứa khẳng định nào về người dùng thật. Mọi nội dung soạn sẵn của guide đều đã qua verifier lúc soạn kịch bản (FR-41).

### Sau buổi và tín hiệu
- **FR-31** Sau guide, màn hình đề xuất kịch bản chưa luyện kế tiếp.
- **FR-32** Nút waitlist "mở thêm" ghi lại người học đã bấm cùng thời điểm bấm.

### Soạn và publish kịch bản (vận hành)
- **FR-33** CLI kiểm file kịch bản theo schema và theo chuẩn chất lượng:
  - 8–12 item, đủ 4 đường mở, ≥2 item thuộc đường chuyện quá khứ hoặc tin tưởng.
  - Mỗi item có hook line, do-not-assert, trọng số, câu hỏi mẫu và topic tag.
  - Kịch bản có trường `language`.
- **FR-34** Eval harness chạy run tốt (người phỏng vấn mù tảng băng), run xấu và 20 run adversarial, rồi xuất báo cáo các chỉ số ở §9.
- **FR-35** CLI chỉ publish kịch bản pass mọi ngưỡng; nếu từ chối thì in lý do.
- **FR-36** CLI chạy verifier guide trên câu hỏi mẫu và pattern lúc soạn. Câu nào khẳng định về người dùng thật, hoặc bị gắn nhãn assumption khi không có transcript, thì chặn publish.

### Vận hành
- **FR-37** Hệ thống áp cap chi phí LLM theo ngày. Khi chạm cap, hệ thống chặn buổi mới nhưng để buổi đang chạy đi hết.
- **FR-38** Hệ thống ghi sự kiện đủ để tính các chỉ số ở §9: bắt đầu buổi, lượt, kết thúc, reveal, bắt đầu và kết quả replay, mở guide, bấm waitlist.

## 8. Yêu cầu phi chức năng

- **NFR-1 Số LLM call:** tối đa 2 mỗi lượt của người học, áp cho cả buổi chính lẫn replay. Mỗi buổi thêm tối đa 1 call cho verifier ở màn reveal. Guide và nhận xét ở màn reveal không gọi LLM.
- **NFR-2 Độ trễ:** p95 ≤ 6 giây mỗi lượt, tính từ lúc gửi tới lúc câu trả lời persona hiện đầy đủ. Đây là mức khởi điểm, sẽ chỉnh sau khi đo.
- **NFR-3 Chi phí:** chi phí trung bình mỗi buổi được đo và ghi log. Mục tiêu là nằm trong mốc giá gói prep-sprint (addendum §4). Cap theo ngày cấu hình được mà không cần deploy lại.
- **NFR-4 Không rò rỉ:** nội dung item khóa không bao giờ có trong context của Call 1 hay Call 2 trước khi item đó mở. Kiểm bằng test tự động trên chính context đã dựng, không chỉ bằng eval.
- **NFR-5 Chống injection:** văn bản của người học không thể làm thay đổi luật mở khóa. Mọi lần mở khóa phải truy được về một luật và một bằng chứng.
- **NFR-6 Rò rỉ trong production:** theo dõi tỉ lệ rò mỗi episode. Mốc ~0,6/episode trong research chỉ để tham chiếu, không dùng làm claim.
- **NFR-7 Độ chính xác phân loại:** trên test set tiếng Việt (≥100 câu có gán nhãn, gồm các ca biên kiểu "luôn thấy bực, đúng không?" `[ASSUMPTION]`), đạt ≥85% đồng thuận và ≤5% câu tốt bị gắn nhầm leading.
- **NFR-8 Bất đồng giữa verifier và cổng:** tỉ lệ lần mở khóa mà verifier ở màn reveal không đồng ý với nhãn đã dẫn tới lần mở đó phải ≤10% trên eval `[ASSUMPTION]`. Đây là chỉ số nội bộ, không bao giờ hiện cho người học.
- **NFR-9 Riêng tư:** transcript, kết quả và guide chỉ chủ tài khoản xem được. Dữ liệu người học không dùng để huấn luyện model. Sản phẩm không có chia sẻ công khai.
- **NFR-10 Toàn vẹn dữ liệu:** snapshot bất biến. Một lượt hoặc là được ghi đủ (transcript, ledger, snapshot), hoặc là không được ghi gì.
- **NFR-11 Responsive:** mọi màn dùng được từ độ rộng 360px tới desktop.
- **NFR-12 Ngôn ngữ:** giao diện và kịch bản tiếng Việt. Ngôn ngữ cố định trong suốt một buổi.
- **NFR-13 Ranh giới đạo đức:** không đầu ra nào của sản phẩm chứa nhận định về người dùng thật. Copy ra mắt không hứa guide theo đề tài của người học.

## 9. Chỉ số thành công

Chỉ đọc các tỉ lệ phần trăm sau khi có ≥30 người học.

| Chỉ số | Ngưỡng |
|---|---|
| Buổi đã bắt đầu đi tới màn reveal | ≥60% |
| Buổi có reveal và có dùng replay | ≥40% (chỉ số tương tác, không chứng minh việc học) |
| Người học làm buổi thứ hai trên kịch bản khác | ≥30% |
| Giả định #9: tỉ lệ mở item ở buổi 2, so giữa người có dùng replay và người không | Theo dõi, chưa đặt ngưỡng |
| Bấm waitlist "mở thêm" | Đếm; ≥1 giảng viên hoặc trung tâm chia sẻ link |

**Counter-metric:** buổi bỏ trước lượt 5; tỉ lệ lượt persona bị gắn cờ do-not-assert; tỉ lệ bất đồng giữa verifier và cổng (NFR-8); rò rỉ mỗi episode; chi phí mỗi buổi; p95 độ trễ; tỉ lệ replay rơi vào dự phòng 2 (dấu hiệu kịch bản thiếu hook).

## 10. Tiêu chí nghiệm thu (cổng ra mắt MVP)

1. **Demo end-to-end** chạy trên URL đã deploy: trang chủ → chọn kịch bản → đăng nhập → phỏng vấn → đoán → reveal → replay → guide → màn sau buổi.
2. **Kịch bản:** ≥1 kịch bản (mục tiêu 2) pass eval: 0 rò rỉ trong 20 run adversarial; run tốt mở ≥2 lần số item của run xấu và mở ≥3 item; bất đồng verifier–cổng ≤10%; 0 câu mẫu hoặc pattern nào bị verifier guide chặn.
3. **Cô lập context:** test tự động chứng minh context của Call 1 và Call 2 không chứa nội dung của item còn khóa, ở mọi lượt của eval.
4. **Cổng:** test tự động cho từng đường mở:
   - Follow-up không mở khi `hook_id` chưa được thả.
   - Nhãn tốt mà không có turn resolve được thì bị hạ thành leading.
   - Item tin tưởng không mở khi openness dưới ngưỡng.
   - Chuỗi injection trong câu của người học không mở được item nào.
5. **Replay:**
   - Chọn khoảnh khắc đúng theo §6.2 trên 3 transcript cố định (một ca ứng viên chính, một ca dự phòng 1, một ca dự phòng 2).
   - Chạy lại cùng transcript thì cho ra cùng khoảnh khắc.
   - Sau replay, dữ liệu của buổi chính giống hệt byte với trước khi replay.
6. **Số call:** log một buổi 30 lượt cho thấy ≤2 call mỗi lượt và đúng 1 call verifier.
7. **Phân loại:** đạt ngưỡng NFR-7 trên test set tiếng Việt.
8. **Độ trễ:** p95 ≤ 6 giây trên ≥1 buổi eval đầy đủ chạy với môi trường đã deploy.
9. **Riêng tư:** tài khoản B không đọc được buổi, reveal hay guide của tài khoản A (test API).
10. **Cap chi phí:** khi cap bị hạ về mức đã tiêu, buổi mới bị chặn kèm thông báo, còn buổi đang chạy vẫn đi tới hết guide.

## 11. Giả định và câu hỏi mở

- Giả định #6 (nhu cầu BA/PM) không có tín hiệu trong sản phẩm lúc ra mắt; đo qua 3 phỏng vấn fresher BA.
- Giả định #8 (trả tiền) chỉ đo qua nút waitlist và 2–3 cuộc nói chuyện với giảng viên.
- Replay diễn ra sau reveal, nên kết quả replay chỉ đo tương tác. Giữ item mục tiêu niêm phong làm giảm, nhưng không loại bỏ, ảnh hưởng này.
- Tên sản phẩm chưa chốt.
