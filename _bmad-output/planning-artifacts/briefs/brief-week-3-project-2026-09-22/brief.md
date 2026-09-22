---
title: 'Product Brief: Phòng tập phỏng vấn người dùng (tên tạm)'
status: draft
created: '2026-09-22'
updated: '2026-09-22'
---

# Product Brief: Phòng tập phỏng vấn người dùng (tên tạm)

> Tên sản phẩm chưa chốt; tên mô tả này dùng tạm, sẽ chốt ở bước PRD.
> Bối cảnh: sản phẩm production thật, 1 dev, MVP ~2 tuần, responsive web app deploy và demo được end-to-end.
> Chi tiết kiến trúc agent, pipeline kịch bản, eval, ước tính chi phí và dữ liệu giá: xem `addendum.md`.

## Tóm tắt

Người mới học phỏng vấn người dùng thường chỉ biết mình hỏi sai **sau khi** buổi thật đã qua: câu hỏi dẫn dắt, không hỏi sâu, bỏ qua một chi tiết người kia vừa nhắc. Lúc đó lỗi đã tốn một buổi phỏng vấn, và thường không ai ngồi nghe lại để chỉ ra.

Sản phẩm là **phòng tập phỏng vấn người dùng, kèm bằng chứng bạn sai ở đâu**. Người học phỏng vấn một persona AI đang giữ một "tảng băng" gồm 8–12 điều chưa nói. Tảng băng cố định từ lượt đầu, và chỉ mở ra khi người học hỏi đúng cách. Cuối buổi, người học đoán mình đã bỏ lỡ gì, rồi xem tảng băng lộ ra kèm trích dẫn đúng lượt trong transcript. Sau đó người học **quay lại đúng khoảnh khắc bị lỡ** để hỏi lại. Đầu ra mang về là một bộ câu hỏi (guide) cho buổi phỏng vấn thật của chính mình.

Ẩn dụ phụ trợ là buồng mô phỏng bay: bắt lỗi ở đây để không mắc lỗi đó trước người thật. Câu phụ khi ra mắt: *"Luyện trên kịch bản của chúng tôi. Tự tin bước vào buổi phỏng vấn của bạn."* Bản ra mắt thực tế: chỉ vai trò UX, tiếng Việt trước, thư viện 2 kịch bản (tối thiểu 1).

## Vấn đề

**Người học sợ, và nhận ra lỗi quá muộn.** Những gì người học kể lại xoay quanh nỗi sợ và lỗi nhìn thấy khi đã muộn, không xoay quanh "thiếu feedback". Ví dụ rõ nhất là một người chuyển ngành PM viết "my first few user discovery interviews were terrifying" và "I filtered for what I wanted to hear", rồi chỉ phát hiện bài test của mình có lỗi sau khi đã tổng hợp xong. Đây là **một tài khoản duy nhất, viết năm 2023**, chưa kiểm độc lập [50]. Hai lỗi **câu hỏi dẫn dắt** và **không hỏi đủ sâu** xuất hiện ở blog UX tiếng Anh (chỉ đọc được tiêu đề và snippet, độ tin thấp [41]) và tài liệu đào tạo UX tại VN (lời giảng viên, độ tin thấp–trung bình [42]). Với BA, người làm nghề ở VN viết rằng fresher "không khai thác đúng, đủ thông tin là việc rất bình thường".

**Hiện người học xoay xở bằng:**
- Phỏng vấn bạn bè hoặc bạn cùng lớp: dễ dãi, miễn phí, nhưng tập luôn thói quen xấu.
- Nhờ senior hoặc quản lý nghe lại: có phán đoán tốt, nhưng phụ thuộc vào việc có người rảnh.
- Khóa học UX tại VN (2,2–9,99 triệu VND): trong các khóa đã kiểm, chỉ Capi Demy có buổi riêng về phỏng vấn người dùng.
- Tự dựng role-play trên ChatGPT: có gói miễn phí, nhưng không có cơ chế giữ trạng thái ẩn hay chỉ ra bằng chứng.

**Bằng chứng về vấn đề này còn mỏng, và brief nói thẳng điều đó.** Cả đợt nghiên cứu chỉ thu được khoảng 6 tiếng nói người học UX/PM, và chỉ một bài đọc được đầy đủ. Tiếng nói của người học BA là **0**. Tiếng nói của người học VN là **0**, chỉ có lời giảng viên và người làm nghề. Chưa ai nói thẳng "tôi muốn có phản hồi". Reddit và các group Facebook không truy cập được, nên đây là lỗ hổng phương pháp chứ không chứng minh được là nhu cầu không có.

## Người dùng

- **Kiến trúc:** phục vụ người học phỏng vấn trong UX, BA và PM ở mọi cấp độ. "First-class" nghĩa là cả ba vai trò dùng chung kiến trúc và cùng chuẩn chất lượng, không gắn nhãn beta. Đa vai trò là **ràng buộc từ project brief**, không phải bằng chứng thị trường.
- **Bản ra mắt thực tế:** chỉ UX, tiếng Việt trước. BA và PM chỉ xuất hiện khi kịch bản của chúng pass eval đầy đủ.
- **Beachhead ra mắt:** sinh viên HCI/UX năm cuối ở VN, ví dụ một người có 5 buổi **phỏng vấn người dùng** cho đồ án tốt nghiệp trong 10 ngày tới và chưa từng phỏng vấn ngoài role-play trên lớp. Thông điệp ra mắt chỉ nói với nhóm này. Phỏng vấn stakeholder thuộc vai trò BA, làm sau.
- **Việc họ cần làm (JTBD):** bước vào buổi thật mà không lúng túng, và biết cách gỡ khi lệch kịch bản, tức "đáng tin khi có người nhìn", không chỉ "học kỹ thuật". JTBD này **đến từ brainstorming**, chưa có tiếng nói người học xác nhận; nó gắn với giả định #10.
- **BA** (khi có) nghĩa là phỏng vấn stakeholder 1:1. Workshop nhiều người nằm ngoài phạm vi.

## Giá trị lõi và khác biệt

**Lời hứa với người học:** bắt lỗi của bạn ở đây, trước khi nó tốn một buổi phỏng vấn thật. Copy dùng ngôn ngữ của nỗi sợ và của việc sửa kịp, không dùng chữ "feedback". Tiếng Việt dùng cụm "phỏng vấn người dùng", vì "phỏng vấn" đứng một mình dễ bị hiểu là phỏng vấn xin việc. Tránh cụm "UX interview practice" vì các công cụ phỏng vấn xin việc đã dùng.

**Vì sao cần agent, không chỉ chatbot.** Persona không bao giờ thấy nội dung các item còn khóa; trạng thái ẩn nằm ngoài model. Ở mỗi lượt, logic agent phân loại câu hỏi và quyết định item nào được phép mở. Trước khi hiện phản hồi, mọi trích dẫn được đối chiếu với transcript đã lưu, và claim nào không trỏ được về một lượt cụ thể thì bị bỏ. Một chatbot chỉ có prompt không làm được ba việc này.

| So với | Họ làm gì | Mình khác ở đâu |
|---|---|---|
| **Role-play trên ChatGPT** | Có luyện nhưng không có bằng chứng | Tảng băng cố định, bộ đếm niêm phong từ lượt 1 ("persona đang giữ 11 điều"). **Replay** là phản chứng: quay lại khoảnh khắc đó, hỏi đúng thì điều bị lỡ mở ra. Việc ChatGPT có prompt không giữ được trạng thái ẩn là **giả định #11, chưa kiểm**; một benchmark, chưa kiểm độc lập, đo persona chỉ dựa prompt rò khoảng 0,6 lần mỗi episode [7] |
| **Synthetic users** (Synthetic Users, UXPressia) | Bán *insight* về người dùng, tức thay thế một phần nghiên cứu. UXPressia quảng bá "practice conversations" nhưng không mô tả phản hồi | Không bao giờ bán insight. Chỉ đánh giá kỹ năng của người học, đứng cùng phía với giới phê bình synthetic users |
| **mom-test** (mã nguồn mở, cho founder) | Prior art gần nhất: có hidden facts và debrief theo lượt, không có replay. Chạy trong Claude Code, dành cho founder | Web app cho người học không rành kỹ thuật, có replay, tiếng Việt, cho UX (BA/PM sau). Moat mỏng: ai cũng có thể đóng gói lại mom-test |
| **Senior / mentor / bạn bè** | Có phán đoán và độ thật | **Bổ trợ, không thay thế.** Mình chỉ đúng lỗi, chứng minh bằng replay, dùng được lúc 11 giờ đêm mà không phải nhờ ai |

**Bằng chứng ủng hộ thiết kế:**
- Không tìm thấy sản phẩm thương mại nào có đủ ba thứ: thông tin ẩn cố định, màn lộ trích theo lượt và replay. Khoảng trống này hẹp, và kết luận chỉ dựa trên một đợt tìm kiếm có giới hạn.
- Một RCT (n=94, preprint, trên **cố vấn tâm lý mới vào nghề**) cho thấy luyện với LLM kèm phản hồi thì cải thiện kỹ năng, còn chỉ luyện thì không tiến bộ và độ đồng cảm giảm. Việc kết quả này chuyển sang kỹ năng phỏng vấn người dùng chưa được chứng minh. Thông điệp vì vậy là "luyện kèm bằng chứng bạn sai ở đâu", không phải "luyện với AI".
- Một persona stakeholder bám tài liệu (n=69) giúp sinh viên đặt câu hỏi tốt hơn so với người đóng vai, nhưng bị đánh giá là **kém thật hơn**.

**Không tuyên bố replay hay OSCE là "đã được chứng minh".** Replay là thiết kế lấy cảm hứng từ deliberate practice, chưa có nghiên cứu trong kỹ năng hội thoại. OSCE / bệnh nhân chuẩn hóa chỉ được nhắc ở mức "cùng họ phương pháp".

**Moat thật:** tốc độ thực thi, tiếng Việt, và thiết kế tin cậy theo cấu trúc. Không có moat công nghệ.

## Ranh giới đạo đức

Sản phẩm **luyện kỹ năng của người học và không bao giờ tạo nhận định về người dùng thật.** Ranh giới được thực thi bằng cấu trúc sản phẩm, không bằng disclaimer:
- Mọi đầu ra chỉ nói về hành vi của người học.
- Guide chỉ chứa câu hỏi và ghi chú kỹ thuật. Câu hỏi nào tự thêm nội dung về người dùng thật đều bị loại.
- Không persona nào được sinh từ câu hỏi nghiên cứu của người học: *"Người trong thế giới của bạn, không bao giờ là câu hỏi của bạn."*
- Trích dẫn chỉ lấy từ transcript. Dữ liệu riêng tư theo mặc định, chỉ người học xem được.

## Giả định then chốt

| # | Giả định | Trạng thái | Kiểm bằng cách nào |
|---|---|---|---|
| 1 | Chưa có sản phẩm nào kết hợp thông tin ẩn cố định, màn lộ trích theo lượt và replay | **SUPPORTED, tìm kiếm có giới hạn**: research [1][4]; không vào được Reddit/Facebook | Kiểm lại trước 2026-12-22; theo dõi mom-test và UXPressia mỗi quý |
| 2 | Phản hồi là đòn bẩy; luyện không phản hồi thì không tiến bộ | **SUPPORTED** bởi một preprint trên cố vấn mới vào nghề [6]; chưa chứng minh chuyển sang phỏng vấn | Đo trong sản phẩm qua giả định #9 |
| 3 | Persona bám tài liệu dạy tốt hơn nhưng kém thật hơn người thật | **VALIDATED**: n=69 [8] | Đo độ thật qua link phản hồi khi có BA/PM |
| 4 | Nỗi đau của người học đủ lớn để họ chủ động đi luyện | **UNVALIDATED**: tín hiệu mỏng, nguồn chưa kiểm | 5–8 phỏng vấn sinh viên HCI năm cuối và fresher BA; tỉ lệ đăng ký hoàn thành buổi đầu |
| 5 | Sinh viên HCI/UX VN sẽ luyện 1–3 tuần trước buổi thật | **UNVALIDATED**: 0 tiếng nói người học VN | Ra mắt với 1–2 lớp HCI; số buổi mỗi người trước deadline |
| 6 | Có nhu cầu luyện phỏng vấn cho BA (và PM) | **UNVALIDATED**: 0 tiếng nói người học BA; văn viết BA ở VN hay đổ lỗi cho stakeholder | Lúc ra mắt: nút "Báo tôi khi BA/PM sẵn sàng" ghi lại vai trò. Phỏng vấn 3 fresher BA |
| 7 | Kịch bản BA/PM do AI soạn đủ thật | **UNVALIDATED**: chưa có người làm nghề kiểm | Link "Người này có giống stakeholder thật không?" ship cùng BA/PM. Trước đó: 1–2 người đọc proxy (giảng viên, thực tập sinh), ghi là kiểm tra một phần |
| 8 | Có người trả tiền (sinh viên, trường hoặc trung tâm) | **UNVALIDATED**: chưa có dữ liệu WTP | Nút waitlist "mở thêm" kèm giá thử; hỏi 2–3 giảng viên HCI hoặc trung tâm |
| 9 | Replay giúp người học mở được item ở buổi sau | **UNVALIDATED**: chỉ có bằng chứng gián tiếp | Tỉ lệ mở item trên một **kịch bản khác** ở buổi kế tiếp, giữa người có dùng replay và người không. Replay diễn ra sau reveal, nên tỉ lệ dùng replay chỉ là chỉ số tương tác |
| 10 | Người học muốn bắt lỗi, không chỉ muốn bớt sợ | **UNVALIDATED** | Tỉ lệ mở màn reveal, dùng replay, tải guide |
| 11 | ChatGPT có prompt không giữ được trạng thái ẩn qua một buổi phỏng vấn | **UNVALIDATED**: chỉ có một benchmark chưa kiểm độc lập [7] | Chạy eval adversarial của chính mình trên một persona ChatGPT có prompt, so tỉ lệ rò với engine |

## Tiêu chí thành công (MVP)

Các ngưỡng tương tác dưới đây là đề xuất, sẽ chốt ở PRD. Chỉ đọc các tỉ lệ phần trăm sau khi có **≥30 người học**.
- **Cổng ship kịch bản:** mọi kịch bản pass full eval: 0 rò rỉ trong 20 run adversarial; run tốt (mù tảng băng) mở gấp ≥2 lần run xấu và mở ≥3 item.
- **Classifier:** ≥85% đồng thuận trên test set tiếng Việt; ≤5% câu hỏi tốt bị gắn nhầm nhãn dẫn dắt.
- **Rò rỉ trong production:** theo dõi tỉ lệ rò mỗi episode. Mốc ~0,6/episode [7] chỉ để tham chiếu, không phải claim.
- **Tương tác:** ≥60% buổi đã bắt đầu đi tới màn reveal; ≥40% buổi có dùng replay.
- **Giá trị:** ≥30% người học làm buổi thứ hai, trên kịch bản khác, trong cửa sổ trước buổi phỏng vấn thật.
- **Trả tiền:** số lượt bấm "mở thêm"; ít nhất 1 giảng viên hoặc trung tâm chia sẻ link đăng ký cho lớp.
- **Vận hành:** chi phí LLM không vượt cap theo ngày; demo end-to-end chạy trên URL đã deploy.

## Hướng MVP

**Hình dạng sản phẩm:** responsive web app. Đăng nhập tối thiểu bằng Google hoặc email magic link, không phân quyền. Mỗi buổi khoảng 15–20 phút, tối đa ~30 lượt của người học. Thư viện lúc ra mắt: mục tiêu 2 kịch bản UX, tối thiểu 1; cần 2 để người học có buổi thứ hai và để đo được giả định #9.

**Demo end-to-end** trên URL đã deploy: đăng nhập → chọn kịch bản → phỏng vấn → đoán → reveal → replay → tải guide.

**Must-ship** (xếp hạng; nửa đầu đã đủ để demo end-to-end):
1. Schema và 2 kịch bản UX (tối thiểu 1), có hook line và ràng buộc do-not-assert
2. Engine: persona giữ thông tin ẩn có độ cởi mở (openness), classifier 3 nhãn, hook ledger, cổng mở khóa
3. Reveal: người học đoán trước, lộ tảng băng, trích dẫn theo tham chiếu, mọi nhãn kèm bằng chứng
4. Replay từ khoảnh khắc bị lỡ
5. Deploy, đăng nhập tối thiểu, lưu trữ riêng tư
6. Eval harness (run tốt mù tảng băng, run xấu, 20 adversarial)
7. Bộ đếm niêm phong, kèm **một câu hỏi kinh nghiệm** ở lần dùng đầu để đặt tier hiển thị
8. Guide tối thiểu kèm verifier
9. Cap chi phí theo ngày
10. Plumbing song ngữ; tiếng Việt mặc định và ship trước
11. Nút waitlist "mở thêm" và nút "Báo tôi khi BA/PM sẵn sàng"

**Next** (theo thứ tự): pipeline sinh kịch bản kèm eval (CLI trước) → admin dashboard → kịch bản BA và PM (sàn 8 item), kèm câu hỏi vai trò ở onboarding → đường "Describe" (kịch bản custom: 1 miễn phí, sau đó vào waitlist) → bản tiếng Anh của thư viện. **Tripwire:** chỉ làm dashboard nếu must-ship xong trước ngày 6; nếu không, tạo BA/PM qua CLI và đẩy dashboard sang Later.

**Later:** feedback diễn đạt theo tier, timeline câu hỏi và tỉ lệ nói, trình soạn kịch bản trực quan, đưa kịch bản của người học vào thư viện.

**Thử với lớp học:** giảng viên chỉ chia sẻ link đăng ký thông thường. Không có tài khoản lớp, không có màn hình cho giảng viên.

**Ngoài phạm vi:** phỏng vấn nhóm hoặc workshop; persona sinh từ câu hỏi nghiên cứu của người học; mọi đầu ra dạng "insight" về người dùng thật; sản phẩm cho giảng viên (tài khoản lớp, dashboard, chấm điểm); thanh toán; voice; ghost run, lộ trình đối kháng, lịch pre-flight / post-flight tự động.

**Chi phí mỗi buổi (ước tính, chưa đo):** khoảng 4 LLM call mỗi lượt, ~30 lượt, cộng reveal, replay và guide, ra ~135–150 call mỗi buổi. Tính ra khoảng 5–8 nghìn VND/buổi với model tier nhỏ và 35–47 nghìn VND/buổi với model tier trung (giá model và tỷ giá là giả định; cách tính ở addendum). Mốc giá B2C đang suy luận là 100–200 nghìn VND cho một gói prep-sprint. Nếu một gói có 3–5 buổi, tier trung sẽ ăn hết hoặc vượt giá bán, còn tier nhỏ thì vẫn nằm trong mốc giá. Việc chọn model và số call mỗi lượt vì vậy là ràng buộc cho PRD và kiến trúc.

## Rủi ro chính

- **Lịch:** must-ship ước tính ~12,5 trên 14 ngày, **trước khi** thêm câu hỏi kinh nghiệm, nút "Báo tôi khi BA/PM sẵn sàng" và kịch bản UX thứ hai. Các mục này nhỏ nhưng chưa được ước tính lại. Vai trò chưa pass eval thì **không hiển thị**, không ship dưới nhãn beta.
- **Kích hoạt:** khác biệt so với ChatGPT chỉ lộ đầy đủ ở cuối buổi đầu tiên. Người bỏ giữa buổi 1 sẽ không bao giờ thấy nó; bộ đếm niêm phong chỉ làm dịu một phần.
- **Phán đoán của classifier:** ranh giới giữa "chỉ thêm phạm vi" (boundary-probe) và "thêm nội dung mới" (dẫn dắt) là phán đoán của LLM, ví dụ "luôn thấy bực, đúng không?". Nhãn sai trên câu hỏi tốt sẽ làm mất niềm tin vào mọi nhãn khác. Cần edge case trong test set, và đây là lý do có ngưỡng classifier ở trên.
- **Độ thật của BA/PM:** kịch bản do AI soạn, chưa có người làm nghề kiểm (giả định #7).

## Câu hỏi mở

**1. Ai trả tiền?**
- **B2C, gói prep-sprint:** gói gắn với ngày phỏng vấn thật, tự hết hạn. Khó khăn: sản phẩm thay thế có gói miễn phí (ChatGPT, mentor ADPList), và chi phí mỗi buổi ở tier trung đã chạm mốc giá.
- **B2B2C:** trung tâm đào tạo hoặc giảng viên HCI mua theo lớp, dùng làm bài tập giữa các buổi học. Người trả chỉ thấy "đã dùng pass", không bao giờ thấy kết quả của người học. Sinh viên VN đã trả 2,2–9,99 triệu VND cho khóa UX, nhưng đây là suy luận, chưa kiểm. Hướng này phải giữ quyết định "không làm sản phẩm cho giảng viên".
- **Kịch bản custom trả phí:** đo WTP qua waitlist.
- **Hướng dự phòng "Panel Rehearsal":** ứng viên UX có vòng mock interview trước hội đồng tuyển dụng; ngày cố định, WTP có thể cao hơn.

Đề xuất: thử B2C và B2B2C song song.

**2. Điều gì kéo người học quay lại?** Nhu cầu đến theo đợt. Các ứng viên: lứa sinh viên mới mỗi học kỳ; vòng pre-flight → phỏng vấn thật → post-flight; ôn lại một khoảnh khắc sau 1 tuần; lộ trình nhắm vào thói quen xấu; kịch bản custom theo từng dự án. Chưa chọn hướng nào; tín hiệu đầu tiên là tỉ lệ làm buổi thứ hai.

## Brief này được hình thành thế nào (BMAD)

Ba bước BMAD: **brainstorming** (4 kỹ thuật, ~105 ý tưởng) → **forge** (6 đòn tấn công, trạng thái HARDENED) → **deep research** (cạnh tranh và tiếng nói người học; 6 claim đã kiểm), sau đó brief được validate và cập nhật.
Các quyết định đổi dọc đường: replay từ "cắt đầu tiên nếu trễ" thành bằng chứng lõi; kịch bản theo chủ đề người học thành "cùng lĩnh vực, không trùng câu hỏi"; đối tượng từ chỉ UX thành ba vai trò về kiến trúc, nhưng ra mắt chỉ UX; định vị từ "sparring partner" qua buồng mô phỏng bay thành "phòng tập kèm bằng chứng bạn sai ở đâu".
Lần validate hạ mức hai giả định từng ghi là đã kiểm, đổi beachhead sang phỏng vấn người dùng, và bổ sung hình dạng sản phẩm, chi phí mỗi buổi và ngưỡng classifier.
Artifact: `_bmad-output/brainstorming/brainstorm-ai-user-interview-practice-2026-09-22/`, `_bmad-output/forge/ai-interview-practice-agent/`, `_bmad-output/planning-artifacts/research/competitive-ai-interview-practice-agent-positioning-2026-09-22/`.
