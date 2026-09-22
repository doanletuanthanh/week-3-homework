---
title: 'competitive + user-voice research: Định vị agent AI luyện phỏng vấn'
type: 'competitive + user-voice'
topic: 'Định vị agent AI luyện phỏng vấn'
decision: 'Agent AI luyện phỏng vấn nên định vị thế nào, nỗi đau của người học có thật không, bằng chứng nào ủng hộ thiết kế'
source: 'native run'
status: complete
preset: 'standard'
validation: 'normal'
claims_verified: 6
claims_unverified: 10
claims_disputed: 1
created: '2026-09-22'
updated: '2026-09-22'
---

# Nghiên cứu cạnh tranh + tiếng nói người dùng: Định vị agent AI luyện phỏng vấn

**Quyết định mà nghiên cứu này phục vụ:** Agent AI luyện phỏng vấn nên định vị thế nào, nỗi đau của người học có thật không, bằng chứng nào ủng hộ thiết kế.

## Tóm tắt điều hành

**Khuyến nghị:** Định vị là **phòng tập phỏng vấn người dùng / stakeholder có phản hồi kèm bằng chứng**, không phải "synthetic users" và không phải "luyện với AI" chung chung. Giữ nguyên thiết kế tin cậy theo cấu trúc. Không tuyên bố replay hay OSCE là "đã có bằng chứng". Về câu hỏi ai trả tiền, thử B2B2C (giảng viên, trung tâm đào tạo) song song với B2C.

**Ba phát hiện quyết định:**
1. **Khoảng trống có thật nhưng hẹp.** Không tìm thấy sản phẩm thương mại nào có đủ thông tin ẩn cố định, lộ kèm bằng chứng theo lượt và replay [1]. Gần nhất là mom-test (mã nguồn mở, cho founder, có hidden facts và scorecard nhưng không có replay) [1] và UXPressia (quảng cáo "practice conversations" nhưng không có phản hồi) [4]. Đối thủ thực tế là ChatGPT tự dựng, giá 0–150k VND/tháng ở VN [14][20].
2. **Phản hồi mới là đòn bẩy, và thông tin ẩn không tự giữ được.** Luyện với LLM mà không có phản hồi thì không tiến bộ, thậm chí làm độ đồng cảm giảm (RCT n=94) [6]. Phản hồi có ES 0,44 trong mô phỏng y khoa [26]. Bệnh nhân ảo chỉ dựa vào prompt vẫn rò thông tin cấm khoảng 0,6 lần mỗi episode [7]. Persona có grounding giúp sinh viên đặt câu hỏi tốt hơn người đóng vai, nhưng bị đánh giá là kém thật hơn [8]. Điều này ủng hộ lõi thiết kế (ledger, cổng mở khóa, trích dẫn) và cảnh báo về độ thật.
3. **Nỗi đau của người học có thật nhưng bằng chứng mỏng, và người học không nói bằng ngôn ngữ "feedback".** Người mới mắc lỗi có hệ thống: câu hỏi mơ hồ, bỏ sót câu hỏi, sai thứ tự [32]. Tiếng nói người học là sợ hãi và lỗi nhận ra muộn ("terrifying", "filtered for what I wanted to hear") [50]. Có 0 tiếng nói người học BA, 0 tiếng nói người học VN, và không ai nói thẳng "tôi muốn feedback".

**Lưu ý lớn nhất:** beachhead (sinh viên HCI ở VN), nhu cầu BA/PM và khả năng trả tiền đều **chưa được kiểm** bằng dữ liệu. Reddit và các group Facebook không truy cập được. Cần 5–8 phỏng vấn người học thật trước khi khóa thông điệp.

**Bằng chứng mỏng ở:** tiếng nói người học (§3), giá tại VN cho khóa BA (§7), replay trong kỹ năng hội thoại (§4), neo/mồi do persona AI (§5), mẫu lời nói về ngưỡng tiền phê duyệt (§6).

## 1. Công cụ AI hiện có: luyện phỏng vấn và "synthetic users"

**Kết luận:** Không tìm thấy sản phẩm thương mại nào kết hợp đủ ba thứ: persona giữ thông tin ẩn cố định, màn lộ kèm bằng chứng theo từng lượt, và replay từ khoảnh khắc bị lỡ, dành cho người học UX/BA/PM [1]. Khoảng trống này có thật. Nhưng nó hẹp, và đối thủ thực tế là ChatGPT tự dựng, gần như miễn phí.

Các nhóm công cụ:

| Nhóm | Ví dụ | Định vị | Giá | Khoảng trống so với ý tưởng |
|---|---|---|---|---|
| Synthetic users (sinh phát hiện nghiên cứu) | Synthetic Users | "discovery co-pilot" cho team nghiên cứu | từ $12.500/năm, không có gói giáo dục [2] | Bán *insight*, đúng thứ ý tưởng cam kết không làm |
| Persona chat kép (vừa "luyện" vừa bán insight) | UXPressia AI Persona Chat | "human-like practice conversations, refining your questions and approach before meeting real customers" [4] | không công bố trên trang [4] | Không mô tả chấm điểm, thông tin ẩn hay phản hồi |
| Luyện customer discovery có thông tin ẩn | mom-test (mã nguồn mở, MIT) | Dành cho founder, chạy trong Claude Code | miễn phí [1] | Có "hidden facts", có scorecard 15 mục /75, có debrief gắn lượt F:/C:. Không có replay từ khoảnh khắc; "league" chỉ theo dõi xu hướng giữa các run [1] |
| Nguyên mẫu học thuật | PEARL (GPT-4) | Sinh viên sau đại học luyện phỏng vấn nghiên cứu | – | Người dùng tự viết persona, không có thông tin ẩn, chỉ trả transcript. n=4 [15] |
| Roleplay bán hàng / phỏng vấn xin việc | Yoodli, Hyperbound, Mockin | Phỏng vấn xin việc, gọi bán hàng | Yoodli miễn phí / $8 / $20 mỗi tháng, thanh toán theo năm [3]; Hyperbound ~$63–70/seat/tháng (nguồn đối thủ, độ tin thấp) [16] | Khác kỹ năng. Cụm "UX interview practice" đã bị công cụ phỏng vấn xin việc chiếm [22] |
| Chatbot tổng quát | ChatGPT kèm template tự dựng | Hướng dẫn tự dựng persona để "mock interview" [20][21]; IIBA gợi ý prompt AI đóng stakeholder [19] | 0–571k VND/tháng tại VN [14] | Không giữ trạng thái ẩn, không chấm theo bằng chứng |

Điểm đáng chú ý:
- **mom-test là prior art gần nhất và chứng minh khái niệm** (persona giữ sự thật ẩn cộng debrief theo lượt) [1]. Vì nó mở mã nguồn, ai cũng có thể đóng gói lại. Lợi thế của mình vì vậy phải đến từ replay, trích dẫn chứng minh được, người học UX/BA và tiếng Việt, không phải từ "thông tin ẩn" đơn thuần.
- **Không tìm thấy simulator phỏng vấn stakeholder chuyên cho BA.** Chỉ có bài viết khuyên prompt ChatGPT [19]. Đây là khoảng trống, nhưng cũng là chỗ thiếu bằng chứng về nhu cầu (xem §3).
- **Một người làm nghề đánh giá synthetic users cao hơn NN/g:** John Whalen kể rằng trong khóa của ông, synthetic users tìm lại được "six or seven" trên khoảng bảy phát hiện chính của phỏng vấn thật. Ông coi chúng là "a way to broaden my thinking. To prepare for being with real humans" [23]. Đây là giai thoại cấp khóa học, không công bố phương pháp (độ tin trung bình).

## 2. Lựa chọn không dùng AI: khóa học, mock interview với bạn, mentoring

| Lựa chọn | Có luyện kèm phản hồi không? | Giá |
|---|---|---|
| Khóa NN/g "User Interviews" (live) | Có: bài tập giữa học viên, giảng viên hướng dẫn cách hỏi sâu | US$1.215/ngày [17] |
| Product Talk "Continuous Interviewing" (Teresa Torres) | 5 buổi live 90 phút, hoạt động nhóm nhỏ, case study. Trang không hứa phản hồi trên mock interview | trang không hiện giá [24] |
| ADPList mentoring | Tư vấn nghề 1:1. Không thấy bằng chứng mentor chạy mock user interview có cấu trúc | miễn phí, 40.000+ mentor, có mentor người Việt [18] |
| Chương trình luyện trong công ty | GitLab "Interview Carousel": mỗi người nói chuyện với 3–4 user trong một sự kiện live [44] | nội bộ |
| Khóa UX tại VN | Capi Demy có buổi "Phỏng vấn sâu (User Interview) và Nghiên cứu thực địa" và challenge thực địa [11]. ColorME [12] và Keyframe [13] không liệt kê user research | 2,2 triệu – 9,99 triệu VND [11][12][13] |
| Khóa BA tại VN | không kiểm được nội dung | ~3,2–12 triệu VND, lấy từ trang tổng hợp, độ tin thấp [25] |

**Nhận định:** Con người mang lại phán đoán và độ thật (xem §4, nghiên cứu RE 2026 [8]). Nhưng họ đắt (NN/g) hoặc không có cấu trúc (ADPList miễn phí nhưng chỉ tư vấn nghề). Ở VN, khóa UX tốt nhất có dạy phỏng vấn nhưng chỉ vài buổi. Điều này hợp với định vị "bổ trợ, không thay thế" và gợi ra một kênh: **làm bài tập luyện giữa các buổi của khóa học** (suy luận, chưa kiểm).

## 3. Người học nói gì về việc luyện phỏng vấn

**Kết luận:** Nỗi đau có thật nhưng **bằng chứng từ chính người học còn mỏng**. Qua hai vòng tìm kiếm chỉ thu được khoảng 6 người học UX/PM, chủ yếu từ một loại cộng đồng (Medium Bootcamp, Substack). Nguồn học thuật mạnh hơn: người mới mắc lỗi có hệ thống [32]. **Chưa tìm thấy ai nói thẳng "tôi ước có phản hồi cho buổi phỏng vấn của mình".** Tiếng nói người học BA và người học VN: **0**. Reddit không truy cập được bằng công cụ của lượt chạy này, nên đây là lỗ hổng phương pháp chứ không phải bằng chứng vắng mặt.

| Vai trò | Khó khăn quan sát được | Bằng chứng | Độ tin |
|---|---|---|---|
| UX / sinh viên | Có một thể loại bài "buổi phỏng vấn đầu tiên của tôi là một mớ hỗn độn" (≥5 tác giả khác nhau). Lỗi hay gặp: hồi hộp, hỏi đúng thứ tự kịch bản dù người dùng đã trả lời, lấp khoảng lặng quá nhanh, vào đề lạnh không khởi động, chỉ phỏng vấn bạn cùng lớp | [41] (chỉ tiêu đề và snippet, không đọc được Medium) | thấp |
| UX / sinh viên (VN, lời giảng viên) | Câu hỏi dẫn dắt, không hỏi sâu ("Tại sao?", "Bạn có thể nói rõ hơn không?"), không để người dùng nói tự do | [42] | thấp–trung bình |
| PM (người chuyển ngành) | "My first few user discovery interviews were terrifying"; "I stumbled and mumbled through my questions and follow-ups"; "I filtered for what I wanted to hear"; phát hiện bài test của mình có lỗi *sau khi* đã tổng hợp xong | [50] (bài gốc, đọc đầy đủ) | cao (một người) |
| PM / founder | Dẫn dắt khách hàng "to the answers they want to hear" (quan sát của người làm nghề); founder rao "trade" phỏng vấn để luyện, nhưng thread chỉ có 1 trả lời và nói về chuyện tìm người phỏng vấn chứ không phải kỹ năng | [55][43] | trung bình / yếu |
| BA (VN, lời người làm nghề) | "Nếu bạn mới chỉ là Fresher BA, việc bạn không thể khai thác đúng, đủ thông tin là việc rất bình thường" [51]. Văn viết VN thường **đổ lỗi cho stakeholder** ("nhiều khách hàng không thể diễn đạt chính xác họ muốn gì") thay vì kỹ năng người hỏi [52] | [51][52] | trung bình (ngôi thứ ba) |
| Mọi vai trò | Lời khuyên của người làm nghề là nhờ quản lý hoặc đồng nghiệp nghe lại buổi phỏng vấn và góp ý, tức là phản hồi **phụ thuộc vào việc có người xem lại**. Công ty như GitLab phải lập hẳn chương trình luyện chính thức | [54][44] | thấp |

Những gì đủ chuẩn "hai cộng đồng độc lập": chỉ có **câu hỏi dẫn dắt** và **không hỏi đủ sâu**, xuất hiện ở blog UX tiếng Anh, tài liệu đào tạo VN [41][42] và nghiên cứu RE [32]. Nhu cầu "muốn có phản hồi sớm hơn" chỉ là **suy luận** từ [50] và [32].

**Hệ quả cho thông điệp:** người học nói bằng ngôn ngữ **sợ hãi và lỗi nhìn lại sau** ("terrifying", "mess", "mistakes"), không bằng ngôn ngữ "thiếu phản hồi". Headline nên chạm vào nỗi sợ trước buổi thật và việc bắt lỗi *trước* khi nó tốn công, không nên chạm vào "feedback". Với BA ở VN, cần đổi khung từ "khách hàng không nói rõ" sang "câu hỏi của bạn quyết định họ nói được gì". Đây là một thuyết phục khó hơn và chưa được kiểm chứng.

## 4. Bằng chứng cho role-play có thông tin ẩn

**Kết luận:** Role-play với bệnh nhân chuẩn hóa (SP) có hiệu quả, nhưng **phản hồi và lặp lại mới là đòn bẩy**, không phải bản thân mô phỏng. Chưa có nghiên cứu nào tách riêng cơ chế "thông tin chỉ lộ khi được hỏi". Replay từ khoảnh khắc chỉ có bằng chứng gián tiếp.

- **Hiệu quả SP trên kỹ năng giao tiếp:** SMD 0,74 (KTC 95% 0,37–1,11), n=2061, 10 nghiên cứu được gộp, dị biệt cao [5]. Số liệu lấy từ abstract, chưa đọc full text (độ tin trung bình). Kaplonyi 2017 thấy phần lớn nghiên cứu có cải thiện đáng kể, nhưng kết quả quá khác nhau để gộp [27].
- **Đòn bẩy thiết kế:** trong mô phỏng y khoa, phản hồi cho ES 0,44 (80 nghiên cứu). Lặp lại cho ES 0,68 (7 nghiên cứu, không có ý nghĩa thống kê) [26].
- **Luyện với AI mà không có phản hồi có thể gây hại.** RCT n=94 cố vấn mới vào nghề: nhóm luyện với LLM kèm phản hồi LLM cải thiện kỹ năng phản ánh và đặt câu hỏi. Nhóm chỉ luyện thì không tiến bộ, và độ đồng cảm giảm dần [6] (đã kiểm độc lập). Brügge 2024 (RCT n=21): phản hồi AI cải thiện ra quyết định lâm sàng, partial η² 0,198, nhưng mẫu rất nhỏ [29]. Một RCT khác (n=84) với bệnh nhân số LLM: điểm hỏi bệnh sử cao hơn 10,5 điểm so với dạy truyền thống [31] (lấy từ snippet).
- **Thông tin ẩn bị rò khi chỉ dựa vào prompt.** Một benchmark bệnh nhân ảo gpt-4o-mini đạt độ trung thành ca bệnh F1 0,947, nhưng vẫn rò thông tin cấm khoảng 0,6 lần mỗi episode ngay trong điều kiện sạch. Trong điều kiện "direct contamination" (nhiễm trực tiếp), độ trung thành sụp còn 0,098 [7]. Đây là benchmark một tác giả và không đo việc học.
- **Persona bám tài liệu cố định có lợi.** Một stakeholder tự động có grounding RAG trên tài liệu ca của giảng viên (n=69 sinh viên) giúp sinh viên đặt câu hỏi elicitation tốt hơn và nhận diện tính năng đầy đủ hơn so với người đóng vai. Tuy vậy, sinh viên đánh giá người thật là **thật và cuốn hút hơn** [8] (đã kiểm độc lập). Đây là tương tự gần nhất với ý tưởng.
- **Nỗi đau của người mới là có thật trong dữ liệu học thuật.** Sinh viên phỏng vấn elicitation với khách hàng đóng vai mắc các lỗi thuộc 7–8 nhóm (con số 34 loại lấy từ snippet). Khó nhất là cách đặt câu hỏi, **câu hỏi bị bỏ sót**, và thứ tự hỏi. Nhóm tác giả sau đó dạy bằng cách kết hợp role-play, tự đánh giá và peer-review để sinh viên nhìn lại lỗi của mình. Nhận định "không tiến bộ qua ba buổi nếu không phản tư" lấy từ snippet và **chưa kiểm được** vì full text nằm sau tường đăng nhập. "Question omission" tương ứng trực tiếp với "khoảnh khắc bị lỡ".
- **Replay / "làm lại":** rapid cycle deliberate practice (dừng, debrief, tua lại, thử lại) chỉ có bằng chứng trong hồi sức cấp cứu, độ chắc chắn RẤT THẤP [28]. **Chưa có bằng chứng nào cho kỹ năng hội thoại.**
- **Bằng chứng về dạng phản hồi trích theo lượt so với phản hồi tổng quát:** không tìm thấy.
- Tổng quan 39 nghiên cứu về bệnh nhân ảo LLM: nguy cơ sai lệch trung bình, cỡ mẫu nhỏ, hallucination là thách thức được nêu tên [30]. **Chưa nghiên cứu nào chứng minh kỹ năng chuyển sang được với người thật.**

## 5. Phê phán synthetic users và rủi ro neo/mồi trước fieldwork

- **NN/g** so sánh Synthetic Users và ChatGPT với ba nghiên cứu phỏng vấn thật. Synthetic users xu nịnh và lý tưởng hóa: họ "completed all courses", trong khi người thật chỉ xong 3/7. Họ đưa danh sách tính năng dài không có ưu tiên và khen concept không phê phán. NN/g chấp nhận dùng chúng để sinh giả thuyết và **pilot bộ câu hỏi phỏng vấn** [9]. Ngoại lệ này tương thích với định vị "chỉ luyện kỹ năng".
- **Wang et al. (Nature Machine Intelligence 2025, 3.200 người thật):** LLM "đóng vai" một nhóm nhân khẩu học thì mô tả sai nhóm đó và làm phẳng sự đa dạng trong nhóm [33].
- **Neo/mồi:** thí nghiệm kinh điển Snyder & Swann (1978) cho thấy người phỏng vấn được gán giả thuyết sẽ chọn câu hỏi xác nhận giả thuyết [10]. Kết quả này bị tranh cãi: Pennington 1987 báo cáo không tái lập được khi phỏng vấn trực tiếp [34]. **Không tìm thấy nghiên cứu nào cho thấy luyện với persona AI làm lệch giả định của người học về người dùng thật** [10]. Rủi ro này là suy luận hợp lý, chưa được chứng minh.
- **Hệ quả cho định vị:** phê phán tập trung vào việc *thay thế* nghiên cứu thật. Sản phẩm không sinh phát hiện về người dùng thật và dùng persona cùng lĩnh vực nhưng khác câu hỏi. Cách này đứng về phía đồng thuận của giới phê bình, nên có thể biến thành thông điệp khác biệt so với Synthetic Users và UXPressia [2][4][9].

## 6. Cách stakeholder thực sự nói: tư liệu cho bộ sinh kịch bản BA/PM

**Nguồn mạnh nhất:** nghiên cứu định tính JMIR 2025 gồm 26 phỏng vấn điều dưỡng và bác sĩ ở Đức và Mỹ, có trích dẫn nguyên văn về workaround [35]. Các nguồn ERP/shadow system chủ yếu là blog nhà cung cấp (độ tin thấp) [38][39][40]. Nguồn PM là tóm tắt The Mom Test [37].

**Danh mục mẫu lời nói (nguyên văn khi có; "suy ra" nghĩa là khuôn được trừu tượng hóa từ nguồn):**

| # | Mẫu | Ví dụ | Nguồn |
|---|---|---|---|
| 1 | Excel ngầm gắn với khoảng trống hệ thống | "We built an Excel list… This is what [HIS] in its present version cannot provide." | [35] |
| 2 | Bỏ bước theo điều kiện | "you deliberately omit this if you know your patient will be admitted as inpatient anyway" | [35] |
| 3 | Ngoại lệ lúc quá tải | "Whenever it's a really stressful day… I reduce documentation, or leave things out." | [35] |
| 4 | Hệ thống đánh dấu, con người mới là kiểm soát thật | "the system… marks it red, but there is no notification… the laboratory has the instruction to call." | [35] |
| 5 | Không tin dữ liệu, kiểm tra song song | "I can't rely on anything at all to be up to date." | [35] |
| 6 | Ngoại lệ theo khung giờ | "at night it becomes difficult, there is an emergency on-call service, but it is only for emergencies." | [35] |
| 7 | Nhập kép | "I already have to operate two systems." | [35] |
| 8 | Triển khai áp đặt, không ai vẽ quy trình | "'We have the system now, please all work with it from today'." | [35] |
| 9 | Kiến thức truyền miệng | "they always prefer the snowball system." | [35] |
| 10 | Dùng login đồng nghiệp, nhập sai trường, nhập trễ | (mô tả, không có nguyên văn) | [35] |
| 11 | **Một người duyệt duy nhất, điểm nghẽn ẩn** | "There's one member of staff who approves my orders. When she's not in then whatever I've ordered just waits until she's around to approve it" | [53] |
| 12 | Bước duyệt mới làm tắc | "Now my orders have to be approved which has gummed the works up… orders that have been on more than a week" | [53] |
| 13 | **Vượt luật vì "biết là đúng"** | "I am defying all the rules, when it comes to ordering I do my ordering because I know it's right" | [53] |
| 14 | Tự phê duyệt khi khẩn cấp | "I had to make my own decision…. I phoned the company, submitted my name to them" | [53] |
| 15 | Kênh quan hệ thay kênh chính thức | "I have a very good relationship, so I can phone up any of these suppliers and talk to their managers" | [53] |
| 16 | Ủy quyền ngầm | "I assist the matron, the clinical sisters with ordering items, because I know at the moment we're quite short staffed" (lý do là thiếu người) | [53] |
| 17 | Quy trình hỏng dẫn tới thay thế tốn kém | "If we have no [bus] tickets we have been known to have to call an ambulance for someone" | [53] |
| 18 | Yêu cầu chết trong hàng đợi | "took about 3 months. I had to email, and then it got cancelled" | [53] |
| 19 | Xuất báo cáo ra Excel vì ERP không cho | suy ra | [39] (nhà cung cấp) |
| 20 | Thiếu trường, ticket IT chậm, nên giữ trong sheet | suy ra | [40] (nhà cung cấp) |
| 21 | Nói bằng danh từ hóa giấu tác nhân ("rồi nó đi qua phê duyệt") | suy ra | [36] |
| 22 | PM: thói quen chung chung / hứa tương lai ("I usually", "I would") | dấu hiệu có nguồn | [37] |
| 23 | PM: khen lịch sự ("That sounds great, I'd totally use that") | có nguồn | [46] |
| 24 | PM: nhu cầu nói ra che job thật (xin dashboard tùy biến, thật ra chỉ cần "pretty charts to show their own clients each week") | có nguồn (giai thoại) | [37] |

**Chưa có nguồn:** câu nói về **ngưỡng tiền phê duyệt** kiểu "dưới X thì tôi tự ký". Không tìm được qua hai vòng. Bộ sinh kịch bản nên coi mẫu này là giả định, hoặc dựa vào mẫu 11–16 (có nguồn) thay thế.

**Quy tắc sinh kịch bản rút ra được:**
1. **Nói bằng danh từ hóa để giấu tác nhân.** Theo Grammar-targeted Interview Method, giả định ngầm nằm trong cụm danh từ như "rồi nó đi qua phê duyệt". Persona nên nói như vậy, và phản hồi thưởng cho người học biết mở ra "ai duyệt cái gì, khi nào, ngưỡng bao nhiêu" [36]. Quy tắc này ánh xạ thẳng vào `boundary-probe`.
2. **"Hệ thống làm X, nhưng thực tế là Y" luôn đi kèm một khoảng trống cụ thể của hệ thống** (không có thông báo, không có trường dữ liệu, báo cáo không xuất được) cộng một bù đắp của con người (gọi điện, Excel, nhập kép) [35][38]. Đây là khuôn tốt cho item mở bằng "chuyện quá khứ".
3. **Ngoại lệ gắn với điều kiện** (ngày bận, ban đêm, "nếu biết đằng nào cũng…") [35] là chất liệu tự nhiên cho item mở bằng follow-up.
4. **Kiến thức truyền miệng** ("snowball system") [35] giải thích vì sao quy trình thật không có trong tài liệu, và hợp với item mở bằng tin tưởng.
5. **PM:** các dấu hiệu "fluff" như "I usually", "I would", "I might" và lời khen lịch sự "that sounds great, I'd totally use that" [37][46] cho persona PM chất liệu để thưởng người học biết kéo về một lần cụ thể trong quá khứ.

## 7. Tín hiệu giá: ai trả tiền

| Mốc giá | Con số | Nguồn |
|---|---|---|
| Thay thế rẻ nhất tại VN | ChatGPT Go 132.000 VND/tháng; Plus share ~150.000 VND; Plus chính chủ ~571.000 VND; không có giảm giá sinh viên chính thức | [14] |
| Mentoring | ADPList miễn phí | [18] |
| Khóa UX tại VN (trọn gói) | 2,2 triệu (ColorME, 8 buổi) – 5,2–5,8 triệu (Keyframe, 12 buổi) – 9,99 triệu VND (Capi Demy, 16 buổi, có buổi phỏng vấn) | [11][12][13] |
| Khóa BA tại VN | ~3,2–12 triệu VND (trang tổng hợp) | [25] |
| Công cụ luyện AI cho cá nhân (toàn cầu) | $0 / $8 / $20 mỗi tháng, thanh toán theo năm (Yoodli, gói miễn phí giới hạn số buổi) | [3] |
| Roleplay B2B | ~$63–70/seat/tháng (độ tin thấp) | [16] |
| Khóa luyện có người (toàn cầu) | US$1.215/ngày (NN/g) | [17] |
| Kênh qua trường | Yoodli được trung tâm hướng nghiệp University of Washington dùng (cho phỏng vấn xin việc) | [47] |

**Đọc tín hiệu (suy luận từ các mốc trên, chưa kiểm):** Với sinh viên VN, sản phẩm thay thế trực tiếp gần như miễn phí (ChatGPT 0–150k/tháng, ADPList 0đ). Nếu sinh viên tự trả thì giá phải ngang mức một tháng ChatGPT Go, tức khoảng 100–200k VND cho một gói prep-sprint. Trong khi đó, sinh viên VN vẫn trả 2–10 triệu cho khóa có cấu trúc. Vì vậy **B2B2C** (trung tâm đào tạo hoặc giảng viên HCI mua theo lớp, làm bài tập giữa các buổi học phỏng vấn) có sức mua cao hơn nhiều so với B2C. Tiền lệ Yoodli ở trung tâm hướng nghiệp đại học ủng hộ hướng này nhưng ở một kỹ năng khác [47]. Chưa có dữ liệu WTP trực tiếp nào.

## Insight liên chiều

1. **Khoảng trống cạnh tranh trùng đúng chỗ bằng chứng mạnh nhất.** Đối thủ gần nhất (UXPressia [4], ChatGPT tự dựng [20][21]) cho *luyện* nhưng không cho *phản hồi*. Còn bằng chứng mạnh nhất (§4) nói rằng luyện không có phản hồi thì không tiến bộ, thậm chí làm độ đồng cảm giảm [6], và phản hồi mới là đòn bẩy [26]. Vì vậy thông điệp khác biệt nên là "luyện *kèm* bằng chứng bạn sai ở đâu" chứ không phải "luyện với AI". Ý này mạnh hơn ẩn dụ buồng mô phỏng bay đứng một mình.
2. **"Tin cậy theo cấu trúc" không phải trang trí mà là điều kiện để chạy được.** Prompt-only rò thông tin ẩn khoảng 0,6 lần mỗi episode [7]. Đó chính là điểm yếu của ChatGPT tự dựng, và là lý do một bộ đếm niêm phong kèm replay mới có thể "chứng minh được". Việc forged-idea chọn cho persona chỉ thấy các item đã mở là cách giảm nhẹ đúng với lỗi mà benchmark đo được. Phải đo lại bằng eval adversarial của chính sản phẩm.
3. **Độ thật là điểm yếu chung của mọi persona AI, và nó chồng lên rủi ro BA/PM không có người làm nghề kiểm tra.** Sinh viên đánh giá người thật "thật hơn" dù persona RAG dạy tốt hơn [8]. Synthetic users xu nịnh và phẳng [9][33]. Danh mục §6 có nguồn, nhưng từ y tế và mua sắm công, không phải phần mềm doanh nghiệp VN. Kịch bản BA/PM do AI soạn sẽ đi đúng vào vùng yếu nhất.
4. **Định vị đạo đức cũng chính là định vị cạnh tranh.** Giới phê bình tấn công việc *thay thế* nghiên cứu [9][33], trong khi đối thủ có vốn nhất bán đúng thứ đó [2]. Còn NN/g thì cho phép dùng để pilot bộ câu hỏi [9]. Câu "chỉ đánh giá kỹ năng người học" vừa là ranh giới đạo đức, vừa là thông điệp tách mình khỏi Synthetic Users.
5. **Giá và nỗi đau cùng đẩy về B2B2C.** Người học không tự nói "cần feedback" (§3), sản phẩm thay thế B2C gần như miễn phí (§7), còn khóa học và giảng viên thì đã trả tiền cho việc dạy phỏng vấn [11]. Người mua có động cơ rõ nhất là người dạy (suy luận, chưa kiểm).

## Đánh giá các giả định trong forged-idea.md

| Giả định | Trạng thái | Căn cứ |
|---|---|---|
| Khác biệt so với ChatGPT: trạng thái cố định và replay chứng minh được | **Ủng hộ một phần**: LLM chỉ dùng prompt rò thông tin ẩn [7]; ChatGPT tự dựng là cách thay thế phổ biến [20][21]. Nhận định "ChatGPT bịa tảng băng sau buổi" chưa được kiểm trực tiếp | [7][20][21] |
| Replay là bằng chứng khác biệt duy nhất | **Ủng hộ về cạnh tranh** (không đối thủ nào có [1]); **chưa kiểm về hiệu quả học** (RCDP chỉ có trong hồi sức, độ chắc chắn rất thấp [28]) | [1][28] |
| Phản hồi tính từ ledger, có căn cứ | **Ủng hộ**: phản hồi là đòn bẩy [26]; thiếu phản hồi thì đứng yên [6]. Dạng trích theo lượt cụ thể thì chưa kiểm | [6][26][29] |
| Tin cậy theo cấu trúc (persona chỉ thấy item đã mở) | **Ủng hộ** bởi bằng chứng rò rỉ [7] và lợi ích của grounding [8] | [7][8] |
| OSCE/SP làm trích dẫn uy tín | **Ủng hộ, kèm lưu ý**: SMD 0,74 là cho SP nói chung, không cho cơ chế thông tin ẩn [5]. Không nên nói "đã chứng minh" | [5][27] |
| "Bổ trợ, không thay thế" con người | **Ủng hộ**: người thật được đánh giá thật hơn [8]; NN/g [9] | [8][9] |
| Beachhead: sinh viên HCI/UX năm cuối ở VN | **Chưa kiểm**: không có tiếng nói người học VN; khóa UX ở VN có dạy phỏng vấn [11] (có nhu cầu học, chưa rõ nhu cầu luyện thêm) | [11] |
| UX/BA/PM đều first-class | **Chưa kiểm / bị thách thức về nhu cầu**: 0 tiếng nói người học BA; văn viết BA ở VN đổ lỗi cho stakeholder [52]; không có simulator BA nào [19] (khoảng trống nhưng chưa có cầu) | [19][51][52] |
| Persona sinh từ câu hỏi nghiên cứu gây neo giả thuyết | **Chưa kiểm**: không có bằng chứng trực tiếp; nền kinh điển còn tranh cãi [10][34]. Quyết định "cùng lĩnh vực, khác câu hỏi" là thận trọng hợp lý, không nên quảng bá như điều đã có bằng chứng | [10][34] |
| AI soạn kịch bản BA/PM, không cần người làm nghề duyệt | **Bị thách thức**: độ thật là điểm yếu đã được đo [8][9]; mẫu phê duyệt theo ngưỡng tiền chưa có nguồn; danh mục §6 lệch về y tế | [8][35][53] |
| Không nói mềm với người mới | **Chưa kiểm**: không tìm thấy bằng chứng về giọng điệu phản hồi | – |
| Ai trả tiền: sinh viên VN, gói prep-sprint | **Bị thách thức**: mốc thay thế là 0–150k VND/tháng [14], ADPList 0đ [18]; khóa học 2–10 triệu [11][12][13] gợi ý hướng B2B2C | [11][14][18] |
| Headline "Practice on ours. Walk into yours prepared." | **Tương thích** với ngoại lệ pilot của NN/g [9] và ngôn ngữ sợ hãi trước buổi thật của người học [50] | [9][50] |

## Khuyến nghị

1. **Định vị: "phòng tập phỏng vấn người dùng / stakeholder có phản hồi kèm bằng chứng"**, tách khỏi "synthetic users". Tránh cụm "UX interview practice" vì đã bị gắn với phỏng vấn xin việc [22]. Tiếng Việt nên dùng "user interview" hoặc "phỏng vấn người dùng", vì "phỏng vấn" đứng một mình bị hiểu là xin việc (quan sát tìm kiếm, §3). *Feeds: brief (định vị), GTM copy.* Độ tin: trung bình–cao.
2. **Đưa phản hồi lên headline phụ, nhưng bằng ngôn ngữ của người học:** "bắt lỗi trước buổi thật" thay vì "feedback" [6][50]. *Feeds: copy ra mắt.* Độ tin: trung bình (tiếng nói người học mỏng).
3. **Giữ nguyên tin cậy theo cấu trúc và đưa tỉ lệ rò (leak/episode) vào eval harness như một chỉ số**, lấy benchmark [7] làm mốc so sánh. *Feeds: PRD (NFR), eval.* Độ tin: cao.
4. **Không tuyên bố replay "có bằng chứng khoa học".** Trình bày nó là thiết kế lấy cảm hứng từ deliberate practice. OSCE chỉ dùng ở mức "cùng họ phương pháp" [5][28]. *Feeds: copy, pitch.* Độ tin: cao.
5. **Bộ sinh kịch bản BA/PM:** nạp danh mục §6 làm tài liệu grounding. Ưu tiên mẫu 11–16 (phê duyệt) và 1–9 (workaround). Đưa quy tắc danh từ hóa [36] vào luật boundary-probe. Đánh dấu mẫu "ngưỡng tiền" là chưa có nguồn. Vẫn nên tìm 1–2 BA thật để kiểm tra nhẹ, vì độ thật là điểm yếu đã được đo [8]. *Feeds: pipeline sinh kịch bản.* Độ tin: trung bình.
6. **Thử hướng B2B2C song song với B2C:** dùng waitlist đo WTP của sinh viên, đồng thời hỏi 2–3 giảng viên HCI hoặc trung tâm (ví dụ các khóa có buổi user interview [11]) về việc dùng làm bài tập. *Feeds: câu hỏi mở "ai trả tiền".* Độ tin: thấp (suy luận từ mốc giá).
7. **Giám sát mom-test** như prior art mở mã nguồn: nếu nó được đóng gói thành web app, khác biệt còn lại sẽ là replay, UX/BA và tiếng Việt [1]. *Feeds: battlecard.* Độ tin: trung bình.

## Câu hỏi mở

- **Người học VN và người học BA có thật sự thấy đau không?** Cần 5–8 phỏng vấn nhanh với sinh viên HCI năm cuối và fresher BA, hoặc thu thập trong group Facebook (công cụ không truy cập được).
- **Người học có muốn phản hồi không, hay chỉ muốn bớt sợ?** Chưa có câu nói trực tiếp nào. Cần phỏng vấn hoặc khảo sát, hoặc đo hành vi (tỉ lệ mở màn reveal và replay).
- **Tiếng nói trên Reddit** (r/UXResearch, r/businessanalysis): bị chặn ở lượt này. Có thể dùng Draft prompt cho công cụ deep-research của bạn, hoặc browser.
- **Giá sẵn lòng trả thực tế ở VN:** chưa có dữ liệu. Waitlist kèm giá thử, và phỏng vấn giảng viên.
- **Replay có cải thiện kỹ năng hội thoại không?** Chưa có nghiên cứu. Có thể tự đo bằng A/B trong sản phẩm (tỉ lệ mở item ở buổi sau).
- **Mẫu lời nói về ngưỡng tiền phê duyệt:** chưa có nguồn. Tìm trong tài liệu process mining hoặc kiểm toán nội bộ, hoặc hỏi một BA.
- Chưa kiểm được: số liệu chính xác của Cook 2011, giá Second Nature/Exec, giá IDF/Coursera hiện tại, trang giá chính chủ của các trung tâm BA ở VN.

## Phụ lục nguồn

| [n] | Hỗ trợ | Nhà xuất bản | Ngày xuất bản | Truy cập | Độ tin |
|---|---|---|---|---|---|
| [1] | mom-test: hidden facts, scorecard /75, debrief theo lượt, không có replay | [GitHub sreshtalluri/mom-test](https://github.com/sreshtalluri/mom-test) | không ghi ngày | 2026-09-22 | cao (đọc 2 lần độc lập) |
| [2] | Synthetic Users từ $12.500/năm, định vị co-pilot | [Synthetic Users](https://www.syntheticusers.com/pricing) | không ghi ngày | 2026-09-22 | cao |
| [3] | Giá Yoodli cho cá nhân | [Yoodli](https://www.yoodli.ai/pricing) | không ghi ngày | 2026-09-22 | cao |
| [4] | UXPressia định vị "practice conversations" | [UXPressia](https://uxpressia.com/ai-persona-chat) | không ghi ngày | 2026-09-22 | cao |
| [5] | SP: SMD 0,74, n=2061 | [Simulation in Healthcare (PubMed)](https://pubmed.ncbi.nlm.nih.gov/39692563/) | 2024-12 | 2026-09-22 | trung bình |
| [6] | RCT n=94: luyện kèm phản hồi và luyện không phản hồi | [arXiv 2505.02428 (Louie et al.)](https://arxiv.org/abs/2505.02428) | 2026-03 (v2) | 2026-09-22 | cao (preprint) |
| [7] | Rò thông tin ẩn ~0,6/episode | [Cureus (Harada), PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC13278464/) | 2026-05 | 2026-09-22 | trung bình (một benchmark) |
| [8] | Stakeholder RAG so với người đóng vai, n=69 | [Requirements Engineering / arXiv 2609.12576](https://arxiv.org/abs/2609.12576) | 2026 | 2026-09-22 | cao |
| [9] | NN/g phê phán synthetic users; ngoại lệ pilot | [Nielsen Norman Group](https://www.nngroup.com/articles/synthetic-users/) | 2024-06-21 | 2026-09-22 | cao |
| [10] | Thiên kiến xác nhận trong phỏng vấn (kinh điển) | [Snyder & Swann, JPSP (bản in lại)](http://www.communicationcache.com/uploads/1/0/8/8/10887248/hypothesis-testing_processes_in_social_interaction.pdf) | 1978 | 2026-09-22 | trung bình |
| [11] | Capi Demy UX 9,99 triệu VND, có buổi user interview | [Capi Demy](https://capidemy.com/course/ux-design) | không ghi ngày | 2026-09-22 | cao |
| [12] | ColorME UI 2,2 triệu VND | [ColorME](https://colorme.vn/course/ui-ux) | không ghi ngày | 2026-09-22 | cao |
| [13] | Keyframe 5,22–5,8 triệu VND | [Keyframe](https://keyframe.vn/khoa-hoc-offline/khoa-hoc-thiet-ke-ux-ui-digital-product-design-39.html) | không ghi ngày | 2026-09-22 | cao |
| [14] | Giá ChatGPT tại VN (Go 132k, share 150k, Plus 571k) | [BestApp](https://bestapp.vn/blog/chatgpt-plus-cho-sinh-vien-2026-go-vs-plus-share) | 2026 | 2026-09-22 | trung bình |
| [15] | PEARL, n=4 | [IJIOE](https://onlineinnovationsjournal.com/forthcoming_articles/51770.html) | 2024-02-23 | 2026-09-22 | cao |
| [16] | Giá Hyperbound (bài review của đối thủ) | [Outdoo](https://www.outdoo.ai/blog/hyperbound-review-and-pricing) | 2026 | 2026-09-22 | thấp |
| [17] | Khóa NN/g User Interviews $1.215 | [Nielsen Norman Group](https://www.nngroup.com/courses/user-interviews/) | không ghi ngày | 2026-09-22 | cao |
| [18] | ADPList miễn phí, 40.000+ mentor | [ADPList](https://adplist.org/mentors) | 2026 | 2026-09-22 | cao |
| [19] | IIBA: AI đóng vai stakeholder persona | [IIBA](https://www.iiba.org/business-analysis-blogs/enrich-business-analysis-experience-for-your-stakeholders-using-ai-tools/) | không ghi ngày | 2026-09-22 | trung bình |
| [20] | Persona ChatGPT cho mock interview | [Contentsquare](https://contentsquare.com/guides/user-interviews/ai/) | không ghi ngày | 2026-09-22 | trung bình |
| [21] | Template tự dựng môi trường luyện phỏng vấn | [Substack (maryma)](https://maryma.substack.com/p/build-your-ai-interview-practice) | không ghi ngày | 2026-09-22 | trung bình |
| [22] | Trùng tên "UX interview practice" với phỏng vấn xin việc | [Mockin](https://mockin.work/) | không ghi ngày | 2026-09-22 | trung bình |
| [23] | Whalen: synthetic users là "chuẩn bị gặp người thật" | [UserTesting podcast](https://www.usertesting.com/resources/podcast/ai-in-ux-research) | 2025-10-06 | 2026-09-22 | trung bình |
| [24] | Continuous Interviewing: 5 buổi live | [Product Talk](https://learn.producttalk.org/continuous-interviewing) | không ghi ngày | 2026-09-22 | trung bình |
| [25] | Giá khóa BA tại VN (tổng hợp) | [SOM](https://som.edu.vn/khoa-hoc-business-analyst/) | không ghi ngày | 2026-09-22 | thấp |
| [26] | Phản hồi ES 0,44; lặp lại 0,68 | [Medical Teacher (Cook 2013)](https://pubmed.ncbi.nlm.nih.gov/22938677/) | 2013 | 2026-09-22 | trung bình |
| [27] | Kaplonyi 2017: SP cải thiện giao tiếp | [Medical Education (PubMed)](https://pubmed.ncbi.nlm.nih.gov/28833360/) | 2017 | 2026-09-22 | trung bình |
| [28] | RCDP: độ chắc chắn rất thấp, chỉ trong hồi sức | [Resuscitation Plus](https://pubmed.ncbi.nlm.nih.gov/38757054/) | 2024 | 2026-09-22 | trung bình |
| [29] | Brügge RCT n=21, phản hồi AI | [BMC Medical Education](https://pmc.ncbi.nlm.nih.gov/articles/PMC11605890/) | 2024 | 2026-09-22 | cao (mẫu nhỏ) |
| [30] | Tổng quan 39 nghiên cứu bệnh nhân ảo LLM | [JMIR Medical Informatics](https://medinform.jmir.org/2026/1/e79039) | 2026-01-02 | 2026-09-22 | trung bình–cao |
| [31] | RCT n=84: bệnh nhân số LLM, +10,5 điểm | [npj Digital Medicine](https://www.nature.com/articles/s41746-025-01841-6) | 2025 | 2026-09-22 | trung bình |
| [32] | Loại lỗi elicitation của người mới (một phần chưa kiểm được) | [Requirements Engineering (Bano et al.)](https://link.springer.com/article/10.1007/s00766-019-00313-0) | 2019 | 2026-09-22 | trung bình |
| [33] | LLM mô tả sai và làm phẳng nhóm nhân khẩu học | [Nature Machine Intelligence](https://www.nature.com/articles/s42256-025-00986-z) | 2025 | 2026-09-22 | cao |
| [34] | Không tái lập được Snyder & Swann khi phỏng vấn trực tiếp | [BJSP (Pennington)](https://bpspsychub.onlinelibrary.wiley.com/doi/abs/10.1111/j.2044-8309.1987.tb00784.x) | 1987 | 2026-09-22 | trung bình–thấp |
| [35] | Trích dẫn workaround nguyên văn (26 phỏng vấn) | [JMIR, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12282938/) | 2025 | 2026-09-22 | cao |
| [36] | Danh từ hóa giấu giả định ngầm (GIM) | [European Journal of Information Systems](https://www.tandfonline.com/doi/full/10.1057/ejis.2010.1) | 2010 | 2026-09-22 | trung bình |
| [37] | Dấu hiệu fluff kiểu Mom Test; giai thoại dashboard | [mtlynch.io](https://mtlynch.io/book-reports/the-mom-test/) | không ghi ngày | 2026-09-22 | trung bình |
| [38] | Truy từng shadow system về khoảng trống cụ thể | [Panorama Consulting](https://www.panorama-consulting.com/how-to-prevent-duplicate-data-entry-by-eliminating-erp-shadow-systems/) | không ghi ngày | 2026-09-22 | thấp–trung bình |
| [39] | Xuất báo cáo từ ERP ra Excel | [ERPVAR](https://www.erpvar.com/blog/why-spreadsheet-shadow-systems-creep-in-around-your-erp) | không ghi ngày | 2026-09-22 | thấp |
| [40] | Thiếu trường nên dùng spreadsheet | [Datamondial](https://www.datamondial.com/en/logistics-shadow-back-office-data-quality/) | không ghi ngày | 2026-09-22 | thấp |
| [41] | Thể loại bài "buổi phỏng vấn đầu tiên hỏng" | [Medium, Bootcamp](https://medium.com/design-bootcamp/my-first-user-research-was-a-mess-heres-what-i-learned-bb9a39027b3f) | không ghi ngày | 2026-09-22 | thấp (snippet) |
| [42] | Lỗi người mới theo giảng viên VN | [Capidemy](https://capidemy.com/capi-news/user-interview-la-gi-huong-dan-phong-van-nguoi-dung-trong-ux-research) | không ghi ngày | 2026-09-22 | thấp–trung bình |
| [43] | HN "trade customer discovery interviews" | [Hacker News](https://news.ycombinator.com/item?id=24634673) | 2020-09-30 | 2026-09-22 | trung bình (yếu) |
| [44] | GitLab Interview Carousel | [GitLab Handbook](https://handbook.gitlab.com/handbook/product/ux/ux-research/interview-carousel) | không ghi ngày | 2026-09-22 | thấp |
| [46] | "That sounds great, I'd totally use that" | [Koji](https://www.koji.so/blog/mom-test-customer-interviews-2026) | 2026 | 2026-09-22 | thấp |
| [47] | Yoodli ở trung tâm hướng nghiệp UW | [UW Career Center](https://careers.uw.edu/blog/2025/01/08/test-tags/) | 2025-01-08 | 2026-09-22 | trung bình |
| [50] | Người học PM: "terrifying", "filtered for what I wanted to hear" | [Finance to Tech (Substack)](https://financetotech.substack.com/p/how-to-conduct-user-interviews) | 2023-04-30 | 2026-09-22 | cao (một người) |
| [51] | Fresher BA khai thác thiếu thông tin là bình thường | [Viblo](https://viblo.asia/p/fba-2-cach-ba-khai-thac-thong-tin-tu-stakeholder-elicitation-5OXLAYQkLGr) | 2023-04-02 | 2026-09-22 | trung bình |
| [52] | Khung "khách hàng không diễn đạt được" | [NCC ANT](https://ant.ncc.plus/nhung-kho-khan-ma-1-ba-co-the-gap-phai/) | 2025-06-02 | 2026-09-22 | trung bình |
| [53] | Trích dẫn nguyên văn về phê duyệt và workaround (NHS, 15 người) | [BMC Health Services Research (PubMed)](https://pubmed.ncbi.nlm.nih.gov/34645449/) | 2021 | 2026-09-22 | cao |
| [54] | Nhờ quản lý hoặc đồng nghiệp nghe lại để góp ý | [dscout People Nerds](https://dscout.com/people-nerds/tips-master-researcher-participant-interviews) | không ghi ngày | 2026-09-22 | thấp |
| [55] | Dẫn dắt khách hàng tới câu trả lời muốn nghe | [Hacker News](https://news.ycombinator.com/item?id=10875585) | 2016-01-10 | 2026-09-22 | trung bình |

## Bản đồ độ cũ

Tính bằng `recon_kit.py staleness`. Cửa sổ: tính năng, giá, định vị 3 tháng; cảm nhận người dùng 18 tháng; mô phỏng LLM và phê phán 24 tháng; effect size và mẫu lời nói 60 tháng.

| Claim | Lớp | Ngày nguồn | Cần kiểm lại | Đã cũ? |
|---|---|---|---|---|
| [1] Chưa có sản phẩm nào có đủ thông tin ẩn + lộ theo lượt + replay | feature | 2026-09 | 2026-12-22 | không |
| [2][3] Giá Synthetic Users, Yoodli | pricing | 2026-09 | 2026-12-22 | không |
| [4] Định vị UXPressia | positioning | 2026-09 | 2026-12-22 | không |
| [11] Giá khóa học VN | pricing | 2026-09 | 2026-12-22 | không |
| [14] Giá ChatGPT tại VN | pricing | 2026-01 | 2026-04-15 | **cũ**: kiểm lại trước khi định giá |
| [50] Tiếng nói người học PM | sentiment | 2023-04 | 2024-10-30 | **cũ**: là tiếng nói người học đọc được đầy đủ duy nhất |
| [9] Phê phán của NN/g | critique | 2024-06 | 2026-06-21 | **cũ**: kiểm xem NN/g đã cập nhật chưa |
| [7][8] Bằng chứng mô phỏng LLM | llm-sim | 2026 | 2028-05 / 2028-09 | không |
| [5][6] Effect size | effect-size | 2024–2026 | 2029–2031 | không |
| [35] Mẫu workaround | example-pattern | 2025 | 2030-01-01 | không |

Mốc kiểm lại sớm nhất: **2024-10-30** ([50], đã quá hạn). Mốc kiểm lại sớm nhất trong tương lai: **2026-12-22** (giá và tính năng đối thủ). Refresh sẽ xử lý các mục này.
