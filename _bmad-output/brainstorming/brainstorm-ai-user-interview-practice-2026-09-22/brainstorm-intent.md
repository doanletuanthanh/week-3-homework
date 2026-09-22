# Brainstorm Intent — AI luyện kỹ năng phỏng vấn người dùng

> Nguồn: phiên brainstorm 2026-09-22 (Creative Partner), memlog `./.memlog.md`.
> Dùng làm đầu vào cho `bmad-forge-idea` → research → product brief. Đây là hướng **tạm chọn**, cần forge kiểm chứng.

## 1. Ý tưởng (một câu)

Một AI agent đóng vai người tham gia nghiên cứu, **giữ kín một "tảng băng" sự thật** (động cơ, cách xoay xở, câu chuyện đau, mâu thuẫn). Người học phải **tự khai thác** bằng câu hỏi tốt; cuối buổi họ thấy chính xác mình đã bỏ lỡ gì, ở phút nào, và luyện lại đúng khoảnh khắc đó.

- Loại: dự án mới, sản phẩm production thật, 1 dev, MVP ~2 tuần.
- Mục tiêu cho forge: **kiểm tra xem ý tưởng có đứng vững không** (tấn công các giả định chịu lực ở mục 6), không phải mở rộng thêm.

## 2. Ràng buộc đã chốt (không mở lại)

1. **Không bao giờ tạo "phát hiện nghiên cứu" giả** để thay người dùng thật. Mục tiêu là luyện kỹ năng.
2. **Chỉ phục vụ người học cá nhân.** Bỏ "cửa giảng viên" (lớp học, phân quyền, soạn kịch bản, dashboard). Lý do: sản phẩm một đối tượng rõ ràng; phía giảng viên là một sản phẩm khác, quá lớn cho MVP; phải chứng minh người học tiến bộ trước.
3. **Riêng tư mặc định:** transcript và kết quả chỉ thuộc về người học.
4. **Lỗi được phân loại theo loại câu hỏi bị thiếu** (quá khứ, follow-up, trung lập…), để sau này vẫn gộp số liệu được mà không phải thiết kế lại.
5. **Một agent rõ ràng**, không nhiều agent. Góc nhìn "hội đồng / người giám sát" chỉ là một cách diễn đạt khác của cùng dữ liệu phân tích.
6. **"Giỏi thật", không phải "trông giỏi":** mọi đánh giá thưởng cho điều làm buổi phỏng vấn thực sự tốt (câu hỏi trung lập, bám theo tín hiệu), không thưởng cho sự trau chuốt.
7. Là **agent thật**: có mục tiêu, có trạng thái, tự quyết bước tiếp theo, dùng tool, tự kiểm tra. Không phải chatbot nhập vai.

## 3. Hướng chính và hướng dự phòng

| | **Chính: "Capstone Sprint"** | **Dự phòng: "Panel Rehearsal"** |
|---|---|---|
| Người học | Sinh viên HCI/UX năm cuối (VN), capstone yêu cầu phỏng vấn ~5 stakeholder, chưa từng làm thật | Ứng viên UX có vòng phỏng vấn mock user interview trước hội đồng |
| Trigger | Buổi phỏng vấn thật trong 1–3 tuần tới | Ngày phỏng vấn cố định, rủi ro cao |
| Định vị | "Bạn tập đấu" / "buồng mô phỏng bay" cho buổi phỏng vấn người dùng thật đầu tiên | Chế độ thi, cảm giác như thật |
| Cơ chế lõi | Giống nhau (mục 4) | Giống nhau + Exam mode |
| Vì sao | Trigger có hạn rõ nhất; mỗi học kỳ có lứa mới (giải bài toán nhu cầu theo đợt ở tầng thu hút); tiếp cận tại chỗ; tiếng Việt là điểm khác biệt; kiểm tra giá trị học tập với chi phí thấp | Sẵn lòng trả tiền cao nhất. Chuyển sang nếu hướng chính thất bại ở khâu **ai trả tiền** |

**Công việc thật người học "thuê" sản phẩm làm (JTBD):** *trông đáng tin khi có người đang đánh giá mình* (giám sát, hội đồng, quản lý). Không chỉ là "học kỹ thuật".
**Đối thủ thật:** con người (tập với bạn bè, mentor senior, ngồi dự cuộc gọi của đồng nghiệp). Không thay thế họ; làm điều họ không làm được: **chỉ ra chính xác điều bạn bỏ lỡ, cho luyện lại đúng khoảnh khắc đó, và có mặt lúc 11 giờ đêm mà không phải nhờ vả ai.**

## 4. Cơ chế lõi (hook ledger)

Mỗi persona có một **tảng băng ẩn**: các mục sự thật, mỗi mục ghi *cách mở khóa* (bề mặt / cần 1 follow-up / chỉ lộ qua câu chuyện quá khứ / cần tin tưởng). Mỗi lượt trả lời của persona phát ra **hook** (một cách xoay xở, một cảm xúc, một sự kiện quá khứ, một lập trường) gắn với các mục trong tảng băng. Agent ghi sổ theo từng lượt: hook nào được người học **nhặt**, hook nào bị **bỏ rơi**. Mức cởi mở của persona phản ứng theo loại câu hỏi: câu dẫn dắt nhận câu trả lời ngắn, lịch sự, rỗng; câu hỏi về quá khứ tốt làm persona mở lòng. Cuối buổi: người học **đoán trước** mình bỏ lỡ gì → **lộ tảng băng**, mọi trích dẫn được xác minh với transcript → **một khoảnh khắc then chốt** kèm nút **"luyện lại từ đây"** (khôi phục đúng trạng thái persona). Tính agent đến từ chính thiết kế sư phạm: trạng thái ẩn bền vững (tảng băng + sổ hook), tool (phân loại câu hỏi, tra tảng băng, xác minh trích dẫn), tự kiểm tra (persona nhất quán với fact sheet; không trích dẫn nào nằm ngoài transcript). Tiền lệ: phương pháp *standardized patient* (OSCE) trong đào tạo y khoa.

## 5. Phạm vi MVP tạm thời (1 dev, 2 tuần)

**IN**
- 2–3 kịch bản persona soạn tay, tảng băng chất lượng cao (không tự sinh từ chủ đề của người học).
- Chat văn bản; tiếng Việt mặc định, có tiếng Anh.
- Persona "sống": trạng thái cởi mở phản ứng theo loại câu hỏi.
- Phân loại loại câu hỏi từng lượt + sổ hook.
- Tự kiểm tra tính nhất quán của persona (fact sheet).
- Đoán trước khi lộ đáp án → lộ tảng băng, giải thích cách mở khóa, có bộ xác minh trích dẫn.
- Một khoảnh khắc then chốt + "luyện lại từ đây" (**cắt đầu tiên nếu trễ tiến độ**).
- Timeline loại câu hỏi + tỉ lệ ai nói nhiều hơn.
- Thẻ "pre-flight" tạo theo yêu cầu (3 cái bẫy cá nhân + câu hỏi đã sửa được).
- Lưu trữ riêng tư, đăng nhập tối thiểu, miễn phí có giới hạn số buổi.

**LATER**
- Thanh toán (gói 14 ngày gắn ngày phỏng vấn thật; hóa đơn để nhà tài trợ hoàn tiền).
- Nhắc lịch pre-flight / post-flight; ôn lại sau 1 tuần.
- Ghost run (chuyên gia phỏng vấn cùng persona).
- Lộ trình đối kháng: persona tiếp theo nhắm vào thói quen xấu của người học.
- Persona sinh từ chủ đề riêng của người học, kèm bộ chắn: biến thể theo seed, không xuất lời persona, phát hiện được ghi thành giả thuyết chưa kiểm chứng.
- Gợi ý / timeout / thước đo cởi mở; Exam mode.
- Góc nhìn khán giả (brief, "sao bạn hỏi thế?", ghi chú phương pháp, hồ sơ sẵn sàng).
- Ghi chú ý định; bài tập phục hồi; tập phần mở và kết.
- Kho câu đố "tìm câu follow-up"; tạm dừng và chọn; gut flag; áp lực đồng hồ.
- Giọng nói; review transcript phỏng vấn thật.

**PARKED**
- Cửa giảng viên.
- Người học tự soạn persona.
- Đặt cọc cam kết.
- Đối tượng founder ("Founder's Wager").
- Observer là agent thứ 2 (đã bác).
- Cài mâu thuẫn có chủ đích.

## 6. Giả định chịu lực (forge + research phải kiểm tra)

1. **Giá trị học tập:** lộ tảng băng có "phải tự khai thác" + luyện lại khoảnh khắc làm hành vi **thay đổi ở buổi sau** (ít câu dẫn dắt / giả định hơn, nhặt nhiều hook hơn). Đo được ngay trong sản phẩm.
2. **Độ tin cậy kỹ thuật:** một agent LLM giữ được tảng băng ẩn nhất quán, không chiều lòng người hỏi, không lộ sớm, và trích dẫn luôn kiểm chứng được. Một trích dẫn bịa là mất hết niềm tin.
3. **Trigger và tiếp cận:** sinh viên capstone ở VN có buổi phỏng vấn thật có hạn, và sẽ dùng thử công cụ luyện tập 1–3 tuần trước đó.
4. **Khác biệt:** "thấy điều mình không tìm ra" đủ hơn ChatGPT miễn phí và việc tập với bạn bè / senior để người học chọn dùng.
5. **Có người trả tiền:** sinh viên với giá VN, hoặc nhà tài trợ (quỹ trường, người thân) trong khi người trả tiền không thấy kết quả. Chưa rõ; nếu thất bại thì chuyển sang hướng dự phòng.

## 7. Câu hỏi mở

- **Ai trả tiền?** Người học (user) ≠ người mua ≠ người trả tiền: phải tách rõ. Sinh viên, nhà tài trợ, hay chuyển sang A8?
- **Điều gì kéo người học quay lại** khi nhu cầu đến theo đợt? Thu hút lứa mới mỗi kỳ, hay vòng pre-flight → phỏng vấn thật → post-flight gắn ngày thật?
- **Định vị (hàng C):** "bạn tập đấu", "buồng mô phỏng bay", hay "OSCE cho UX"?
- **Nguồn persona (hàng D):** kịch bản soạn sẵn hay sinh từ chủ đề riêng (giá trị cao hơn nhưng rủi ro nghiên cứu giả cao nhất)?
- Ngôn ngữ mặc định VI hay EN (nhiều chương trình HCI ở VN dạy bằng tiếng Anh)?
