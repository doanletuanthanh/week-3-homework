---
title: 'Addendum: Phòng tập phỏng vấn người dùng (tên tạm)'
created: '2026-09-22'
updated: '2026-09-22'
---

# Addendum cho brief

Chi tiết dành cho PRD và kiến trúc. Nguồn: `forged-idea.md` và `.memlog.md` của forge, `research.md`. Brief chỉ giữ phần tóm tắt.

## 1. Kiến trúc agent (đã khóa ở forge)

**Trạng thái (state)**
- Mỗi kịch bản có một **tảng băng** gồm 8–12 item. Mỗi item có một đường mở: bề mặt / 1 follow-up / chuyện quá khứ / tin tưởng.
- Persona có trạng thái **openness**, phản ứng theo loại câu hỏi người học đặt.
- **Hook ledger:** mỗi lượt của persona thả ra các hook gắn với item. Ledger theo dõi hook nào được người học nhặt, hook nào bị bỏ qua. Ledger là nguồn cho reveal, cho việc chọn khoảnh khắc replay, và cho nội dung feedback.

**Classifier 3 nhãn** (một luật chung cho mọi vai trò)
- `confirm-grounded`: nội dung đã có trong lời persona. Tốt.
- `boundary-probe`: chủ đề đã grounded, câu hỏi chỉ thêm phạm vi (mọi / luôn / không bao giờ / trường hợp nào). Tốt.
- `leading/assumption`: câu hỏi thêm nguyên nhân, phán xét hoặc nội dung mới. Xấu.
- Grounding tính theo nghĩa. Verifier phải trả về turn ID mà nó dựa vào. Không có turn trích được thì coi là không grounded.
- Các vai trò chỉ khác nhau ở trọng số, các bước bắt buộc (must-do) và template đầu ra.

**Cổng mở khóa (gate)**
- Cổng do logic agent quyết định, không phụ thuộc "tâm trạng" persona. Cùng một luật áp cho cả buổi chính lẫn replay.
- Item follow-up chỉ mở khi câu hỏi bám vào hook persona thực sự đã thả. Câu hỏi chung chung chỉ mở được item bề mặt.
- Item tin tưởng chỉ mở khi openness vượt ngưỡng VÀ câu hỏi phù hợp.

**Ba luật tin cậy theo cấu trúc**
1. Context của persona chỉ gồm: danh tính, fact bề mặt, các item đã mở, và hook line của các item còn khóa. Nội dung item khóa không bao giờ nằm trong context. Mỗi item khóa có một ràng buộc do-not-assert trung tính, và bước self-check kiểm từng lượt persona theo các ràng buộc này.
2. Trích dẫn theo tham chiếu: LLM chỉ xuất turn ID (span là tùy chọn). UI render câu trích từ transcript đã lưu. Tham chiếu nào không resolve được thì claim đó bị bỏ.
3. Nội dung feedback được tính từ ledger. LLM chỉ lo diễn đạt. Mọi nhãn đều hiện bằng chứng: câu persona làm căn cứ, hoặc "bạn tự đưa ý này vào, persona chưa từng nói".

**Replay:** mỗi buổi có 1 khoảnh khắc. Hệ thống khôi phục trạng thái tại lượt đó và cho 3 lượt. Thành công: "Đã mở: item X". Thất bại: hiện item cùng 1 câu mẫu lẽ ra mở được.

**Bộ đếm niêm phong:** tổng số item hiện từ lượt 1. Số item "đã mở" hiện live chỉ ở tier sinh viên. Các tier khác chỉ thấy tổng niêm phong, số đã mở hiện lúc reveal.

**Guide verifier**
- Loại mọi câu khẳng định về người dùng thật. Chỉ cho phép câu hỏi, ghi chú kỹ thuật, và nhắc tới hành vi của người học trong buổi.
- Mọi câu hỏi trong guide chạy qua classifier 3 nhãn mà không có transcript để grounding. Câu nào thêm nội dung về người dùng sẽ bị gắn nhãn assumption và bị loại.
- Pre-flight card được gộp vào guide.

**Ngôn ngữ:** giả định ngôn ngữ cố định từ đầu buổi, vì verifier grounding và trích dẫn giả định transcript chỉ có một ngôn ngữ. Mọi LLM call nhận tham số ngôn ngữ.

## 2. Kịch bản và eval

**Chuẩn chất lượng** (áp cho mọi kịch bản library, mọi vai trò, mọi ngôn ngữ)
- 8–12 item, đủ cả 4 đường mở, ≥2 item chỉ mở được bằng chuyện quá khứ hoặc tin tưởng.
- Run tốt và run xấu phải cách biệt rõ: run tốt mở gấp ≥2 lần và mở ≥3 item.
- Run BA tốt phải có câu xác nhận đóng đúng lúc.
- 0 rò rỉ trong 20 run adversarial.

**Người phỏng vấn "tốt" trong eval phải mù tảng băng**: chỉ có transcript và luật kỹ thuật chung. Nếu biết tảng băng, eval sẽ đo kiến thức thay vì kỹ thuật.

**Đề xuất từ research:** đưa tỉ lệ rò rỉ trên mỗi episode vào eval harness như một chỉ số. Mốc so sánh là benchmark bệnh nhân ảo của Harada; claim này **chưa kiểm độc lập**, không dùng con số của nó trong copy.

**Pipeline sinh kịch bản**
- AI soạn kịch bản, grounded trên tài liệu BA/PM thật. Một AI critic đóng vai senior BA/PM. Eval là cổng. Người chỉ duyệt kết quả eval.
- Làm dạng CLI trước (0,5 ngày). Admin dashboard sau (1 admin, JSON editor kèm schema validation, chỉ publish kịch bản pass full eval).
- Nếu chủ đề người học trùng kịch bản của vai trò đó, gợi ý kịch bản của vai trò khác.
- Trường tùy chọn "chủ đề phỏng vấn thật" trước buổi: bật overlap check và điền sẵn cho guide. Nếu bỏ qua, hỏi lại ở cuối buổi.

**Kịch bản custom (đường "Describe")**
- Người học mô tả người được phỏng vấn (vai trò, bối cảnh, tính khí) và câu hỏi nghiên cứu của mình.
- Tảng băng sinh ra cố ý nói về một quy trình khác. Câu hỏi nghiên cứu bị loại bằng do-not-assert, và verifier kiểm tảng băng đã sinh. UI nói rõ nhân vật sẽ không bàn về câu hỏi đó.
- Eval rút gọn: 2 run scripted và 5 run adversarial (nhắm do-not-assert và việc loại trừ câu hỏi nghiên cứu), cùng ngưỡng cách biệt như library. Eval fail thì không trừ lượt miễn phí. Gắn nhãn "kiểm tra nhẹ".
- Thời gian chờ eval (~100–200 LLM call) có thể mất vài phút.

**Tư liệu grounding cho BA/PM** (research.md §6)
- Ưu tiên mẫu 11–16 (phê duyệt, nguồn NHS) và mẫu 1–9 (workaround, nguồn JMIR 2025; trích dẫn nguyên văn đã kiểm).
- Đưa quy tắc danh từ hóa vào luật boundary-probe. Ví dụ persona nói "rồi nó đi qua phê duyệt", người học được thưởng khi mở ra "ai duyệt, khi nào, ngưỡng bao nhiêu".
- Mẫu "ngưỡng tiền phê duyệt" **chưa có nguồn**. Coi là giả định, hoặc thay bằng mẫu 11–16.
- Danh mục lệch về y tế và mua sắm công, chưa có mẫu từ phần mềm doanh nghiệp VN.
- PM: dùng các dấu hiệu "fluff" ("I usually", "I would") và lời khen lịch sự làm chất liệu để thưởng người học biết kéo câu chuyện về một lần cụ thể trong quá khứ.

## 3. Lịch và tripwire

- Ước tính của forge: must-ship ~12,5 trên 14 ngày. Người dùng tin là chặt hơn.
- Tripwire: chỉ làm dashboard nếu must-ship xong trước ngày 6. Nếu không, tạo BA/PM qua CLI và đẩy dashboard sang Later.
- Plumbing song ngữ thêm khoảng 0,5 ngày vào must-ship.
- BA/PM ship ở full bar với sàn 8 item, hoặc không ship. Onboarding chỉ hiện các vai trò đã pass eval.
- Thêm vào must-ship sau lần validate (chưa ước tính lại ngày): kịch bản UX thứ hai (mục tiêu 2, tối thiểu 1), một câu hỏi kinh nghiệm ở lần dùng đầu (đặt tier cho bộ đếm niêm phong), nút "Báo tôi khi BA/PM sẵn sàng" ghi lại vai trò. Câu hỏi vai trò ở onboarding đi cùng BA/PM trong Next.

## 3b. Ước tính chi phí mỗi buổi (chưa đo)

**Số call** (giả định từ kiến trúc ở §1):
- Mỗi lượt người học ~4 call: persona trả lời; classifier 3 nhãn kèm verifier grounding; self-check do-not-assert; cập nhật ledger / cổng mở khóa (có thể gộp vào classifier).
- ~30 lượt/buổi → ~120 call. Reveal, diễn đạt feedback, replay (3 lượt × ~4 call) và guide + verifier thêm ~15–30 call.
- Tổng: **~135–150 call/buổi**.

**Token** (giả định): mỗi call ~2–3k token vào (context persona, transcript, luật), ~200 token ra → ~0,3–0,45M token vào, ~30k token ra mỗi buổi.

**Giá** (giả định, không gắn với model cụ thể; kiểm lại theo bảng giá hiện hành khi chọn model), tỷ giá giả định ~26.000 VND/USD:

| Tier model | Giá giả định (USD / 1M token vào / ra) | Chi phí/buổi | VND/buổi |
|---|---|---|---|
| Nhỏ | ~0,5 / ~2 | ~$0,21–0,29 | ~5–8k |
| Trung | ~3 / ~15 | ~$1,35–1,80 | ~35–47k |

**So với mốc giá B2C** (100–200k VND/gói prep-sprint, suy luận từ research §7): gói 3–5 buổi tốn ~15–40k ở tier nhỏ, nhưng ~105–235k ở tier trung, ngang hoặc vượt giá bán. Hướng xử lý cho PRD/kiến trúc: dùng tier nhỏ cho classifier/self-check, chỉ dùng tier lớn hơn cho persona nếu eval cần; gộp call; cache phần context cố định. Kịch bản custom còn tốn thêm ~100–200 call cho eval, tương đương khoảng một buổi.

## 4. Tín hiệu giá (research.md §7)

- **Đã kiểm [11]:** Capi Demy UX 9,99 triệu VND (16 buổi, có buổi user interview); ColorME 2,2 triệu; Keyframe 5,2–5,8 triệu.
- **Chưa kiểm, không dùng trong copy:**
  - Giá ChatGPT tại VN [14]: nguồn đã cũ, cần kiểm lại trước khi định giá.
  - Synthetic Users [2] và Yoodli [3].
  - Khóa BA tại VN [25]: độ tin thấp.
- Gợi ý giá prep-sprint ~100–200k VND trong research là **suy luận**.
- Tiền lệ kênh qua trường: Yoodli ở trung tâm hướng nghiệp University of Washington, nhưng cho kỹ năng khác [47].

## 5. Hướng dự phòng và theo dõi đối thủ

- **Panel Rehearsal:** dành cho ứng viên UX có mock user interview trước hội đồng tuyển dụng. Ngày cố định, Exam mode, gói high-stakes trả một lần. Cùng lõi cơ chế. Chuyển sang hướng này nếu beachhead A1 không trả tiền.
- **mom-test:** nếu được đóng gói thành web app, khác biệt còn lại chỉ là replay, UX/BA và tiếng Việt.

## 6. Phương án đã bác (lý do)

- **Chỉ định vị UX, ẩn BA/PM sau nhãn beta:** project brief yêu cầu cả ba vai trò. Vấn đề nằm ở cách chấm điểm, nên sửa luật chấm thay vì giấu vai trò.
- **Chấm theo "loại câu hỏi" đơn thuần, hoặc luật riêng cho từng vai trò:** sẽ phạt BA giỏi hoặc thưởng câu dẫn dắt. Thay bằng luật grounding chung.
- **Persona sinh thẳng từ câu hỏi nghiên cứu:** gây neo giả thuyết trước fieldwork, và không qua được chuẩn chất lượng.
- **Tone mềm cho người mới:** thực chất là chiều lòng. Thay bằng khen có căn cứ.
- **Observer là agent thứ hai:** thay bằng một lăng kính của cùng bộ phân tích.
- **Sản phẩm cho giảng viên:** bỏ ở brainstorm vì là một sản phẩm khác, quá lớn cho MVP solo.
- **Workshop nhiều người; "sparring partner"; OSCE làm headline.**
