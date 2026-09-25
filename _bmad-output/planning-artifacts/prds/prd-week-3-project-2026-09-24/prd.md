---
title: 'PRD: InterviewLab'
status: draft
created: '2026-09-24'
updated: '2026-09-25'
---

# PRD: InterviewLab

> Nguồn: `brief.md` và `addendum.md` của brief (2026-09-22), `forged-idea.md`, `research.md`.
> Chi tiết kỹ thuật (hợp đồng từng LLM call, luật mở khóa dạng giả mã, mô hình dữ liệu snapshot, ước tính chi phí): `addendum.md` cùng thư mục.
> Thẻ `[ASSUMPTION]` đánh dấu chỗ suy luận hoặc đề xuất chưa được duyệt.

## 1. Sản phẩm

Người mới học phỏng vấn người dùng thường chỉ biết mình hỏi sai **sau khi** buổi phỏng vấn thật đã qua, ví dụ hỏi câu dẫn dắt, không hỏi sâu, hoặc bỏ qua một chi tiết người kia vừa nhắc. **InterviewLab** là phòng tập phỏng vấn người dùng, kèm bằng chứng bạn sai ở đâu.

Người học phỏng vấn một persona AI. Persona giữ một **tảng băng** gồm 8–12 điều chưa nói. Tảng băng cố định từ lượt đầu, và một điều chỉ mở ra khi người học hỏi đúng cách. Cuối buổi, người học đoán mình khai thác được bao nhiêu. Sau đó tảng băng lộ ra, mỗi điều kèm trích dẫn đúng lượt trong transcript. Người học quay lại **khoảnh khắc bị lỡ** để hỏi lại, rồi mang về một bộ câu hỏi dựa trên lỗi của chính mình.

**Bối cảnh:** sản phẩm production thật, 1 dev, MVP khoảng 16 ngày dev (brief ban đầu nhắm ~2 tuần), responsive web app, deploy và demo end-to-end trên URL thật. Bản ra mắt chỉ có vai trò UX và chỉ tiếng Việt. Thư viện có 2 kịch bản (tối thiểu 1).

**Người dùng ra mắt:** sinh viên HCI/UX năm cuối ở VN sắp có phỏng vấn người dùng cho đồ án, ví dụ Linh ở UJ-1. BA và PM dùng chung kiến trúc nhưng chỉ ra mắt khi kịch bản của họ pass eval đầy đủ (Next).

**Ranh giới đạo đức** (thực thi bằng cấu trúc sản phẩm, không bằng disclaimer): sản phẩm chỉ đánh giá kỹ năng của người học và không bao giờ tạo nhận định về người dùng thật. Mọi trích dẫn đều lấy từ transcript. Dữ liệu của người học là riêng tư theo mặc định.

## 2. Thay đổi sau phản hồi reviewer

| Phản hồi | Thay đổi | Lý do |
|---|---|---|
| Replay cần spec cơ chế chính xác | Thêm §6: snapshot mỗi lượt, luật chọn khoảnh khắc, đường dự phòng, khôi phục context, 3 lượt qua cùng cổng, nhánh tách biệt | Brief chỉ có một dòng về replay, mà replay là bằng chứng khác biệt duy nhất |
| 4 LLM call mỗi lượt là quá nặng | Giới hạn **2 call mỗi lượt**: Call 1 "phân tích" (chỉ trả bằng chứng) và Call 2 "persona". **Code** quyết định mở khóa. Self-check do-not-assert chạy trễ một lượt, nằm trong Call 1. Guide và nhận xét ở màn reveal dùng template dựng từ ledger. Cả buổi còn ~67 call, trước đây ~135–150 | Lúc đầu định gộp classifier và cổng thành một call trả về "item nào được mở". Phương án này bị bác, vì nó đưa quyết định mở khóa trở lại model và buộc nội dung item khóa nằm chung context với văn bản thô của người học (mặt tấn công injection). Cách hiện tại: Call 1 không bao giờ thấy nội dung khóa, và mọi lần mở khóa phải có một sự kiện trong ledger làm chứng |
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
11. Trang "Buổi của tôi": danh sách buổi, và bản xem lại chỉ đọc của từng buổi.

**Vì sao phạm vi còn lại như vậy.** Reviewer yêu cầu thu hẹp MVP. Yêu cầu này dẫn tới bốn thay đổi: giảm từ 4 xuống 2 LLM call mỗi lượt, cắt plumbing song ngữ, cắt bộ đếm theo tier, và chuyển guide sang dựng từ template. Các mục còn lại (2 kịch bản, dự phòng 1 của replay, verifier ở màn reveal, đăng nhập bằng cả Google lẫn magic link) được giữ vì PM có hơn 14 ngày để build (addendum §6), không phải vì bỏ qua phản hồi.

**Cắt và hệ quả**

| Mục | Hệ quả |
|---|---|
| Câu hỏi kinh nghiệm và tier | Mọi người thấy cùng một bộ đếm (chỉ tổng niêm phong) |
| Nút "Báo tôi khi BA/PM sẵn sàng" | Giả định #6 (§11, nhu cầu BA/PM) **không có tín hiệu trong sản phẩm lúc ra mắt**, chỉ đo được qua phỏng vấn |
| Guide cá nhân hóa theo chủ đề thật | Lời hứa "Tự tin bước vào buổi phỏng vấn của bạn" yếu đi. Copy ra mắt chỉ được hứa guide dựa trên **lỗi của bạn**, không được hứa guide theo **đề tài của bạn** |
| Trường "chủ đề phỏng vấn thật" (và overlap check đi kèm) | Không kiểm được chủ đề thật của người học có trùng kịch bản hay không. Giảm nhẹ: thẻ kịch bản nêu rõ bối cảnh nghiên cứu để người học tự chọn. Làm lại cùng guide cá nhân hóa (Later) |
| Ô tự do "khoảnh khắc bạn thấy mình bỏ lỡ" ở màn đoán | Không có phần nào trong sản phẩm dùng tới nó; màn đoán chỉ còn thanh trượt |
| Dòng "Bạn đã dùng 1 trong 2 buổi miễn phí" | MVP không có thanh toán; câu này ngầm hứa một mô hình giá chưa có |
| Plumbing song ngữ | Chỉ có tiếng Việt. Trường `language` trong kịch bản giúp bản tiếng Anh sau này không phải migrate dữ liệu |

**Next:** pipeline sinh kịch bản (CLI) → kịch bản BA/PM (sàn 8 item), kèm câu hỏi vai trò ở onboarding → đường "Describe" (kịch bản custom) → thư viện tiếng Anh. Kịch bản BA/PM chỉ ship kèm các biện pháp giảm rủi ro độ thật đã chốt ở forge: grounded trên tài liệu thật, AI critic đóng vai senior, 1–2 người đọc proxy (ghi là kiểm tra một phần), và link "Người này có giống stakeholder thật không?".
**Later:** admin dashboard, guide cá nhân hóa theo chủ đề, feedback theo tier, timeline câu hỏi và tỉ lệ nói, trình soạn kịch bản trực quan.
**Ngoài phạm vi:** phỏng vấn nhóm/workshop; persona sinh từ câu hỏi nghiên cứu của người học; mọi đầu ra dạng insight về người dùng thật; sản phẩm cho giảng viên; thanh toán; voice.

## 4. Hành trình chính

Các thuật ngữ item, hook, ledger, openness, đường mở và niêm phong được định nghĩa ở §5.1.

### UJ-1: Linh luyện trước buổi phỏng vấn thật đầu tiên

Linh là sinh viên HCI năm cuối. Trong 10 ngày tới cô có 5 buổi phỏng vấn người dùng cho đồ án, và chưa từng phỏng vấn ngoài role-play trên lớp. Một bạn cùng lớp gửi link vào group chat. Linh mở trên laptop lúc 11 giờ đêm, hơi lo vì tuần sau phải gặp người đầu tiên.

**Màn 1: Trang chủ.** Một câu: "Luyện phỏng vấn người dùng. Xem chính xác bạn đã bỏ lỡ điều gì." Bên dưới là ảnh chụp màn reveal: một dòng transcript được highlight, kèm chú thích "Chị ấy vừa nhắc tới một cách xoay xở. Bạn chuyển chủ đề." Nút "Bắt đầu một buổi luyện". Chưa cần đăng nhập. Màn này phải cho Linh hiểu ngay đây không phải chatbot, vì nó biết cô đã bỏ lỡ gì.

**Màn 2: Chọn kịch bản.** Có 2 thẻ. Mỗi thẻ gồm ảnh đại diện, tên và một câu bối cảnh về persona, bối cảnh nghiên cứu, và bộ đếm niêm phong ở góc ("Đang giữ 11 điều chưa nói"). Ví dụ: "Chị Thu, 26 tuổi, nhân viên văn phòng. Bối cảnh: bạn đang nghiên cứu cách sinh viên và người đi làm trẻ quản lý chi tiêu. Chị Thu từng dùng vài app rồi bỏ." Nếu Linh đã luyện một kịch bản, thẻ đó chuyển sang "Đã luyện · Xem lại kết quả", và bấm vào sẽ mở bản xem lại của buổi đó (Màn 10).

**Màn 3: Chuẩn bị** (đọc khoảng 20 giây). Ba dòng: bạn có tối đa 30 lượt hỏi, khoảng 15–20 phút; chị Thu chỉ nói ra những điều đó nếu bạn hỏi đúng cách; không có câu trả lời đúng sẵn, cứ hỏi như đang gặp người thật. Khi Linh bấm "Bắt đầu", hệ thống yêu cầu đăng nhập (Google hoặc magic link), kèm lý do: "để lưu lại buổi này cho bạn xem lại".

**Màn 4: Phỏng vấn.** Khung chat chiếm phần lớn màn hình. Thanh trên cùng luôn hiện tên persona và bối cảnh nghiên cứu, "Lượt 4/30", và "Chị Thu đang giữ 11 điều chưa nói" (số cố định). Màn này không có gợi ý, không hiện nhãn và không có bộ đếm số điều đã mở.

> Lượt 2. Linh: "Chị có muốn một app nhắc chị tiết kiệm không?" Chị Thu: "Ừ, cũng được đó em." Câu hỏi này bị gắn nhãn `leading/assumption` (nó thêm nội dung mới) và thuộc loại giả định-tương-lai. Openness giảm. Linh không được báo gì.
> Lượt 5. Linh: "Lần gần nhất chị thấy hết tiền trước cuối tháng là khi nào ạ?" Chị Thu: "Tháng trước. Chị nhớ là có lần chị định ghi lại nhưng rồi cũng bỏ." Câu trả lời mở item bề mặt "từng thử ghi chép rồi bỏ" và thả hook của item "đang trả phí cho một app gần như không mở".
> Lượt 6. Linh: "Dạ vâng. Còn chuyện ăn uống thì sao chị?" Ledger ghi hook ở lượt 5 bị bỏ qua.

Linh bấm "Kết thúc buổi" ở lượt 22. Nếu đi đủ tới lượt 30, buổi tự kết thúc.

**Màn 5: Đoán trước khi xem.** "Trước khi xem chị Thu giấu gì, bạn đoán xem: bạn khai thác được bao nhiêu trong 11 điều?" Linh trả lời bằng thanh trượt 0–11 và kéo tới 7.

**Màn 6: Tảng băng lộ diện.** "Bạn đoán 7. Thực tế: 3 trên 11."
- **Đã khai thác (3):** mỗi mục kèm lượt đã mở nó.
- **Bỏ lỡ (7):** mỗi mục có thẻ đường mở cần dùng ("hỏi tiếp một chi tiết chị vừa nhắc", "chuyện đã xảy ra", "cần sự tin tưởng"). Mục nào có hook đã thả thì hiện lượt gần nhất, câu persona nói và câu Linh hỏi ngay sau đó.
- **Giữ lại để bạn thử (1):** mục gắn với khoảnh khắc replay **vẫn niêm phong** cho tới khi replay xong. Thẻ chỉ ghi "Lượt 5: chị Thu vừa nhắc tới một điều. Bạn đã chuyển chủ đề." Lý do: nếu Linh đã đọc nội dung item trước replay, replay chỉ còn là bài chép lại chứ không còn là phép thử.
- **Nhận xét cách hỏi,** dựng từ ledger theo template. Ví dụ: "Bạn hỏi 3 câu giả định tương lai (lượt 2, 9, 15). Ở lượt 2 bạn hỏi 'Chị có muốn một app nhắc chị tiết kiệm không?', chị Thu trả lời 'cũng được đó em'. Câu trả lời này không phản ánh hành vi thật." Mọi trích dẫn đều bấm được để nhảy tới lượt đó.

Cuối màn là một khối nổi bật: "Khoảnh khắc đáng tiếc nhất là lượt 5–6. Thử lại?", nút "Quay lại lượt 6", và một liên kết nhỏ "Bỏ qua, cho tôi xem luôn". Nếu Linh bỏ qua, item được mở niêm phong ngay và replay không còn được đề xuất.

**Màn 7: Luyện lại.** Màn hình hiện lượt 4–5, dừng ở câu chị Thu vừa nói ("…chị định ghi lại nhưng rồi cũng bỏ"). Có một liên kết "xem toàn bộ transcript trước đó" và dòng chữ nhỏ "Bạn có 3 lượt."

> Linh: "Chị định ghi lại kiểu gì ạ?" Chị Thu: "Chị tải một cái app, ghi được hai tuần. Xong thấy phiền quá nên thôi. Mà chị quên hủy, giờ vẫn trừ tiền hàng tháng."
> Hệ thống hiện: "Đã mở khóa: Chị đang trả phí cho một app chị gần như không mở. Đây chính là điều bạn bỏ lỡ."

Nếu sau 3 lượt Linh vẫn chưa mở được, màn hình hiện nội dung item kèm một câu hỏi mẫu: "Một câu đã mở được nó: 'Chị định ghi lại kiểu gì ạ?'"

**Màn 8: Mang về.** Tiêu đề "Bộ câu hỏi cho buổi phỏng vấn thật của bạn". Trang này cũng là pre-flight card, dùng để đọc lại ngay trước buổi thật. Một trang, dựng từ lỗi của Linh:
- "Thay vì hỏi" lấy nguyên văn câu dẫn dắt của Linh; "Hãy hỏi" lấy pattern soạn sẵn cho loại lỗi đó ("Lần gần nhất bạn … là khi nào? Chuyện gì đã xảy ra?").
- Thẻ "Thói quen cần để ý" chỉ hiện khi ledger cho thấy thói quen đó, ví dụ ≥2 hook bị bỏ qua: "bạn hay chuyển chủ đề khi người kia nhắc tới một chi tiết nhỏ. Khi nghe thấy 'chị có cách riêng', 'chị từng thử', hãy hỏi tiếp trước khi đi tiếp."

Nút "Tải về" dùng bản in thân thiện với PDF của trình duyệt.

**Màn 9: Sau buổi.** Thẻ kịch bản thứ hai ("Anh Dũng, chủ quán cà phê nhỏ, đang giữ 9 điều") và nút "Luyện tiếp với anh Dũng". Bên dưới, cỡ chữ nhỏ hơn: "Muốn luyện với người trong lĩnh vực của bạn?" và nút waitlist "mở thêm".

**Màn 10: Buổi của tôi.** Ba ngày sau, trước buổi phỏng vấn thật đầu tiên, Linh đăng nhập lại và bấm "Buổi của tôi" trên header.
- **Danh sách:** mỗi buổi một dòng gồm tên kịch bản, ngày và số item đã khai thác trên tổng ("Chị Thu · 25/09 · 3/11"). Buổi chưa xong có nhãn "Đang làm dở · Tiếp tục".
- **Mở một buổi đã xong:** Linh thấy transcript, màn reveal và guide, tất cả **chỉ đọc** và đóng băng như lúc buổi kết thúc. Kết quả replay (nếu có) là một phần của reveal đã đóng băng. Replay không chạy lại được.
- **Không còn item nào niêm phong trên trang này**, kể cả khi Linh bỏ replay giữa chừng hoặc bỏ qua replay.
- **Trạng thái trống:** người học chưa có buổi nào thấy "Bạn chưa luyện buổi nào", kèm nút tới thư viện kịch bản.

Linh mở lại guide, đọc thẻ "Thói quen cần để ý" và in ra mang theo.

**Tình huống lệch hướng chính**
- Linh đóng tab ở lượt 12. Khi mở lại, buổi tiếp tục đúng lượt 12.
- Linh đóng tab giữa replay. Khi quay lại, cô tiếp tục đúng lượt replay đang dở. Replay chỉ bị coi là bỏ khi cô bấm "Dừng".
- Hệ thống chạm cap chi phí trong ngày. Buổi đang chạy vẫn đi tới hết reveal, replay và guide. Chỉ buổi mới bị chặn, kèm thông báo "quay lại sau [giờ reset]".
- Một LLM call lỗi. Lượt đó không được tính, Linh thấy "Chị Thu chưa nghe rõ, bạn gửi lại nhé", và không có trạng thái nào bị ghi dở.

### UJ-2: Thanh publish một kịch bản mới

Thanh soạn file JSON của kịch bản "Anh Dũng" (có hỗ trợ AI, ngoài sản phẩm), rồi:

1. **`validate`** (FR-33): báo lỗi schema và vi phạm chuẩn, ví dụ thiếu một đường mở, chỉ có 1 item thuộc đường chuyện quá khứ hoặc tin tưởng, hoặc một topic tag lộ nội dung item. Thanh sửa cho tới khi sạch.
2. **`eval`** (FR-34, FR-36): chạy run tốt (mù tảng băng), run xấu, 20 run adversarial, và verifier trên câu hỏi mẫu và pattern guide. Báo cáo cho thấy 0 rò rỉ, run tốt mở 6 item so với 2 của run xấu, cùng các chỉ số khác.
3. **`publish`** (FR-35): khi mọi ngưỡng pass, kịch bản lên thư viện. Nếu có ngưỡng fail, lệnh từ chối và in lý do.

## 5. Cơ chế agent

### 5.1 Khái niệm

- **Lượt:** một câu của người học cộng một câu trả lời của persona. Lượt đánh số từ 1 tới tối đa 30.
- **Item:** một điều nằm trong tảng băng. Mỗi item có:
  - nội dung (bí mật) và một **cụm neo nội dung** (bí mật, chỉ code dùng để kiểm persona đã nói ra item);
  - một **topic tag công khai**, không lộ nội dung;
  - một đường mở, và item tiên quyết nếu có;
  - một hook line soạn sẵn, kèm **cụm neo hook** mà persona phải nói nguyên văn;
  - một **ràng buộc do-not-assert trung tính**: luật hành vi ở mức topic tag, ví dụ "về chủ đề `đăng ký trả phí`: trả lời mơ hồ, không phủ nhận, không tự kể". Ràng buộc này không chứa nội dung item;
  - một trọng số quan trọng và một câu hỏi mẫu.
- **Đường mở:**
  - *bề mặt:* chạm đúng chủ đề mà không dẫn dắt.
  - *follow-up:* hỏi tiếp đúng hook persona đã thả.
  - *chuyện quá khứ:* hỏi về một lần cụ thể đã xảy ra.
  - *tin tưởng:* openness đạt ngưỡng và câu hỏi phù hợp.
- **Nhãn câu hỏi**, một luật chung cho mọi vai trò:
  - `confirm-grounded` (tốt): nội dung đã có trong lời persona.
  - `boundary-probe` (tốt): chủ đề đã grounded, câu hỏi chỉ thêm phạm vi (mọi / luôn / không bao giờ / trường hợp nào). Câu hỏi tách một cụm danh từ hóa mà persona vừa nói cũng được tính (persona nói "rồi nó đi qua phê duyệt", người học hỏi "ai duyệt, khi nào, ngưỡng bao nhiêu").
  - `open` (trung tính): câu hỏi mở, không đưa nội dung nào vào, ví dụ "Chị kể em nghe…", "Lần gần nhất … là khi nào?". Không cần grounding, không tính là dẫn dắt.
  - `leading/assumption` (xấu): thêm nguyên nhân, phán xét hoặc nội dung mới.

  Hai nhãn tốt phải kèm `grounded_turn_id` resolve được tới một lượt persona có thật. Nếu không, câu hỏi nhận nhãn `leading`. Lý do thêm nhãn `open` vào bộ 3 nhãn của forge: addendum §7.
- **Loại câu hỏi:** mở / đóng / giả định-tương-lai / chuyện-quá-khứ-cụ-thể / khác. Loại câu hỏi dùng cho luật mở khóa và cho nhận xét ở màn reveal.
- **Openness:** một số nguyên của persona. Code cập nhật nó theo nhãn của mỗi lượt. Tham số nằm trong từng kịch bản.
- **Hook ledger:**
  - *thả:* code chọn hook được thả (tối đa 1 mỗi lượt persona) và chỉ ghi là đã thả khi câu trả lời chứa cụm neo hook.
  - *nhặt:* hook được nhặt ở bất kỳ lượt nào sau đó mà Call 1 gán `hook_id` của hook đó cho câu của người học và code chấp nhận. Hook còn nhặt được cho tới khi item của nó mở.
  - *bỏ qua:* chỉ là một chú thích, ghi khi lượt ngay sau lượt thả không nhặt hook đó. Chú thích này dùng cho reveal và cho việc chọn khoảnh khắc replay; nó không đóng hook.
- **Đã khai thác:** item đã mở **và** persona đã nói ra nó (câu trả lời chứa cụm neo nội dung). Item đã mở mà persona chưa nói ra thì vẫn nằm trong context persona, và chỉ được tính khi persona nói ra.

### 5.2 Mỗi lượt: đúng 2 LLM call

1. **Call 1, phân tích.** Input chỉ gồm những thứ persona cũng được thấy: danh tính, fact bề mặt, item đã mở, hook line đã thả, topic tag, ràng buộc do-not-assert trung tính, transcript, cộng câu mới của người học. Call 1 **không bao giờ thấy nội dung item khóa.** Output là bằng chứng có cấu trúc:
   - loại câu hỏi, nhãn, `grounded_turn_id`, `hook_id`, topic tag khớp;
   - danh sách ràng buộc do-not-assert mà **lượt persona trước đó** vi phạm (kiểm trễ một lượt).
2. **Kiểm bằng code** (không tốn LLM):
   - Nhãn tốt mà `grounded_turn_id` không resolve được tới một lượt persona có thật thì hạ thành nhãn `leading`.
   - `hook_id` không trỏ tới một hook đã thả và còn nhặt được thì bị bỏ. Mỗi lượt chỉ nhận tối đa 1 topic tag.
   - **Quyết định mở khóa** theo luật của từng đường mở (addendum §3.1), đánh giá trên trạng thái **trước lượt này** (snapshot t−1). Mỗi lượt mở tối đa 1 item.
   - Sau đó mới cập nhật openness và ledger, rồi chọn hook được thả ở lượt này (nếu có).
3. **Call 2, persona.** Context chỉ gồm danh tính, fact bề mặt, item đã mở (kể cả item vừa mở ở lượt này), đúng một hook line cần thả (nếu có), ràng buộc do-not-assert trung tính và transcript. Output chỉ là câu trả lời. Code dò cụm neo trong câu trả lời để ghi hook đã thả và item đã nói ra.
4. **Ghi lượt** trong một transaction: transcript, bằng chứng, trạng thái, snapshot (§6.1).

Mọi lần mở khóa phải có một sự kiện trong ledger hoặc openness làm chứng. Model không thể tự tuyên bố một item được mở. Việc hook đã được thả, hay item đã được nói ra, do code kiểm bằng cụm neo, không dựa vào lời khai của model.

### 5.3 Ngoài lượt

- **Verifier ở màn reveal (1 call logic):** kiểm lại xem mỗi `grounded_turn_id` dùng làm bằng chứng có thực sự chứa nội dung được nói tới không. Verifier cũng kiểm lượt persona cuối cùng theo do-not-assert, vì lượt này không có Call 1 nào sau nó. Kết quả được lưu theo buổi.
  - Bằng chứng của nhận xét hoặc lời khen mà không qua được thì bị bỏ khỏi màn hình.
  - Trích dẫn của một lần mở khóa thì **không bị bỏ**: người học không thấy gì khác, item vẫn tính là đã khai thác, còn sự bất đồng chỉ ghi thành chỉ số nội bộ (NFR-8).
  - Nếu verifier lỗi sau tối đa 2 lần thử lại kỹ thuật, reveal vẫn render: bỏ mọi lời khen có căn cứ, giữ phần còn lại, và ghi log.
  - Chọn khoảnh khắc replay không phụ thuộc verifier (§6.2).
- **Nhận xét ở màn reveal và guide:** template dựng từ ledger, không gọi LLM. Câu hỏi mẫu và pattern đã qua verifier guide lúc soạn kịch bản.
- **Replay:** 2 call mỗi lượt, qua đúng pipeline §5.2.

## 6. Replay: spec cơ chế

### 6.1 Snapshot mỗi lượt

Sau mỗi lượt *t* của buổi chính, hệ thống lưu một snapshot bất biến gồm: `turn_index`, danh sách item đã mở (kèm lượt mở), hook ledger (mọi hook đã thả, kèm trạng thái chưa nhặt / đã nhặt, chú thích bỏ qua và lượt), các item đã nói ra, `openness`, và con trỏ tới transcript tính tới hết lượt *t*. Snapshot của lượt 0 là trạng thái khởi đầu của kịch bản.

### 6.2 Chọn khoảnh khắc (tất định, không dùng LLM)

1. **Ứng viên chính:** mọi hook có trạng thái *bỏ qua*, thả ở lượt *h*, thuộc một item đi theo đường follow-up hoặc chuyện quá khứ và vẫn còn khóa khi buổi kết thúc. Chọn ứng viên có trọng số item cao nhất; nếu bằng nhau, chọn *h* sớm nhất; nếu vẫn bằng, chọn theo thứ tự item trong kịch bản. Điểm rẽ nhánh là **sau lượt h**, và người học hỏi lại thay cho lượt *h+1*.
2. **Dự phòng 1:** nếu không có ứng viên chính, chọn lượt sớm nhất bị gắn nhãn `leading` (lượt *l*). Điểm rẽ nhánh là **sau lượt l−1**, và người học hỏi lại lượt *l*. Mục tiêu hiển thị là "hỏi lại mà không dẫn dắt"; replay vẫn có thể mở bất kỳ item nào.
3. **Dự phòng 2:** nếu cũng không có lượt nào mang nhãn `leading`, bỏ replay. Màn reveal hiện một câu hỏi mẫu của item quan trọng nhất còn khóa. Nếu mọi item đều đã mở, không hiện gì.

### 6.3 Khôi phục context

Nhánh replay bắt đầu từ bản sao snapshot tại điểm rẽ nhánh: item đã mở, ledger, openness, transcript. Mọi thứ xảy ra sau điểm rẽ nhánh trong buổi chính **không có mặt** trong context của cả hai call. Màn hình hiện 2 lượt cuối trước điểm rẽ nhánh, và cho mở xem toàn bộ transcript trước đó.

### 6.4 Ba lượt qua cùng cổng mở khóa

Người học có đúng 3 lượt. Mỗi lượt chạy pipeline §5.2 không đổi: cùng luật, cùng ngưỡng, cùng 2 call. Hook của item mục tiêu vẫn nhặt được ở cả 3 lượt, theo luật chung ở §5.1. Khác biệt duy nhất: khi nhiều item cùng thỏa luật trong một lượt, replay ưu tiên item mục tiêu. Item mục tiêu (với ứng viên chính) vẫn niêm phong theo §6.6. Mỗi buổi chỉ có 1 lần replay.

### 6.5 Thành công và thất bại

- **Thành công (ứng viên chính):** item mục tiêu mở trong ≤3 lượt. Replay dừng ngay, và màn hình hiện "Đã mở khóa: [item]. Đây chính là điều bạn bỏ lỡ."
- **Thành công một phần:** replay mở item khác nhưng không mở item mục tiêu. Màn hình hiện item vừa mở, rồi xử lý như thất bại với item mục tiêu.
- **Thất bại:** hết 3 lượt. Màn hình hiện nội dung item mục tiêu, kèm câu hỏi mẫu soạn sẵn cho nó.
- **Dự phòng 1:** thành công khi cả 3 lượt không có lượt nào bị gắn nhãn `leading` và ít nhất 1 lượt có nhãn tốt. Item nào mở trong lúc đó thì hiện ra. Khi thất bại, màn hình hiện câu hỏi mẫu cho item quan trọng nhất còn khóa.
- **Bỏ giữa chừng:** người học bấm "Dừng" trước khi hết 3 lượt. Replay được xử lý như thất bại. Rời trang không phải là bỏ: khi quay lại, replay tiếp tục đúng lượt đang dở (FR-10).
- **Bỏ qua:** người học chọn "Bỏ qua, cho tôi xem luôn" trên màn reveal. Không có nhánh replay nào được tạo.

### 6.6 Mở niêm phong và kết thúc buổi

Item mục tiêu được mở niêm phong ngay khi replay kết thúc theo bất kỳ cách nào: thành công, thất bại, bỏ giữa chừng hoặc bỏ qua. Lúc đó buổi chuyển sang trạng thái **đã xong**. Từ đây buổi chỉ còn xem lại dạng chỉ đọc (FR-40), và không có item nào của buổi còn niêm phong.

### 6.7 Cô lập

Replay là một **nhánh riêng** gắn với buổi chính và điểm rẽ nhánh. Replay không bao giờ ghi đè transcript, ledger, snapshot, danh sách đã mở, điểm reveal hay chỉ số của buổi chính. Kết quả reveal của buổi chính (số đã khai thác, danh sách, nhận xét) được đóng băng trước khi replay bắt đầu. Kết quả replay được lưu thành một bản ghi riêng, hiện kèm reveal khi xem lại, và không bao giờ làm thay đổi số đã khai thác của buổi chính. Chỉ số replay được ghi riêng.

## 7. Yêu cầu chức năng

### Truy cập và tài khoản
- **FR-1** Khách xem được trang chủ và thư viện kịch bản mà không cần đăng nhập.
- **FR-2** Trước khi bắt đầu một buổi, người học phải đăng nhập bằng Google hoặc email magic link. MVP không có phân quyền.
- **FR-3** Người học chỉ xem được các buổi của chính mình.

### Thư viện kịch bản
- **FR-4** Thư viện chỉ hiện kịch bản đã publish (đã pass eval, FR-35). Mỗi thẻ gồm tên và một câu về persona, bối cảnh nghiên cứu, và tổng số item trong tảng băng (bộ đếm niêm phong).
- **FR-5** Mỗi người học chỉ có một buổi chấm điểm cho mỗi kịch bản. Sau đó thẻ chuyển sang "Xem lại kết quả".

### Buổi phỏng vấn
- **FR-6** Màn chuẩn bị nêu giới hạn 30 lượt và luật "chỉ nói nếu hỏi đúng cách".
- **FR-7** Người học chat với persona bằng tiếng Việt. Màn hình luôn hiện bối cảnh nghiên cứu, số lượt đã dùng trên 30, và tổng số item trong tảng băng (bộ đếm niêm phong), không đổi trong suốt buổi.
- **FR-8** Trong lúc phỏng vấn, màn hình không hiện nhãn, gợi ý hay số item đã mở.
- **FR-9** Người học kết thúc buổi được bất cứ lúc nào. Buổi tự kết thúc sau lượt 30.
- **FR-10** Buổi bị gián đoạn trong lúc phỏng vấn thì tiếp tục được đúng lượt đã dừng. Buổi bị gián đoạn sau reveal nhưng trước khi chuyển sang trạng thái đã xong (§6.6) thì mở lại ở đề xuất replay. Nếu gián đoạn xảy ra giữa replay, replay tiếp tục đúng lượt đang dở.
- **FR-11** Lượt mà LLM call bị lỗi không được tính và không làm thay đổi trạng thái; người học được mời gửi lại.

### Engine mỗi lượt
- **FR-12** Hệ thống tạo bằng chứng phân tích cho mỗi câu của người học (§5.2 bước 1) mà không đưa nội dung item khóa vào bước này.
- **FR-13** Hệ thống quyết định mở khóa chỉ bằng luật theo đường mở, dựa trên bằng chứng đã qua kiểm của code, ledger và openness.
- **FR-14** Hệ thống cập nhật openness, hook ledger (thả, nhặt, chú thích bỏ qua) và danh sách item đã nói ra sau mỗi lượt. Hook chỉ được ghi là đã thả, và item chỉ được tính đã nói ra, khi câu trả lời chứa cụm neo tương ứng.
- **FR-15** Context của persona chỉ gồm những gì liệt kê ở §5.2 bước 3.
- **FR-16** Hệ thống kiểm lượt persona trước đó theo các ràng buộc do-not-assert (lượt cuối do verifier kiểm). Lượt vi phạm bị gắn cờ, bị loại khỏi bằng chứng ở màn reveal và được ghi log.
- **FR-17** Hệ thống lưu snapshot bất biến sau mỗi lượt (§6.1).

### Đoán và reveal
- **FR-18** Trước reveal, người học đoán số item mình đã khai thác, trên thang từ 0 tới tổng số.
- **FR-19** Màn reveal hiện số đoán cạnh số thật, danh sách đã khai thác (kèm lượt mở), danh sách bỏ lỡ (kèm đường mở cần dùng và bằng chứng lượt gần nhất nếu có), và item mục tiêu của replay ở trạng thái niêm phong (§6.6).
- **FR-20** Màn reveal hiện nhận xét cách hỏi, tính từ ledger. Mỗi nhận xét trích ít nhất một lượt. Nếu buổi có lượt được gắn nhãn tốt và qua verifier, nhận xét có ít nhất một lời khen có căn cứ, trích đúng lượt đó.
- **FR-21** Mọi trích dẫn được render từ transcript đã lưu theo ID lượt. Trích dẫn không resolve được hoặc bị verifier bác thì claim của nó bị bỏ, trừ trích dẫn của một lần mở khóa (§5.3). Bấm vào trích dẫn sẽ nhảy tới lượt đó.
- **FR-22** Verifier chạy đúng một lần logic mỗi buổi, trước khi render reveal. Kết quả được lưu, và lỗi được xử lý theo §5.3.

### Replay
- **FR-23** Hệ thống chọn khoảnh khắc replay theo §6.2 và đề xuất nó trên màn reveal.
- **FR-24** Replay khôi phục context theo §6.3.
- **FR-25** Replay cho đúng 3 lượt, qua cùng pipeline với buổi chính (§6.4).
- **FR-26** Replay hiện kết quả thành công, thành công một phần hoặc thất bại theo §6.5.
- **FR-27** Replay không bao giờ sửa dữ liệu hay chỉ số của buổi chính (§6.7).

### Guide
- **FR-28** Guide gồm: câu dẫn dắt nguyên văn của người học ghép với pattern soạn sẵn cho loại lỗi đó; thẻ thói quen hiện khi ledger vượt ngưỡng; và câu hỏi mẫu của các item bị bỏ lỡ.
- **FR-29** Người học mở lại được guide và in hoặc lưu nó thành PDF.
- **FR-30** Guide không chứa khẳng định nào về người dùng thật. Mọi nội dung soạn sẵn của guide đều đã qua verifier lúc soạn kịch bản (FR-36).

### Sau buổi và tín hiệu
- **FR-31** Sau guide, màn hình đề xuất kịch bản chưa luyện kế tiếp.
- **FR-32** Nút waitlist "mở thêm" ghi lại người học đã bấm cùng thời điểm bấm.

### Vận hành: soạn và publish kịch bản
- **FR-33** CLI kiểm file kịch bản theo schema và theo chuẩn chất lượng:
  - 8–12 item, đủ 4 đường mở, ≥2 item thuộc đường chuyện quá khứ hoặc tin tưởng.
  - Mỗi item có đủ các trường ở §5.1.
  - Kịch bản có trường `language` và `role`, vì vai trò là dữ liệu.
  - Không ràng buộc do-not-assert, topic tag hay hook line nào được chứa từ mang nội dung của item khóa.
  - Mọi item phải đến được: đồ thị item tiên quyết không có vòng, và ngưỡng openness của item tin tưởng đạt được trong ≤20 lượt tốt.
- **FR-34** Eval harness chạy run tốt (người phỏng vấn mù tảng băng) và run xấu, mỗi loại 3 lần và lấy trung vị, cộng 20 run adversarial. Báo cáo gồm:
  - số item mở;
  - rò rỉ mỗi episode. **Rò rỉ** là khi persona nói ra nội dung của một item chưa mở ở lượt đó, do judge của eval chấm. **Episode** là một run eval, hoặc một buổi trong production;
  - tỉ lệ persona nói đúng cụm neo khi được yêu cầu;
  - tỉ lệ mâu thuẫn giữa lời persona trước và sau khi một item mở;
  - bất đồng giữa verifier và cổng mở khóa.
- **FR-35** CLI chỉ publish kịch bản pass mọi ngưỡng; nếu từ chối thì in lý do.
- **FR-36** CLI chạy verifier guide trên câu hỏi mẫu và pattern lúc soạn. Câu nào khẳng định về người dùng thật, hoặc bị gắn nhãn `leading/assumption` khi không có transcript, thì chặn publish.

### Vận hành: hệ thống
- **FR-37** Hệ thống áp cap chi phí LLM theo ngày. Khi chạm cap, hệ thống chặn buổi mới nhưng để buổi đang chạy đi hết.
- **FR-38** Hệ thống ghi sự kiện đủ để tính các chỉ số ở §9: bắt đầu buổi, lượt, kết thúc, reveal, bắt đầu và kết quả replay, mở guide, bấm waitlist.

### Buổi của tôi

Nhóm này thuộc luồng người học, nối tiếp FR-31 và FR-32. ID được giữ nguyên, nên nhóm đứng cuối.

- **FR-39** Người học đã đăng nhập xem được danh sách buổi của mình. Mỗi buổi gồm tên kịch bản, ngày bắt đầu, và số item đã khai thác trên tổng của buổi chính. Buổi chưa xong được đánh dấu và mở lại để tiếp tục (FR-10).
- **FR-40** Mở một buổi đã xong sẽ hiện transcript, màn reveal (kèm kết quả replay nếu có) và guide ở dạng chỉ đọc, đúng như lúc buổi kết thúc. Trang này không có thao tác nào gửi lượt mới hay chạy replay.
- **FR-41** Không item nào còn niêm phong trên trang xem lại, trong mọi trường hợp replay: thành công, thất bại, bỏ giữa chừng, bỏ qua, hoặc không có replay (§6.6).
- **FR-42** Header có liên kết tới "Buổi của tôi" sau khi đăng nhập. Thẻ kịch bản ở trạng thái "Đã luyện · Xem lại kết quả" dẫn thẳng tới bản xem lại của buổi đó.
- **FR-43** Người học chưa có buổi nào thấy trạng thái trống, kèm lối tới thư viện kịch bản.

## 8. Yêu cầu phi chức năng

- **NFR-1 Số LLM call:** tối đa 2 call logic mỗi lượt của người học, áp cho cả buổi chính lẫn replay. Mỗi buổi thêm tối đa 1 call logic cho verifier ở màn reveal. Guide, nhận xét ở màn reveal và trang "Buổi của tôi" không gọi LLM. Lần thử lại kỹ thuật khi lỗi không tính là call logic, nhưng được ghi log và tính vào chi phí.
- **NFR-2 Độ trễ:** p95 ≤ 6 giây mỗi lượt, tính từ lúc gửi tới lúc câu trả lời persona hiện đầy đủ. Đây là mức khởi điểm, sẽ chỉnh sau khi đo.
- **NFR-3 Chi phí:** chi phí trung bình mỗi buổi được đo và ghi log. Mục tiêu là nằm trong mốc giá gói prep-sprint (addendum §5). Mốc 100–200k VND là suy luận, chưa kiểm `[ASSUMPTION]`. Cap theo ngày cấu hình được mà không cần deploy lại.
- **NFR-4 Không rò rỉ:** nội dung và cụm neo nội dung của item khóa không bao giờ có trong context của Call 1 hay Call 2 trước khi item đó mở. Ràng buộc do-not-assert chỉ ở mức topic tag. Kiểm bằng test tự động trên chính context đã dựng, không chỉ bằng eval.
- **NFR-5 Chống injection:** văn bản của người học không thể thay đổi luật mở khóa, và mọi lần mở khóa phải truy được về một luật và một bằng chứng. Dù Call 1 trả JSON do kẻ tấn công điều khiển:
  - mỗi lượt mở tối đa 1 item;
  - không item follow-up nào mở mà không có hook đã thả thật (có cụm neo trong transcript);
  - không nội dung khóa nào lộ ra ngoài item được mở.

  Mô hình đe dọa: nội dung kịch bản không phải bí mật của bên thứ ba, nên nếu người học tự chèn injection, họ chỉ làm hỏng buổi luyện của chính mình. Rủi ro còn lại được đo bằng 20 run adversarial, không được coi là đã loại bỏ.
- **NFR-6 Rò rỉ trong production:** theo dõi tỉ lệ rò rỉ mỗi episode. Mốc ~0,6/episode trong research chỉ để tham chiếu, không dùng làm claim.
- **NFR-7 Độ chính xác phân loại:** trên test set tiếng Việt (≥100 câu có gán nhãn theo 4 nhãn, gồm các ca biên kiểu "luôn thấy bực, đúng không?" và câu hỏi mở không trích lượt `[ASSUMPTION]`), đạt ≥85% đồng thuận và ≤5% câu tốt bị gắn nhầm nhãn `leading`.
- **NFR-8 Bất đồng giữa verifier và cổng mở khóa:** với mỗi lần mở khóa, verifier ở màn reveal kiểm lại nhãn đã dẫn tới lần mở đó. Tỉ lệ lần verifier không đồng ý phải ≤10% trên eval `[ASSUMPTION]`. Đây là chỉ số nội bộ, không bao giờ hiện cho người học.
- **NFR-9 Riêng tư:** transcript, kết quả và guide chỉ chủ tài khoản xem được. Dữ liệu người học không dùng để huấn luyện model. Sản phẩm không có chia sẻ công khai.
- **NFR-10 Toàn vẹn dữ liệu:** snapshot bất biến. Một lượt hoặc là được ghi đủ (transcript, ledger, snapshot), hoặc là không được ghi gì.
- **NFR-11 Responsive:** mọi màn dùng được từ độ rộng 360px tới desktop.
- **NFR-12 Ngôn ngữ:** giao diện và kịch bản tiếng Việt. Ngôn ngữ cố định trong suốt một buổi.
- **NFR-13 Ranh giới đạo đức:** không đầu ra nào của sản phẩm chứa nhận định về người dùng thật. Giới hạn của copy ra mắt: xem bảng "Cắt và hệ quả" ở §3.
- **NFR-14 Giọng và copy:**
  - Viết "phỏng vấn người dùng", không viết "phỏng vấn" đứng một mình (dễ hiểu nhầm là phỏng vấn xin việc). Không dùng chữ "feedback".
  - Dùng ngôn ngữ của nỗi sợ và của việc sửa kịp.
  - Không dùng tone mềm để chiều lòng người mới; lời khen chỉ được đưa khi có căn cứ.
  - Không đưa số liệu chưa kiểm (ví dụ ~0,6 rò rỉ mỗi episode, mốc giá) vào copy.

## 9. Chỉ số thành công

Chỉ đọc các tỉ lệ phần trăm sau khi có ≥30 người học.

| ID | Chỉ số | Ngưỡng |
|---|---|---|
| SM-1 | Buổi đã bắt đầu đi tới màn reveal | ≥60% |
| SM-2 | Buổi có reveal và có dùng replay | ≥40% (chỉ số tương tác, không chứng minh việc học) |
| SM-3 | Người học làm buổi thứ hai trên kịch bản khác | ≥30%. Chỉ đo được khi thư viện có ≥2 kịch bản |
| SM-4 | Giả định #9 (§11): tỉ lệ mở item ở buổi 2, so giữa người có dùng replay và người không | Theo dõi, chưa đặt ngưỡng. Chỉ đo được khi có ≥2 kịch bản |
| SM-5 | Bấm waitlist "mở thêm" | Đếm; ≥1 giảng viên hoặc trung tâm chia sẻ link |

**Counter-metric**

| ID | Chỉ số |
|---|---|
| SM-C1 | Buổi bỏ trước lượt 5 |
| SM-C2 | Tỉ lệ lượt persona bị gắn cờ do-not-assert |
| SM-C3 | Tỉ lệ bất đồng giữa verifier và cổng mở khóa (NFR-8) |
| SM-C4 | Rò rỉ mỗi episode (NFR-6) |
| SM-C5 | Chi phí mỗi buổi (NFR-3) |
| SM-C6 | độ trễ p95 (NFR-2) |
| SM-C7 | Tỉ lệ replay rơi vào dự phòng 2 (dấu hiệu kịch bản thiếu hook) |

## 10. Tiêu chí nghiệm thu (cổng ra mắt MVP)

1. **Demo end-to-end** (UJ-1) chạy trên URL đã deploy: trang chủ → chọn kịch bản → đăng nhập → phỏng vấn → đoán → reveal → replay → guide → màn sau buổi.
2. **Kịch bản** (FR-33–36): ≥1 kịch bản (mục tiêu 2) pass `validate` (kể cả kiểm khả năng đến được) và pass eval: 0 rò rỉ trong 20 run adversarial; run tốt mở ≥2 lần số item của run xấu và mở ≥3 item; bất đồng giữa verifier và cổng mở khóa ≤10%; 0 câu mẫu hoặc pattern nào bị verifier guide chặn.
3. **Cô lập context** (NFR-4, FR-12, FR-15): test tự động chứng minh context của Call 1 và Call 2 không chứa nội dung hay cụm neo nội dung của item còn khóa, ở mọi lượt của eval.
4. **Cổng mở khóa** (FR-13, FR-14, NFR-5): test tự động cho từng đường mở:
   - Follow-up không mở khi `hook_id` chưa được thả, và vẫn mở được khi hook được nhặt muộn hơn một lượt.
   - Nhãn tốt mà `grounded_turn_id` không resolve được tới một lượt persona có thật thì bị hạ thành nhãn `leading`. Câu hỏi mở ở lượt 1 nhận nhãn `open`, không bị tính là nhãn `leading`.
   - Luật mở khóa đánh giá trên trạng thái trước lượt.
   - Item tin tưởng không mở khi openness dưới ngưỡng.
   - Hook không được ghi là đã thả khi câu trả lời thiếu cụm neo. Item không được tính đã khai thác khi câu trả lời thiếu cụm neo nội dung.
   - Với Call 1 giả lập trả JSON đối kháng, mỗi lượt mở tối đa 1 item, và không item follow-up nào mở khi không có hook đã thả.
5. **Replay** (FR-23–27):
   - Chọn khoảnh khắc đúng theo §6.2 trên 3 transcript cố định (một ca ứng viên chính, một ca dự phòng 1, một ca dự phòng 2).
   - Chạy lại cùng transcript thì cho ra cùng khoảnh khắc.
   - Câu hỏi mẫu gửi ở lượt replay thứ 2 vẫn mở được item mục tiêu.
   - Sau replay, transcript, ledger, snapshot và kết quả reveal của buổi chính không đổi. Chỉ cờ mở niêm phong được cập nhật.
6. **Số call** (NFR-1): log một buổi 30 lượt cho thấy ≤2 call logic mỗi lượt và đúng 1 call logic cho verifier.
7. **Phân loại** (NFR-7): đạt ngưỡng NFR-7 trên test set tiếng Việt.
8. **Độ trễ** (NFR-2): p95 ≤ 6 giây trên ≥1 buổi eval đầy đủ chạy với môi trường đã deploy.
9. **Riêng tư** (FR-3, NFR-9): tài khoản B không đọc được buổi, reveal hay guide của tài khoản A (test API).
10. **Buổi của tôi** (FR-39–43):
    - Danh sách hiện đúng số đã khai thác của buổi chính, kể cả khi replay đã mở thêm item.
    - Bản xem lại khớp với reveal và guide lúc kết thúc buổi, và không gọi LLM nào.
    - Với 4 ca (replay thành công, thất bại, bấm "Dừng" giữa chừng, bỏ qua), trang xem lại không còn item nào niêm phong.
    - Người học mới thấy trạng thái trống.
    - Tài khoản B không mở được trang xem lại của tài khoản A.
11. **Cap chi phí** (FR-37): khi cap bị hạ về mức đã tiêu, buổi mới bị chặn kèm thông báo, còn buổi đang chạy vẫn đi tới hết guide.

## 11. Giả định, rủi ro và câu hỏi mở

### Giả định (đánh số theo brief)

| # | Giả định | Trạng thái | Đo trong MVP |
|---|---|---|---|
| 1 | Chưa sản phẩm nào kết hợp thông tin ẩn cố định, reveal trích theo lượt và replay | Được ủng hộ, tìm kiếm có giới hạn | Kiểm lại trước 2026-12-22; theo dõi mom-test, UXPressia |
| 2 | Luyện kèm bằng chứng mới giúp tiến bộ | Được ủng hộ bởi một preprint ngoài lĩnh vực | Qua #9 |
| 3 | Persona bám tài liệu dạy tốt hơn nhưng kém thật hơn người thật | Đã kiểm (n=69) | Chưa đo độ thật trong MVP (xem rủi ro) |
| 4 | Nỗi đau đủ lớn để người học chủ động đi luyện | Chưa kiểm | 5–8 phỏng vấn sinh viên HCI năm cuối trước khi chốt copy; SM-1 |
| 5 | Sinh viên HCI/UX VN luyện 1–3 tuần trước buổi thật | Chưa kiểm, 0 tiếng nói người học VN | Ra mắt với 1–2 lớp; số buổi mỗi người |
| 6 | Có nhu cầu cho BA/PM | Chưa kiểm | **Không có tín hiệu trong sản phẩm**; 3 phỏng vấn fresher BA |
| 7 | Kịch bản BA/PM do AI soạn đủ thật | Chưa kiểm | Không áp dụng cho MVP (xem Next) |
| 8 | Có người trả tiền | Chưa kiểm | SM-5; 2–3 cuộc nói chuyện với giảng viên hoặc trung tâm |
| 9 | Replay giúp mở item ở buổi sau | Chưa kiểm | SM-4, khi có ≥2 kịch bản. Replay diễn ra sau reveal, vì vậy chỉ đo được tương tác; giữ item mục tiêu niêm phong làm giảm, nhưng không loại bỏ, ảnh hưởng này |
| 10 | Người học muốn bắt lỗi, không chỉ muốn bớt sợ | Chưa kiểm | SM-1, SM-2, lượt mở guide |
| 11 | ChatGPT có prompt không giữ được trạng thái ẩn | Chưa kiểm | Chạy bộ adversarial của eval trên một persona ChatGPT chỉ dùng prompt, so tỉ lệ rò với engine (ngoài cổng ra mắt) |

### Rủi ro

- **Kích hoạt:** khác biệt so với ChatGPT chỉ lộ rõ ở màn reveal. Người bỏ giữa buổi đầu sẽ không bao giờ thấy nó. Bộ đếm niêm phong và ảnh reveal ở trang chủ chỉ làm dịu một phần. Theo dõi bằng SM-C1.
- **Phán đoán của Call 1 (phân tích):** ranh giới giữa `boundary-probe`, `open` và `leading` là phán đoán của LLM. Nhãn sai trên một câu tốt làm mất niềm tin vào mọi nhãn khác. Giảm nhẹ: NFR-7, và ca biên trong test set.
- **Độ thật của persona:** persona bám tài liệu bị đánh giá là kém thật hơn người đóng vai (#3), trong khi màn chuẩn bị mời người học "hỏi như đang gặp người thật". MVP chưa đo độ thật.
- **Lịch:** khoảng 16,25 ngày dev cho toàn bộ must-ship (addendum §6), chưa gồm buffer.

### Câu hỏi mở (hoãn có chủ đích)

- **Ai trả tiền?** Các hướng: B2C gói prep-sprint gắn ngày phỏng vấn thật; B2B2C qua giảng viên hoặc trung tâm (người trả không thấy kết quả của người học); kịch bản custom trả phí; hướng dự phòng "Panel Rehearsal". Brief đề xuất thử B2C và B2B2C song song. MVP chỉ thu tín hiệu qua SM-5.
- **Điều gì kéo người học quay lại?** Các ứng viên: lứa mới mỗi học kỳ, vòng pre-flight → buổi thật → post-flight, ôn lại sau 1 tuần, lộ trình nhắm thói quen xấu, kịch bản custom theo dự án. Tín hiệu đầu tiên: SM-3, khi có kịch bản thứ hai.
