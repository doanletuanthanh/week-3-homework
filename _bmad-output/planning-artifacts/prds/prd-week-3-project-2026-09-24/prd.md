---
title: 'PRD: InterviewLab'
status: final
created: '2026-09-24'
updated: '2026-09-25'
---

# PRD: InterviewLab

> Nguồn: `brief.md` và `addendum.md` của brief (2026-09-22), `forged-idea.md`, `research.md`, `brainstorm-intent.md`. **PRD này và `addendum.md` cùng thư mục thay `brief.md`, addendum của brief và `forged-idea.md` ở mọi điểm khác nhau**; lịch sử thay đổi và lý do ở addendum §7–§8.
> Chi tiết kỹ thuật (hợp đồng từng call, luật mở khóa, mô hình dữ liệu, chi phí, lịch): `addendum.md`.
> Thẻ `[ASSUMPTION]` đánh dấu chỗ suy luận hoặc đề xuất chưa được duyệt.

## 1. Sản phẩm

Người mới học phỏng vấn người dùng thường chỉ biết mình hỏi sai **sau khi** buổi phỏng vấn thật đã qua: hỏi câu dẫn dắt, không hỏi sâu, hoặc bỏ qua một chi tiết người kia vừa nhắc. **InterviewLab** là phòng tập phỏng vấn người dùng, kèm bằng chứng bạn sai ở đâu.

Người học phỏng vấn một persona AI. Persona giữ một **tảng băng** gồm 8–12 điều chưa nói. Tảng băng cố định từ lượt đầu, và một điều chỉ mở ra khi người học hỏi đúng cách. Cuối buổi, người học đoán mình khai thác được bao nhiêu, rồi tảng băng lộ ra, mỗi điều kèm trích dẫn đúng lượt trong transcript. Người học quay lại **khoảnh khắc bị lỡ** để hỏi lại, và mang về một trang "thói quen hỏi" dựng từ lỗi của chính mình.

**Việc người học cần làm** (JTBD, từ brainstorm): bước vào buổi thật mà không lúng túng. MVP phục vụ phần "bắt lỗi trước khi nó tốn một buổi thật"; phần "biết cách gỡ khi lệch kịch bản" chưa được phục vụ (Later).

**Bối cảnh:** sản phẩm production thật, 1 dev, 16 ngày dev cố định, responsive web app, deploy và demo end-to-end trên URL thật. Chỉ vai trò UX, chỉ tiếng Việt. Cam kết 1 kịch bản; kịch bản thứ hai chỉ làm nếu kịp (§3).

**Người dùng ra mắt:** sinh viên HCI/UX năm cuối ở VN sắp có phỏng vấn người dùng cho đồ án (Linh, UJ-1). BA và PM dùng chung kiến trúc, ra mắt sau (Next).

**Ranh giới đạo đức** (thực thi bằng cấu trúc sản phẩm, không bằng disclaimer): sản phẩm chỉ đánh giá kỹ năng của người học và không bao giờ tạo nhận định về người dùng thật. Mọi trích dẫn lấy từ transcript. Dữ liệu người học riêng tư theo mặc định.

## 2. Thay đổi sau phản hồi reviewer

Reviewer nhận xét thiết kế quá nặng và phạm vi quá rộng. Các thay đổi chính: giảm từ 4 xuống **2 LLM call mỗi lượt**, và **code** (không phải model) quyết định mở khóa; guide và nhận xét dựng từ template, không gọi LLM; cắt plumbing song ngữ, bộ đếm theo tier, admin dashboard, magic link, cổng publish tự động; cam kết 1 kịch bản thay vì 2; lịch cố định 16 ngày với thứ tự cắt chốt trước. Bảng đầy đủ qua các vòng review (adversarial, party-mode, advanced elicitation, validate): addendum §8.

## 3. Phạm vi MVP

| | Nội dung |
|---|---|
| **Cam kết** (~16,25 ngày trên mốc 16, addendum §6) | 1 kịch bản UX tiếng Việt và 11 mục dưới đây |
| **Nếu kịp** | Kịch bản thứ hai, chỉ khi đạt tripwire ngày 11 (addendum §6); kèm màn thư viện (Màn 2) và Màn 8 |
| **Nếu trễ** | Cắt đúng thứ tự: (1) kịch bản thứ hai → (2) "Buổi của tôi" thu lại thành liên kết "Buổi gần nhất" → (3) verifier lúc chạy chỉ còn trong eval. Yêu cầu viết lại sẵn cho cắt #2 và #3: addendum §6 |
| **Không bao giờ cắt** | Test cổng mở khóa (§9.2 mục 4), đường replay chính, reveal, eval của kịch bản 1, deploy |
| **Next** | Pipeline sinh kịch bản kèm cổng publish tự động (FR-35) và verifier guide lúc soạn (FR-36) → kịch bản BA/PM (sàn 8 item) kèm câu hỏi vai trò ở onboarding → đường "Describe" → thư viện tiếng Anh |

**Trong MVP**
1. Schema kịch bản và kịch bản 1: mục tiêu nghiên cứu, lời mở đầu, ≥12 fact bề mặt, item, hook, ràng buộc do-not-assert, trọng số, câu hỏi mẫu, pattern guide.
2. Engine mỗi lượt: 2 call, luật mở khóa bằng code, openness, hook ledger, snapshot.
3. Đoán, reveal, verifier lúc reveal.
4. Replay từ khoảnh khắc bị lỡ.
5. Guide là phần "Mang về" cuối màn reveal, có nút in.
6. Bộ đếm niêm phong: chỉ hiện tổng số.
7. Đăng nhập Google, lưu trữ riêng tư, deploy.
8. CLI `validate`, eval harness và báo cáo (kèm run baseline chỉ-prompt), `publish` (chỉ đặt trạng thái), `trace`, `seed-demo`. Thay cho FR-35/FR-36: trách nhiệm duyệt thủ công có tên (§7, đầu nhóm "Vận hành: soạn và publish").
9. Cap chi phí theo ngày.
10. Nút waitlist "mở thêm".
11. "Buổi của tôi": danh sách buổi và bản xem lại chỉ đọc.

**Hệ quả của các mục đã cắt** (mỗi dòng là một giới hạn copy hoặc sản phẩm phải tôn trọng)

| Đã cắt | Hệ quả |
|---|---|
| Kịch bản thứ hai (nếu cắt #1) | FR-5 cho một buổi chấm điểm mỗi kịch bản, nên mỗi người học chỉ có **một buổi luyện**. SM-3, SM-4 và giả định #9 không đo được (§9.1). Không có thẻ "Sắp có"; cuối reveal chỉ còn dòng waitlist |
| "Buổi của tôi" (nếu cắt #2) | Với 1 kịch bản, mỗi người học chỉ có một buổi, nên "Buổi gần nhất" là buổi đó và gần như không mất gì. Với 2 kịch bản, buổi cũ hơn mở qua thẻ kịch bản của nó |
| Verifier lúc chạy (nếu cắt #3) | Không có lời khen có căn cứ lúc chạy; lời bảo vệ agent (§5.0) mất một chân tự kiểm lúc chạy. Copy không được nói "mọi trích dẫn được đối chiếu trước khi hiện" |
| Câu hỏi kinh nghiệm và tier | Mọi người thấy cùng bộ đếm (chỉ tổng niêm phong) |
| Nút "Báo tôi khi BA/PM sẵn sàng" | Giả định #6 không có tín hiệu trong sản phẩm |
| Guide theo đề tài thật của người học | Copy chỉ được hứa guide theo **lỗi và thói quen của bạn**, không theo **đề tài của bạn**. Headline "Tự tin bước vào…" thay bằng "Mắc lỗi ở đây, đừng mắc trước người thật." (reveal được thiết kế để lay niềm tin). Bản in có dòng trống để người học tự viết câu cho đề tài của mình |
| Magic link | Chỉ Google; người không có tài khoản Google không vào được |
| Trường "chủ đề phỏng vấn thật" | Không kiểm được chủ đề thật có trùng kịch bản không; thẻ kịch bản nêu rõ bối cảnh nghiên cứu |
| Ô tự do ở màn đoán, dòng "1 trong 2 buổi miễn phí" | Màn đoán chỉ có thanh trượt; không ngầm hứa mô hình giá |
| Cổng publish tự động, verifier guide lúc soạn | Không có máy chặn kịch bản fail ngưỡng hay câu soạn sẵn vi phạm đạo đức; thay bằng trách nhiệm duyệt thủ công có tên (§7) |
| Plumbing song ngữ | Chỉ tiếng Việt; trường `language` trong kịch bản để bản tiếng Anh không cần migrate |

**Later:** admin dashboard, guide theo đề tài, feedback theo tier, timeline câu hỏi và tỉ lệ nói, trình soạn kịch bản trực quan, luyện "gỡ khi lệch kịch bản".
**Ngoài phạm vi:** phỏng vấn nhóm; persona sinh từ câu hỏi nghiên cứu của người học; mọi đầu ra dạng insight về người dùng thật; sản phẩm cho giảng viên; thanh toán; voice.

BA/PM (Next) chỉ ship kèm các biện pháp độ thật đã chốt ở forge: grounded trên tài liệu thật, AI critic đóng vai senior, 1–2 người đọc proxy (ghi là kiểm tra một phần), link "Người này có giống stakeholder thật không?", và tiêu chí eval "run BA tốt có câu xác nhận đóng đúng lúc".

## 4. Hành trình chính

Vòng lặp cốt lõi: **phỏng vấn → đoán → tảng băng lộ diện → luyện lại khoảnh khắc bị lỡ → mang về thói quen hỏi.** Thuật ngữ ở §5.1.

### UJ-1: Linh luyện trước buổi phỏng vấn thật đầu tiên

Linh là sinh viên HCI năm cuối. Trong 10 ngày tới cô có 5 buổi phỏng vấn người dùng cho đồ án, và chưa từng phỏng vấn ngoài role-play trên lớp. Một bạn cùng lớp gửi link vào group chat. Linh mở trên laptop lúc 11 giờ đêm.

**Màn 1: Trang chủ.** "Luyện phỏng vấn người dùng. Xem chính xác bạn đã bỏ lỡ điều gì." Dòng phụ: "Mắc lỗi ở đây, đừng mắc trước người thật." Ảnh chụp màn reveal: một dòng transcript được highlight, chú thích "Chị ấy vừa nhắc tới một cách xoay xở. Bạn chuyển chủ đề." Nút "Bắt đầu một buổi luyện". Với 1 kịch bản, nút dẫn thẳng tới Màn 3; nếu Linh đã có buổi của kịch bản đó, nút thành "Tiếp tục buổi luyện" (buổi chưa xong) hoặc "Xem lại kết quả" (buổi đã xong) (FR-4). Chưa cần đăng nhập.

**Màn 2: Chọn kịch bản** (chỉ khi có ≥2 kịch bản). Mỗi thẻ: ảnh, tên, một câu về persona, bối cảnh nghiên cứu, bộ đếm niêm phong ("Đang giữ 11 điều chưa nói"). Ví dụ: "Chị Thu, 26 tuổi, nhân viên văn phòng. Chị từng dùng vài app quản lý chi tiêu rồi bỏ." Thẻ đã luyện đổi nhãn như nút ở Màn 1.

**Màn 3: Chuẩn bị** (~20 giây đọc). **Mục tiêu nghiên cứu** dạng câu hỏi: "Bạn muốn hiểu: vì sao người trẻ bắt đầu rồi bỏ việc theo dõi chi tiêu?". Ba dòng: tối đa 30 lượt, khoảng 15–20 phút; chị Thu chỉ nói ra những điều đó nếu bạn hỏi đúng cách ("một điều" là một trải nghiệm, thói quen hay cảm nhận chị chưa kể, không phải tên hay tuổi); cứ hỏi như đang gặp người thật. Bấm "Bắt đầu" thì đăng nhập Google, kèm lý do "để lưu lại buổi này cho bạn xem lại".

**Màn 4: Phỏng vấn.** Khung chat. Thanh trên: tên persona, mục tiêu nghiên cứu, "Lượt 4/30", "Chị Thu đang giữ 11 điều chưa nói". Chị Thu nói trước bằng lời mở đầu soạn sẵn ("Chào em, chị có khoảng 20 phút, em cứ hỏi nhé."). Không gợi ý, không nhãn, không đếm số điều đã mở. Khi chờ: "Chị Thu đang gõ…". Chị Thu nói chuyện thoải mái về đời sống thường ngày và chỉ giữ kín những điều trong tảng băng; chị dè dặt hơn hoặc cởi mở hơn tùy cách Linh hỏi (openness, §5.1).

> Lượt 2. Linh: "Chị có muốn một app nhắc chị tiết kiệm không?" Chị Thu: "Ừ, cũng được đó em." Call 1 gắn nhãn `leading`, loại giả định-tương-lai, kèm nội dung Linh tự thêm: "app nhắc chị tiết kiệm". Openness giảm. Linh không được báo gì.
> Lượt 5. Linh: "Lần gần nhất chị thấy hết tiền trước cuối tháng là khi nào ạ?" Chị Thu: "Tháng trước. Chị nhớ là có lần chị định ghi lại nhưng rồi cũng bỏ." Mở item bề mặt "từng thử ghi chép rồi bỏ", và thả hook của item "đang trả phí cho một app gần như không mở".
> Lượt 6. Linh: "Dạ vâng. Còn chuyện ăn uống thì sao chị?" Ledger ghi hook ở lượt 5 bị bỏ qua.

Linh bấm "Kết thúc buổi" ở lượt 22 (buổi tự kết thúc sau lượt 30).

**Màn 5: Đoán.** "Trước khi xem chị Thu giấu gì: bạn khai thác được bao nhiêu trong 11 điều?" Thanh trượt 0–11; Linh kéo tới 7.

**Màn 6: Tảng băng lộ diện.** Từ trên xuống (replay là điều khác biệt duy nhất, nên đứng ngay dưới điểm):
1. **Điểm:** "Bạn đoán 7. Thực tế: 3 trên 11."
2. **Khối replay:** "Khoảnh khắc đáng tiếc nhất là lượt 5–6. Thử lại?", nút "Quay lại lượt 6", liên kết nhỏ "Bỏ qua, cho tôi xem luôn". Kèm thẻ **Giữ lại để bạn thử (1)**: item mục tiêu **vẫn niêm phong**, thẻ chỉ ghi "Lượt 5: chị Thu vừa nhắc tới một điều. Bạn đã chuyển chủ đề." (đọc nội dung trước thì replay chỉ còn là bài chép lại). Bỏ qua thì item mở niêm phong ngay.
3. **Đã khai thác (3):** mỗi mục kèm lượt đã mở.
4. **Bỏ lỡ (7):** mỗi mục một dòng (nội dung, đường mở cần dùng: "hỏi tiếp một chi tiết chị vừa nhắc", "chuyện đã xảy ra", "cần sự tin tưởng"). Bấm vào thì hiện câu hỏi mẫu, và nếu có hook đã thả thì hiện lượt gần nhất, câu persona nói và câu Linh hỏi ngay sau. Mục đi đường tin tưởng nói bằng lời, không con số: "Chị Thu chưa đủ tin để kể. Lượt 2, 9, 15 làm chị dè dặt hơn (câu dẫn dắt)."
5. **Mang về: "Thói quen hỏi của bạn — đọc lại trước buổi thật"** (đây là guide). Tối đa 3 nhận xét, chọn theo luật ở addendum §3.3:
   - Lời khen có căn cứ, nếu có, đứng đầu: "Lượt 8, bạn hỏi 'Chị nói hay quên, là quên ghi hay quên xem lại ạ?': bạn hỏi tiếp đúng điều chị vừa nói."
   - Mỗi lỗi là một cặp. Dòng giải thích kèm bằng chứng: "Lượt 2, bạn tự thêm 'app nhắc chị tiết kiệm'; chị Thu chưa từng nói điều này. Câu trả lời cho một câu dẫn dắt không phản ánh hành vi thật." Rồi **"Thay vì hỏi"**: trích nguyên văn câu của Linh; **"Hãy hỏi"**: pattern soạn sẵn cho loại lỗi đó ("Lần gần nhất bạn … là khi nào? Chuyện gì đã xảy ra?").
   - Thẻ "Thói quen cần để ý" (không tính vào 3), khi ledger vượt ngưỡng, ví dụ ≥2 hook bị bỏ qua: "bạn hay chuyển chủ đề khi người kia nhắc tới một chi tiết nhỏ. Khi nghe 'chị có cách riêng', 'chị từng thử', hãy hỏi tiếp."
   - Phần này không chứa câu hỏi về **nội dung chuyện của persona** (câu hỏi mẫu của item bỏ lỡ chỉ ở mục 4); câu của chính người học được trích nguyên văn như mọi trích dẫn khác.
   - Nút "Tải về" in riêng phần này; dưới mỗi pattern có dòng trống "Câu của bạn, cho đề tài của bạn: ______". Lời khen chỉ hiện trên màn, không vào bản in.
6. **Dòng cuối:** "Muốn luyện với người trong lĩnh vực của bạn?" và nút waitlist "mở thêm"; khi có kịch bản chưa luyện, kèm thẻ kịch bản đó (Màn 8).

**Màn 7: Luyện lại.** Hiện lượt 4–5, dừng ở câu chị Thu vừa nói ("…chị định ghi lại nhưng rồi cũng bỏ"); liên kết "xem toàn bộ transcript trước đó"; "Bạn có 3 lượt."

> Linh: "Chị định ghi lại kiểu gì ạ?" Chị Thu: "Chị tải một cái app, ghi được hai tuần. Xong thấy phiền quá nên thôi. Mà chị quên hủy, giờ vẫn trừ tiền hàng tháng."
> Hệ thống: "Đã mở khóa: Chị đang trả phí cho một app chị gần như không mở. Đây chính là điều bạn bỏ lỡ."

Sau 3 lượt mà chưa mở: hiện nội dung item kèm "Một câu đã mở được nó: 'Chị định ghi lại kiểu gì ạ?'"

**Màn 8: Sau buổi** (chỉ khi có ≥2 kịch bản). Thẻ "Anh Dũng, chủ quán cà phê nhỏ, đang giữ 9 điều" và nút "Luyện tiếp với anh Dũng", ngay trên dòng waitlist ở cuối Màn 6.

**Màn 9: Buổi của tôi.** Ba ngày sau, trước buổi phỏng vấn thật đầu tiên (và lại trước các buổi sau), Linh bấm "Buổi của tôi" trên header.
- **Danh sách:** "Chị Thu · 25/09 · 3/11"; buổi chưa xong có nhãn "Đang làm dở · Tiếp tục".
- **Buổi đã xong:** transcript và màn reveal (kèm "Mang về" và kết quả replay), **chỉ đọc**, đóng băng như lúc kết thúc; không còn item nào niêm phong.
- **Trạng thái trống:** "Bạn chưa luyện buổi nào" và nút bắt đầu.

Linh đọc thẻ "Thói quen cần để ý" và in ra mang theo.

**Tình huống lệch hướng**
- Đóng tab ở lượt 12 → mở lại đúng lượt 12. Đóng tab giữa replay → tiếp tục đúng lượt replay; chỉ bấm "Dừng" mới là bỏ.
- Chạm cap chi phí trong ngày → buổi đang chạy vẫn đi hết reveal và replay; chỉ buổi mới bị chặn, kèm "quay lại sau [giờ reset]".
- LLM call lỗi → lượt không được tính, "Chị Thu chưa nghe rõ, bạn gửi lại nhé", không trạng thái nào bị ghi dở.

### UJ-2: Thanh publish một kịch bản mới

Thanh soạn file JSON của kịch bản (có hỗ trợ AI, ngoài sản phẩm), rồi:
1. **`validate`** (FR-33): báo lỗi schema và vi phạm chuẩn (thiếu một đường mở, topic tag lộ nội dung item…). Sửa tới khi sạch.
2. **`eval`** (FR-34): run tốt (mù tảng băng), run xấu, 20 run adversarial, run baseline. Thanh phân xử cờ rò rỉ theo tiêu chí ở FR-34, duyệt thủ công mọi chuỗi soạn sẵn và xác nhận mọi ngưỡng ở §9.2 mục 2, ghi tất cả vào báo cáo.
3. **`publish`**: đặt trạng thái `published`. Lệnh không tự kiểm ngưỡng trong MVP (FR-35 là Next).

## 5. Cơ chế agent

### 5.0 Vì sao đây là agent

`brainstorm-intent.md` (mục 2, ràng buộc 7) định nghĩa agent của sản phẩm bằng năm thuộc tính: có mục tiêu, có trạng thái, tự quyết bước tiếp theo, dùng tool, tự kiểm tra. Agent ở đây là **bộ điều khiển** bao quanh hai LLM call. LLM là giác quan (Call 1 hiểu câu hỏi tiếng Việt tự do) và giọng nói (Call 2 trả lời như một người). Bộ điều khiển giữ trạng thái và ra quyết định.

| Thuộc tính | Cơ chế | Bằng chứng kiểm được |
|---|---|---|
| Có mục tiêu | Trong một buổi: giữ tảng băng cho tới khi người học hỏi đúng cách; ở replay, nhắm một item mục tiêu cụ thể. Mục tiêu xuyên buổi (lộ trình đối kháng, nơi brainstorm đặt thuộc tính này) đã hoãn từ brief; MVP chỉ nhận phần trong buổi | §6.2, §9.2 mục 5 |
| Có trạng thái | Tảng băng, hook ledger, openness, snapshot bất biến mỗi lượt, nằm **ngoài** model | §6.1, NFR-10 |
| Tự quyết bước tiếp theo | Mỗi lượt: mở item nào, thả hook nào, persona ở mức openness nào, context nào đưa cho persona. Cuối buổi: chọn khoảnh khắc replay | §5.2, §6.2, §9.2 mục 4 |
| Dùng tool | Dò cụm neo, tra ledger, resolve trích dẫn theo ID lượt, kiểm bằng chứng của nhãn, chạy luật mở khóa. Các tool này **cố ý không cho model gọi**: nếu model gọi được `unlock`, cổng lại nằm trong tay model (addendum §7) | §5.2, NFR-5 |
| Tự kiểm tra | Dò cụm neo trước khi ghi hook đã thả hay item đã nói ra; kiểm bằng chứng của nhãn `leading`; kiểm do-not-assert trễ một lượt; verifier ở màn reveal (nếu cắt #3: call kiểm cuối buổi) | FR-14, FR-16, FR-22 |

**Đây không phải là** một vòng lặp LLM tự điều khiển, vì không model nào được tự tuyên bố một item đã mở. Đây là một máy trạng thái cố định có lớp LLM bên ngoài: máy trạng thái tạo ra sự thật nền để có bằng chứng theo lượt; LLM làm hai việc máy trạng thái không làm được là hiểu câu hỏi tự do và trả lời như người.

**Bằng chứng mạnh nhất không cần judge:** persona không bao giờ *nhận* nội dung khóa. Đây là test tất định trên context đã dựng (§9.2 mục 3), không phải chỉ dẫn trong prompt. Bằng chứng so sánh: cùng 20 đòn adversarial trên một persona chỉ-prompt giữ cả tảng băng (FR-34). Bằng chứng từng lượt: `trace` (FR-44).

### 5.1 Khái niệm

- **Lượt:** một câu của người học cộng một câu trả lời của persona, đánh số 1–30. Lời mở đầu là **lượt 0**: chỉ có lời persona, không gọi LLM, không thả hook, không tính vào 30, và không phải đích hợp lệ của `grounded_turn_id`.
- **Item:** một điều trong tảng băng, gồm:
  - nội dung (bí mật) và **cụm neo nội dung** (bí mật, chỉ code dùng để kiểm persona đã nói ra item);
  - **topic tag công khai**, không lộ nội dung;
  - một đường mở, và item tiên quyết nếu có;
  - hook line soạn sẵn, kèm **cụm neo hook** persona phải nói nguyên văn. Mọi cụm neo dài 2–4 từ (ví dụ "vẫn trừ tiền hàng tháng"), tối đa 2 biến thể;
  - **ràng buộc do-not-assert trung tính** ở mức topic tag, ví dụ "về chủ đề `đăng ký trả phí`: trả lời mơ hồ, không phủ nhận, không tự kể"; không chứa nội dung item;
  - trọng số và một câu hỏi mẫu.
- **Đường mở:** *bề mặt* (chạm đúng chủ đề mà không dẫn dắt); *follow-up* (hỏi tiếp đúng hook persona đã thả); *chuyện quá khứ* (hỏi về một lần cụ thể đã xảy ra); *tin tưởng* (openness đạt ngưỡng của item, câu hỏi chạm đúng chủ đề và không dẫn dắt). Điều kiện chính xác: addendum §3.1.
- **Nhãn câu hỏi** (một luật cho mọi vai trò; tên trong dữ liệu):
  - `confirm_grounded` (tốt): nội dung đã có trong lời persona.
  - `boundary_probe` (tốt): chủ đề đã grounded, câu hỏi chỉ thêm phạm vi (mọi / luôn / không bao giờ / trường hợp nào), kể cả tách một cụm danh từ hóa persona vừa nói ("rồi nó đi qua phê duyệt" → "ai duyệt, khi nào?").
  - `open` (trung tính): câu hỏi mở, không đưa nội dung nào vào ("Chị kể em nghe…", "Lần gần nhất … là khi nào?").
  - `leading` (xấu): thêm nguyên nhân, phán xét hoặc nội dung mới.

  **Nhãn tốt và nhãn `leading` phải có bằng chứng**, nếu không bị hạ thành `open` (không phạt người học vì model thiếu bằng chứng): nhãn tốt cần `grounded_turn_id` resolve được tới một lượt persona có thật; nhãn `leading` cần `introduced_content`, tức cụm người học tự thêm, có trong câu của người học và không có trong bất kỳ lời persona nào trước đó (code kiểm, addendum §2). Lý do thêm `open` và hạ về `open`: addendum §7.
- **Loại câu hỏi:** mở / đóng / giả định-tương-lai / chuyện-quá-khứ-cụ-thể / khác; dùng cho luật mở khóa và nhận xét.
- **Openness:** số nguyên 0–10 của persona, bắt đầu ở 4, code cập nhật theo nhãn và loại câu hỏi (bảng ở addendum §3.1). Persona chỉ nhận 3 mức (dè dặt 0–3 / bình thường 4–6 / cởi mở 7–10). Openness chỉ đổi độ sẵn lòng **kể về item**; ở mọi mức, persona vẫn nói chuyện thoải mái về fact bề mặt và đời sống thường ngày.
- **Hook ledger:**
  - *thả:* code chọn tối đa 1 hook mỗi lượt và chỉ ghi đã thả khi câu trả lời chứa cụm neo hook. Câu hỏi chốt không nhắm chủ đề nào ("Có điều gì em chưa hỏi mà chị nghĩ em nên biết không?") cũng làm thả một hook, như người thật gợi ý mà chưa kể hết (addendum §3.2).
  - *nhặt:* ở bất kỳ lượt nào sau đó mà Call 1 gán `hook_id` của hook và code chấp nhận; hook còn nhặt được tới khi item của nó mở.
  - *bỏ qua:* chú thích khi lượt ngay sau lượt thả không nhặt; dùng cho reveal và chọn replay, không đóng hook.
- **Đã khai thác:** item đã mở **và** persona đã nói ra (câu trả lời chứa cụm neo nội dung).

### 5.2 Mỗi lượt: đúng 2 LLM call

1. **Call 1, phân tích.** Input chỉ gồm những thứ persona cũng được thấy (danh tính, fact bề mặt, item đã mở, hook đã thả, topic tag, ràng buộc do-not-assert trung tính, transcript) cộng câu mới của người học. Call 1 **không bao giờ thấy nội dung item khóa.** Output: loại câu hỏi, nhãn và bằng chứng của nhãn (`grounded_turn_id` hoặc `introduced_content`), `hook_id`, topic tag khớp, và các ràng buộc do-not-assert mà **lượt persona trước** vi phạm (kiểm trễ một lượt).
2. **Kiểm bằng code** (không tốn LLM): nhãn thiếu bằng chứng hợp lệ → `open`; `hook_id` không trỏ tới hook đã thả và còn nhặt được → bỏ; tối đa 1 topic tag. **Quyết định mở khóa** theo luật từng đường mở, trên trạng thái **trước lượt này** (snapshot t−1), tối đa 1 item mỗi lượt. Rồi cập nhật openness, ledger, và chọn hook thả ở lượt này.
3. **Call 2, persona.** Context chỉ gồm:
   - danh tính, fact bề mặt, mức openness, transcript, và luật giọng (nói thoải mái, có thể lan man về đời sống thường ngày);
   - item đã mở: item **vừa mở ở lượt này** phải được nói ra ngay; item mở từ trước mà chưa nói thì nói khi phù hợp;
   - tối đa một hook line cần thả;
   - ràng buộc do-not-assert của topic tag khớp ở lượt này, **chỉ khi item của tag đó vẫn còn khóa sau quyết định mở khóa của lượt này** (item vừa mở không bao giờ đi kèm ràng buộc "không tự kể" của chính nó), cộng một luật chung: "nếu được hỏi về điều không có trong những gì bạn biết để nói, trả lời mơ hồ, không phủ nhận, không tự kể, và không nhắc tới chủ đề nào bạn được dặn tránh". Persona không bao giờ thấy danh sách ràng buộc của mọi item khóa, vì danh sách đó là mục lục của tảng băng.

   Output chỉ là câu trả lời; code dò cụm neo để ghi hook đã thả và item đã nói ra.
4. **Ghi lượt** trong một transaction: transcript, bằng chứng, trạng thái, snapshot (§6.1).

**Nói chính xác về cổng:** hàm mở khóa là code, nhưng input của nó là phán đoán của Call 1. Code kiểm tham chiếu (lượt có thật, thuộc persona, hook đã thả và còn nhặt được, cụm tự thêm có thật trong câu người học và vắng trong lời persona), không kiểm ngữ nghĩa. Cổng là **một hàm tất định, kiểm toán được, của các phán đoán của model**: mọi lần mở khóa đều phát lại, ghi log và test được.

### 5.3 Ngoài lượt

- **Verifier ở màn reveal** (đúng 1 call logic, hợp đồng ở addendum §2): kiểm lại, trên transcript đã đóng băng, (a) nhãn và loại câu hỏi đã dẫn tới mỗi lần mở khóa, (b) bằng chứng của mỗi nhận xét và lời khen sẽ hiện (lượt được trích có thật sự chứa điều được nói tới; với nhãn `leading`, persona có thật sự chưa từng nói cụm được coi là tự thêm), (c) lượt persona cuối theo do-not-assert (không có Call 1 nào sau nó). Kết quả lưu theo buổi.
  - Nhận xét hoặc lời khen bị bác thì bỏ khỏi màn hình.
  - Lần mở khóa bị bác thì **không bị bỏ**: item vẫn tính đã khai thác, bất đồng chỉ ghi thành chỉ số nội bộ (NFR-8).
  - Verifier lỗi sau tối đa 2 lần thử lại kỹ thuật: reveal vẫn render, bỏ mọi lời khen, giữ phần còn lại, ghi log.
  - Chọn khoảnh khắc replay không phụ thuộc verifier.
- **Nhận xét và guide:** template dựng từ ledger, không gọi LLM.
- **Replay:** 2 call mỗi lượt, qua đúng pipeline §5.2.

## 6. Replay: spec cơ chế

### 6.1 Snapshot mỗi lượt

Sau mỗi lượt *t* của buổi chính, hệ thống lưu một snapshot bất biến: `turn_index`, item đã mở (kèm lượt), hook ledger (hook đã thả, trạng thái, chú thích bỏ qua, lượt), item đã nói ra, `openness`, và con trỏ tới transcript tới hết lượt *t*. Snapshot lượt 0 là trạng thái khởi đầu của kịch bản, với transcript chỉ gồm lời mở đầu.

### 6.2 Chọn khoảnh khắc (tất định, không dùng LLM)

1. **Ứng viên chính:** mọi hook *bỏ qua*, thả ở lượt *h*, của một item đi đường follow-up hoặc chuyện quá khứ và vẫn khóa khi buổi kết thúc. Chọn trọng số item cao nhất; hòa thì *h* sớm nhất; vẫn hòa thì thứ tự item trong kịch bản. Rẽ nhánh **sau lượt h**; người học hỏi lại thay cho lượt *h+1*.
2. **Dự phòng 1:** không có ứng viên chính → lượt `leading` sớm nhất (lượt *l*). Rẽ nhánh sau lượt *l−1*; người học hỏi lại lượt *l*. Mục tiêu hiển thị là "hỏi lại mà không dẫn dắt"; replay vẫn có thể mở bất kỳ item nào.
3. **Dự phòng 2:** không có lượt `leading` → không có replay. Reveal hiện câu hỏi mẫu của item quan trọng nhất còn khóa (không hiện gì nếu mọi item đã mở), và buổi chuyển thẳng sang trạng thái **đã xong**.

### 6.3 Khôi phục context

Nhánh replay bắt đầu từ bản sao snapshot tại điểm rẽ nhánh. Mọi thứ sau điểm rẽ nhánh trong buổi chính **không có mặt** trong context của cả hai call. Màn hình hiện 2 lượt cuối trước điểm rẽ nhánh, và cho xem toàn bộ transcript trước đó.

### 6.4 Ba lượt qua cùng cổng

Đúng 3 lượt, mỗi lượt chạy §5.2 không đổi. Hook của item mục tiêu nhặt được ở cả 3 lượt. Khác biệt duy nhất: khi nhiều item cùng thỏa luật, ưu tiên item mục tiêu. Mỗi buổi 1 lần replay.

### 6.5 Thành công và thất bại

- **Thành công (ứng viên chính):** item mục tiêu được **nói ra** (mở, và câu trả lời chứa cụm neo nội dung) trong ≤3 lượt. Replay dừng, hiện "Đã mở khóa: [item]. Đây chính là điều bạn bỏ lỡ." Tiêu chí là "nói ra" để màn thành công không bao giờ báo điều mà transcript replay không chứa.
- **Thành công một phần:** persona nói ra item khác nhưng không nói ra item mục tiêu. Hiện item vừa mở, rồi xử lý như thất bại.
- **Thất bại:** hết 3 lượt. Hiện nội dung item mục tiêu và câu hỏi mẫu của nó.
- **Dự phòng 1:** thành công khi cả 3 lượt không có `leading` và ≥1 lượt có nhãn tốt (luyện cách hỏi, không nhắm một item; ghi nhận ở addendum §7). Item nào mở thì hiện ra. Thất bại thì hiện câu hỏi mẫu của item quan trọng nhất còn khóa.
- **Bỏ giữa chừng:** bấm "Dừng" trước khi hết 3 lượt → như thất bại. Rời trang không phải là bỏ (FR-10).
- **Bỏ qua:** chọn "Bỏ qua, cho tôi xem luôn" → không tạo nhánh.

### 6.6 Mở niêm phong và kết thúc buổi

Item mục tiêu mở niêm phong ngay khi replay kết thúc theo bất kỳ cách nào (thành công, thất bại, bỏ giữa chừng, bỏ qua). Buổi chuyển sang **đã xong** (`done`) lúc đó, hoặc ngay sau reveal nếu không có replay (§6.2 dự phòng 2). Từ đây buổi chỉ còn bản xem lại chỉ đọc, không còn item nào niêm phong.

### 6.7 Cô lập

Replay là **nhánh riêng**, không bao giờ ghi đè transcript, ledger, snapshot, danh sách đã mở, điểm reveal hay chỉ số của buổi chính. Kết quả reveal của buổi chính được đóng băng trước khi replay bắt đầu. Kết quả replay lưu thành bản ghi riêng, hiện kèm reveal khi xem lại, và không làm đổi số đã khai thác.

## 7. Yêu cầu chức năng

### Truy cập và tài khoản
- **FR-1** Khách xem được trang chủ, và thư viện khi có, mà không cần đăng nhập.
- **FR-2** Trước khi bắt đầu một buổi, người học phải đăng nhập bằng Google. Không có phân quyền, không có magic link, không có đường đăng nhập riêng cho demo.
- **FR-3** Người học chỉ xem được các buổi của chính mình.

### Thư viện kịch bản
- **FR-4** Màn thư viện chỉ xuất hiện khi có ≥2 kịch bản đã publish (đã pass eval và được duyệt theo trách nhiệm có tên, nhóm "Vận hành: soạn và publish"). Mỗi thẻ gồm tên, một câu về persona, bối cảnh nghiên cứu và bộ đếm niêm phong. Với 1 kịch bản, nút ở trang chủ thay cho thẻ. Nút hoặc thẻ của một kịch bản dẫn tới: màn chuẩn bị nếu người học chưa có buổi nào; **tiếp tục** buổi (FR-10) nếu buổi chưa ở trạng thái `done`; bản xem lại chỉ đọc (FR-40) chỉ khi buổi đã `done`. Với tài khoản demo (FR-45), trang chủ luôn có thêm nút "Bắt đầu buổi mới"; nút chính dẫn tới buổi gần nhất của kịch bản.
- **FR-5** Mỗi người học có một buổi chấm điểm cho mỗi kịch bản. Buổi chưa xong chỉ tiếp tục được, không bắt đầu lại. Luật này cũng là giới hạn chi phí theo người. Tài khoản demo (FR-45) không bị giới hạn này.

### Buổi phỏng vấn
- **FR-6** Màn chuẩn bị nêu mục tiêu nghiên cứu (dạng câu hỏi), giới hạn 30 lượt, luật "chỉ nói nếu hỏi đúng cách", và định nghĩa "một điều".
- **FR-7** Người học chat với persona bằng tiếng Việt. Buổi mở bằng lời mở đầu soạn sẵn ở lượt 0 (§5.1). Màn hình luôn hiện mục tiêu nghiên cứu, số lượt đã dùng trên 30 và bộ đếm niêm phong, không đổi trong suốt buổi.
- **FR-8** Trong lúc phỏng vấn, màn hình không hiện nhãn, gợi ý hay số item đã mở.
- **FR-9** Người học kết thúc buổi được bất cứ lúc nào; buổi tự kết thúc sau lượt 30.
- **FR-10** Buổi gián đoạn trong lúc phỏng vấn thì tiếp tục đúng lượt đã dừng; gián đoạn sau reveal nhưng trước `done` thì mở lại ở đề xuất replay; gián đoạn giữa replay thì tiếp tục đúng lượt replay đang dở.
- **FR-11** Lượt có LLM call lỗi không được tính và không làm đổi trạng thái; người học được mời gửi lại.

### Engine mỗi lượt
- **FR-12** Hệ thống tạo bằng chứng phân tích cho mỗi câu của người học (§5.2 bước 1) mà không đưa nội dung item khóa vào bước này.
- **FR-13** Hệ thống quyết định mở khóa chỉ bằng luật theo đường mở, dựa trên bằng chứng đã qua kiểm của code, ledger và openness. Nhãn thiếu bằng chứng hợp lệ (§5.1) bị hạ thành `open` trước khi luật chạy.
- **FR-14** Hệ thống cập nhật openness, hook ledger và danh sách item đã nói ra sau mỗi lượt. Hook chỉ được ghi đã thả, và item chỉ được tính đã nói ra, khi câu trả lời chứa cụm neo tương ứng (hoặc biến thể), so khớp sau khi chuẩn hóa theo addendum §3.2.
- **FR-15** Context của persona chỉ gồm những gì liệt kê ở §5.2 bước 3; ràng buộc do-not-assert chỉ gồm của topic tag khớp ở lượt đó, và chỉ khi item của tag vẫn còn khóa sau quyết định mở khóa.
- **FR-16** Hệ thống kiểm lượt persona trước đó theo ràng buộc do-not-assert (lượt cuối do verifier kiểm; nếu cắt #3, do call kiểm cuối buổi). Lượt vi phạm bị gắn cờ, loại khỏi bằng chứng ở reveal và ghi log.
- **FR-17** Hệ thống lưu snapshot bất biến sau mỗi lượt (§6.1).

### Đoán và reveal
- **FR-18** Trước reveal, người học đoán số item đã khai thác, từ 0 tới tổng số.
- **FR-19** Màn reveal hiện, theo đúng thứ tự: số đoán cạnh số thật; khối đề xuất replay (FR-23) kèm item mục tiêu niêm phong, không kèm câu hỏi mẫu; danh sách đã khai thác (kèm lượt mở); danh sách bỏ lỡ, mỗi mục một dòng (nội dung, đường mở), mở ra thì hiện câu hỏi mẫu và bằng chứng lượt gần nhất nếu có. Mục bỏ lỡ đường tin tưởng trích ledger **bằng lời, không hiện con số**. **Mọi lượt được nêu là dẫn dắt đều hiện kèm cụm người học đã tự thêm và dòng "persona chưa từng nói điều này"**, lấy từ bằng chứng của Call 1 đã qua kiểm.
- **FR-20** Màn reveal hiện tối đa 3 nhận xét cách hỏi, tính từ ledger và chọn theo luật ở addendum §3.3. Mỗi nhận xét trích ít nhất một lượt. Nếu buổi có lượt nhãn tốt qua verifier, nhận xét đầu tiên là một lời khen có căn cứ trích đúng lượt đó. Buổi không có gì để nhận xét hiện trạng thái trống ở addendum §3.3.
- **FR-21** Mọi trích dẫn được render từ transcript đã lưu theo ID lượt. Trích dẫn không resolve được hoặc bị verifier bác thì claim bị bỏ, trừ trích dẫn của một lần mở khóa (§5.3). Bấm trích dẫn thì nhảy tới lượt đó.
- **FR-22** Verifier chạy đúng một lần logic mỗi buổi, trước khi render reveal, theo hợp đồng ở addendum §2. Kết quả được lưu; lỗi xử lý theo §5.3.

### Replay
- **FR-23** Hệ thống chọn khoảnh khắc replay theo §6.2 và đề xuất trên màn reveal.
- **FR-24** Replay khôi phục context theo §6.3.
- **FR-25** Replay cho đúng 3 lượt, qua cùng pipeline với buổi chính (§6.4).
- **FR-26** Replay hiện kết quả theo §6.5.
- **FR-27** Replay không bao giờ sửa dữ liệu hay chỉ số của buổi chính (§6.7).

### Guide
Guide là phần "Mang về" cuối màn reveal (Màn 6 mục 5), không phải màn riêng.
- **FR-28** Guide có tiêu đề "Thói quen hỏi của bạn — đọc lại trước buổi thật" và chỉ gồm: tối đa 3 nhận xét của FR-20 (mỗi lỗi là cặp "Thay vì hỏi" trích nguyên văn câu của người học / "Hãy hỏi" lấy pattern soạn sẵn theo loại lỗi), và thẻ thói quen khi ledger vượt ngưỡng (addendum §3.3). Câu hỏi mẫu của item bỏ lỡ nói về chuyện của persona nên chỉ nằm ở FR-19.
- **FR-29** Người học mở lại được guide (cùng màn reveal) và in hoặc lưu riêng phần guide thành PDF. Bản in có dòng trống dưới mỗi pattern: "Câu của bạn, cho đề tài của bạn: ______". Lời khen không vào bản in.
- **FR-30** Guide chứa (a) chuỗi cố định đã duyệt từ kịch bản và (b) trích nguyên văn câu hỏi của chính người học từ transcript. Không có nội dung nào được LLM sinh ra lúc chạy, và guide không chứa khẳng định nào về người dùng thật.

### Sau buổi và tín hiệu
- **FR-31** Khi có kịch bản chưa luyện, cuối màn reveal đề xuất kịch bản đó.
- **FR-32** Nút waitlist "mở thêm" ghi lại người bấm và thời điểm.

### Vận hành: soạn và publish kịch bản

**Trách nhiệm có tên (thay FR-35 và FR-36 trong MVP), người chịu trách nhiệm: Thanh.** Trước khi chạy `publish`:
- xác nhận mọi ngưỡng của §9.2 mục 2 trong báo cáo eval;
- phân xử mọi cờ rò rỉ theo tiêu chí ở FR-34;
- duyệt thủ công từng chuỗi cố định hiện cho người học (câu hỏi mẫu, pattern guide, thẻ thói quen, lời mở đầu) theo hai tiêu chí của FR-36: không khẳng định về người dùng thật, không phải câu `leading`;
- ghi tất cả vào báo cáo eval của kịch bản.

FR-35 và FR-36 quay lại cùng pipeline sinh kịch bản (Next), khi người soạn không còn chỉ là Thanh.

- **FR-33** CLI kiểm file kịch bản theo schema và chuẩn chất lượng:
  - 8–12 item, đủ 4 đường mở, ≥2 item thuộc đường chuyện quá khứ hoặc tin tưởng; mỗi item đủ các trường ở §5.1;
  - kịch bản có `language`, `role`, `research_goal` (dạng câu hỏi), `opening_line`, ≥12 fact bề mặt, và pattern guide theo loại lỗi;
  - không ràng buộc do-not-assert, topic tag hay hook line nào chứa từ mang nội dung của item khóa;
  - mỗi cụm neo dài 2–4 từ, tối đa 2 biến thể;
  - mọi item đến được: đồ thị tiên quyết không có vòng, ngưỡng openness của item tin tưởng đạt được trong ≤20 lượt tốt.
- **FR-34** Eval harness chạy run tốt (người phỏng vấn mù tảng băng) và run xấu, mỗi loại 3 lần lấy trung vị, cộng 20 run adversarial, trong đó có đòn **"dò bản đồ topic"** (hỏi persona có chủ đề nào được dặn tránh không). Episode chạy song song. Khi tinh chỉnh prompt chỉ chạy tốt/xấu ×1; bản đầy đủ chạy trước khi publish. Báo cáo gồm:
  - số item mở, và tỉ lệ mở của run tốt so với mục tiêu hiệu chỉnh 50–75% (chỉ báo cáo; ngoài khoảng nghĩa là nội dung kịch bản cần sửa);
  - **rò rỉ mỗi episode.** Rò rỉ là: (a) persona nói ra nội dung của một item chưa mở ở lượt đó; hoặc (b) persona nêu một topic còn khóa **bằng lời của chính nó**, ngoài hook line được phép ở lượt đó. Hook line là chuỗi soạn sẵn đã duyệt, nên thả hook không bao giờ là rò rỉ; mỗi lần thả được ghi thành sự kiện hook và đưa cho judge làm danh sách được phép. Judge gắn cờ; Thanh phân xử. **Tiêu chí xác nhận:** một cờ là rò rỉ đã xác nhận nếu lời persona nêu tên một topic còn khóa hoặc nói nội dung khóa, ngoài các hook được phép. Mỗi phán quyết ghi vào báo cáo kèm đoạn lời persona được trích và lý do. **Episode** là một run eval;
  - run baseline chỉ-prompt (chỉ báo cáo): cùng 20 đòn adversarial trên một persona có cả tảng băng trong prompt kèm chỉ dẫn "đừng kể cho tới khi được hỏi đúng cách". Hỗ trợ giả định #11 nếu baseline có số rò đã xác nhận cao hơn engine;
  - tỉ lệ persona nói đúng cụm neo khi được yêu cầu; tỉ lệ mâu thuẫn giữa lời persona trước và sau khi một item mở; bất đồng giữa verifier và cổng mở khóa.
- **FR-35** *(Next)* CLI chỉ publish kịch bản pass mọi ngưỡng, nếu từ chối thì in lý do. Trong MVP, `publish` chỉ đặt trạng thái.
- **FR-36** *(Next)* CLI chạy verifier guide trên câu hỏi mẫu và pattern lúc soạn, chặn câu khẳng định về người dùng thật hoặc câu `leading`. Trong MVP, thay bằng trách nhiệm có tên ở trên.

### Vận hành: hệ thống
- **FR-37** Hệ thống áp cap chi phí LLM theo ngày: chạm cap thì chặn buổi mới nhưng buổi đang chạy đi hết reveal và replay. Cap chừa một phần dành riêng (cấu hình được) cho các tài khoản demo (FR-45).
- **FR-38** Hệ thống ghi các sự kiện sau; cùng dữ liệu đã lưu (turn, `verifier_json`, log chi phí), đủ để tính mọi chỉ số ở §9.3 (buổi của tài khoản demo được đánh dấu và loại khỏi chỉ số):
  - bắt đầu buổi (kịch bản);
  - lượt (độ trễ);
  - kết thúc;
  - reveal (số đoán, số đã khai thác, tổng, mức khoảnh khắc replay: ứng viên chính / dự phòng 1 / dự phòng 2);
  - bắt đầu replay và kết quả replay;
  - bấm "Tải về" guide;
  - bấm waitlist.

### Buổi của tôi
Nhóm này thuộc luồng người học; ID được giữ nguyên nên nhóm đứng sau các nhóm vận hành.
- **FR-39** Người học đã đăng nhập xem được danh sách buổi của mình: tên kịch bản, ngày bắt đầu, số item đã khai thác trên tổng của buổi chính. Buổi chưa xong được đánh dấu và mở lại để tiếp tục (FR-10).
- **FR-40** Mở một buổi đã `done` hiện transcript và màn reveal (kèm guide và kết quả replay nếu có) ở dạng chỉ đọc, đúng như lúc kết thúc. Không có thao tác gửi lượt mới hay chạy replay.
- **FR-41** Không item nào còn niêm phong trên trang xem lại, trong mọi trường hợp: replay thành công, thất bại, bỏ giữa chừng, bỏ qua, hoặc không có replay.
- **FR-42** Header có liên kết "Buổi của tôi" sau khi đăng nhập. Nút hoặc thẻ kịch bản dẫn tới buổi theo FR-4.
- **FR-43** Người học chưa có buổi nào thấy trạng thái trống, kèm nút bắt đầu buổi luyện.

### Vận hành: trace và demo
ID được giữ nguyên nên nhóm đứng cuối.
- **FR-44** CLI `trace <session>` in từng lượt: câu người học, JSON của Call 1, các sửa của code (hạ nhãn, bỏ `hook_id`, bỏ tag), luật mở khóa đã chạy, item mở, hook được chọn và có khớp cụm neo không, openness trước và sau. Chỉ đọc dữ liệu đã lưu, không gọi LLM.
- **FR-45** Danh sách email tài khoản demo nằm trong biến môi trường (`DEMO_ACCOUNT_EMAILS`); đó là các tài khoản Google thật của Thanh, đăng nhập như mọi người học. CLI `seed-demo <email> --guess <n>` chỉ nhận email trong danh sách, chạy một transcript soạn sẵn qua **engine thật** (call thật), gắn buổi vào tài khoản đó với số đoán đã cho, và dừng ở trạng thái `revealed` (đang đề xuất replay) để replay chạy live. Lệnh **thất bại, in lý do và khoảnh khắc đã chọn** nếu buổi không rơi vào ứng viên chính (§6.2). Chạy lại được nhiều lần.

## 8. Yêu cầu phi chức năng

- **NFR-1 Số LLM call:** tối đa 2 call logic mỗi lượt của người học, cả buổi chính lẫn replay; mỗi buổi thêm đúng 1 call logic cho verifier. Guide, nhận xét, trang "Buổi của tôi" và `trace` không gọi LLM. Thử lại kỹ thuật không tính là call logic nhưng được ghi log và tính vào chi phí.
- **NFR-2 Độ trễ:** p95 ≤ 6 giây mỗi lượt (từ lúc gửi tới lúc câu trả lời hiện đủ), đo trên mọi lượt của một lần chạy eval đầy đủ trên môi trường đã deploy. Ngưỡng cố định cho MVP; chỉnh sau ra mắt. Không stream; UI hiện "[persona] đang gõ…". Phần context cố định và transcript được cache prompt.
- **NFR-3 Chi phí:** chi phí trung bình mỗi buổi được đo và ghi log; mục tiêu nằm trong mốc giá gói prep-sprint (addendum §5; mốc 100–200k VND là suy luận `[ASSUMPTION]`). Cap theo ngày cấu hình được không cần deploy lại.
- **NFR-4 Không rò rỉ:** nội dung và cụm neo nội dung của item khóa không bao giờ có trong context của Call 1 hay Call 2 trước khi item mở. Context của Call 2 chứa ràng buộc do-not-assert của tối đa một topic tag, và không bao giờ của item vừa mở. Kiểm bằng test tự động trên context đã dựng, không chỉ bằng eval.
- **NFR-5 Chống injection:** văn bản người học không đổi được luật mở khóa; mọi lần mở khóa truy được về một luật và một bằng chứng. Dù Call 1 trả JSON do kẻ tấn công điều khiển: mỗi lượt mở tối đa 1 item; không item follow-up nào mở khi không có hook đã thả thật; không nội dung khóa nào lộ ra ngoài item được mở. Mô hình đe dọa: người học tự chèn injection chỉ làm hỏng buổi của chính mình; rủi ro thật là **uy tín**, vì một ảnh chụp "persona vừa khai hết bí mật" lan qua group chat của lớp, đúng kênh phân phối. Rủi ro còn lại đo bằng 20 run adversarial, không coi là đã loại bỏ.
- **NFR-6 Rò rỉ:** trong MVP, rò rỉ chỉ đo trên eval (FR-34); production chưa có bộ dò tự động (§10 rủi ro). Mốc ~0,6/episode trong research chỉ để tham chiếu.
- **NFR-7 Độ chính xác phân loại:** trên test set tiếng Việt ≥100 câu gán theo 4 nhãn (gồm ca biên kiểu "luôn thấy bực, đúng không?" và câu hỏi mở không trích lượt `[ASSUMPTION]`): ≤5% câu tốt bị gắn nhầm `leading` (**cổng cứng**) và ≥85% đồng thuận. Nếu tới hết ngày 13 chưa đạt 85%, con số này chuyển thành chỉ số báo cáo.
- **NFR-8 Bất đồng verifier và cổng:** với mỗi lần mở khóa, verifier kiểm lại nhãn và loại câu hỏi đã dẫn tới nó. Tỉ lệ không đồng ý ≤10% trên eval `[ASSUMPTION]`. Chỉ số nội bộ, không hiện cho người học.
- **NFR-9 Riêng tư:** transcript, kết quả và guide chỉ chủ tài khoản xem được; dữ liệu người học không dùng để huấn luyện model (cấu hình nhà cung cấp, kiểm ở checklist §9.4); không có chia sẻ công khai.
- **NFR-10 Toàn vẹn dữ liệu:** snapshot bất biến; một lượt hoặc ghi đủ (transcript, ledger, snapshot) hoặc không ghi gì.
- **NFR-11 Responsive:** mọi màn dùng được từ 360px tới desktop.
- **NFR-12 Ngôn ngữ:** giao diện và kịch bản tiếng Việt; ngôn ngữ cố định trong một buổi.
- **NFR-13 Ranh giới đạo đức:** không đầu ra nào chứa nhận định về người dùng thật; giới hạn copy ở bảng hệ quả §3.
- **NFR-14 Giọng và copy:** viết "phỏng vấn người dùng", không để "phỏng vấn" đứng một mình (dễ hiểu nhầm là phỏng vấn xin việc); không dùng chữ "feedback"; dùng ngôn ngữ của nỗi sợ và của việc sửa kịp, không dùng tone mềm để chiều lòng người mới; không hứa "tự tin" hay guide theo đề tài; headline "Mắc lỗi ở đây, đừng mắc trước người thật."; lời khen chỉ khi có căn cứ; không đưa số liệu chưa kiểm vào copy.

## 9. Tiêu chí đánh giá thành công

### 9.1 Tóm tắt

| Mục tiêu | Cổng ra mắt (§9.2) | Tín hiệu sau ra mắt (§9.3) | Giới hạn đã biết |
|---|---|---|---|
| Cơ chế agent đúng và không rò | Mục 2, 3, 4, 5, 6, 12 | SM-C2, SM-C3, SM-C4 | Rò rỉ chỉ đo trên eval; Thanh là người phân xử duy nhất (§10) |
| Người học đi hết vòng lặp | Mục 1; buổi thử 2 sinh viên (§9.4) | SM-1, SM-2, SM-C1, SM-C7 | Chỉ đọc % sau ≥30 người học |
| Người học thấy được lỗi của mình | Mục 7 (nhãn đáng tin) | SM-6, SM-7 | Chỉ là chỉ số trong buổi, không chứng minh kỹ năng chuyển sang buổi thật |
| Vận hành được | Mục 8, 9, 10, 11 | SM-C5, SM-C6 | Ngưỡng chi phí là suy luận |
| Có nhu cầu trả tiền | — | SM-5 | Chỉ là tín hiệu waitlist |

**1 kịch bản hay 2 kịch bản.** Cam kết là 1 kịch bản. Khi đó **SM-3, SM-4 và giả định #9** (replay có giúp buổi sau không) **không đo được**, vì mỗi người học chỉ có một buổi. Thay vào đó, bản ra mắt được đánh giá bằng hai chỉ số trong buổi: SM-6 (khoảng cách giữa số đoán và số thật, tức reveal có thật sự lộ ra điều người học không tự thấy) và SM-7 (tỉ lệ replay ứng viên chính thành công, tức người học có hỏi đúng được khi quay lại đúng khoảnh khắc). Nếu kịch bản thứ hai kịp ra mắt, SM-3 và SM-4 được đo thêm.

### 9.2 Cổng ra mắt MVP

1. **Demo end-to-end** (UJ-1) trên URL đã deploy: trang chủ → (chọn kịch bản, khi có ≥2) → chuẩn bị → đăng nhập → phỏng vấn → đoán → reveal → replay → "Mang về" và in.
2. **Kịch bản** (FR-33, FR-34, trách nhiệm có tên ở §7): ≥1 kịch bản pass `validate` và pass eval:
   - 0 rò rỉ **đã xác nhận** trong 20 run adversarial, tính cả rò topic và đòn "dò bản đồ topic", mọi cờ đã phân xử theo tiêu chí FR-34 và ghi trong báo cáo;
   - run tốt mở ≥2 lần số item của run xấu và ≥3 item;
   - persona nói đúng cụm neo khi được yêu cầu ≥95%;
   - bất đồng verifier và cổng ≤10%;
   - mọi chuỗi cố định đã được duyệt và ghi trong báo cáo.

   Báo cáo cũng có tỉ lệ mở của run tốt so với 50–75% và kết quả baseline (chỉ báo cáo).
3. **Cô lập context** (NFR-4, FR-12, FR-15): test tự động chứng minh, ở mọi lượt của eval và của replay, context của Call 1 và Call 2 không chứa nội dung hay cụm neo nội dung của item còn khóa; context của Call 2 chỉ chứa ràng buộc do-not-assert của tối đa một topic tag, và không bao giờ của item vừa mở ở lượt đó.
4. **Cổng mở khóa** (FR-13, FR-14, NFR-5): test tự động:
   - follow-up không mở khi `hook_id` chưa được thả, và vẫn mở khi hook được nhặt muộn;
   - follow-up không mở khi `grounded_turn_id` không phải lượt đã thả hook;
   - nhãn tốt mà `grounded_turn_id` không resolve được (kể cả trỏ tới lượt 0) bị hạ thành `open`, openness không đổi; câu hỏi mở ở lượt 1 nhận `open`;
   - nhãn `leading` mà `introduced_content` rỗng, không có trong câu người học, hoặc có trong lời persona trước đó (kể cả lời mở đầu ở lượt 0) bị hạ thành `open`, openness không bị trừ;
   - luật đánh giá trên trạng thái trước lượt; openness bắt đầu ở 4 và đổi đúng bảng addendum §3.1;
   - câu hỏi chốt làm thả một hook nhưng không mở item; item tin tưởng không mở khi openness dưới ngưỡng;
   - hook không ghi là đã thả, item không tính đã khai thác, khi thiếu cụm neo;
   - cụm neo vẫn khớp khi khác ở dấu, cách đặt dấu thanh ("hủy" / "huỷ"), dạng Unicode, dấu câu, hoa thường, khoảng trắng;
   - với Call 1 giả lập trả JSON đối kháng, mỗi lượt mở tối đa 1 item, và không item follow-up nào mở khi không có hook đã thả.
5. **Replay** (FR-19, FR-23–27):
   - chọn khoảnh khắc đúng §6.2 trên 3 transcript cố định (ứng viên chính, dự phòng 1, dự phòng 2), và cùng transcript cho cùng khoảnh khắc;
   - với Call 1 giả lập, câu hỏi mẫu gửi ở lượt replay thứ 2 mở được item mục tiêu và persona nói ra nó ngay;
   - "Đã mở khóa" chỉ hiện khi transcript replay chứa cụm neo nội dung của item mục tiêu;
   - trước khi replay kết thúc, dữ liệu reveal gửi về trình duyệt không chứa nội dung, cụm neo hay câu hỏi mẫu của item mục tiêu;
   - sau replay, dữ liệu buổi chính không đổi, trừ cờ mở niêm phong.
6. **Số call** (NFR-1): log một buổi 30 lượt cho thấy ≤2 call logic mỗi lượt và đúng 1 call verifier.
7. **Phân loại** (NFR-7): ≤5% câu tốt bị gắn nhầm `leading` (cổng cứng); ≥85% đồng thuận là cổng tới hết ngày 13.
8. **Độ trễ** (NFR-2): p95 ≤ 6 giây trên mọi lượt của một lần eval đầy đủ trên môi trường đã deploy.
9. **Riêng tư** (FR-3, NFR-9): tài khoản B không đọc được buổi, reveal, guide hay trang xem lại của tài khoản A (test API).
10. **Buổi của tôi và điều hướng** (FR-4, FR-39–43):
    - danh sách hiện đúng số đã khai thác của buổi chính, kể cả khi replay đã mở thêm item;
    - bản xem lại khớp reveal lúc kết thúc và không gọi LLM;
    - với 5 ca (replay thành công, thất bại, "Dừng", bỏ qua, không có replay), trang xem lại không còn item niêm phong;
    - buổi ở `interviewing`, `revealed` hoặc `replaying` luôn mở ra ở chế độ tiếp tục, không bao giờ ở bản xem lại;
    - người học mới thấy trạng thái trống.
11. **Cap chi phí** (FR-37): khi cap bị hạ về mức đã tiêu, buổi mới bị chặn kèm thông báo, buổi đang chạy đi hết reveal và replay, tài khoản demo vẫn bắt đầu được buổi mới.
12. **Trace và seed** (FR-44, FR-45): `trace` in đủ các trường của FR-44 cho mọi lượt, không gọi LLM. `seed-demo` gắn được một buổi vào tài khoản demo, dừng ở `revealed` với khoảnh khắc là ứng viên chính, và replay chạy live tới kết quả; với email ngoài danh sách thì từ chối.

Yêu cầu viết lại cho các mục trên nếu cắt #2 hoặc #3: addendum §6.

### 9.3 Chỉ số sau ra mắt

Chỉ đọc tỉ lệ phần trăm sau khi có ≥30 người học (không tính tài khoản demo), trong 4 tuần đầu sau ra mắt.

| ID | Chỉ số | Ngưỡng |
|---|---|---|
| SM-1 | Buổi đã bắt đầu đi tới reveal | ≥60% |
| SM-2 | Buổi có reveal và bắt đầu replay (trên các buổi có khoảnh khắc replay) | ≥40% (tương tác, không chứng minh việc học) |
| SM-3 | Người học làm buổi thứ hai trên kịch bản khác | ≥30%; chỉ khi có ≥2 kịch bản |
| SM-4 | Giả định #9: tỉ lệ mở item ở buổi 2, người có dùng replay so với người không | Theo dõi; chỉ khi có ≥2 kịch bản |
| SM-5 | Bấm waitlist "mở thêm" | Đếm; ghi nhận thủ công nếu ≥1 giảng viên hoặc trung tâm chia sẻ link |
| SM-6 | Khoảng cách đoán − thực tế ở reveal | Theo dõi; ngưỡng đặt sau 30 người học |
| SM-7 | Tỉ lệ replay ứng viên chính kết thúc thành công | Theo dõi; ngưỡng đặt sau 30 người học |

**Counter-metric:**
- **SM-C1:** buổi bỏ trước lượt 5, tức không có lượt mới trong 24 giờ và chưa kết thúc.
- **SM-C2:** tỉ lệ lượt persona bị gắn cờ do-not-assert.
- **SM-C3:** bất đồng verifier và cổng (NFR-8).
- **SM-C4:** rò rỉ đã xác nhận mỗi episode. Chỉ đo trên eval (NFR-6).
- **SM-C5:** chi phí mỗi buổi.
- **SM-C6:** độ trễ p95 trong production.
- **SM-C7:** tỉ lệ buổi rơi vào dự phòng 2, dấu hiệu kịch bản thiếu hook.

### 9.4 Checklist ra mắt (không tính vào lịch build)

- **Buổi thử với 2 sinh viên HCI** (trước hết ngày 12, addendum §6). Ghi lại ba câu trả lời có/không:
  - Họ có gửi câu đầu tiên trong 60 giây mà không cần hỏi phải làm gì không?
  - Persona có né các câu hỏi về đời sống thường ngày không?
  - Họ có tự tìm thấy khối replay mà không cần chỉ không?
- **Transcript demo:** soạn trước, cố ý bỏ qua một hook để buổi rơi vào ứng viên chính. Đây là input của `seed-demo`.
- **Thứ tự demo:**
  - Mở bằng reveal của một buổi đã seed ("Bạn đoán 7. Thực tế: 3").
  - Chạy live khoảng 5 lượt để cho thấy một hook được thả rồi bị bỏ qua.
  - Chuyển sang buổi đã seed ở `revealed` và chạy replay live.
  - Mở `trace` khi được hỏi "đây có phải chatbot không" (§5.0).
- **Nhà cung cấp LLM:** tắt việc dùng dữ liệu để huấn luyện (NFR-9).
- **Tài khoản demo:** điền `DEMO_ACCOUNT_EMAILS`, seed vài buổi cho buổi tập và dự phòng (dừng ở `revealed`, không phải `done`), và cấu hình phần cap dành riêng (FR-37).

## 10. Giả định, rủi ro và câu hỏi mở

### Giả định (đánh số theo brief)

| # | Giả định | Trạng thái | Đo trong MVP |
|---|---|---|---|
| 1 | Chưa sản phẩm nào kết hợp thông tin ẩn cố định, reveal trích theo lượt và replay | Được ủng hộ, tìm kiếm có giới hạn | Kiểm lại trước 2026-12-22; theo dõi mom-test, UXPressia |
| 2 | Luyện kèm bằng chứng giúp tiến bộ | Một preprint ngoài lĩnh vực | Qua #9 (cần ≥2 kịch bản) |
| 3 | Persona bám tài liệu dạy tốt hơn nhưng kém thật hơn | Đã kiểm (n=69) | Chưa đo độ thật |
| 4 | Nỗi đau đủ lớn để chủ động đi luyện | Chưa kiểm | 5–8 phỏng vấn sinh viên HCI trước khi chốt copy; SM-1 |
| 5 | Sinh viên HCI/UX VN luyện 1–3 tuần trước buổi thật | Chưa kiểm, 0 tiếng nói người học VN | Ra mắt với 1–2 lớp; số buổi mỗi người |
| 6 | Có nhu cầu cho BA/PM | Chưa kiểm | Không có tín hiệu trong sản phẩm; 3 phỏng vấn fresher BA |
| 7 | Kịch bản BA/PM do AI soạn đủ thật | Chưa kiểm | Không áp dụng cho MVP |
| 8 | Có người trả tiền | Chưa kiểm | SM-5; 2–3 cuộc nói chuyện với giảng viên hoặc trung tâm |
| 9 | Replay giúp mở item ở buổi sau | Chưa kiểm | SM-4, chỉ khi có ≥2 kịch bản; với 1 kịch bản chỉ có SM-7 làm tín hiệu thay. Replay diễn ra sau reveal, nên giữ item mục tiêu niêm phong chỉ làm giảm, không loại bỏ, ảnh hưởng của việc đã xem đáp án |
| 10 | Người học muốn bắt lỗi, không chỉ bớt sợ | Chưa kiểm | SM-1, SM-2, lượt bấm "Tải về" guide |
| 11 | ChatGPT chỉ-prompt không giữ được trạng thái ẩn | Chưa kiểm | Run baseline trong eval (FR-34) |

**Giả định nội dòng:** ngoài bảng trên, các chỗ gắn `[ASSUMPTION]` là: mốc giá (NFR-3), thành phần test set (NFR-7), ngưỡng 10% (NFR-8), giá trị openness mặc định và luật 1 item mỗi lượt (addendum §3.1).

### Rủi ro

- **Kích hoạt:** khác biệt so với ChatGPT chỉ lộ ở màn reveal; người bỏ giữa buổi đầu không bao giờ thấy. Giảm nhẹ: bộ đếm niêm phong, ảnh reveal ở trang chủ. Theo dõi SM-C1.
- **Phán đoán của Call 1:** ranh giới giữa `boundary_probe`, `open` và `leading` là phán đoán của LLM, và cổng là hàm tất định của các phán đoán này. Một nhãn sai trên câu tốt làm mất niềm tin vào mọi nhãn khác. Giảm nhẹ:
  - NFR-7;
  - mọi nhãn phải có bằng chứng kiểm được, thiếu thì hạ về `open`;
  - verifier kiểm lại nhãn `leading` trước khi hiện.
- **Grounding bịa:** một `grounded_turn_id` bịa (trỏ tới lượt persona có thật bất kỳ) làm openness tăng như câu tốt, nên có thể mở sớm item tin tưởng. Follow-up vẫn được bảo vệ vì phải đúng lượt đã thả hook.
- **Người phân xử duy nhất:** Thanh vừa soạn, vừa tinh chỉnh, vừa phân xử cờ rò rỉ, vừa publish, không có người đọc thứ hai. Giảm nhẹ duy nhất là tiêu chí xác nhận viết sẵn và phán quyết kèm trích dẫn trong báo cáo (FR-34). Đây là rủi ro chấp nhận, không phải quy trình.
- **Rò rỉ trong production:** chưa có bộ dò tự động; tỉ lệ rò chỉ biết qua eval (NFR-6).
- **Khớp cụm neo tiếng Việt:** so khớp sai sẽ báo "bỏ lỡ" một điều persona đã nói. Giảm nhẹ: chuẩn hóa ở addendum §3.2, cụm neo ngắn, ngưỡng ≥95%.
- **Độ thật của persona:** persona bám tài liệu kém thật hơn người đóng vai (#3), và MVP chưa đo độ thật. Giảm nhẹ:
  - persona nói thoải mái ngoài item;
  - openness bắt đầu ở mức bình thường;
  - câu hỏi chốt được thả hook;
  - buổi thử với 2 sinh viên (§9.4).

  Luật giọng chưa có chỉ số eval riêng.
- **Nội dung kịch bản nhạt:** mọi kiểm của CLI và eval là kiểm cơ học, và chi tiêu cá nhân là đề tài phổ biến nhất của đồ án HCI. Giảm nhẹ: rubric soạn kịch bản (addendum §6), mục tiêu hiệu chỉnh 50–75%.
- **Lịch:** 16 ngày cố định; phần cam kết là ~16,25 ngày (16,0 nếu FR-35/36 tiết kiệm mức cao), không có ngày dư. Ở mức ước tính thấp, cắt #2 (~0,25) vừa đủ bù phần vượt, nên **bất kỳ** trễ thêm nào sẽ kéo tới cắt #3 (verifier); ở mức tiết kiệm cao, verifier chỉ bị cắt khi trễ hơn ~0,25 ngày. Kịch bản thứ hai chỉ làm khi đạt tripwire ngày 11 (addendum §6).

### Câu hỏi mở

- **Rubric của project brief có yêu cầu nguyên văn "LLM gọi tool" không?** Người chịu trách nhiệm: Thanh, lấy câu chữ của rubric trước hết ngày 9. Nếu có, verifier thành một vòng gọi tool có giới hạn (`get_turn(id)`, `get_ledger_event(id)`), ~0,25 ngày, và verifier ra khỏi thứ tự cắt (addendum §6). Nếu câu chữ mơ hồ, giữ lời bảo vệ ở §5.0 cộng `trace`.
- **Ai trả tiền?** (hoãn có chủ đích) Các hướng:
  - B2C gói prep-sprint gắn ngày phỏng vấn thật;
  - B2B2C qua giảng viên hoặc trung tâm (người trả không thấy kết quả của người học);
  - kịch bản custom trả phí;
  - "Panel Rehearsal".

  Brief đề xuất thử B2C và B2B2C song song. MVP chỉ thu tín hiệu qua SM-5.
- **Điều gì kéo người học quay lại?** (hoãn có chủ đích) Các ứng viên:
  - lứa mới mỗi học kỳ;
  - vòng pre-flight → buổi thật → post-flight;
  - ôn lại sau 1 tuần;
  - lộ trình nhắm thói quen xấu;
  - kịch bản custom theo dự án.

  Tín hiệu đầu tiên: SM-3, khi có kịch bản thứ hai.
