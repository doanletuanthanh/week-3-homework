---
title: 'PRD: InterviewLab'
status: final
created: '2026-09-24'
updated: '2026-10-02'
---

# PRD: InterviewLab

> Nguồn: `brief.md` và `addendum.md` của brief (2026-09-22), `forged-idea.md` (forge gốc), `forge/notes-panel-vs-guess-slider/forged-idea.md` (forge ghi chú, 2026-10-01), `research.md`, `brainstorm-intent.md`. **PRD này và `addendum.md` cùng thư mục thay mọi nguồn trên ở mọi điểm khác nhau**; lý do ở addendum §7, lịch sử ở addendum §8.
> Chi tiết kỹ thuật (hợp đồng từng call, luật mở khóa, mô hình dữ liệu, chi phí, ước tính): `addendum.md`.
> Thẻ `[ASSUMPTION]` đánh dấu giá trị khởi đầu PM đã chấp nhận hoặc suy luận chưa kiểm; mọi thẻ được xem lại sau lần eval đầy đủ đầu tiên (§13). `[n]` là số nguồn trong `research.md`.

## 1. Sản phẩm

Người mới học phỏng vấn người dùng thường chỉ biết mình hỏi sai **sau khi** buổi phỏng vấn thật đã qua: hỏi câu dẫn dắt, không hỏi sâu, hoặc bỏ qua một chi tiết người kia vừa nhắc. **InterviewLab** là phòng tập phỏng vấn người dùng và stakeholder, kèm bằng chứng bạn sai ở đâu.

Người học chọn một **chủ đề** (ví dụ "ứng dụng quản lý chi tiêu"), rồi phỏng vấn một trong vài **persona** AI của chủ đề đó. Mỗi persona giữ một **tảng băng** riêng gồm 8–12 điều chưa nói, cố định từ lượt đầu; một điều chỉ mở ra khi người học hỏi đúng cách. Trong buổi, người học ghi chú tự do trên một **canvas**. Cuối buổi, người học đoán persona đã kể bao nhiêu điều. Rồi tảng băng lộ ra với **hai con số**: KHAI THÁC (persona thật sự đã kể gì — kỹ năng hỏi) và NHẬN BIẾT (người học đã ghi lại điều quan trọng nào — kỹ năng nghe). Mỗi điều kèm trích dẫn đúng lượt. Người học quay lại **khoảnh khắc bị lỡ** để hỏi lại, và mang về một trang "thói quen hỏi" dựng từ lỗi của chính mình. Người học cũng có thể **tự tạo chủ đề**: gõ một chủ đề, hệ thống tự sinh persona và kiểm tra nhẹ trước khi cho luyện.

**Việc người học cần làm** (JTBD, từ brainstorm): bước vào buổi thật mà không lúng túng. Sản phẩm phục vụ phần "bắt lỗi trước khi nó tốn một buổi thật"; phần "biết cách gỡ khi buổi đi chệch kế hoạch hỏi" chưa được phục vụ (Later).

**Bối cảnh:** sản phẩm production thật, 1 dev, không có ngày ra mắt cứng, mục tiêu là sản phẩm tốt nhất làm được. Lịch dự kiến khoảng 2 tháng; ước tính từ dưới lên là ~64 ngày dev chưa buffer (khoảng 3 tháng làm việc), PM chấp nhận độ chênh này (§13). Responsive web app, deploy trên URL thật. Ba vai trò (UX, BA, PM), chỉ tiếng Việt. Thứ tự build theo **lát phát hành** (§3), không có thứ tự cắt.

**Người dùng:** sinh viên và người mới vào nghề UX, BA, PM ở VN sắp có phỏng vấn người dùng hoặc stakeholder thật. Người dùng đầu tiên: sinh viên HCI/UX năm cuối (Linh, UJ-1).

**Ranh giới đạo đức** (thực thi bằng cấu trúc sản phẩm, không bằng disclaimer): sản phẩm chỉ đánh giá kỹ năng của người học và không bao giờ tạo nhận định về người dùng thật. Mọi trích dẫn lấy từ transcript hoặc canvas của chính người học.

**Ai xem được dữ liệu:** người học xem được buổi của mình; **quản trị viên InterviewLab xem được mọi buổi** (transcript, ghi chú, kết quả, kịch bản tự tạo) để kiểm tra chất lượng. Người học được báo điều này bằng lời thường khi đăng nhập (FR-63, NFR-9). Sản phẩm không hứa riêng tư ngoài phạm vi đó.

## 2. Thay đổi sau phản hồi reviewer (vòng 2, 2026-10-01)

| Phản hồi | Thay đổi | Ở đâu |
|---|---|---|
| Lịch | Bỏ mốc 16 ngày cố định, thứ tự cắt, tripwire ngày 11, cam kết 1 kịch bản và mọi mốc "hết ngày N". Thay bằng 5 lát phát hành và ước tính mới từ dưới lên | §3, addendum §6 |
| Thanh trượt đoán không có nội dung | Áp nguyên forge ghi chú: canvas ghi chú trong buổi, hai con số KHAI THÁC / NHẬN BIẾT, lớp phán đoán thay cụm neo và template | §6 Màn 4–6, §8, FR-46–49 |
| Hỏi vai trò | Vai trò là **bộ lọc thư viện** (UX / BA / PM / Khác), chỉ lọc chủ đề; luật chấm giống nhau cho mọi vai trò. BA và PM ra mắt kèm biện pháp độ thật của forge | §4, FR-50, FR-64–65 |
| Lớp chủ đề | `topic` đứng trên persona; 6 chủ đề × 2–3 persona = 14 persona; FR-5 tính theo persona, nên người học có nhiều buổi trong một chủ đề. Thêm đường "Tạo chủ đề của bạn" | §4, §6, FR-4–5, FR-51–56 |
| Soạn kịch bản | Review Console trên web cho quản trị viên; FR-35, FR-36 về lại MVP; CLI hoặc worker vẫn chạy eval | §6 Console, FR-35–36, FR-57–61 |
| Phương pháp | Trang "Phương pháp đứng sau InterviewLab", bị chặn tới khi có một lần research học thuật riêng | FR-62, §12.4 |

**Các khóa bị mở lại ở vòng này** (chi tiết addendum §7):
- FR-30 cũ "không có nội dung LLM sinh lúc chạy" → generator có cấu trúc, verifier và classifier (forge ghi chú).
- Cụm neo quyết định hook đã thả / item đã nói ra → verdict do Call 1 của lượt sau phán đoán (forge ghi chú).
- NFR-1 cũ "≤2 call mỗi lượt, 1 verifier mỗi buổi" → lượt replay ≤3 call, reveal 3 call (forge ghi chú).
- FR-2 "không phân quyền" → người học không có vai trò; quản trị viên lấy từ allowlist.
- FR-5 "một buổi mỗi kịch bản" (vốn cũng là giới hạn chi phí theo người) → một buổi mỗi persona; chi phí theo người tăng theo số persona.
- **Khóa riêng tư** của brainstorm-intent ("individual learner only, private") và brief ("chỉ người học xem được") → quản trị viên xem được mọi thứ (§13 rủi ro).
- Khóa neo giả thuyết của brief/forge ("Người trong thế giới của bạn, không bao giờ là câu hỏi của bạn") **bị thử thách** ở đường tự tạo chủ đề; neo được chấp nhận là rủi ro còn lại (§13).

**Quyết định từng được đưa ra vì lịch, nay không còn áp dụng:** thứ tự cắt và tripwire; 1 kịch bản; màn thư viện chỉ khi ≥2 kịch bản; NFR-7 ≥85% hạ thành chỉ số báo cáo sau ngày 13 (nay là cổng cứng); thử với 2 sinh viên (nay 5–8); Thanh là người phân xử rò rỉ duy nhất (nay có người phân xử thứ hai); FR-35/36 sang Next; admin dashboard sang Later; BA/PM sang Next; đường Describe/custom sang Next.

**Vẫn cắt, vì lý do sản phẩm** (không phải lịch):
- **Magic link:** tài khoản dùng một lần (plus-addressing) làm vô hiệu giới hạn chi phí theo người của FR-5; gần như mọi sinh viên VN có Gmail.
- **Song ngữ:** nhân đôi mọi test set (classifier, judge, canvas) và eval theo ngôn ngữ; không người dùng ra mắt nào cần tiếng Anh. Giữ trường `language`.
- **Bộ đếm live / theo tier:** khuyến khích chơi để tăng số và là một gợi ý; forge cấm đếm so với tổng.
- **Guide theo đề tài thật của người học:** viết câu hỏi về đề tài thật là neo giả thuyết trước fieldwork và gần với nhận định về người dùng thật.

## 3. Phạm vi và lát phát hành

Ra mắt = cả 5 lát, build theo đúng thứ tự dưới đây. Mỗi lát deploy được và chạy end-to-end trước khi sang lát sau. Ước tính chi tiết: addendum §6.

| Lát | Nội dung | Ước tính (ngày dev) |
|---|---|---|
| **S1** Vòng lặp lõi | Engine 2 call, lớp phán đoán (verdict, token span), canvas ghi chú, đoán, reveal hai con số, replay, "Mang về", "Buổi của tôi", đăng nhập kèm thông báo ai xem được, cap chi phí, eval harness, `validate` / `eval` / `publish` (cổng tạm) / `trace` / `seed-demo`, kiểm FR-36 trong CLI, test set phân loại và judge, **1 chủ đề UX với 1 persona** (lối vào: trang chủ → Màn 3 của persona đó; bảng `topic` có một dòng duy nhất) | ~26,75 |
| **S2** Lớp chủ đề | `topic` trên persona, thư viện kèm bộ lọc vai trò, màn chủ đề, cảnh báo trùng đề tài, kiểm không trùng tag trong chủ đề, gợi ý persona kế tiếp; **phần còn lại của UX**: 5 persona, đủ 2 chủ đề × 3 persona | ~8,25 |
| **S3** Review Console | Console web (allowlist), CRUD chủ đề và persona kèm `validate` inline, hàng đợi eval (worker), báo cáo, phân xử rò rỉ hai người, duyệt chuỗi, publish có cổng FR-35 đầy đủ, trình xem buổi; **generator kịch bản** và AI critic; **cho 6 persona của S1–S2 qua lại cổng đầy đủ** | ~9,5 |
| **S5** Tạo chủ đề của bạn | Form chủ đề và "Bạn muốn luyện điều gì", phân loại trọng tâm luyện, kiểm duyệt nội dung, eval rút gọn tự động, hạn mức, ngân sách sinh riêng, trạng thái "đang chuẩn bị" và "chưa qua kiểm tra" | ~7 |
| **S4** BA/PM | Gói tài liệu grounding (research.md §6, kèm lưu ý của nó), 2 chủ đề BA × 2 persona, 2 chủ đề PM × 2 persona, AI critic đóng senior, người đọc là BA/PM đang làm nghề, link "Người này có giống stakeholder thật không?", tiêu chí eval BA và PM | ~9,75 |
| Xuyên suốt | Trang phương pháp (sau research học thuật), 5–8 buổi thử với sinh viên, người phân xử thứ hai | ~2,5 |
| **Tổng** | | **~64** (chưa có buffer; addendum §6 ~63,75) |

**Cổng publish tạm cho S1–S2:** persona của S1–S2 publish qua cổng tạm của CLI (FR-35); cả 6 persona qua lại cổng đầy đủ trên Console sau S3 (§12.2 mục 16). **Thứ tự build** là S1 → S2 → S3 → S5 → S4; nhãn S4/S5 giữ từ bản trước.

**Thư viện lúc ra mắt (14 persona):** UX 2 chủ đề × 3 persona; BA 2 chủ đề × 2; PM 2 chủ đề × 2. Mỗi vai trò có ≥2 chủ đề và mỗi chủ đề ≥2 persona, nên SM-4 đo được cả cùng chủ đề lẫn khác chủ đề **trong từng vai trò**. Chủ đề curated mặc định là chủ đề **kề bên** đề tài đồ án phổ biến, không chọn để trùng đề tài của ai, và kèm cảnh báo trùng đề tài (FR-51).

**Luôn có trong lát chứa nó:** test cổng mở khóa và cô lập context (§12.2 mục 3–4), đường replay chính, reveal, eval của mọi persona trước khi publish, deploy.

**Later:** timeline câu hỏi và tỉ lệ nói, luyện "gỡ khi buổi đi chệch kế hoạch hỏi", nhắc ghi chú ở reveal.
**Ngoài phạm vi:** phỏng vấn nhóm; persona sinh từ câu hỏi nghiên cứu của người học; mọi đầu ra dạng insight về người dùng thật; sản phẩm cho giảng viên; thanh toán; voice; song ngữ; magic link; bộ đếm live; guide theo đề tài thật.

## 4. Mô hình chủ đề, persona và vai trò

- **Chủ đề (`topic`):** một lĩnh vực phỏng vấn, ví dụ "ứng dụng quản lý chi tiêu". Gồm tên, vai trò (`ux` / `ba` / `pm`), mô tả một câu, loại (`curated` hoặc `custom`), trạng thái, và với `custom` thì chủ sở hữu. Chủ đề curated có 2–3 persona.
- **Persona (kịch bản):** một nhân vật trong chủ đề, với **câu hỏi nghiên cứu riêng**, lời mở đầu, ≥12 fact bề mặt và tảng băng 8–12 item. Các persona cùng chủ đề có **tảng băng khác nhau và topic tag không trùng nhau** (FR-33), để buổi thứ hai trong cùng chủ đề không phải bài thuộc lòng của buổi đầu.
- **Khóa neo giả thuyết, mang sang lớp chủ đề:** mỗi persona có câu hỏi nghiên cứu của chính nó, và màn chuẩn bị nói rõ "[Persona] sẽ không bàn về câu hỏi nghiên cứu của bạn." (FR-51). Không có tính năng tìm hay khớp chủ đề theo đề tài thật của người học.
- **Ràng buộc chống neo** (rủi ro và lý do: §13 "Neo giả thuyết ở lớp chủ đề"):
  - chủ đề curated chọn **kề bên** đề tài đồ án phổ biến, không trùng;
  - tảng băng của persona nói về một quy trình hoặc khía cạnh phụ, không phải câu hỏi hiển nhiên nhất của chủ đề (rubric soạn kịch bản, addendum §2.8);
  - cảnh báo trùng đề tài ở màn chủ đề và màn chuẩn bị (FR-51);
  - mọi đầu ra chỉ nói về kỹ năng của người học.
- **Vai trò:** bộ lọc trên thư viện với 4 lựa chọn **UX / BA / PM / Khác** (Khác hiện mọi chủ đề). Vai trò **chỉ lọc chủ đề**; luật nhãn, luật mở khóa và cách chấm giống nhau cho mọi vai trò (§8.1). Lựa chọn được nhớ trên trình duyệt cho khách và lưu vào tài khoản sau khi đăng nhập; mỗi lần chọn BA hoặc PM được ghi sự kiện, là tín hiệu trong sản phẩm cho giả định #6 (§13).
- **Chủ đề tự tạo (`custom`):** do người học tạo bằng một dòng chủ đề và một câu trả lời "Bạn muốn luyện điều gì trong buổi này?". Hệ thống sinh **1 persona** đầy đủ; người học không chọn, không mô tả và không bao giờ thấy hay tác động vào nội dung ẩn. Chủ đề tự tạo chỉ chủ sở hữu thấy trong thư viện của mình (và quản trị viên, NFR-9); không bao giờ vào thư viện chung.
- **Trọng tâm luyện:** câu trả lời "Bạn muốn luyện điều gì" được **một call phân loại** ánh xạ vào tập đóng; câu trả lời không ánh xạ được thành `general`. Văn bản gốc không bao giờ tới generator (FR-53); ô chủ đề thì có, nên neo qua ô chủ đề là rủi ro còn lại (§13).

  | Trọng tâm | Nhãn trên màn chuẩn bị | Generator | "Mang về" |
  |---|---|---|---|
  | `follow_up` | Hỏi tiếp chi tiết vừa nghe | nhiều item đường follow-up | nhận xét "nghe nhưng không hỏi tiếp" và thẻ chuyển chủ đề lên đầu (sau lời khen) |
  | `past_story` | Kéo về một lần cụ thể | nhiều item đường chuyện quá khứ | nhận xét giả định-tương-lai lên đầu |
  | `trust` | Người dè dặt | nhiều item đường tin tưởng, persona dè dặt hơn | nhận xét dẫn dắt lên đầu |
  | `no_leading` | Tránh câu dẫn dắt | persona dễ đồng ý với câu dẫn dắt, để lỗi lộ rõ | nhận xét dẫn dắt lên đầu |
  | `general` | (không hiện dòng "tập trung vào") | phân bổ mặc định | không ưu tiên |

  Mọi trọng tâm vẫn giữ đủ 4 đường mở (FR-33).

## 5. Hành trình chính

Vòng lặp cốt lõi: **chọn chủ đề → phỏng vấn kèm ghi chú → đoán → tảng băng lộ diện (hai con số) → luyện lại khoảnh khắc bị lỡ → mang về thói quen hỏi → persona kế tiếp.** Đặc tả từng màn ở §6; trạng thái buổi ở §7; thuật ngữ ở §8.1.

### UJ-1: Linh luyện trước buổi phỏng vấn thật đầu tiên

Linh là sinh viên HCI năm cuối, có 5 buổi phỏng vấn người dùng cho đồ án trong 10 ngày tới, chưa từng phỏng vấn ngoài role-play trên lớp. Một bạn gửi link vào group chat; Linh mở trên laptop lúc 11 giờ đêm.

1. **Trang chủ → Thư viện.** Linh bấm "Vào thư viện", chọn bộ lọc UX, thấy 2 chủ đề. Cô chọn "Chi tiêu hằng ngày của người trẻ đi làm".
2. **Màn chủ đề.** Ba persona; cảnh báo "Nếu đồ án của bạn cũng về chủ đề này…". Linh chọn chị Thu.
3. **Chuẩn bị.** Câu hỏi nghiên cứu của chị Thu: "Vì sao người trẻ bắt đầu rồi bỏ việc theo dõi chi tiêu?", dòng "Chị Thu sẽ không bàn về câu hỏi nghiên cứu của bạn", giới thiệu canvas ghi chú. Bấm "Bắt đầu" → đăng nhập Google → thông báo ai xem được dữ liệu (lần đầu) → vào buổi.
4. **Phỏng vấn.** Chị Thu mở lời. Lượt 2, Linh hỏi "Chị có muốn một app nhắc chị tiết kiệm không?" (Call 1 gắn `leading`, cụm tự thêm "app nhắc chị tiết kiệm"; openness giảm; Linh không được báo). Lượt 5, chị Thu nhắc "có lần chị định ghi lại nhưng rồi cũng bỏ" (thả hook). Linh ghi vào canvas "từng thử ghi chép rồi bỏ?" nhưng lượt 6 lại hỏi chuyện ăn uống. Lượt 22, Linh bấm "Kết thúc buổi"; canvas đóng băng.
5. **Đoán.** "Bạn nghĩ chị Thu đã kể cho bạn bao nhiêu trong 11 điều?" Linh kéo tới 7.
6. **Reveal.** "Bạn đoán 7. Chị Thu đã kể: 3 trên 11." và "Nhận biết: 4 điều quan trọng trong ghi chú của bạn." Dòng chẩn đoán "Bạn nghe được, nhưng chưa hỏi tiếp", ngay trên nút "Quay lại lượt 6". Ghi chú "từng thử ghi chép rồi bỏ?" **chưa được tô gì**, vì nó liên quan tới điều đang giữ lại để Linh thử.
7. **Luyện lại.** Linh hỏi "Chị định ghi lại kiểu gì ạ?"; chị Thu kể chuyện app trả phí vẫn trừ tiền. "Đã mở khóa: Chị đang trả phí cho một app chị gần như không mở. Đây chính là điều bạn bỏ lỡ." Lúc này ghi chú của cô mới được tô vàng, kèm "Bạn đoán đúng, nhưng chị Thu chưa xác nhận — trong buổi thật, bạn sẽ không biết mình đúng", và NHẬN BIẾT tăng lên 5.
8. **Mang về và persona kế tiếp.** Linh in "Thói quen hỏi của bạn", rồi bấm "Luyện tiếp với anh Dũng" (persona thứ hai cùng chủ đề). Hai ngày sau cô luyện thêm một chủ đề khác. Trước buổi thật, cô mở "Buổi của tôi" đọc lại thẻ thói quen.

### UJ-2: Minh tự tạo chủ đề

Minh là fresher PM, sắp phỏng vấn cư dân cho một ý tưởng app hẹn hò trong khu dân cư. Thư viện không có chủ đề này.

1. Minh bấm "Tạo chủ đề của bạn", gõ "app hẹn hò trong khu dân cư đang sống", và trả lời "Bạn muốn luyện điều gì?" bằng "em hay quên hỏi tiếp" (→ `follow_up`). Màn hình nói rõ: kịch bản do AI sinh, chỉ qua kiểm tra nhẹ, mọi chi tiết là hư cấu, không phải insight về người dùng thật; còn 1 kịch bản miễn phí và 3 lần thử hôm nay.
2. **Đang chuẩn bị** (vài phút): ba bước hiện tiến độ. Minh đóng tab; lát sau "Buổi của tôi" hiện "Đang chuẩn bị".
3. Lần thử đầu **chưa qua kiểm tra** (eval thấy dấu hiệu lộ). Minh không mất kịch bản miễn phí; còn 2 lần thử hôm nay. Lần thử thứ hai qua; Minh vào màn chuẩn bị với nhãn "Kiểm tra nhẹ", rồi luyện như UJ-1. Mỗi item ở reveal có nhãn "chi tiết hư cấu".

### UJ-3: Thanh soạn và publish một persona BA

Thanh là dev duy nhất và là quản trị viên chính; người phân xử thứ hai là một quản trị viên khác trong `ADMIN_EMAILS`.

1. **Console → Chủ đề BA "Phê duyệt và ngoại lệ trong mua sắm nội bộ".** Thanh bấm "Sinh bản nháp persona": generator dựng nháp từ gói grounding (dựa trên mẫu phê duyệt 11–16 và mẫu workaround 1–9 của research.md §6, không dùng mẫu "ngưỡng tiền" chưa có nguồn), AI critic đóng senior BA viết nhận xét. Thanh sửa trong trình soạn; `validate` báo lỗi inline (thiếu đường tin tưởng, tag trùng với persona khác trong chủ đề) tới khi sạch.
2. **Eval:** Thanh xếp lần chạy đầy đủ vào hàng đợi; worker chạy trong vài giờ. Báo cáo hiện các ngưỡng FR-35, baseline, tiêu chí BA, nhận xét AI critic.
3. **Phân xử:** Thanh và người phân xử thứ hai cùng xử từng cờ rò rỉ; cờ chỉ đóng khi hai người đồng ý.
4. **Duyệt chuỗi:** FR-36 tự động chạy trên mọi chuỗi cố định; Thanh duyệt từng chuỗi. Ghi ý kiến của 1–2 BA đang làm nghề đã đọc transcript eval (FR-65).
5. **Publish:** nút chỉ bật khi mọi mục xanh.

## 6. Màn hình

Mỗi màn: nội dung, thao tác, và các trạng thái **trống / đang tải / lỗi**. Nghĩa của "đã khai thác", "nhận biết", "niêm phong" ở §8.1; ứng viên chính, dự phòng 1/2, item mục tiêu, lượt *h* và *l* ở §9.2.

| Màn | Tên | Ai xem | Trạng thái §7 dẫn tới | FR chính | Lát |
|---|---|---|---|---|---|
| 0 | Thông báo dữ liệu | Đăng nhập lần đầu | — | FR-63 | S1 |
| 1 | Trang chủ | Khách | — | FR-1 | S1 |
| 2 | Thư viện | Khách | `generating`, `failed_eval` (thẻ chủ đề tự tạo) | FR-4, FR-50 | S2 |
| 2b | Chủ đề | Khách | thẻ persona theo mọi trạng thái | FR-4, FR-51 | S2 |
| 3 | Chuẩn bị | Khách → đăng nhập | `interviewing` 0 lượt | FR-6 | S1 |
| 4 | Buổi phỏng vấn người dùng | Đăng nhập | `interviewing` | FR-7–11, FR-46 | S1 |
| 5 | Đoán | Đăng nhập | `interviewing` đã kết thúc | FR-18 | S1 |
| 6 | Tảng băng lộ diện | Đăng nhập | `revealed`, `done` | FR-19–22, FR-28–31 | S1 |
| 7 | Luyện lại | Đăng nhập | `replaying` | FR-23–27 | S1 |
| 8 | (đã gộp vào Màn 6 mục 7) | — | — | — | — |
| 9 | Buổi của tôi | Đăng nhập | mọi trạng thái (danh sách) | FR-39–43, FR-66 | S1 |
| 10 | Tạo chủ đề của bạn | Đăng nhập | — | FR-52–56 | S5 |
| 11 | Đang chuẩn bị / Chưa qua kiểm tra | Đăng nhập | `generating`, `failed_eval` | FR-54 | S5 |
| 12 | Phương pháp | Khách | — | FR-62 | xuyên suốt |
| C1–C10 | Review Console | Quản trị viên | mọi trạng thái (C9) | FR-57–61 | S3 (C10: S5) |

### 6.0 Luật chung cho mọi màn

- **Tải chuẩn:** khung xám đúng hình nội dung sắp hiện (skeleton), không spinner toàn trang. Thao tác ghi (lưu, gửi) hiện trạng thái đang xử lý ngay trên nút và khóa nút đó.
- **Lỗi chuẩn:** "Không kết nối được. Thử lại" kèm nút thử lại, giữ nguyên dữ liệu đã nhập; lỗi khi lưu hiện cạnh thao tác vừa làm. Thử lại 3 lần vẫn lỗi → "InterviewLab đang gặp sự cố. Tiến độ của bạn đã được lưu; quay lại sau ít phút." Hết phiên đăng nhập → chuyển sang đăng nhập rồi quay lại đúng trang, giữ nội dung đang gõ (ô hỏi, canvas, ô chủ đề) trong trình duyệt.
- **Không áp dụng:** ghi rõ khi một trạng thái không thể xảy ra.
- **Header:** logo → Màn 1; "Thư viện"; trước đăng nhập: "Đăng nhập"; sau đăng nhập: "Buổi của tôi" và avatar mở menu ("Đăng xuất"). Header thu thành menu ở <768px.
- **URL và nút quay lại:** mỗi buổi có một URL `/buoi/[id]`, luôn render đúng màn theo trạng thái hiện tại (§7), không theo màn đã mở trước. Nút quay lại của trình duyệt đưa người học từ một màn trong buổi về màn trước buổi (Màn 2b hoặc Buổi của tôi). Buổi không tồn tại hoặc không phải của mình → "Không tìm thấy buổi này." kèm nút "Buổi của tôi" (không phân biệt hai trường hợp).
- **Giờ reset** của mọi hạn mức theo ngày: 00:00 giờ Việt Nam (UTC+7); hiện "sau 0 giờ đêm nay".
- **Tên persona trong chuỗi:** trường `display_name` dạng xưng hô ("chị Thu"), viết hoa chữ đầu khi đứng đầu câu. Ký hiệu `[persona]` trong spec là trường này.
- **Từ dùng trong giao diện:** "lượt" chỉ dùng cho lượt hỏi–đáp (1–30); hạn mức dùng "buổi", "kịch bản" và "lần thử".
- **Breakpoint:** <768px là mobile (bong bóng canvas, header thu gọn); ≥768px là desktop. Console tối thiểu 1024px.
- **Truy cập:** theo NFR-15. **Copy:** theo NFR-14.
- **Prototype Stitch:** thiết kế lại phải bỏ các chỗ trái PRD trong prototype hiện có (chi tiết §12.4).

### 6.1 Người học

**Màn 0 · Thông báo dữ liệu** (FR-63)
- Trang đầy đủ, không đóng được bằng cách bấm ra ngoài. Hiện ngay sau lần đăng nhập Google đầu tiên **từ bất kỳ đâu**, và mỗi khi phiên bản thông báo đổi, **trước mọi trang đòi đăng nhập hay ghi dữ liệu** (kể cả link thẳng tới Màn 4–11).
- Nội dung: chuỗi FR-63. Nút chính "Tôi hiểu"; link phụ "Quay lại" về trang trước, không lưu đồng ý, không tạo gì.
- Sau "Tôi hiểu": tiếp tục đúng hành động đã khởi động (bấm "Bắt đầu" ở Màn 3 thì tạo buổi luôn; bấm "Tạo kịch bản" ở Màn 10 thì gửi luôn).
- Đăng nhập: hủy cửa sổ Google → ở lại trang cũ, không báo lỗi; đăng nhập lỗi → "Không đăng nhập được. Thử lại."
- Trống: không áp dụng. Tải: nút "Tôi hiểu" ở trạng thái đang xử lý. Lỗi: lỗi chuẩn, chưa lưu đồng ý thì không đi tiếp.

**Màn 1 · Trang chủ** (khách xem được)
- Nội dung: headline "Luyện phỏng vấn người dùng. Xem chính xác bạn đã bỏ lỡ điều gì."; tagline "Mắc lỗi ở đây, đừng mắc trước người thật."; ảnh chụp màn reveal **từ một buổi `seed-demo`**, không số liệu tổng hợp (một dòng transcript tô, chú thích "Chị ấy vừa nhắc tới một cách xoay xở. Bạn chuyển chủ đề."); nút chính "Vào thư viện"; nút phụ "Tạo chủ đề của bạn"; footer có link "Phương pháp đứng sau InterviewLab" (chỉ khi FR-62 đã mở).
- Tài khoản demo (FR-45): không có nút riêng; mọi thẻ persona của tài khoản demo có thêm "Bắt đầu buổi mới" (Màn 2b).
- Trống / tải / lỗi: không áp dụng (trang tĩnh).

**Màn 2 · Thư viện** (khách xem được)
- Nội dung:
  - bộ lọc vai trò dạng chip **UX / BA / PM / Khác**; mặc định không chip nào chọn = mọi chủ đề; "Khác" hiện mọi chủ đề kèm dòng "Chưa có chủ đề dành cho vai trò của bạn; đây là mọi chủ đề." (lựa chọn vẫn được ghi sự kiện, FR-50);
  - lưới thẻ chủ đề curated theo thứ tự quản trị viên đặt: tên, nhãn vai trò, một câu mô tả, "3 persona", và sau đăng nhập "Đã luyện 1/3";
  - đầu lưới: thẻ "Tạo chủ đề của bạn";
  - sau đăng nhập, khu **"Chủ đề bạn tự tạo"** (không chịu bộ lọc vai trò, mới nhất trước): mỗi thẻ có nhãn "Kiểm tra nhẹ" và trạng thái lấy từ buổi chơi được của nó, nếu chưa có thì từ lần thử mới nhất: "Đang chuẩn bị", "Chưa qua kiểm tra", hoặc như thẻ curated.
- Thao tác: đổi bộ lọc; mở thẻ chủ đề → Màn 2b (chủ đề tự tạo đang chuẩn bị hoặc chưa qua → Màn 11); mở "Tạo chủ đề của bạn" → Màn 10.
- Trống: bộ lọc không có chủ đề → "Chưa có chủ đề cho vai trò này." kèm "Xem mọi chủ đề" (= bỏ chọn chip) và "Tạo chủ đề của bạn"; khu "Chủ đề bạn tự tạo" không hiện khi chưa có. Tải, lỗi: chuẩn.

**Màn 2b · Chủ đề**
- Nội dung: tên và mô tả chủ đề; **cảnh báo trùng đề tài** (FR-51): "Nếu đồ án của bạn cũng về chủ đề này, điều các nhân vật ở đây kể có thể thành giả thuyết trong đầu bạn trước khi gặp người thật. Họ là nhân vật hư cấu, không phải người dùng của bạn."; thẻ persona đã publish: avatar minh họa (chọn trong C4; persona sinh tự động dùng chữ cái đầu), `display_name` và tên, một câu về persona, câu hỏi nghiên cứu, bộ đếm niêm phong "Đang giữ 11 điều chưa nói", và nút theo §7 ("Bắt đầu" / "Tiếp tục buổi luyện" / "Xem lại kết quả"). Tài khoản demo: thêm "Bắt đầu buổi mới"; nút chính trỏ buổi mới nhất.
- Persona bị gỡ publish không hiện ở đây; buổi đã có của người học vẫn mở được từ Màn 9.
- Chủ đề tự tạo: thêm dòng "Kịch bản do AI sinh, chỉ qua kiểm tra nhẹ. Mọi chi tiết là hư cấu."
- Trống: không còn persona đã publish → "Chủ đề này đang được cập nhật." và nút về thư viện. Tải: chuẩn. Lỗi: lỗi chuẩn; chủ đề không tồn tại hoặc là chủ đề tự tạo của người khác → "Không tìm thấy chủ đề này." kèm nút về thư viện.

**Màn 3 · Chuẩn bị** (~20 giây đọc)
- Nội dung: đầu màn dùng lại phần đầu thẻ persona ở Màn 2b (avatar, tên, một câu); câu hỏi nghiên cứu; ba dòng: tối đa 30 lượt, khoảng 15–20 phút; [persona] chỉ nói ra những điều đang giữ nếu bạn hỏi đúng cách ("một điều" là một trải nghiệm, thói quen hay cảm nhận chưa kể, không phải tên hay tuổi); cứ hỏi như đang gặp người thật. Dòng **"[Persona] sẽ không bàn về câu hỏi nghiên cứu của bạn."** Cảnh báo trùng đề tài rút gọn: "Nếu đồ án của bạn cũng về chủ đề này: [persona] là nhân vật hư cấu, điều [persona] kể không phải insight cho đề tài của bạn." Khối **giới thiệu canvas**: "Ghi lại điều bạn thấy quan trọng trong lúc nghe. Cuối buổi, chúng tôi đối chiếu ghi chú với những gì [persona] đã nói. Ghi chú là tùy chọn."
- Chủ đề tự tạo: thêm "Buổi này tập trung vào: [nhãn trọng tâm]" (không hiện với `general`), nhãn "Kiểm tra nhẹ", và **"Đây không phải insight thật: mọi chi tiết là hư cấu."** Buổi đã có từ lúc tạo kịch bản (§7), nên "Bắt đầu" chỉ mở Màn 4.
- Nút theo trạng thái: chưa có buổi → "Bắt đầu"; đã có buổi chưa xong → "Tiếp tục buổi luyện" mở màn theo §7; buổi `done` → "Xem lại kết quả". Server từ chối tạo buổi thứ hai cho cùng persona (FR-5) và chuyển tới buổi hiện có.
- Thao tác: "Bắt đầu" → nếu chưa đăng nhập: đăng nhập Google → Màn 0 (lần đầu) → tạo buổi (curated) → Màn 4.
- Trống: không áp dụng. Tải: nút ở trạng thái đang xử lý khi tạo buổi; mở thẳng từ link → tải chuẩn. Lỗi: chạm cap chi phí buổi (FR-37) → "Hôm nay InterviewLab đã hết chỗ cho buổi luyện mới. Quay lại sau 0 giờ đêm nay." (với chủ đề tự tạo, cap được kiểm ở đây, trước lượt đầu tiên; buổi giữ nguyên để hôm sau tiếp tục); persona đã bị gỡ và người học chưa có buổi → "Nhân vật này đang được cập nhật." kèm nút về chủ đề; lỗi tạo buổi → lỗi chuẩn, không tạo buổi dở.

**Màn 4 · Buổi phỏng vấn người dùng** (tiêu đề trang: "Buổi phỏng vấn người dùng với [persona]")
- Nội dung: khung chat; thanh trên: tên persona, câu hỏi nghiên cứu, "Lượt 4/30", "[Persona] đang giữ 11 điều chưa nói" (bộ đếm niêm phong không đổi suốt buổi). Ở <768px câu hỏi nghiên cứu thu một dòng, chạm để mở; lượt và bộ đếm luôn hiện. Persona nói trước bằng lời mở đầu (lượt 0).
- **Canvas ghi chú:** desktop là notepad cố định cạnh chat; mobile là bong bóng có nhãn "Ghi chú"; chạm thì notepad trượt lên che phần dưới màn hình, phần trên giữ ≥1 tin cuối của persona; khi notepad mở, ô gửi câu hỏi ẩn và bàn phím chỉ phục vụ notepad; chạm ra ngoài, vuốt xuống, Esc hoặc nút "Thu" để thu, ô gửi trở lại với nội dung đang gõ. Canvas là một khối văn bản tự do, placeholder "Ghi điều bạn thấy quan trọng…", tối đa 5.000 ký tự `[ASSUMPTION]`, tự lưu im lặng.
- Ô hỏi: tối đa 500 ký tự `[ASSUMPTION]`; desktop: Enter gửi, Shift+Enter xuống dòng; mobile: nút gửi; ô rỗng không gửi được.
- Thao tác: gửi câu hỏi; ghi và sửa canvas bất cứ lúc nào, kể cả khi persona đang gõ; "Kết thúc buổi" → hộp xác nhận "Kết thúc và đóng băng ghi chú?" · "Kết thúc buổi" / "Hỏi tiếp". Khi persona đang gõ, "Kết thúc buổi" khóa tới khi lượt ghi xong.
- Không có: nhãn, gợi ý, số item đã mở, autocomplete, điền sẵn, cảnh báo sắp hết lượt (bộ đếm "Lượt n/30" là đủ), hay số đếm so với tổng trên canvas (FR-8). Phản hồi của API lượt chỉ gồm lời persona, số lượt và trạng thái lỗi; mọi phân tích ở lại server.
- Đang tải: "[Persona] đang gõ…" (không stream); ô gửi khóa, canvas vẫn sửa được.
- Lỗi: LLM call lỗi → **thông báo hệ thống dưới ô gửi** (không phải bong bóng persona, không vào transcript): "[Persona] chưa nghe rõ. Gửi lại câu hỏi."; câu hỏi giữ trong ô; lượt không tính (FR-11). Lỗi 3 lần liên tiếp → "InterviewLab đang gặp sự cố. Buổi của bạn đã được lưu ở lượt [n]; quay lại sau." Canvas lưu thất bại 2 lần liên tiếp → dòng nhỏ "Ghi chú chưa lưu được, đang thử lại"; không mất chữ trên màn.
- Hết lượt 30 → tự kết thúc như bấm "Kết thúc buổi": canvas đóng băng (gồm cả phần đang gõ dở), 3 call reveal bắt đầu, sang Màn 5.
- Trống: chưa có lượt nào của người học → chỉ lời mở đầu và ô gửi.

**Màn 5 · Đoán**
- Nội dung: chỉ có câu hỏi và thanh trượt (không xem lại transcript hay canvas): "Bạn nghĩ [persona] đã kể cho bạn bao nhiêu trong [N] điều?". Thanh trượt **không có giá trị ban đầu** (núm ẩn, nhãn "Kéo để chọn"); hai đầu ghi "0" và "[N]"; giá trị đang chọn hiện to phía trên. "Xem kết quả" khóa tới khi người học chọn. Số đoán không bao giờ vào LLM call nào.
- Đang tải: 3 call reveal chạy từ lúc buổi kết thúc. Bấm "Xem kết quả" khi chưa xong → "Đang đối chiếu transcript và ghi chú của bạn…" (không số nào); sau 30 giây thêm "Vẫn đang đối chiếu. Bạn có thể đóng trang; kết quả sẽ ở trong Buổi của tôi."
- Trống: không áp dụng. Lỗi: một call reveal lỗi sau 2 lần thử lại → Màn 6 dạng suy giảm; gửi số đoán lỗi → lỗi chuẩn, giữ giá trị đã chọn.

**Màn 6 · Tảng băng lộ diện**

Màn 6 có ba chế độ: **đang tính** (đã đoán, 3 call chưa xong), **đề xuất replay** (`revealed`), và **đã xong** (`done`; cũng là bản xem lại ở Màn 9).

*Chế độ đang tính:* "Bạn đoán [g]. Đang đối chiếu transcript và ghi chú của bạn…", không số nào khác; tự cập nhật khi xong; call lỗi sau 2 lần thử lại → dạng suy giảm.

*Chế độ đề xuất replay: nội dung, thứ tự cố định*
1. **Hai con số:** "Bạn đoán 7. Chị Thu đã kể: 3 trên 11." và "Nhận biết: 4 điều quan trọng trong ghi chú của bạn." Mẫu số NHẬN BIẾT không hiện. Canvas rỗng → "Không có ghi chú trong buổi này" (không bao giờ là 0); canvas có chữ nhưng không khớp item nào → "Nhận biết: chưa có điều quan trọng nào trong ghi chú của bạn."
2. **Khối replay:** dòng chẩn đoán, nút "Quay lại lượt [điểm rẽ + 1]" (ứng viên chính: *h*+1; dự phòng 1: *l*), liên kết "Bỏ qua, cho tôi xem luôn" (hộp xác nhận "Bỏ qua lần luyện lại? Bạn sẽ không thử lại được khoảnh khắc này." · "Cho tôi xem luôn" / "Ở lại").
   - Ứng viên chính: thẻ **"Giữ lại để bạn thử"**: biểu tượng khóa, dòng "Một điều [persona] chưa kể. Mở ra sau khi bạn luyện lại hoặc bỏ qua." Không topic tag, không đường mở, không trọng số.
   - Dự phòng 1: không có thẻ giữ lại.
   - Dòng chẩn đoán là chuỗi cố định đã duyệt, chọn theo luật:
     - ứng viên chính, verifier đồng ý `hook_ignored`, canvas có đoạn khớp item mục tiêu → "Bạn nghe được, nhưng chưa hỏi tiếp.";
     - ứng viên chính, verifier đồng ý `hook_ignored`, canvas không khớp, rỗng, hoặc judge cuối buổi lỗi → "Lượt [h]: [persona] vừa nhắc tới một điều. Bạn đã chuyển chủ đề.";
     - ứng viên chính, verifier bác hoặc lỗi → "Lượt [h]: [persona] vừa nhắc tới một điều. Thử hỏi lại từ đây.";
     - dự phòng 1, verifier đồng ý tính mới của cụm tự thêm → "Lượt [l]: bạn đã thêm ý của mình vào câu hỏi. Thử hỏi lại mà không dẫn dắt.";
     - dự phòng 1, verifier bác hoặc lỗi → "Lượt [l]: thử hỏi lại câu này theo cách khác."
   - Không có khoảnh khắc replay (dự phòng 2) → thay khối bằng câu hỏi mẫu của item quan trọng nhất còn khóa.
3. **Đã kể ([k]):** mỗi mục: nội dung và link "Lượt N".
4. **Bỏ lỡ ([N] − [k] − số item đang giữ):** mỗi mục một dòng: nội dung và nhãn đường mở cố định ("Hỏi tiếp chi tiết" / "Kéo về một lần cụ thể" / "Tạo tin tưởng" / "Hỏi thẳng"); mở ra thì hiện câu hỏi mẫu và lượt gần nhất có hook kèm câu người học hỏi ngay sau. Mục đường tin tưởng dùng mẫu cố định do code điền từ ledger: "[Persona] chưa đủ tin để kể. Lượt [a, b, c] làm [persona] dè dặt hơn."
5. **Ghi chú của bạn** (ẩn khi canvas rỗng): canvas đóng băng, các đoạn được tô theo kết quả chấm, mỗi đoạn có **nhãn chữ** ("Đã kể" / "Chưa xác nhận" / "Chưa từng lộ ra" / "Chưa từng được nói") và màu; chú giải ở đầu mục. Câu giải thích cố định (FR-48a) **luôn hiện ngay dưới đoạn tô**; link "Lượt N" ở cuối câu là nơi duy nhất mở transcript. Fact bề mặt không tô.
6. **Mang về: "Thói quen hỏi của bạn — đọc lại trước buổi thật"** (FR-28–30): tối đa 3 nhận xét (lời khen có căn cứ trước; chủ đề tự tạo: nhận xét thuộc trọng tâm ngay sau), cặp "Thay vì hỏi" / "Hãy hỏi", thẻ "Thói quen cần để ý". Lượt dẫn dắt chỉ hiện ở đây (và trong transcript), không ở "Bỏ lỡ". Nút "Tải về" khóa tới khi buổi `done`, kèm dòng "Tải về sau khi luyện lại hoặc bỏ qua."
7. **Cuối trang** (Màn 8 cũ gộp vào đây): thẻ persona kế tiếp (FR-31); hết persona chưa luyện trong vai trò → "Bạn đã luyện mọi persona của vai trò này." kèm link thư viện; nút waitlist "Muốn thêm persona? Báo tôi khi có" → sau bấm, và mọi lần sau: "Đã ghi. Chúng tôi sẽ báo khi có persona mới." (kênh báo `[ASSUMPTION]`: email Google của tài khoản); với persona BA/PM, link "Người này có giống stakeholder thật không?" (FR-64).

*Luật niêm phong* (chế độ đề xuất replay, tới khi replay kết thúc theo bất kỳ cách nào, §9.6). Khoảnh khắc replay được chọn trước 3 call (tất định, §9.2); rồi:
- **Ứng viên chính** (có item mục tiêu): đoạn canvas khớp item mục tiêu không được tô, không có dấu, và không tính vào con số NHẬN BIẾT đang hiện; claim, "Hãy hỏi" và thẻ thói quen bị giữ lại nếu có `item_id` là item mục tiêu hoặc trích lượt thả hook của item đó; item mục tiêu không có trong "Đã khai thác" hay "Bỏ lỡ".
- **Dự phòng 1** (không có item mục tiêu, luyện lượt `leading` *l*): mọi claim và "Hãy hỏi" trích lượt *l*, và dòng cụm tự thêm của lượt *l*, bị giữ lại.
- Dữ liệu bị giữ không được gửi về trình duyệt, kể cả qua Màn 9 hay transcript (§12.2 mục 5). Khi replay kết thúc, chúng hiện ra; dữ liệu reveal đã đóng băng trước replay (§9.7), đây chỉ là thay đổi hiển thị.
- Người học có thể suy ra ghi chú nào khớp item mục tiêu bằng cách loại trừ; đây là rủi ro đã chấp nhận (§13).

*Chế độ đã xong* (`done`; mở từ Màn 7, từ "Bỏ qua", hoặc từ Màn 9): như trên, không còn gì bị giữ, và khối replay được thay bằng **thẻ kết quả luyện lại**: kết quả (đúng chuỗi của Màn 7), nội dung item mục tiêu (ứng viên chính) hoặc lượt *l* (dự phòng 1), câu hỏi mẫu, và link "Xem 3 lượt luyện lại" (mở transcript nhánh replay, tách rõ khỏi transcript chính). Không còn nút replay. Item mục tiêu **không** chuyển vào "Đã khai thác" (con số của buổi chính không đổi); nó ở trong thẻ kết quả. Đoạn canvas khớp item mục tiêu dùng chuỗi FR-48a, và nếu replay thành công thì thêm biến thể "Trong buổi chính [persona] chưa xác nhận; ở lần luyện lại bạn đã mở được nó." Không có khoảnh khắc replay: không có thẻ kết quả. "Tải về" bật: bản in gồm tên persona, chủ đề, ngày buổi; tên file `thoi-quen-hoi-[persona]-[ngay].pdf`.

*Phần chung của mọi chế độ:*
- **Transcript buổi chính:** ngăn trượt (desktop: panel phải; <768px: toàn màn, nút "Về kết quả"). Mở từ mọi link "Lượt N": cuộn tới lượt đó, tô nền 2 giây. Hiện đủ mọi lượt; lượt dẫn dắt có nhãn "Dẫn dắt" và cụm tự thêm gạch chân (chỉ khi verifier đồng ý); trong chế độ đề xuất replay, lượt thả hook của item mục tiêu (hoặc lượt *l* ở dự phòng 1) không có nhãn hay dấu nào.
- Chủ đề tự tạo: mỗi item có nhãn "chi tiết hư cấu"; đầu trang có "Đây không phải insight thật".
- Trống "Mang về": "Buổi này không có câu dẫn dắt hay hook bị bỏ qua nào được ghi nhận."
- Tải: chế độ đang tính như trên; mở lại ở `revealed`/`done` → tải chuẩn, đọc kết quả đã lưu, không gọi LLM. Lỗi: tải lỗi → lỗi chuẩn; "Quay lại lượt…" hay "Bỏ qua" lỗi → lỗi chuẩn ngay dưới khối replay, trạng thái buổi không đổi.
- Suy giảm: judge cuối buổi lỗi → mục 5 hiện "Chưa chấm được ghi chú lần này", NHẬN BIẾT ẩn; generator hoặc verifier lỗi → mục 6 chỉ còn dòng trạng thái trống (không lời khen).

**Màn 7 · Luyện lại**
- Nội dung: 2 lượt cuối trước điểm rẽ nhánh, dừng ở câu persona vừa nói; link "Xem toàn bộ transcript trước đó" (cùng ngăn transcript của Màn 6, chỉ tới điểm rẽ); "Bạn có 3 lượt"; nút "Dừng" (hộp xác nhận "Dừng luyện lại? Điều bị giữ sẽ được mở ra." · "Dừng" / "Hỏi tiếp"). Canvas không hiện (đã đóng băng).
- Mở đầu dự phòng 1: "Hỏi lại từ đây, lần này không dẫn dắt."
- Kết quả hiện dưới lượt cuối, kèm nút "Về kết quả buổi" (không tự chuyển):
  - ứng viên chính, thành công → "Đã mở khóa: [item]. Đây chính là điều bạn bỏ lỡ.";
  - một phần → "Bạn mở được một điều khác: [item]." rồi chuỗi thất bại;
  - thất bại hoặc Dừng → nội dung item mục tiêu kèm "Một câu đã mở được nó: '[câu hỏi mẫu]'";
  - dự phòng 1, thành công → "Ba câu không dẫn dắt, có [k] câu bám vào lời [persona]."; thất bại hoặc Dừng → "Lượt [n] vẫn thêm ý của bạn: '[cụm]'." (chỉ khi verifier của lượt replay đồng ý; nếu không thì "Lần này chưa có câu nào bám vào lời [persona].") kèm câu hỏi mẫu của item quan trọng nhất còn khóa.
- Trống: không áp dụng. Đang tải: "[Persona] đang gõ…" rồi "Đang kiểm tra…" (judge replay). Lỗi: Call 1/Call 2 lỗi → như Màn 4, lượt không tính; judge replay lỗi sau 2 lần thử lại → lượt vẫn tính, coi như chưa kể item, dòng nhỏ "Chưa kiểm được lượt này." Chạm cap chi phí giữa replay: replay vẫn chạy hết (FR-37).

**Màn 9 · Buổi của tôi** (đăng nhập)
- Nội dung: danh sách mọi buổi, mới nhất trước, tải thêm 20 buổi mỗi lần, không lọc: tên persona · chủ đề · ngày · kết quả · nhãn trạng thái theo §7. Kết quả chỉ hiện cho buổi `done`: "Kể 3/11 · Nhận biết 4"; canvas rỗng → "Kể 3/11 · Không có ghi chú"; judge cuối buổi lỗi → "Kể 3/11". Buổi ở trạng thái khác không hiện số (giữ niêm phong). Buổi `generating`/`failed_eval` hiện chủ đề đã gõ thay cho tên persona. Bấm một buổi → đúng màn theo §7.
- Bản xem lại (`done`) = Màn 6 chế độ đã xong, kèm ngăn transcript chính và transcript nhánh replay; chỉ đọc, không gọi LLM.
- **Tài khoản** (cuối trang): nút "Xóa tài khoản và toàn bộ dữ liệu" (FR-66) → hộp xác nhận nêu rõ sẽ xóa vĩnh viễn mọi buổi, ghi chú, kết quả và chủ đề tự tạo, không khôi phục được; phải gõ "XÓA" để bật nút xác nhận. Có buổi đang `generating` → nút khóa, "Đợi kịch bản đang chuẩn bị xong rồi xóa."
- Trống: "Bạn chưa luyện buổi nào" và nút "Vào thư viện". Tải, lỗi: chuẩn. Xóa lỗi → lỗi chuẩn, không xóa gì.

**Màn 10 · Tạo chủ đề của bạn** (đăng nhập)
- Nội dung: ô "Bạn muốn phỏng vấn người dùng về chủ đề gì?" (10–300 ký tự, ví dụ mờ); ô "Bạn muốn luyện điều gì trong buổi này?" (tùy chọn, kèm 4 gợi ý bấm nhanh: "Hỏi tiếp chi tiết vừa nghe", "Kéo về một lần cụ thể", "Người dè dặt", "Tránh câu dẫn dắt"); khối thông tin, nguyên văn: "AI sẽ sinh một nhân vật hư cấu cho chủ đề này. Bạn không thấy và không chọn được điều nhân vật giấu. Kịch bản chỉ qua kiểm tra nhẹ: chưa ai đọc nó, và nó chỉ được chạy thử tự động vài lần ngắn. Đây không phải insight về người dùng thật. Quản trị viên InterviewLab xem được chủ đề và buổi luyện của bạn. Đừng nhập tên hay thông tin của người thật hay tổ chức thật." Dòng hạn mức: "Còn 1 kịch bản miễn phí · 3 lần thử hôm nay". Nút "Tạo kịch bản".
- Gửi: kiểm duyệt và phân loại trọng tâm chạy **ngay trong lần gửi, trước khi tạo buổi** (FR-55). Qua → tạo buổi `generating` và chuyển sang Màn 11. Bị từ chối → không tạo buổi, không tính lần thử.
- Trống: form rỗng là mặc định. Tải: mở màn → tải chuẩn cho dòng hạn mức; bấm "Tạo kịch bản" → nút ở trạng thái đang xử lý.
- Lỗi và hạn mức, chỉ hiện trạng thái đầu tiên thỏa theo thứ tự:
  1. đường tạo chủ đề đang tắt (FR-56 kill) → "Tạm dừng tạo chủ đề mới để kiểm tra chất lượng." nút khóa;
  2. đang có lần thử chạy → "Bạn đang có một kịch bản đang chuẩn bị" kèm link Màn 11;
  3. đã dùng kịch bản miễn phí → nút thay bằng waitlist;
  4. đã trượt 6 lần (trọn đời tài khoản) → "Tài khoản này đã dùng hết lần thử tạo chủ đề." nút khóa;
  5. hết ngân sách hệ thống, hoặc tài khoản đã dùng 20% ngân sách hôm nay → "Hôm nay đã hết lần tạo kịch bản. Quay lại sau 0 giờ đêm nay.";
  6. hết 3 lần thử hôm nay → "Bạn đã dùng 3 lần thử hôm nay. Quay lại sau 0 giờ đêm nay.";
  7. bị kiểm duyệt từ chối → một thông báo chung: "Chủ đề này không tạo được. Thử một chủ đề khác, không nhắc tới người thật hay tổ chức thật." Lần thử không bị tính; quá 10 lần từ chối trong ngày → khóa tới 0 giờ `[ASSUMPTION]`;
  8. ô trống, quá ngắn hoặc quá dài → lỗi inline; lỗi mạng khi gửi → lỗi chuẩn, giữ nội dung hai ô.

**Màn 11 · Đang chuẩn bị / Chưa qua kiểm tra** (đăng nhập)
- **Đang chuẩn bị** (`generating`): chủ đề đã gõ; ba bước kèm trạng thái ("Đang tạo nhân vật" → "Kiểm tra cấu trúc" → "Chạy thử"); "Thường mất khoảng 2 phút. Bạn có thể đóng trang; kịch bản sẽ ở trong Buổi của tôi."; tiêu đề tab trình duyệt đổi thành "✓ Kịch bản sẵn sàng" khi xong; không hiện nội dung sinh ra. Trang tự cập nhật; qua → chuyển sang Màn 3 của persona mới.
- **Chưa qua kiểm tra** (`failed_eval`): "Kịch bản này chưa qua kiểm tra nên chúng tôi không cho bạn luyện với nó. Kịch bản miễn phí của bạn vẫn còn."; lý do, chuỗi cố định theo mã: "Nhân vật chưa đủ chặt chẽ" / "Nhân vật chưa phân biệt được câu hỏi tốt và câu hỏi dẫn dắt" / "Nhân vật dễ để lộ điều đang giữ" / "Nội dung sinh ra không qua kiểm tra an toàn" / "Lỗi hệ thống (lần thử này không bị tính)"; "Còn X lần thử hôm nay"; nút "Thử lại" (mở Màn 10, điền sẵn chủ đề và trọng tâm; gửi thì tạo **buổi mới** trong cùng chủ đề tự tạo) hoặc trạng thái hạn mức như Màn 10.
- Quá 10 phút vẫn `generating` → worker chuyển sang `failed_eval` mã "lỗi hệ thống", không tính lần thử.
- Trống: không áp dụng. Tải: lần mở đầu → tải chuẩn rồi hiện bước hiện tại. Lỗi tải trạng thái: lỗi chuẩn; tiến trình vẫn chạy ở worker.

**Màn 12 · Phương pháp đứng sau InterviewLab** (khách xem được; chỉ mở sau FR-62)
- Nội dung (dàn ý, chữ cuối cùng viết sau research học thuật): thiết kế **lấy cảm hứng từ** các phương pháp đã được nghiên cứu:
  - bệnh nhân chuẩn hóa trong đào tạo y khoa [5][27], kèm lưu ý: số liệu của [5] lấy từ abstract, dị biệt cao, và là cho bệnh nhân chuẩn hóa nói chung, không cho cơ chế thông tin ẩn ("cùng họ phương pháp");
  - vai trò của phản hồi trong luyện tập mô phỏng [26] và trong luyện với AI [6] (ghi rõ [6] là preprint, kèm phát hiện của chính nó: luyện không có phản hồi thì không tiến bộ);
  - persona bám tài liệu cho luyện elicitation [8], **kèm phát hiện bất lợi**: sinh viên đánh giá người đóng vai thật là thật và cuốn hút hơn.
- Nói thẳng, ở dạng "chúng tôi chưa tìm thấy" vì tìm kiếm có giới hạn: chưa tìm thấy nghiên cứu nào tách riêng **cơ chế thông tin ẩn chỉ lộ khi được hỏi đúng**; chưa tìm thấy bằng chứng cho **replay trong kỹ năng hội thoại** (bằng chứng gần nhất chỉ trong hồi sức, độ chắc chắn rất thấp [28]); chưa tìm thấy bằng chứng rằng **phản hồi trích theo từng lượt** tốt hơn phản hồi tổng quát; tổng quan về bệnh nhân ảo LLM chưa thấy nghiên cứu nào chứng minh kỹ năng chuyển sang người thật [30].
- Phần "Chúng tôi tự kiểm thế nào": eval, rò rỉ đã xác nhận, `trace`. Không con số nào cho tới khi research học thuật kiểm lại (NFR-14). Mỗi trích dẫn có link nguồn.
- Trống / tải / lỗi: không áp dụng (trang tĩnh).

### 6.2 Review Console (quản trị viên)

Mọi màn Console chỉ cho email trong `ADMIN_EMAILS` (FR-57). Sau C1 vào C2; thanh bên: Chủ đề, Eval, Phân xử, Duyệt chuỗi, Buổi học, Chủ đề tự tạo, Hạn mức. Màn hình <1024px → "Review Console cần màn hình ≥1024px." Mọi lần mở dữ liệu của người học được ghi log (FR-57). Mọi chữ do người học nhập được hiển thị ở dạng đã escape (NFR-5).

**C1 · Truy cập.** Đăng nhập Google. Email ngoài allowlist → "Tài khoản này không có quyền quản trị." (403), không lộ Console có gì. Tải: chuẩn. Lỗi đăng nhập: lỗi chuẩn kèm nút đăng nhập lại.

**C2 · Chủ đề.** Bảng chủ đề curated: tên, vai trò, số persona, trạng thái từng persona (nháp / đang eval / chờ duyệt / đã publish / cổng tạm / lưu trữ), lần sửa cuối. Lọc theo vai trò, trạng thái. Kéo để đổi thứ tự hiện ở thư viện. Nút "Chủ đề mới". Không xóa; chủ đề và persona chỉ lưu trữ (ẩn khỏi thư viện, giữ dữ liệu). Trống: "Chưa có chủ đề nào" kèm nút tạo; bộ lọc không có kết quả → "Không có chủ đề khớp bộ lọc". Tải, lỗi: chuẩn.

**C3 · Chi tiết chủ đề.** Trường: tên, vai trò, mô tả, ghi chú độ kề bên đề tài phổ biến. Danh sách persona kèm trạng thái và nút mở. Kết quả kiểm **không trùng topic tag** giữa các persona (FR-33). Nút "Persona mới (trống)", "Sinh bản nháp persona" (generator; BA/PM kèm gói grounding và AI critic) và "Lưu trữ". Trống: chưa có persona → "Chưa có persona" kèm hai nút tạo. Tải: chuẩn; đang sinh bản nháp → dòng tiến độ, có thể rời trang. Lỗi: lưu lỗi → lỗi chuẩn cạnh nút lưu; sinh lỗi → lý do và nút thử lại.

**C4 · Soạn persona.** Trình soạn theo schema (form cho trường đơn gồm `display_name`, avatar chọn từ bộ có sẵn, một câu giới thiệu; JSON cho item) kèm **`validate` inline** khi lưu. **Phiên bản:** bộ chọn phiên bản; mỗi lần lưu là một bản nháp mới; bản đã publish chỉ đọc kèm "Tạo nháp từ bản này"; eval và publish luôn gắn phiên bản đang xem. Nút "Chạy nhanh (tốt/xấu ×1)" (chỉ để tinh chỉnh, không bao giờ cho cổng publish) và "Chạy eval đầy đủ" (chỉ khi `validate` sạch; hộp xác nhận kèm chi phí ước tính). Nhận xét AI critic (BA/PM) hiện bên cạnh. Trống: persona mới → form rỗng, trường bắt buộc có dấu. Tải: chuẩn. Lỗi: lưu lỗi → giữ nội dung đang soạn; JSON sai cú pháp → lỗi inline, không lưu; có phiên bản mới hơn → "Có phiên bản mới hơn", không ghi đè.

**C5 · Eval.** Danh sách job: loại, persona, phiên bản, trạng thái (`queued` / `running` kèm tiến độ episode / `failed` kèm lỗi / `done`), chi phí ước tính và thực tế. Báo cáo: mọi chỉ số FR-34, từng ngưỡng FR-35 đạt/không, baseline, tiêu chí BA/PM (FR-65), hiệu chỉnh 50–75%, tỉ lệ cờ judge bị phân xử là không phải rò. **Ý kiến người đọc BA/PM:** form gồm loại người đọc (BA đang làm nghề / PM đang làm nghề / sinh viên / giảng viên), tên hoặc viết tắt, nhận xét; nhãn "người làm nghề" hay "kiểm tra một phần" tự suy ra từ loại. Trống: "Chưa chạy eval" kèm nút chạy. Tải: chuẩn; job đang chạy tự cập nhật. Lỗi: job `failed` → lý do và nút chạy lại; tải báo cáo lỗi → lỗi chuẩn.

**C6 · Phân xử rò rỉ.** Hàng đợi cờ của một báo cáo: đoạn lời persona được trích, hook được phép ở lượt đó, lý do của judge. Mỗi quản trị viên ghi phán quyết (rò đã xác nhận / không phải rò) và lý do, **độc lập** (không thấy phán quyết người kia cho tới khi mình đã ghi). Hai người phân xử là hai email khác nhau trong `ADMIN_EMAILS`. Cờ đóng khi hai phán quyết trùng. Bất đồng → cả hai thấy phán quyết của nhau và sửa được phán quyết của mình; tới khi trùng, cờ tính là rò đã xác nhận `[ASSUMPTION]`. Trống: "Không có cờ nào." Tải: chuẩn. Lỗi: lưu lỗi → giữ lý do đang gõ.

**C7 · Duyệt chuỗi.** Hai nhóm:
- chuỗi cố định của persona (lời mở đầu, hook line, câu hỏi mẫu, nhãn thẻ thói quen), sửa ở C4;
- **chuỗi cố định cấp sản phẩm**, **sửa ngay tại C7**: câu giải thích canvas (FR-48a), dòng chẩn đoán và chuỗi kết quả replay (Màn 6–7), nhãn đường mở và mẫu thẻ tin tưởng (Màn 6), thông báo FR-63, khối thông tin và lý do của Màn 10–11, câu "[persona] chưa từng nói điều này" (FR-19).

Mỗi chuỗi kèm kết quả FR-36, chạy lại khi lưu. Duyệt / trả lại kèm ghi chú (ghi chú hiện cho người sửa kế tiếp). Người duyệt phải khác người sửa `[ASSUMPTION]`. Chuỗi bị FR-36 chặn không duyệt được. Chuỗi cấp sản phẩm đổi thì phải duyệt lại trước khi deploy. Trống: "Không có chuỗi chờ duyệt." Tải, lỗi: chuẩn.

**C8 · Publish.** Checklist: `validate` sạch; mọi ngưỡng FR-35 đạt; mọi cờ đã đóng; mọi chuỗi đã duyệt; FR-36 sạch. Nút "Publish" chỉ bật khi mọi mục xanh. "Gỡ publish" có hai lựa chọn: "Gỡ, buổi đang dở chạy tiếp trên phiên bản cũ" hoặc "Gỡ và dừng buổi đang dở" (buổi chuyển `withdrawn`, §7). Persona mang cờ cổng tạm hiện "Cần qua lại cổng đầy đủ". Trống: không áp dụng. Tải: chuẩn. Lỗi: publish hoặc gỡ lỗi → trạng thái không đổi; checklist đổi giữa lúc bấm → từ chối kèm lý do.

**C9 · Buổi học.** Mọi buổi (curated và tự tạo): lọc theo người học, chủ đề, persona, trạng thái, ngày. Mở một buổi: transcript, canvas, reveal, replay, và trace (FR-44) dạng mỗi lượt một hàng thu gọn, mở ra xem JSON. Chỉ đọc. Trống: "Chưa có buổi nào" / "Không có buổi khớp bộ lọc". Tải, lỗi: chuẩn.

**C10 · Chủ đề tự tạo và hạn mức.**
- Mọi yêu cầu tạo chủ đề: chủ đề người học gõ, trọng tâm, kết quả (qua / trượt kèm mã / kiểm duyệt từ chối), chi phí sinh và eval, số lần thử, báo lỗi của người học (FR-56). Thao tác: **gỡ kịch bản tự tạo** (persona ẩn với chủ sở hữu, buổi đang dở chuyển `withdrawn`, lý do ghi log); **trả lại kịch bản miễn phí** cho người học sau khi xem báo lỗi.
- **Hạn mức:** cap chi phí buổi theo ngày (FR-37, kèm phần dành cho demo), ngân sách sinh theo ngày, tỉ lệ tối đa mỗi tài khoản (20%), mức đã dùng hôm nay; **công tắc tắt đường tạo chủ đề** (FR-56) kèm chỉ số SM-10 và SM-C8 của 30 yêu cầu gần nhất. Sửa không cần deploy.
- Trống: "Chưa có yêu cầu nào." Tải: chuẩn. Lỗi: lưu cấu hình lỗi → giữ giá trị cũ, báo lỗi cạnh ô.

## 7. Trạng thái buổi

Mỗi buổi có một trạng thái. Hai trạng thái đầu chỉ có ở chủ đề tự tạo: buổi được tạo khi yêu cầu tạo chủ đề qua kiểm duyệt (Màn 10), nên trạng thái của kịch bản sinh ra được theo dõi trên chính buổi đó. Yêu cầu bị kiểm duyệt từ chối không tạo buổi.

**Chuyển trạng thái:** `generating` → `interviewing` (qua; lượt 0 được ghi) hoặc `failed_eval`; `interviewing` → `revealed` (lưu số đoán) → `replaying` → `done`, hoặc `revealed` → `done` (bỏ qua hoặc không có replay); mọi trạng thái chưa cuối → `withdrawn` (C8, C10).

| Trạng thái | Nghĩa | Thẻ (Màn 2 / 2b) | Buổi của tôi (Màn 9) | Mở buổi dẫn tới | Console C9 |
|---|---|---|---|---|---|
| `generating` | Đang sinh, `validate`, eval rút gọn | Thẻ chủ đề tự tạo ở Màn 2: "Đang chuẩn bị" → Màn 11 | "Đang chuẩn bị" | Màn 11 đang chuẩn bị | Yêu cầu và tiến độ |
| `failed_eval` | Sinh, `validate`, kiểm an toàn hoặc eval rút gọn không qua, hoặc lỗi hệ thống / quá 10 phút; trạng thái cuối, không trừ kịch bản miễn phí | Thẻ chủ đề tự tạo ở Màn 2: "Chưa qua kiểm tra" → Màn 11 (khi mọi lần thử đều trượt) | "Chưa qua kiểm tra" | Màn 11 chưa qua kiểm tra | Lý do, báo cáo eval rút gọn |
| `interviewing`, 0 lượt người học | Buổi đã tạo, lượt 0 đã ghi | "Tiếp tục buổi luyện" | "Đang làm dở · Tiếp tục" | Màn 3 (nút "Tiếp tục buổi luyện" → Màn 4) | Transcript (lượt 0) |
| `interviewing`, đang hỏi | Có ≥1 lượt, chưa kết thúc | "Tiếp tục buổi luyện" | "Đang làm dở · Tiếp tục" | Màn 4 đúng lượt đã dừng, canvas như lúc rời | Transcript, canvas hiện tại |
| `interviewing`, đã kết thúc, chưa đoán | `ended_at` có, `guess` trống; canvas đóng băng; call reveal đang hoặc đã chạy | "Tiếp tục buổi luyện" | "Đang làm dở · Tiếp tục" | Màn 5 | Như trên, canvas đóng băng |
| `revealed`, đang tính | Số đoán đã lưu; 3 call reveal chưa xong | "Tiếp tục buổi luyện" | "Đang làm dở · Tiếp tục" | Màn 6 chế độ đang tính | Transcript, canvas |
| `revealed` | Số đoán đã lưu; reveal sẵn sàng; đang đề xuất replay | "Tiếp tục buổi luyện" | "Đang làm dở · Tiếp tục" | Màn 6 chế độ đề xuất replay | Reveal đầy đủ, không niêm phong |
| `replaying` | Nhánh replay đang chạy | "Tiếp tục buổi luyện" | "Đang làm dở · Tiếp tục" | Màn 7 đúng lượt replay đang dở | Reveal và nhánh replay |
| `done` | Replay kết thúc theo mọi cách, hoặc không có replay; không còn gì bị giữ | "Xem lại kết quả" | "Xem lại" kèm kết quả | Màn 6 chế độ đã xong (= bản xem lại) | Mọi dữ liệu, chỉ đọc |
| `withdrawn` | Persona bị gỡ kèm dừng buổi (C8) hoặc kịch bản tự tạo bị gỡ (C10); trạng thái cuối | (persona không hiện) | "Đã dừng: nhân vật đã được gỡ" | Trang "Nhân vật này đã được gỡ. Buổi của bạn dừng ở đây." kèm transcript chỉ đọc | Lý do gỡ |

- Persona chưa có buổi nào: thẻ hiện "Bắt đầu" → Màn 3.
- Tài khoản demo: thẻ luôn có thêm "Bắt đầu buổi mới"; nút chính trỏ buổi mới nhất (FR-45).
- Chủ đề tự tạo: mỗi lần thử là **một buổi mới** trong cùng chủ đề; "Thử lại" không tái dùng buổi trượt. Thẻ phản ánh buổi chơi được; nếu chưa có, lần thử mới nhất. Mỗi người học có tối đa một buổi `generating` cùng lúc (luật chống lạm dụng, FR-56).
- Buổi `withdrawn` không tính vào FR-5: khi persona quay lại (phiên bản mới), người học được bắt đầu lại.
- Chỉ "Dừng" ở Màn 7 mới là bỏ replay; rời trang ở bất kỳ trạng thái nào không đổi trạng thái (FR-10).

## 8. Cơ chế agent

### 8.0 Vì sao đây là agent

`brainstorm-intent.md` (mục 2, ràng buộc 7) định nghĩa agent bằng năm thuộc tính (thuật ngữ: §8.1). Agent ở đây là **bộ điều khiển** bao quanh các LLM call: LLM quyết định **nghĩa** (hiểu câu hỏi, trả lời như người, phán đoán một lượt đã kể gì, ghi chú khớp điều gì); code quyết định **tham chiếu** (cắt theo chỉ số, resolve ID lượt), **số học**, **trạng thái** (cổng là luật trên bằng chứng đã phán đoán) và **ranh giới context**. Không có tìm chuỗi, regex hay template nào ra quyết định. Bất biến: **không lời nào được chấm bởi chính call đã viết ra nó.**

| Thuộc tính | Cơ chế | Bằng chứng kiểm được |
|---|---|---|
| Có mục tiêu | Giữ tảng băng cho tới khi người học hỏi đúng cách; ở replay, nhắm một item mục tiêu. Mục tiêu xuyên buổi đã hoãn từ brief | §9.2, §12.2 mục 5 |
| Có trạng thái | Tảng băng, hook ledger, openness, verdict, snapshot bất biến mỗi lượt, nằm ngoài model | §9.1, NFR-10 |
| Tự quyết bước tiếp theo | Mỗi lượt: mở item nào, thả hook nào, mức openness, context nào cho persona. Cuối buổi: chọn khoảnh khắc replay | §8.2, §9.2 |
| Dùng tool | Resolve trích dẫn theo ID lượt và token range, tra ledger, chạy luật mở khóa. Cố ý không cho model gọi: nếu model gọi được `unlock`, cổng nằm trong tay model | §8.2, NFR-5 |
| Tự kiểm tra | Call 1 lượt sau phán đoán lượt persona trước (đã thả hook? đã kể item? vi phạm do-not-assert?); judge cuối buổi; verifier kiểm mọi claim trước khi hiện; classifier kiểm mọi câu "Hãy hỏi" | FR-14, FR-16, FR-22 |

**Bằng chứng mạnh nhất không cần judge:** persona không bao giờ *nhận* nội dung khóa, và canvas không bao giờ vào context của call nào trong buổi. Đây là test tất định trên context đã dựng (§12.2 mục 3). Bằng chứng so sánh: cùng 20 đòn adversarial trên một persona chỉ-prompt (FR-34). Bằng chứng từng lượt: `trace` (FR-44).

### 8.1 Khái niệm

- **Tên gọi:** persona = kịch bản = một dòng `scenario` (có `persona_id` ổn định qua các phiên bản); chủ đề tự tạo = `topic(kind=custom)`; hạn mức "kịch bản miễn phí" đếm persona chơi được. Giao diện dùng "persona" khi đếm và trên thẻ ("3 persona", waitlist), "nhân vật" trong câu văn cảnh báo và hư cấu, và tên persona; không dùng "scenario". "Chủ đề tự tạo" là thứ người học gõ; "kịch bản" là persona sinh ra cho nó, và là đơn vị của hạn mức.
- **Lượt:** một câu của người học cộng một câu trả lời của persona, đánh số 1–30. Lời mở đầu là **lượt 0**: chỉ có lời persona, không gọi LLM, không thả hook, không tính vào 30, không phải đích hợp lệ của `grounded_turn_id`. Mọi lượt được lưu thêm dạng **token đánh số** (tách theo khoảng trắng) để trích dẫn được cắt theo chỉ số.
- **Item:** một điều trong tảng băng: nội dung (bí mật); **topic tag công khai** không lộ nội dung; một đường mở và item tiên quyết nếu có; hook line soạn sẵn; **ràng buộc do-not-assert trung tính** ở mức topic tag; trọng số; một câu hỏi mẫu.
- **Đường mở:** *bề mặt*, *follow-up*, *chuyện quá khứ*, *tin tưởng* (điều kiện: addendum §3.1).
- **Nhãn câu hỏi** (một luật cho mọi vai trò): `confirm_grounded` (tốt), `boundary_probe` (tốt, kể cả tách một cụm danh từ hóa persona vừa nói), `open` (trung tính), `leading` (xấu: thêm nguyên nhân, phán xét hoặc nội dung mới). Nhãn tốt cần `grounded_turn_id` resolve được tới một lượt persona có thật; nhãn `leading` cần `introduced_span`, một token range hợp lệ trong câu người học. Thiếu thì hạ thành `open`. Việc "persona chưa từng nói ý này" là phán đoán của verifier trước khi hiện (§8.3).
- **Loại câu hỏi:** mở / đóng / giả định-tương-lai / chuyện-quá-khứ-cụ-thể / khác.
- **Openness:** số nguyên 0–10, bắt đầu ở 4, code cập nhật theo nhãn và loại câu hỏi (addendum §3.1). Persona chỉ nhận 3 mức; openness chỉ đổi độ sẵn lòng kể về item.
- **Verdict:** phán đoán của **Call 1 lượt t+1** về lượt persona t: hook được chọn ở lượt t đã được thả chưa; mỗi item đã mở mà chưa kể đã được kể chưa; ràng buộc do-not-assert nào bị vi phạm. Verdict lưu gắn với lượt t. Lượt persona cuối do judge cuối buổi phán đoán; lượt replay do một judge ngay sau câu trả lời.
- **Hook ledger:** *thả* khi verdict của lượt đó dương; *nhặt* ở bất kỳ lượt sau mà Call 1 gán `hook_id` và code chấp nhận; *bỏ qua* là chú thích khi lượt ngay sau lượt thả không nhặt. Hook còn nhặt được tới khi item của nó mở. **Câu hỏi chốt** (câu mở chung không nhắm chủ đề nào, kiểu "Có điều gì em chưa hỏi mà chị nghĩ em nên biết không?") cũng làm thả một hook.
- **KHAI THÁC (đã khai thác):** item đã mở **và** có verdict "đã kể" dương. Verifier xác nhận lại khi hiện; verifier bác thì vẫn giữ tín dụng, ghi chỉ số.
- **Canvas:** một khối văn bản tự do, tự lưu, đóng băng ở "Kết thúc buổi"; chỉ bản cuối được chấm.
- **NHẬN BIẾT:** số item quan trọng người học ghi trên canvas, đã xác nhận hay chưa. Mẫu số = số item **đã lộ ra trong transcript** (hook đã thả hoặc đã kể). Kết quả chấm từng đoạn canvas: item đã kể → tính cả KHAI THÁC và NHẬN BIẾT; item đã lộ nhưng chưa kể → chỉ NHẬN BIẾT, dòng "Bạn đoán đúng, nhưng [persona] chưa xác nhận…"; item **chưa từng lộ ra** → không tính, nhãn "Chưa từng lộ ra"; fact bề mặt → không tính, không gắn nhãn; điều chưa từng được nói → không tính, nhãn "Chưa từng được nói" (tương đương câu dẫn dắt, nhưng trên ghi chú). Cùng item nhắc hai lần tính một lần.

### 8.2 Mỗi lượt: đúng 2 LLM call

1. **Call 1, phân tích.** Input chỉ gồm những thứ persona cũng được thấy (danh tính, fact bề mặt, item đã mở, hook đã thả, hook được chọn ở lượt persona trước, topic tag, ràng buộc do-not-assert trung tính, transcript dạng token) cộng câu mới của người học. Call 1 **không bao giờ thấy nội dung item khóa** và không bao giờ thấy canvas. Output: verdict cho lượt persona trước; loại câu hỏi; nhãn và bằng chứng (`grounded_turn_id` hoặc `introduced_span`); `hook_id`; topic tag khớp.
2. **Code** (không tốn LLM): ghi verdict vào lượt trước (hook đã thả, item đã kể, cờ do-not-assert) **trước** khi kiểm `hook_id`, nên hook vừa thả ở lượt t nhặt được ngay ở lượt t+1; nhãn thiếu bằng chứng hợp lệ → `open`; `hook_id` không trỏ tới hook đã thả và còn nhặt được → bỏ; tối đa 1 topic tag. **Quyết định mở khóa** theo luật từng đường mở trên snapshot t−1, tối đa 1 item mỗi lượt. Cập nhật openness, ledger, chọn hook thả ở lượt này.
3. **Call 2, persona.** Context chỉ gồm: danh tính, fact bề mặt, mức openness, transcript, luật giọng; item đã mở (item vừa mở phải nói ngay); tối đa một hook line cần thả; ràng buộc do-not-assert của topic tag khớp, **chỉ khi item của tag đó vẫn khóa sau quyết định mở khóa**, cộng một luật chung tránh mọi chủ đề được dặn tránh. Persona không bao giờ thấy danh sách ràng buộc của mọi item khóa.
4. **Ghi lượt** trong một transaction: transcript và token, phân tích, verdict của lượt trước, trạng thái, snapshot.

**Nói chính xác về cổng:** hàm mở khóa là code, nhưng input của nó là phán đoán của Call 1. Code kiểm tham chiếu, không kiểm ngữ nghĩa. Cổng là **một hàm tất định, kiểm toán được, của các phán đoán của model**.

### 8.3 Ngoài lượt

**Reveal: đúng 3 call logic tuần tự**, khởi chạy lúc "Kết thúc buổi" trong khi Màn 5 hiện; số đoán không vào call nào.
1. **Judge cuối buổi:** verdict cho lượt persona cuối (hook, đã kể, do-not-assert); chấm canvas đã đóng băng (bọc như dữ liệu): trả token range cho mỗi kết quả (item / chưa từng được nói), code cắt theo chỉ số, ngoài phạm vi hoặc rỗng thì bỏ.
2. **Generator:** viết nhận xét và "Mang về" dạng claim có cấu trúc `{text, cited_turns, item_id?, canvas_range?, suggested_question?}`; code resolve mọi tham chiếu, tham chiếu hỏng thì bỏ claim.
3. **Verifier:** kiểm lại, trên dữ liệu đã đóng băng: nhãn và loại câu hỏi đã dẫn tới mỗi lần mở khóa; tính mới của mọi cụm `leading` sẽ hiện ("persona chưa từng nói ý này"); mỗi verdict "đã kể" được tính; mỗi claim của generator (lượt được trích có chứa điều được nói, không khẳng định về người dùng thật); **gán nhãn câu hỏi cho mọi `suggested_question`**, câu `leading` bị loại; mọi claim "bạn bỏ qua hook".
- Xử lý: claim, lời khen hay câu "Hãy hỏi" bị bác thì không hiện; lần mở khóa hay verdict "đã kể" bị bác thì giữ tín dụng, ghi chỉ số (NFR-8). Call lỗi sau tối đa 2 lần thử lại kỹ thuật: suy giảm theo Màn 6. Kết quả cả ba call lưu theo buổi; mở lại reveal không gọi lại LLM.
- **Chọn khoảnh khắc replay không phụ thuộc call nào của reveal:** nó chỉ dùng ledger và nhãn đã qua kiểm của code (§9.2), nên chạy trước cả ba call; generator được báo item mục tiêu đang niêm phong nhưng **không nhận nội dung, câu hỏi mẫu hay hook line** của nó, để không claim nào diễn đạt lại được nó (Màn 6). Verifier chỉ quyết định **câu chữ** của dòng chẩn đoán (Màn 6 mục 2), không đổi khoảnh khắc.
- **Câu giải thích đoạn canvas** lấy từ tập chuỗi cố định (FR-48a), không bao giờ từ trường `reason` của judge; `reason` chỉ lưu nội bộ.
- **Replay:** mỗi lượt 3 call (§9.4).

## 9. Replay: spec cơ chế

### 9.1 Snapshot mỗi lượt
Sau mỗi lượt *t* của buổi chính: snapshot bất biến gồm `turn_index`, item đã mở (kèm lượt), hook ledger, item đã kể, `openness`, và con trỏ tới transcript tới hết lượt *t*. Snapshot 0 là trạng thái khởi đầu. Verdict của lượt persona *t* đến cùng lượt *t+1*; snapshot *t* được cập nhật phần verdict khi lượt *t+1* ghi (cùng transaction), và đó là thay đổi duy nhất được phép trên một snapshot.

### 9.2 Chọn khoảnh khắc (tất định, không dùng LLM)
1. **Ứng viên chính:** mọi hook *bỏ qua*, thả ở lượt *h*, của một item đi đường follow-up hoặc chuyện quá khứ và vẫn khóa khi buổi kết thúc. Chọn trọng số cao nhất; hòa thì *h* sớm nhất; vẫn hòa thì thứ tự item. Rẽ nhánh **sau lượt h**.
2. **Dự phòng 1:** không có ứng viên chính → lượt `leading` sớm nhất *l* (nhãn sau khi code kiểm, không chờ verifier). Rẽ nhánh sau lượt *l−1*. Mục tiêu hiển thị "hỏi lại mà không dẫn dắt".
3. **Dự phòng 2:** không có lượt `leading` → không có replay; reveal hiện câu hỏi mẫu của item quan trọng nhất còn khóa; buổi chuyển thẳng sang `done`.

### 9.3 Khôi phục context
Nhánh replay bắt đầu từ bản sao snapshot tại điểm rẽ nhánh, kèm verdict của các lượt ≤ điểm rẽ. Mọi thứ sau điểm rẽ trong buổi chính **không có mặt** trong context. Canvas không vào context.

### 9.4 Ba lượt qua cùng cổng
Đúng 3 lượt, mỗi lượt chạy §8.2 cộng judge ngay sau câu trả lời. Hook của item mục tiêu nhặt được ở cả 3 lượt. Khi nhiều item cùng thỏa luật, ưu tiên item mục tiêu. Mỗi buổi 1 lần replay.

### 9.5 Thành công và thất bại
- **Thành công (ứng viên chính):** item mục tiêu mở và judge xác nhận persona **đã kể** trong ≤3 lượt.
- **Thành công một phần:** persona kể item khác nhưng không kể item mục tiêu → hiện item vừa mở, rồi như thất bại.
- **Thất bại:** hết 3 lượt → hiện nội dung item mục tiêu và câu hỏi mẫu.
- **Dự phòng 1:** thành công khi cả 3 lượt không `leading` và ≥1 lượt có nhãn tốt.
- **Bỏ giữa chừng:** "Dừng" → như thất bại. **Bỏ qua:** không tạo nhánh.

### 9.6 Mở niêm phong và kết thúc buổi
Item mục tiêu mở niêm phong ngay khi replay kết thúc theo bất kỳ cách nào. Buổi chuyển sang `done` lúc đó, hoặc ngay sau reveal nếu không có replay.

### 9.7 Cô lập
Replay là nhánh riêng, không bao giờ ghi đè transcript, ledger, snapshot, verdict, canvas, điểm reveal hay chỉ số của buổi chính. Kết quả replay lưu riêng, hiện kèm reveal, không đổi KHAI THÁC hay NHẬN BIẾT.

## 10. Yêu cầu chức năng

ID được giữ ổn định; FR mới đánh số tiếp từ FR-46. Lát ghi trong tiêu đề mỗi nhóm; FR khác lát của nhóm có nhãn riêng. Nhóm của người học đứng trước, nhóm vận hành và Console đứng cuối (cùng thứ tự với §6).

### Truy cập và tài khoản (S1)
- **FR-1** Khách xem được trang chủ, thư viện, màn chủ đề và trang phương pháp mà không cần đăng nhập.
- **FR-2** Trước khi bắt đầu một buổi hoặc tự tạo chủ đề, người học phải đăng nhập bằng Google. Người học không có vai trò hay phân quyền; quản trị viên lấy từ allowlist (FR-57). Không magic link, không đường đăng nhập riêng cho demo.
- **FR-3** Người học chỉ xem được buổi và chủ đề tự tạo của chính mình. Quản trị viên xem được mọi thứ (NFR-9).
- **FR-63** Ngay sau lần đăng nhập Google đầu tiên (từ bất kỳ đâu), và mỗi khi phiên bản thông báo đổi, người học thấy Màn 0 **trước mọi trang đòi đăng nhập hay ghi dữ liệu**. Chuỗi khởi đầu: "Buổi luyện của bạn (hội thoại, ghi chú, kết quả, chủ đề bạn tự tạo và câu trả lời 'luyện điều gì') được lưu để bạn xem lại. Quản trị viên InterviewLab đọc được các nội dung này để kiểm tra và cải thiện chất lượng; bạn có thể xóa tài khoản và toàn bộ dữ liệu bất cứ lúc nào trong Buổi của tôi. Nội dung được gửi tới nhà cung cấp AI để tạo câu trả lời, chấm và kiểm tra; nhà cung cấp có thể lưu tạm theo chính sách của họ. Chúng tôi ghi lại cách bạn dùng sản phẩm (ví dụ thời gian trả lời, loại thiết bị) để đo chất lượng. Chúng tôi không công khai hay bán dữ liệu của bạn. Đừng nhập tên hay thông tin cá nhân của người thật." Người học phải bấm "Tôi hiểu"; thời điểm và phiên bản đồng ý được lưu. Chuỗi đi qua duyệt chuỗi cấp sản phẩm (C7); câu "không dùng để huấn luyện" chỉ được thêm khi cấu hình của nhà cung cấp đã được kiểm (§12.4).
- **FR-66** Người học xóa được tài khoản và **toàn bộ dữ liệu** của mình từ Buổi của tôi (Màn 9): mọi buổi, lượt, canvas, kết quả, replay, chủ đề tự tạo và persona sinh cho họ, lần thử tạo chủ đề, sự kiện gắn với tài khoản. Xóa cứng, không khôi phục, xong trong một thao tác; sau đó phiên đăng nhập kết thúc. Không có xóa tự động theo thời gian. Chỉ số đã tổng hợp (không gắn người) được giữ. Log truy cập của quản trị viên giữ dòng log nhưng bỏ nội dung.

### Thư viện, chủ đề và vai trò (S2; FR-5 thuộc S1)
- **FR-4** Thư viện liệt kê chủ đề curated có ≥1 persona đã publish, và chủ đề tự tạo của người học. Màn chủ đề liệt kê persona đã publish kèm câu hỏi nghiên cứu, một câu về persona và bộ đếm niêm phong. Nút của một persona dẫn tới màn theo trạng thái buổi (§7). Tài khoản demo luôn có thêm "Bắt đầu buổi mới".
- **FR-5** *(S1)* Mỗi người học có **một buổi cho mỗi persona** (curated hoặc tự tạo), tính theo `persona_id` ổn định chứ không theo phiên bản: publish phiên bản mới không mở thêm buổi. Buổi chưa xong chỉ tiếp tục được, không bắt đầu lại. Buổi `withdrawn` không tính (§7). Tài khoản demo không bị giới hạn này. Giới hạn chi phí toàn hệ thống do FR-37 giữ.
- **FR-50** Thư viện có bộ lọc vai trò UX / BA / PM / Khác; chỉ lọc chủ đề theo trường `role`, không đổi gì khác. Lựa chọn được nhớ (trình duyệt cho khách, tài khoản sau đăng nhập) và mỗi lần chọn được ghi sự kiện.
- **FR-51** Màn chủ đề và màn chuẩn bị hiện cảnh báo trùng đề tài và dòng "[Persona] sẽ không bàn về câu hỏi nghiên cứu của bạn." Sản phẩm không có chức năng tìm hay khớp chủ đề theo đề tài thật của người học.

### Buổi phỏng vấn (S1)
- **FR-6** Màn chuẩn bị nêu câu hỏi nghiên cứu của persona, giới hạn 30 lượt, luật "chỉ nói nếu hỏi đúng cách", định nghĩa "một điều", và giới thiệu canvas.
- **FR-7** Người học chat với persona bằng tiếng Việt; buổi mở bằng lời mở đầu ở lượt 0. Màn hình luôn hiện câu hỏi nghiên cứu, số lượt trên 30, và bộ đếm niêm phong (bộ đếm không đổi suốt buổi).
- **FR-8** Trong buổi, màn hình không hiện nhãn, gợi ý hay số item đã mở. Canvas không bao giờ vào context của call nào trong buổi, không có gì đọc canvas trước "Kết thúc buổi", không autocomplete, không điền sẵn, không đếm so với tổng.
- **FR-9** Người học kết thúc buổi được bất cứ lúc nào; buổi tự kết thúc sau lượt 30.
- **FR-10** Buổi gián đoạn tiếp tục đúng chỗ theo §7 (kể cả canvas đã lưu); chỉ "Dừng" mới là bỏ replay.
- **FR-11** Lượt có LLM call lỗi không được tính và không đổi trạng thái; người học được mời gửi lại.

### Canvas ghi chú (S1)
- **FR-46** Màn phỏng vấn có canvas ghi chú: notepad cố định cạnh chat trên desktop, bong bóng mở notepad trên mobile; một khối văn bản, tự lưu im lặng, sửa tự do trong buổi, sửa được khi persona đang gõ. Hành vi chi tiết (kích thước, cách thu, ô gửi khi notepad mở): Màn 4 là nguồn duy nhất.
- **FR-47** Buổi kết thúc (bấm "Kết thúc buổi" hoặc tự kết thúc sau lượt 30) thì canvas đóng băng và 3 call reveal bắt đầu; chỉ bản đóng băng được chấm. Không có ghi thời điểm từng ghi chú.
- **FR-48** Judge cuối buổi chấm canvas theo §8.1 (KHAI THÁC + NHẬN BIẾT / chỉ NHẬN BIẾT / chưa từng lộ ra / fact bề mặt không nhãn / chưa từng được nói), trả token range cho mỗi kết quả; code cắt theo chỉ số; range ngoài phạm vi hoặc rỗng bị bỏ. Cùng item tính một lần.
- **FR-48a** Mỗi đoạn canvas được tô hiện **một câu giải thích từ tập đóng** theo loại kết quả, kèm nội dung item khi có (trừ item mục tiêu còn niêm phong). Tập khởi đầu, đi qua duyệt chuỗi cấp sản phẩm (C7):
  - item đã kể: "[Persona] đã kể điều này ở lượt N.";
  - item đã lộ, chưa kể: "Bạn đoán đúng, nhưng [persona] chưa xác nhận — trong buổi thật, bạn sẽ không biết mình đúng.";
  - item chưa từng lộ ra: "[Persona] chưa nói gì gợi tới điều này. Đây là phỏng đoán, chưa được xác nhận.";
  - chưa từng được nói: "[Persona] chưa từng nói điều này. Ghi chú này là giả định của bạn, không phải điều bạn nghe được.";
  - thêm sau replay thành công, cho đoạn khớp item mục tiêu: "Trong buổi chính [persona] chưa xác nhận; ở lần luyện lại bạn đã mở được nó."

  Trường `reason` của judge không bao giờ hiện cho người học.
- **FR-49** Canvas rỗng: reveal hiện "Không có ghi chú trong buổi này" thay cho NHẬN BIẾT (không bao giờ là 0), dòng chẩn đoán theo nhánh "canvas không khớp" và nhánh verifier của Màn 6 mục 2, không nhắc "lần sau".

### Engine mỗi lượt (S1)
- **FR-12** Hệ thống tạo phân tích cho mỗi câu của người học (§8.2 bước 1) mà không đưa nội dung item khóa hay canvas vào.
- **FR-13** Mở khóa chỉ bằng luật theo đường mở, trên bằng chứng đã qua kiểm của code, ledger và openness. Nhãn thiếu bằng chứng hợp lệ bị hạ thành `open` trước khi luật chạy.
- **FR-14** Hook chỉ được ghi đã thả, và item chỉ được tính đã kể, khi verdict tương ứng dương: Call 1 lượt sau (buổi chính), judge cuối buổi (lượt persona cuối), hoặc judge replay (mọi lượt replay; ở replay, verdict trong output Call 1 bị bỏ qua). Verdict được ghi trước khi kiểm `hook_id` của cùng lượt.
- **FR-15** Context của persona chỉ gồm những gì ở §8.2 bước 3.
- **FR-16** Lượt persona vi phạm do-not-assert (theo verdict) bị gắn cờ, loại khỏi bằng chứng ở reveal và ghi log; lượt cuối do judge cuối buổi kiểm.
- **FR-17** Hệ thống lưu snapshot bất biến sau mỗi lượt (§9.1).

### Đoán và reveal (S1)
- **FR-18** Trước reveal, người học trả lời "Bạn nghĩ [persona] đã kể cho bạn bao nhiêu trong [N] điều?" bằng thanh trượt 0–N. Số đoán so với KHAI THÁC (SM-6) và không vào LLM call nào.
- **FR-19** Màn reveal hiện theo Màn 6 (ba chế độ, thứ tự cố định, luật niêm phong). Mọi lượt bị nêu là dẫn dắt hiện cụm tự thêm (cắt theo token range) và "[persona] chưa từng nói điều này", chỉ khi verifier đồng ý; chuỗi này đi qua C7.
- **FR-20** Tối đa 3 nhận xét. Code tính điều kiện kích hoạt từ các nhãn đã qua kiểm; generator viết nhận xét theo điều kiện đó; verifier kiểm (§8.3); nhận xét về lượt `leading` mà verifier bác tính mới thì không hiện. Lời khen có căn cứ (nếu có, qua verifier) đứng đầu; với chủ đề tự tạo, nhận xét thuộc trọng tâm luyện đứng ngay sau. Mỗi nhận xét trích ít nhất một lượt hoặc một đoạn canvas.
- **FR-21** Mọi trích dẫn render từ transcript hoặc canvas đã lưu theo ID lượt và token range. Trích dẫn không resolve được hoặc bị verifier bác thì claim bị bỏ, riêng tín dụng mở khóa và "đã kể" vẫn được giữ (§8.3). Bấm trích dẫn nhảy tới lượt.
- **FR-22** Reveal chạy đúng 3 call logic (judge cuối buổi → generator → verifier), khởi chạy lúc "Kết thúc buổi". Kết quả lưu; lỗi xử lý theo Màn 6.

### Replay (S1)
- **FR-23** Chọn khoảnh khắc theo §9.2 và đề xuất trên reveal.
- **FR-24** Khôi phục context theo §9.3.
- **FR-25** Đúng 3 lượt qua cùng pipeline cộng judge ngay sau câu trả lời (§9.4).
- **FR-26** Hiện kết quả theo §9.5.
- **FR-27** Không bao giờ sửa dữ liệu hay chỉ số của buổi chính (§9.7).

### Guide "Mang về" (S1)
- **FR-28** Tiêu đề "Thói quen hỏi của bạn — đọc lại trước buổi thật"; gồm tối đa 3 nhận xét của FR-20 (mỗi lỗi là cặp "Thay vì hỏi" trích nguyên văn câu người học / "Hãy hỏi" do generator viết) và thẻ thói quen khi ledger vượt ngưỡng (addendum §3.3). Câu hỏi mẫu của item bỏ lỡ chỉ ở FR-19.
- **FR-29** Người học in hoặc lưu riêng phần này thành PDF; bản in có dòng trống "Câu của bạn, cho đề tài của bạn: ______" dưới mỗi "Hãy hỏi"; lời khen không vào bản in.
- **FR-30** Mọi câu trong "Mang về" là (a) trích nguyên văn từ transcript hoặc canvas của người học, (b) chuỗi cố định đã duyệt, hoặc (c) claim của generator đã qua verifier; mọi "Hãy hỏi" đã qua nhãn của verifier và không phải `leading`. Không có khẳng định nào về người dùng thật. Generator hoặc verifier lỗi → dòng trạng thái trống.

### Sau buổi và tín hiệu (S1–S2, S4)
- **FR-31** Cuối reveal đề xuất persona kế tiếp: persona chưa luyện cùng chủ đề trước, rồi chủ đề khác cùng vai trò (chủ đề tự tạo không có vai trò: đề xuất theo bộ lọc người học đang chọn, mặc định mọi chủ đề). Hết persona chưa luyện → chuỗi "đã luyện mọi persona" của Màn 6.
- **FR-32** Nút waitlist ghi người bấm, thời điểm và ngữ cảnh (hết persona / hết kịch bản tự tạo miễn phí); bấm lại không tạo bản ghi mới.
- **FR-64** *(S4)* Reveal của persona BA/PM có link "Người này có giống stakeholder thật không?" mở một câu hỏi có/không kèm ô nhận xét tùy chọn; câu trả lời được lưu theo persona.

### Buổi của tôi (S1)
- **FR-39** Danh sách mọi buổi của người học kèm trạng thái theo §7. Số (KHAI THÁC trên tổng, NHẬN BIẾT) chỉ hiện cho buổi `done`; buổi ở trạng thái khác không có số trong danh sách lẫn trong dữ liệu gửi về (giữ niêm phong).
- **FR-40** Mở buổi `done` hiện Màn 6 chế độ đã xong (transcript chính, transcript nhánh replay, canvas có tô, reveal đầy đủ), chỉ đọc, đúng như lúc kết thúc, không gọi LLM.
- **FR-41** Không gì còn bị giữ trên trang xem lại, trong mọi cách kết thúc: replay ứng viên chính thành công, một phần, thất bại; replay dự phòng 1 thành công, thất bại; "Dừng"; "Bỏ qua"; không có replay.
- **FR-42** Header có "Buổi của tôi" sau khi đăng nhập.
- **FR-43** Người học chưa có buổi nào thấy trạng thái trống kèm nút vào thư viện.

### Tạo chủ đề của bạn (S5)
- **FR-52** Người học đã đăng nhập tự tạo chủ đề bằng một ô chủ đề (10–300 ký tự) và ô tùy chọn "Bạn muốn luyện điều gì trong buổi này?" (Màn 10). Người học không chọn, không mô tả persona và không bao giờ thấy hay tác động vào nội dung ẩn. Chủ đề tự tạo không có vai trò.
- **FR-53** Một call phân loại ánh xạ câu trả lời "luyện điều gì" vào tập đóng `follow_up` / `past_story` / `trust` / `no_leading` / `general`; **code** kiểm output thuộc tập, ngoài tập thì thành `general`. Văn bản gốc chỉ có trong call phân loại và trong dữ liệu lưu (`focus_raw`), không bao giờ trong context của call nào khác. Ô chủ đề thì khác: nó là văn bản tự do và **đi thẳng vào generator**; neo qua ô chủ đề là rủi ro còn lại đã chấp nhận (§13).
- **FR-54** Pipeline sinh dùng **cùng generator và cùng `validate`** với Console (FR-58), chạy trên worker, với hồ sơ cổng riêng: sinh 1 persona (kèm câu hỏi nghiên cứu riêng về một khía cạnh phụ của chủ đề, theo ràng buộc của chính sách kiểm duyệt) → `validate` (kể cả: không có câu mệnh lệnh hay câu nói với model trong trường persona) → **kiểm an toàn đầu ra** (FR-36 mở rộng: mọi fact bề mặt, item, hook line, lời mở đầu, câu hỏi nghiên cứu; chặn khẳng định về người thật hay tổ chức thật, nội dung vi phạm chính sách) → **eval rút gọn**: 1 run tốt (mù tảng băng) + 1 run xấu + 5 adversarial (có đòn "dò bản đồ topic" và đòn dùng lại từ trong chủ đề), mỗi run **tối đa 10 lượt người học**, 7 run song song. Qua khi: run tốt mở ≥2 lần run xấu và ≥3 item; judge xác nhận persona truyền đạt hook được chọn ≥90% `[ASSUMPTION]`; **0 cờ rò rỉ** (không có người phân xử, nên mọi cờ là trượt); kiểm an toàn sạch. Qua → buổi sang `interviewing`; trượt → `failed_eval` kèm mã lý do; quá 10 phút → `failed_eval` mã lỗi hệ thống.
- **FR-55** Kiểm duyệt chạy **đồng bộ trong lần gửi ở Màn 10, trước khi tạo buổi**, cùng call phân loại trọng tâm. Chủ đề được bọc như dữ liệu. Chính sách:
  - **từ chối:** nhắm vào người thật có tên hoặc nhận ra được; **tổ chức hay thương hiệu thật có tên** (sàng lọc chặt); nội dung tình dục; hoạt động phạm pháp; quấy rối hay hạ thấp một nhóm người;
  - **cho phép kèm ràng buộc** (ràng buộc được truyền cho generator): chủ đề có người dùng là trẻ vị thành niên → persona luôn là người lớn (phụ huynh, giáo viên); chủ đề sức khỏe, sức khỏe tâm thần → chỉ về việc dùng dịch vụ, không có nội dung khủng hoảng hay tự hại trong item;
  - **cho phép:** còn lại.

  Bị từ chối → không tạo buổi, không tính lần thử, một thông báo chung (Màn 10); quá 10 lần từ chối một ngày → khóa tới 0 giờ `[ASSUMPTION]`.
- **FR-56** Hạn mức và an toàn của đường tự tạo chủ đề (luật chống lạm dụng, không phải giả định):
  - tối đa **3 lần thử mỗi người học mỗi ngày** (qua hay trượt đều tính; bị kiểm duyệt từ chối và trượt do lỗi hệ thống không tính);
  - tối đa **6 lần trượt trọn đời mỗi tài khoản**; hết thì đường này khóa với tài khoản đó;
  - **1 kịch bản tự tạo chơi được miễn phí** mỗi tài khoản (trượt không trừ), sau đó nút waitlist;
  - tối đa **một lần thử đang chạy** mỗi người học;
  - **ngân sách sinh theo ngày tách khỏi cap chi phí buổi** (FR-37); mỗi lần thử **giữ trước chi phí tối đa** của nó khi bắt đầu và trả lại phần thừa khi xong, nên không vượt ngân sách; **không tài khoản nào dùng quá 20%** ngân sách ngày;
  - quản trị viên **gỡ được kịch bản tự tạo** từ C10; người học báo được "Kịch bản này có vấn đề" ở reveal của kịch bản tự tạo, và quản trị viên trả lại kịch bản miễn phí từ C10 nếu thấy đúng;
  - **công tắc tắt:** sau 30 yêu cầu (tính lại theo cửa sổ 30 yêu cầu gần nhất), nếu tỉ lệ qua **<50%** hoặc chi phí mỗi kịch bản chơi được **>12 USD**, quản trị viên tắt đường này để xem lại (C10); khi tắt, Màn 10 hiện trạng thái tạm dừng;
  - mọi màn của chủ đề tự tạo mang nhãn "Kiểm tra nhẹ", mọi item ở reveal mang nhãn "chi tiết hư cấu", màn chuẩn bị và reveal có dòng "Đây không phải insight thật".

### Vận hành: soạn và publish (S1 CLI; S3 Console)
- **FR-33** `validate` kiểm file persona theo schema và chuẩn chất lượng:
  - 8–12 item, đủ 4 đường mở, ≥2 item thuộc đường chuyện quá khứ hoặc tin tưởng; mỗi item đủ các trường ở §8.1;
  - persona có `topic_id`, `language`, `research_goal` (dạng câu hỏi), `opening_line`, ≥12 fact bề mặt, câu hỏi mẫu;
  - không ràng buộc do-not-assert, topic tag hay hook line nào chứa từ mang nội dung của item khóa;
  - **không trùng topic tag với persona khác cùng chủ đề**;
  - mọi item đến được (đồ thị tiên quyết không vòng; ngưỡng openness đạt được trong ≤20 lượt tốt).
- **FR-34** Eval đầy đủ: run tốt (mù tảng băng) và run xấu, mỗi loại 3 lần lấy trung vị, cộng 20 adversarial (có đòn "dò bản đồ topic"), episode chạy song song trên worker. Khi tinh chỉnh, chạy nhanh tốt/xấu ×1; chạy nhanh **không bao giờ** dùng cho cổng FR-35. Đây là luật chi phí, không phải luật lịch: một lần eval đầy đủ hơn 2.000 call, khoảng 20–40 USD, nên tinh chỉnh 15 lần bằng eval đầy đủ sẽ tốn hàng trăm USD trước khi có người học nào. Báo cáo: số item mở và tỉ lệ so với mục tiêu hiệu chỉnh 50–75%; **rò rỉ mỗi episode** (định nghĩa (a) nói nội dung item chưa mở; (b) nêu topic còn khóa bằng lời của persona ngoài hook được phép; judge gắn cờ, người phân xử xác nhận theo tiêu chí viết sẵn, mỗi phán quyết kèm trích dẫn và lý do); run baseline chỉ-prompt; tỉ lệ judge xác nhận persona đã truyền đạt hook; tỉ lệ mâu thuẫn trước/sau mở item; bất đồng verifier theo từng loại claim.
- **FR-35** Publish chỉ thành công khi persona đạt mọi ngưỡng của §12.2 mục 2, mọi cờ rò rỉ đã đóng bởi hai người phân xử, mọi chuỗi cố định đã duyệt và FR-36 sạch; nếu từ chối thì nêu từng lý do. Áp cho cả CLI `publish` và nút Publish của Console. Ở S1–S2, CLI `publish` chạy **cổng tạm** (§3): cùng các ngưỡng, cùng bộ kiểm FR-36 trong CLI, chuỗi do Thanh duyệt tay và ghi trong báo cáo; persona mang cờ `interim_gate` và phải qua lại cổng đầy đủ (duyệt chuỗi C7, publish C8) sau S3 và trước ra mắt; persona không qua thì bị gỡ publish cho tới khi qua.
- **FR-36** Kiểm tự động mọi **chuỗi cố định** (lời mở đầu, hook line, câu hỏi mẫu, nhãn thẻ thói quen, và chuỗi cấp sản phẩm ở C7) lúc soạn, và mọi nội dung persona sinh ra ở đường tự tạo chủ đề (FR-54): chặn câu khẳng định về người dùng thật, câu `leading` (qua classifier nhãn), và (với nội dung sinh) khẳng định về người thật hay tổ chức thật. Bộ kiểm có trong CLI từ S1; Console dùng lại ở S3. Nội dung của thẻ thói quen và câu "Hãy hỏi" sinh lúc chạy do verifier kiểm (FR-30), không thuộc FR-36.
- **FR-65** *(S4)* Persona BA/PM được soạn từ **gói grounding** qua generator. Gói gồm:
  - danh mục mẫu của research.md §6, kèm nguồn và độ tin từng mẫu; ưu tiên mẫu phê duyệt 11–16 [53] và mẫu workaround 1–9 [35]; mẫu "ngưỡng tiền phê duyệt" **không có nguồn** và chỉ được dùng như `[ASSUMPTION]`, không bao giờ như lời có nguồn; mẫu từ blog nhà cung cấp ERP ghi độ tin thấp;
  - lưu ý độ lệch: nguồn mạnh là y tế và mua sắm công, chưa có mẫu từ doanh nghiệp VN; generator phải chuyển bối cảnh, AI critic chấm riêng độ hợp bối cảnh VN;
  - quy tắc sinh của research.md §6: danh từ hóa giấu tác nhân ("rồi nó đi qua phê duyệt") để người học tách ra; "hệ thống làm X nhưng thực tế Y" kèm phần người bù; ngoại lệ gắn điều kiện thành item follow-up; truyền miệng thành item tin tưởng; với PM, dấu hiệu "fluff" ("thường thì", "chắc là sẽ", khen lịch sự) thành chất liệu cho item chuyện quá khứ.

  AI critic đóng senior BA/PM viết nhận xét vào báo cáo eval; AI critic **không** được tính là kiểm độ thật. **Người đọc là BA hoặc PM đang làm nghề** (≥1 BA cho persona BA, ≥1 PM cho persona PM) đọc transcript eval và ghi ý kiến vào báo cáo; nếu chỉ tìm được sinh viên hoặc giảng viên của ngành, báo cáo ghi "kiểm tra một phần", không bao giờ ghi là người làm nghề đã duyệt. Eval có tiêu chí BA và tiêu chí PM (ngưỡng ở §12.2 mục 2).

### Review Console (S3)
- **FR-57** Console chỉ cho email trong biến môi trường `ADMIN_EMAILS`; tài khoản khác nhận 403. Ghi log truy cập (ai, dữ liệu nào, khi nào) cho: mọi màn Console mở dữ liệu của người học (kể cả danh sách), và mọi lệnh CLI đọc dữ liệu người học (`trace`, xuất báo cáo). Truy cập thẳng cơ sở dữ liệu chỉ dành cho Thanh, để vận hành và sửa lỗi, và **không có log** (NFR-9 nói rõ điều này). Người phân xử thứ hai là một quản trị viên và có cùng quyền xem.
- **FR-58** Quản trị viên tạo, sửa chủ đề và persona theo schema, với `validate` inline khi lưu và phiên bản bất biến sau publish; sinh bản nháp persona bằng generator (cùng generator với FR-54).
- **FR-59** Quản trị viên xếp eval vào hàng đợi (nhanh hoặc đầy đủ); worker chạy, Console hiện tiến độ, chi phí và báo cáo. Không eval nào chạy trong web request.
- **FR-60** Quản trị viên phân xử cờ rò rỉ theo C6, duyệt và sửa chuỗi theo C7, và publish / gỡ publish theo C8. Ở S1–S2 (trước Console), CLI có lệnh `adjudicate` (mỗi quản trị viên ghi phán quyết riêng) và `approve-strings` (duyệt chuỗi persona và chuỗi cấp sản phẩm, ghi vào cùng bảng duyệt).
- **FR-61** Quản trị viên xem mọi buổi (curated và tự tạo) gồm transcript, canvas, reveal, replay và trace, và mọi yêu cầu tự tạo chủ đề kèm chi phí; chỉ đọc.

### Vận hành: hệ thống (S1)
- **FR-37** Cap chi phí LLM theo ngày cho buổi: chạm cap thì chặn buổi mới (với chủ đề tự tạo: chặn ở lượt đầu tiên, buổi giữ nguyên để hôm sau tiếp tục); buổi đã có lượt đi hết reveal và replay; chừa phần dành riêng cho tài khoản demo. Ngân sách sinh chủ đề là cap riêng (FR-56). Hàng đợi worker và quota LLM chia theo ưu tiên: lượt đang chạy > reveal > sinh chủ đề > eval của Console; eval không được làm chậm lượt đang chạy.
- **FR-38** Hệ thống ghi sự kiện **ở server** (không qua SDK phía trình duyệt), đủ để tính mọi chỉ số ở §12.3 (buổi demo bị loại): chọn bộ lọc vai trò; mở chủ đề; bắt đầu buổi (persona, chủ đề, loại curated/tự tạo, loại thiết bị: mobile dưới 768px / desktop; tính từ lượt 0, buổi `generating`/`failed_eval` không phải buổi bắt đầu); lượt (độ trễ, thời điểm); kết thúc (canvas rỗng hay không); reveal (số đoán, KHAI THÁC, **NHẬN BIẾT thật**, tổng, số item đã lộ, mức khoảnh khắc replay, độ trễ reveal); bắt đầu và kết quả replay; "Tải về"; waitlist; yêu cầu tạo chủ đề và kết quả; báo lỗi kịch bản tự tạo; câu trả lời FR-64; xóa tài khoản (không gắn người sau khi xóa).

### Vận hành: trace, demo, phương pháp (S1; FR-62 xuyên suốt)
- **FR-44** *(S1)* `trace <session>` (CLI, và trong Console C9) in từng lượt: câu người học, JSON của Call 1, verdict cho lượt trước, các sửa của code, luật mở khóa đã chạy, item mở, hook được chọn và verdict của nó, openness trước và sau. Chỉ đọc dữ liệu đã lưu.
- **FR-45** *(S1)* `DEMO_ACCOUNT_EMAILS` liệt kê tài khoản Google thật của Thanh; không email nào được vừa ở `DEMO_ACCOUNT_EMAILS` vừa ở `ADMIN_EMAILS` (hệ thống từ chối khởi động nếu có). `seed-demo <email> --persona <id> --guess <n>` chạy một transcript soạn sẵn qua engine thật, gắn buổi vào tài khoản đó, dừng ở `revealed`; thất bại và in lý do nếu buổi không rơi vào ứng viên chính. Chạy lại được. Tài khoản demo không bị FR-5 giới hạn, nhưng vẫn theo hạn mức FR-56.
- **FR-62** *(xuyên suốt)* Trang "Phương pháp đứng sau InterviewLab" theo Màn 12. Trang **chỉ được mở công khai sau một lần research học thuật riêng** (`bmad-deep-recon`, loại academic-lit) kiểm lại từng nguồn và từng câu; trước đó route trả 404 và footer không có link. Đây là việc trong checklist ra mắt của riêng trang này (§12.4), **không chặn ra mắt sản phẩm**: sản phẩm ra mắt được khi trang còn 404. Không câu nào khẳng định cơ chế thông tin ẩn hay replay "đã được chứng minh"; không con số nào chưa được lần research đó kiểm; mọi con số dùng sau đó phải kèm phạm vi gốc (ví dụ [5] là cho bệnh nhân chuẩn hóa nói chung).

## 11. Yêu cầu phi chức năng

- **NFR-1 Số LLM call:** lượt buổi chính ≤2 call logic; lượt replay ≤3 (Call 1, Call 2, judge); reveal đúng 3 call tuần tự (judge cuối buổi → generator → verifier). Đường tự tạo chủ đề: 1 call kiểm duyệt kèm phân loại trọng tâm trong request, rồi generator, kiểm an toàn và eval rút gọn trên worker, tính vào ngân sách sinh, không vào chi phí buổi. Trang "Buổi của tôi" và `trace` không gọi LLM; Console không gọi LLM trong web request (generator, AI critic và eval chạy trên worker). Thử lại kỹ thuật không tính là call logic nhưng được ghi log và tính chi phí.
- **NFR-2 Độ trễ:** p95 ≤ 6 giây mỗi lượt buổi chính, đo trên một lần eval đầy đủ trên môi trường đã deploy. Reveal sẵn sàng p95 ≤ 15 giây sau khi bấm "Xem kết quả" `[ASSUMPTION]` (3 call chạy từ lúc kết thúc buổi, che một phần bằng màn đoán). Đường tự tạo chủ đề: **p95 ≤ 2 phút** từ lúc gửi tới `interviewing` hoặc `failed_eval` (quyết định của PM); để đạt mốc này, eval rút gọn giới hạn mỗi run tối đa 10 lượt (eval đầy đủ: 30 lượt) và chạy 7 run song song; vì vậy kiểm tra này còn nhẹ hơn nữa so với eval đầy đủ (§13). Không stream. Phần context cố định và transcript được cache prompt.
- **NFR-3 Chi phí:** chi phí trung bình mỗi buổi và mỗi kịch bản tự tạo chơi được đo và ghi log; mục tiêu mỗi buổi nằm trong mốc giá gói prep-sprint (addendum §5; mốc 100.000–200.000 VND là suy luận `[ASSUMPTION]`, dựa một phần vào giá ChatGPT tại VN [14], nguồn đã cũ, phải kiểm lại trước khi định giá). Cap theo ngày (buổi và sinh) cấu hình được không cần deploy.
- **NFR-4 Không rò rỉ:** nội dung item khóa không bao giờ có trong context của Call 1, Call 2 hay judge replay trước khi item mở; canvas không bao giờ có trong context của call nào trong buổi. Context của Call 2 chứa ràng buộc do-not-assert của tối đa một topic tag, và không bao giờ của item vừa mở. Kiểm bằng test tự động trên context đã dựng.
- **NFR-5 Chống injection:** văn bản người học (câu hỏi, canvas, chủ đề tự tạo, câu trả lời "luyện điều gì") luôn được bọc như dữ liệu và không đổi được luật mở khóa; mọi lần mở khóa truy được về một luật và một bằng chứng. Dù Call 1 trả JSON đối kháng: mỗi lượt mở tối đa 1 item; không item follow-up nào mở khi không có hook đã thả theo verdict; không nội dung khóa nào lộ ra ngoài item được mở. Chữ do người học nhập luôn được hiển thị ở dạng đã escape ở mọi màn người học và Console; Console có Content-Security-Policy chặt. Mô hình đe dọa: người học tự chèn injection chủ yếu làm hỏng buổi của chính mình; rủi ro thật là uy tín (ảnh chụp lan qua group chat của lớp), chi phí ở đường tự tạo chủ đề, và chữ của người học hiển thị trong Console. Rủi ro còn lại đo bằng adversarial, không coi là đã loại bỏ.
- **NFR-6 Đo rò rỉ:** rò rỉ chỉ đo trên eval (FR-34, FR-54); production chưa có bộ dò tự động (§13). Mốc ~0,6/episode của [7] chỉ để tham chiếu nội bộ, không so trực tiếp: [7] là benchmark một tác giả, một model, với định nghĩa "thông tin cấm" khác định nghĩa rò (a)/(b) của FR-34.
- **NFR-7 Độ chính xác phán đoán** (mọi test set tiếng Việt, gán tay):
  - **classifier nhãn** (≥100 câu, 4 nhãn, có ca biên và câu BA/PM): ≤5% câu tốt bị gắn nhầm `leading` và ≥85% đồng thuận, **cả hai là cổng cứng**;
  - **judge verdict** (≥100 cặp lượt: đã kể / đã thả hook, diễn đạt khác, chỉ chạm chủ đề, phủ định), cổng cứng ở **mọi hướng đổ lỗi cho người học**: ≤5% lượt đã kể bị chấm "chưa kể"; ≤5% hook đã thả bị chấm "chưa thả" (follow-up tốt không mở được); ≤5% hook chưa thả bị chấm "đã thả" (sinh ra "bạn bỏ qua hook" sai);
  - **judge canvas** (≥100 đoạn: diễn đạt khác, chỉ chạm chủ đề, phủ định, bịa, nhắc trùng), cổng cứng: ≤5% đoạn diễn đạt đúng bị bỏ lỡ hoặc bị gắn nhầm "chưa từng được nói";
  - **tính mới của `leading`** (verifier, ≥50 ca), cổng cứng: ≤5% cụm persona đã nói bị coi là tự thêm (ngưỡng và cỡ test set là `[ASSUMPTION]`).
  - **kiểm duyệt chủ đề** (FR-55; ≥100 chủ đề, đủ mọi nhóm từ chối, mọi nhóm "cho phép kèm ràng buộc", và chủ đề bình thường): ≤2% chủ đề thuộc các nhóm từ chối tổ chức/thương hiệu thật, tình dục và người thật bị cho qua; ≤10% chủ đề bình thường bị từ chối `[ASSUMPTION]`; cổng cứng;
  - **kiểm an toàn đầu ra** (FR-36 và verifier; ≥50 câu khẳng định về người dùng thật, người thật hay tổ chức thật, xen câu bình thường): ≤5% lọt `[ASSUMPTION]`; cổng cứng;
  - **phân loại trọng tâm** (FR-53): không có cổng; sai thì rơi về `general`, vô hại (chỉ đổi tỉ lệ đường mở và thứ tự nhận xét).
- **NFR-8 Bất đồng verifier:** tỉ lệ verifier không đồng ý với cổng mở khóa hoặc verdict "đã kể" ≤10% trên eval `[ASSUMPTION]`, theo dõi riêng từng loại claim. Chỉ số nội bộ, không hiện cho người học.
- **NFR-9 Ai xem được dữ liệu:**
  - **Người học** xem được buổi của chính mình (transcript, canvas, reveal, replay, "Mang về") và chủ đề tự tạo của mình; không xem được của ai khác.
  - **Quản trị viên** (email trong `ADMIN_EMAILS`, gồm Thanh và người phân xử thứ hai) xem được **mọi** buổi và chủ đề tự tạo của mọi người học: transcript, canvas, kết quả, replay, trace, chủ đề người học gõ và câu trả lời "luyện điều gì". Truy cập qua Console và CLI được ghi log (FR-57); truy cập thẳng cơ sở dữ liệu của Thanh không có log.
  - **Nhà cung cấp hạ tầng** nhận dữ liệu để vận hành: nhà cung cấp LLM nhận nội dung từng call (có thể lưu tạm theo chính sách của họ; cấu hình không dùng để huấn luyện, kiểm ở §12.4); nhà cung cấp hosting và cơ sở dữ liệu lưu trữ dữ liệu.
  - Ngoài các bên trên: không chia sẻ công khai, không link xem chung, không bán dữ liệu.
  - **Lưu và xóa:** dữ liệu được giữ tới khi người học xóa tài khoản (FR-66); không có xóa tự động theo thời gian. Việc áp dụng quy định bảo vệ dữ liệu cá nhân của Việt Nam được kiểm ở §12.4.
  - Người học được báo đúng như trên ở Màn 0 (FR-63).
- **NFR-10 Toàn vẹn dữ liệu:** snapshot bất biến (trừ phần verdict của §9.1); một lượt hoặc ghi đủ hoặc không ghi gì; canvas đóng băng không sửa được.
- **NFR-11 Responsive:** mọi màn người học dùng được từ 360px tới desktop; Console tối thiểu 1024px.
- **NFR-12 Ngôn ngữ:** giao diện và kịch bản tiếng Việt; ngôn ngữ cố định trong một buổi.
- **NFR-13 Ranh giới đạo đức:** không đầu ra nào chứa nhận định về người dùng thật; chủ đề tự tạo mang nhãn hư cấu và "Đây không phải insight thật".
- **NFR-14 Giọng và copy:** viết "phỏng vấn người dùng", không để "phỏng vấn" đứng một mình (kể cả tiêu đề trang); không dùng chữ "feedback"; dùng ngôn ngữ của nỗi sợ và của việc sửa kịp, không tone mềm; không hứa "tự tin" hay guide theo đề tài; tagline "Mắc lỗi ở đây, đừng mắc trước người thật." (tạm thời, xem lại sau câu hỏi về thông điệp ở buổi thử sinh viên đầu tiên, §12.4); lời khen chỉ khi có căn cứ; không số liệu chưa kiểm trong copy; **không hứa điều sản phẩm không làm**, cụ thể:
  - không dùng "riêng tư", "chỉ bạn xem được", "bí mật" hay tương tự về dữ liệu người học; chủ đề người học tạo gọi là "chủ đề tự tạo", không gọi "chủ đề riêng" (dễ đọc thành riêng tư);
  - không dùng định vị "luyện lúc 11 giờ đêm mà không cần nhờ ai / không ai thấy bạn sai" theo nghĩa không ai nhìn thấy: với quản trị viên xem được mọi buổi, câu này chỉ còn đúng ở nghĩa "không cần hẹn ai, luyện lúc nào cũng được", và copy chỉ được dùng nghĩa đó;
  - không nói kịch bản tự tạo "đã kiểm tra đầy đủ"; không nói phương pháp "đã được chứng minh".
- **NFR-15 Truy cập:** mọi nghĩa của màu (đoạn canvas, nhãn dẫn dắt) đi kèm nhãn chữ; thanh trượt điều khiển được bằng phím mũi tên / Home / End và đọc được giá trị "X trên N"; canvas mobile mở bằng nút có nhãn, đóng bằng Esc hoặc nút "Thu", focus trả về nút; tin persona mới và trạng thái "đang gõ" được đọc qua live region lịch sự; tương phản chữ ≥4,5:1 (WCAG 2.2 AA); mọi thao tác dùng được không cần chuột.

## 12. Tiêu chí đánh giá thành công

### 12.1 Tóm tắt

| Mục tiêu | Cổng ra mắt (§12.2) | Tín hiệu sau ra mắt (§12.3) | Giới hạn đã biết |
|---|---|---|---|
| Cơ chế agent đúng và không rò | Mục 2, 3, 4, 5, 6, 12 | SM-C2, SM-C3, SM-C4 | Rò rỉ chỉ đo trên eval; lỗi tương quan giữa các judge cùng họ model |
| Người học đi hết vòng lặp | Mục 1, 13; buổi thử 5–8 sinh viên | SM-1, SM-2, SM-9, SM-C1, SM-C7 | Chỉ đọc % sau ≥30 người học |
| Người học thấy được lỗi hỏi và lỗi nghe | Mục 7 | SM-6, SM-7, SM-8 | Chỉ số trong buổi, không chứng minh kỹ năng chuyển sang buổi thật |
| Replay giúp buổi sau (giả định #9) | — | SM-3, SM-4a, SM-4b | Tương quan, không nhân quả (người dùng replay tự chọn); thiên lệch persona thứ hai (§13) |
| Đường tự tạo chủ đề dùng được và an toàn | Mục 8, 14 | SM-10, SM-C8 (công tắc tắt theo ngưỡng FR-56) | Kiểm tra nhẹ, không người đọc |
| BA/PM đủ thật | Mục 2 (tiêu chí BA và PM) | SM-11 | Chỉ là kiểm tra một phần nếu không có người đọc BA/PM đang làm nghề |
| Vận hành được | Mục 8, 9, 10, 11, 16 | SM-C5, SM-C6 | Giá trị cap ban đầu là suy luận |
| Không nói quá về phương pháp | Mục 15 | — | Trang chỉ mở sau research học thuật |
| Có nhu cầu trả tiền và nhu cầu BA/PM | — | SM-5, SM-12 | Chỉ là tín hiệu |

### 12.2 Cổng ra mắt

Mỗi mục áp cho lát chứa tính năng đó; ra mắt khi mọi mục xanh.

1. **Demo end-to-end** trên URL đã deploy: thư viện (bộ lọc) → chủ đề → chuẩn bị → đăng nhập (thông báo ai xem được) → phỏng vấn kèm canvas → đoán → reveal hai con số → replay → "Mang về" và in → persona kế tiếp.
2. **Mỗi persona curated** pass `validate` và eval đầy đủ:
   - 0 rò rỉ đã xác nhận trong 20 adversarial (hai người phân xử theo C6; bất đồng tính là rò), tính cả rò topic và đòn "dò bản đồ topic";
   - run tốt mở ≥2 lần số item của run xấu và ≥3 item;
   - judge xác nhận persona truyền đạt hook được chọn ≥95%;
   - bất đồng verifier ≤10%;
   - mọi chuỗi cố định đã duyệt, FR-36 sạch;
   - persona BA: ≥2 trong 3 run tốt có ≥1 câu xác nhận đóng (`confirm_grounded`, `question_type = closed`) ngay sau một lượt persona nêu một bước quy trình, người duyệt hoặc điều kiện ngoại lệ `[ASSUMPTION]`;
   - persona PM: ≥2 trong 3 run tốt có ≥1 câu `past_specific` ngay sau một lượt persona nói thói quen chung hoặc hứa hẹn tương lai ("thường thì", "chắc là sẽ") `[ASSUMPTION]`.
   Báo cáo có tỉ lệ hiệu chỉnh 50–75%, baseline, nhận xét AI critic (BA/PM).
3. **Cô lập context** (NFR-4, FR-8, FR-12, FR-15): test tự động chứng minh, ở mọi lượt của eval và replay, context của Call 1, Call 2 và judge replay không chứa nội dung item còn khóa, và không call nào trong buổi chứa canvas; context của Call 2 chỉ chứa do-not-assert của tối đa một topic tag, không bao giờ của item vừa mở.
4. **Cổng mở khóa** (FR-13, FR-14, NFR-5), test tự động với Call 1 và judge giả lập:
   - follow-up không mở khi hook chưa có verdict thả, và vẫn mở khi hook được nhặt muộn; hook có verdict thả ở lượt t nhặt được ngay ở lượt t+1;
   - follow-up không mở khi `grounded_turn_id` không phải lượt đã thả hook;
   - nhãn tốt mà `grounded_turn_id` không resolve được (kể cả lượt 0) bị hạ thành `open`, openness không đổi;
   - nhãn `leading` mà `introduced_span` rỗng hoặc ngoài phạm vi token của câu người học bị hạ thành `open`;
   - luật đánh giá trên trạng thái trước lượt; openness bắt đầu ở 4 và đổi đúng bảng addendum §3.1;
   - câu hỏi chốt làm thả hook nhưng không mở item; item tin tưởng không mở khi openness dưới ngưỡng;
   - hook không ghi đã thả, item không tính đã kể, khi verdict âm hoặc thiếu;
   - với Call 1 đối kháng, mỗi lượt mở tối đa 1 item, không follow-up nào mở khi không có hook đã thả.
5. **Replay** (FR-19, FR-23–27):
   - chọn khoảnh khắc đúng §9.2 trên 3 transcript cố định, tất định;
   - với Call 1 và judge giả lập, câu hỏi mẫu ở lượt replay thứ 2 mở được item mục tiêu và persona kể nó ngay;
   - "Đã mở khóa" chỉ hiện khi judge replay cho verdict "đã kể" dương với item mục tiêu;
   - trước khi replay kết thúc, **mọi dữ liệu gửi về trình duyệt** (API reveal, API danh sách Buổi của tôi, API transcript, API lượt) không chứa: nội dung, câu hỏi mẫu, topic tag, đường mở, trọng số hay `hook_id` của item mục tiêu; range canvas khớp item mục tiêu; claim, "Hãy hỏi" hay thẻ thói quen có `item_id` của nó hoặc trích lượt thả hook của nó; con số NHẬN BIẾT tính cả nó; và với dự phòng 1, claim hay dòng cụm tự thêm của lượt *l*. Test trên 3 transcript cố định có canvas khớp item mục tiêu và 1 transcript dự phòng 1. Sau khi replay kết thúc, các phần đó có mặt;
   - API lượt (buổi chính và replay) chỉ trả lời persona, số lượt và trạng thái lỗi; sự kiện FR-38 chỉ phát từ server;
   - dòng chẩn đoán chọn đúng nhánh của Màn 6 mục 2 khi verifier đồng ý, bác, và lỗi;
   - sau replay, dữ liệu buổi chính không đổi, trừ cờ mở niêm phong.
6. **Số call** (NFR-1): log một buổi 30 lượt cho thấy ≤2 call logic mỗi lượt chính, ≤3 mỗi lượt replay, đúng 3 call reveal.
7. **Phán đoán** (NFR-7): mọi cổng cứng của classifier, judge verdict (cả ba hướng), judge canvas và tính mới của `leading` đạt.
8. **Độ trễ** (NFR-2): p95 lượt ≤6 giây và p95 reveal ≤15 giây trên môi trường đã deploy; p95 đường tự tạo chủ đề ≤2 phút trên 10 chủ đề mẫu.
9. **Ai xem được và xóa** (FR-3, FR-57, FR-63, FR-66, NFR-9): tài khoản người học B không đọc được bất kỳ dữ liệu nào của A (test API); tài khoản ngoài allowlist nhận 403 ở mọi route Console; mọi lần mở dữ liệu người học qua Console (kể cả danh sách) và qua lệnh CLI có dòng log; Màn 0 hiện trước mọi trang ghi dữ liệu, kể cả Màn 10 và link thẳng, và đồng ý được lưu kèm phiên bản; email vừa ở danh sách demo vừa ở allowlist làm hệ thống từ chối khởi động; xóa tài khoản xóa hết dữ liệu ở FR-66 (kiểm bằng truy vấn sau khi xóa) và kết thúc phiên; chữ người học có thẻ HTML hiển thị đã escape ở Console.
10. **Buổi của tôi và điều hướng** (FR-4, FR-39–43, §6.0, §7): mỗi trạng thái ở §7 (kể cả `revealed` đang tính và `withdrawn`) mở đúng màn qua URL buổi; nút quay lại về màn trước buổi; URL buổi của người khác hiện "Không tìm thấy buổi này."; danh sách chỉ hiện số cho buổi `done` và đúng số của buổi chính; bản xem lại khớp reveal và không gọi LLM; mọi cách kết thúc ở FR-41 đều không còn gì bị giữ; trạng thái trống đúng; persona publish phiên bản mới không mở thêm buổi (FR-5).
11. **Cap chi phí và hàng đợi** (FR-37, FR-56): hạ cap về mức đã tiêu thì buổi mới bị chặn kèm thông báo, buổi đang chạy đi hết; buổi tự tạo đã có bị chặn ở lượt đầu; tài khoản demo vẫn bắt đầu được; hết ngân sách sinh thì chặn lần thử mới mà không ảnh hưởng buổi; chi phí giữ trước làm tổng chi không vượt ngân sách sinh; khi một eval đầy đủ đang chạy, p95 lượt vẫn ≤6 giây.
12. **Trace và seed** (FR-44, FR-45): `trace` in đủ mọi trường của FR-44 cho mọi lượt mà không gọi LLM; `seed-demo` dừng ở `revealed` với khoảnh khắc là ứng viên chính, replay chạy live tới kết quả, và từ chối email ngoài danh sách.
13. **Canvas** (FR-46–49): canvas tự lưu và khôi phục sau khi đóng tab; đóng băng ở "Kết thúc buổi"; dùng được ở 360px mà không che ô gửi khi đã thu; canvas rỗng hiện "Không có ghi chú trong buổi này" và mục "Ghi chú của bạn" ẩn; tự kết thúc sau lượt 30 cũng đóng băng canvas; tô đúng các range đã chấm trên 10 canvas cố định, mỗi đoạn kèm đúng câu giải thích của FR-48a; với judge và generator giả lập: range ngoài phạm vi hoặc rỗng bị bỏ, cùng item nhắc hai lần tính một lần, claim có `cited_turns` hoặc `canvas_range` hỏng bị bỏ.
14. **Tạo chủ đề của bạn** (FR-52–56):
    - ≥6 trong 10 chủ đề mẫu bình thường qua kiểm tra `[ASSUMPTION]`; báo cáo ghi tỉ lệ cờ rò rỉ của judge mà người phân xử (đọc lại sau) cho là không phải rò; nếu tỉ lệ này cao, sửa judge hay hồ sơ eval, không siết hạn mức của người học;
    - kiểm duyệt chạy trước khi tạo buổi; chủ đề nêu tên người thật, tổ chức thật hay thương hiệu thật bị từ chối và không tính lần thử; chủ đề về trẻ vị thành niên hay sức khỏe tâm thần được sinh với ràng buộc của FR-55;
    - kiểm an toàn đầu ra chặn được persona sinh ra có khẳng định về tổ chức thật (test bằng generator giả lập);
    - lần thử thứ 4 trong ngày, lần trượt thứ 7 trọn đời, lần thử thứ hai khi đang có một lần chạy, và lần thử vượt 20% ngân sách ngày đều bị chặn; trượt do lỗi hệ thống hay quá 10 phút không tính lần thử; kịch bản miễn phí chỉ bị trừ khi qua;
    - công tắc tắt ở C10 làm Màn 10 chuyển sang trạng thái tạm dừng; gỡ kịch bản tự tạo chuyển buổi đang dở sang `withdrawn`;
    - mọi màn có nhãn "Kiểm tra nhẹ", "chi tiết hư cấu", "Đây không phải insight thật";
    - **test canary:** một chuỗi duy nhất đặt trong câu trả lời "luyện điều gì" không có trong context hay payload của bất kỳ call nào ngoài call phân loại, ở cả pipeline sinh lẫn buổi luyện.
15. **Trang phương pháp** (FR-62): route trả 404 và footer không có link cho tới khi việc của trang ở checklist §12.4 xong. Mục này không đòi research học thuật phải xong trước ra mắt.
16. **Cổng tạm** (FR-35): mọi persona mang cờ `interim_gate` đã qua lại cổng đầy đủ trên Console trước ra mắt.

### 12.3 Chỉ số sau ra mắt

Chỉ đọc tỉ lệ phần trăm sau ≥30 người học (không tính demo), trong 4 tuần đầu.

| ID | Chỉ số | Ngưỡng |
|---|---|---|
| SM-1 | Buổi đã bắt đầu (tính từ lượt 0; không tính `generating`/`failed_eval`) đi tới reveal | ≥60%; dưới ngưỡng → xem lại lời mở đầu và 5 lượt đầu qua SM-C1 và buổi thử |
| SM-2 | Buổi có reveal và bắt đầu replay (trên buổi có khoảnh khắc replay) | ≥40% (tương tác, không chứng minh việc học); dưới ngưỡng → xem lại vị trí và chữ của khối replay |
| SM-3 | Người học làm buổi thứ hai với persona khác | ≥30%; dưới ngưỡng → xem lại thẻ persona kế tiếp và câu hỏi giữ chân ở §13 |
| SM-4a | Tỉ lệ KHAI THÁC ở buổi thứ hai **cùng chủ đề**, người đã dùng replay ở buổi đầu so với người không | Theo dõi (tương quan) |
| SM-4b | Như SM-4a nhưng buổi thứ hai **khác chủ đề** | Theo dõi (tương quan); đây là tín hiệu ít nhiễu hơn cho giả định #9 |
| SM-5 | Bấm waitlist "mở thêm" | Đếm |
| SM-6 | Khoảng cách số đoán − KHAI THÁC, tách buổi đầu và buổi thứ hai cùng chủ đề | Theo dõi; ngưỡng đặt sau 30 người học |
| SM-7 | Tỉ lệ replay ứng viên chính thành công | Theo dõi |
| SM-8 | NHẬN BIẾT thật (giá trị lưu, không phải số đang hiện khi niêm phong) trên số item đã lộ, ở buổi có canvas không rỗng và ≥1 item đã lộ; tách mobile / desktop | Theo dõi |
| SM-9 | Tỉ lệ buổi có canvas không rỗng lúc kết thúc; tách mobile / desktop | Xem lại vị trí canvas nếu <30% `[ASSUMPTION]`; nếu chỉ mobile dưới ngưỡng thì xem lại riêng canvas mobile |
| SM-10 | Tỉ lệ yêu cầu tự tạo chủ đề qua kiểm tra (cửa sổ 30 yêu cầu gần nhất); tỉ lệ kịch bản tự tạo được chơi tới reveal | **Dưới ngưỡng FR-56 → tắt đường này để xem lại** |
| SM-11 | Tỉ lệ "không giống" ở link FR-64, theo persona | Xem lại persona nếu >50% với ≥10 câu trả lời `[ASSUMPTION]` |
| SM-12 | Số lần chọn bộ lọc BA, PM (giả định #6) | Đếm |

**Counter-metric:**
- **SM-C1:** buổi bỏ trước lượt 5 (không có lượt mới trong 24 giờ, chưa kết thúc; không tính `generating`/`failed_eval`).
- **SM-C2:** tỉ lệ lượt persona bị gắn cờ do-not-assert.
- **SM-C3:** bất đồng verifier theo từng loại claim (NFR-8).
- **SM-C4:** rò rỉ đã xác nhận mỗi episode, chỉ trên eval.
- **SM-C5:** chi phí mỗi buổi.
- **SM-C6:** độ trễ p95 lượt và reveal trong production.
- **SM-C7:** tỉ lệ buổi rơi vào dự phòng 2.
- **SM-C8:** chi phí mỗi kịch bản tự tạo chơi được (gồm lần thử trượt), cửa sổ 30 yêu cầu gần nhất. **Vượt ngưỡng FR-56 → tắt đường này để xem lại.**

### 12.4 Checklist ra mắt

Phần dev của các mục dưới đây đã tính trong addendum §6; thời gian chờ người ngoài không tính.

- **Buổi thử với 5–8 sinh viên**, hai vòng: vòng 1 sau S2 (UX); vòng 2 sau S4 trên bản ứng viên ra mắt, gồm ≥2 người BA/PM chơi persona BA/PM và ≥1 người dùng đường tự tạo chủ đề. Ghi các câu có/không: gửi câu đầu trong 60 giây không cần hỏi; persona có né đời sống thường ngày không; tự tìm thấy khối replay; có ghi gì vào canvas không (mobile và desktop); hiểu thông báo ai xem được dữ liệu. Vòng 1 thêm hai câu khám phá trước khi khóa thông điệp (giả định #4, #10): "Lần phỏng vấn người dùng gần nhất, điều gì làm bạn lo nhất?" và "Bạn muốn biết mình sai ở đâu, hay muốn bớt run?"; headline ở NFR-14 xem lại sau vòng này.
- **Người phân xử thứ hai:** đã nhận tiêu chí xác nhận ở FR-34 và phân xử thử 10 cờ **trước lần eval đầy đủ đầu tiên của persona 1 (S1)**.
- **Người đọc BA/PM đang làm nghề** (FR-65): tìm trước khi bắt đầu S4; nếu chỉ có sinh viên hoặc giảng viên, ghi là kiểm tra một phần.
- **Cổng tạm:** sau S3, cho 6 persona của S1–S2 qua lại cổng đầy đủ (§12.2 mục 16).
- **Trang phương pháp** (FR-62, riêng cho trang này, không chặn ra mắt): chạy research học thuật, viết chữ cuối cùng, đối chiếu từng câu và từng nguồn, rồi mới bỏ 404 và thêm link ở footer.
- **Transcript demo:** soạn trước, cố ý bỏ qua một hook, có canvas; là input của `seed-demo`.
- **Nhà cung cấp LLM:** tắt việc dùng dữ liệu để huấn luyện (NFR-9).
- **Tài khoản và hạn mức:** điền `DEMO_ACCOUNT_EMAILS` và `ADMIN_EMAILS` (không trùng nhau); seed buổi demo ở `revealed` và bấm "Tôi hiểu" một lần bằng tay trên mỗi tài khoản demo; giá trị ban đầu `[ASSUMPTION]`: cap chi phí buổi 30 USD/ngày (gồm 5 USD dành cho demo), ngân sách sinh 50 USD/ngày (khoảng 7–12 kịch bản chơi được).
- **Quy định dữ liệu cá nhân của Việt Nam:** kiểm việc áp dụng (cơ sở xử lý, đồng ý, quyền xóa, chuyển dữ liệu ra nước ngoài qua nhà cung cấp LLM) trước ra mắt. Đây là việc cần người có chuyên môn xem, không phải tư vấn pháp lý trong PRD này.
- **Dùng thử nội bộ:** khi chơi thử để đánh giá replay, dùng tài khoản không nằm trong `ADMIN_EMAILS`.
- **Prototype Stitch:** bản thiết kế mới phải bỏ các chỗ trái PRD trong prototype hiện có: cảnh báo "câu dẫn dắt" và đồng hồ openness hiện live (trái FR-8), số liệu chưa kiểm (trái NFR-14), câu "không dùng để huấn luyện" (chỉ được dùng sau khi kiểm nhà cung cấp, FR-63).

## 13. Giả định, rủi ro và câu hỏi mở

### Giả định (đánh số theo brief)

| # | Giả định | Trạng thái | Đo |
|---|---|---|---|
| 1 | Chưa sản phẩm nào kết hợp thông tin ẩn cố định, reveal trích theo lượt và replay | Được ủng hộ, tìm kiếm có giới hạn | Kiểm lại trước 2026-12-22; theo dõi mom-test, UXPressia |
| 2 | Luyện kèm bằng chứng giúp tiến bộ | Được ủng hộ cho phản hồi nói chung [6][26][29]; dạng phản hồi trích theo từng lượt chưa kiểm | Qua #9 |
| 3 | Persona bám tài liệu dạy tốt hơn nhưng kém thật hơn | Đã kiểm (n=69) [8] | SM-11 cho BA/PM; UX chưa đo độ thật |
| 4 | Nỗi đau đủ lớn để chủ động đi luyện | Chưa kiểm | Buổi thử 5–8 sinh viên; SM-1 |
| 5 | Người học luyện 1–3 tuần trước buổi thật | Chưa kiểm | Số buổi mỗi người, SM-3 |
| 6 | Có nhu cầu cho BA/PM | Chưa kiểm | SM-12, buổi BA/PM tới reveal |
| 7 | Kịch bản BA/PM do AI soạn đủ thật | Chưa kiểm; một trong các giả định rủi ro nhất | Người đọc BA/PM đang làm nghề (FR-65), SM-11; AI critic không tính là kiểm độ thật |
| 8 | Có người trả tiền | Chưa kiểm | SM-5; 2–3 cuộc nói chuyện với giảng viên hoặc trung tâm |
| 9 | Replay giúp mở item ở buổi sau | Chưa kiểm | SM-4a, SM-4b; tương quan, không nhân quả |
| 10 | Người học muốn bắt lỗi, không chỉ bớt sợ | Chưa kiểm | SM-1, SM-2, "Tải về", SM-9 |
| 11 | ChatGPT chỉ-prompt không giữ được trạng thái ẩn | Ủng hộ một phần [7] (một benchmark) | Baseline trong eval (FR-34) |
| 12 | Người học dùng canvas trong buổi (cả trên mobile) | Chưa kiểm | SM-9 |
| 13 | Người học muốn tự tạo chủ đề | Chưa kiểm | SM-10, waitlist sau kịch bản miễn phí |

**Giả định nội dòng.** Mọi giá trị dưới đây được xem lại sau lần eval đầy đủ đầu tiên; người chịu trách nhiệm: Thanh.
- **PM đã chấp nhận làm giá trị khởi đầu (2026-10-02):** mốc giá (NFR-3); p95 reveal (NFR-2); tính mới `leading` (NFR-7); ngưỡng 10% (NFR-8); tiêu chí BA và PM (§12.2 mục 2); ngưỡng SM-9 và SM-11; luật bất đồng phân xử (C6); mẫu "ngưỡng tiền phê duyệt" (FR-65); openness và 1 item mỗi lượt (addendum §3.1).
- **Thêm sau reviewer gate 2026-10-02, chưa được PM duyệt, đã hoãn có chủ đích:** giới hạn ô hỏi 500 ký tự và canvas 5.000 ký tự (Màn 4); kênh báo waitlist (Màn 6); 10 lần từ chối mỗi ngày (FR-55); ngưỡng hook ≥90% và ≥6/10 chủ đề mẫu qua (FR-54, §12.2 mục 14); ngưỡng kiểm duyệt và kiểm an toàn đầu ra (NFR-7); người duyệt chuỗi khác người sửa (C7); giá trị cap ban đầu 30 USD và 50 USD (§12.4); giữ trước 5 USD mỗi lần thử (addendum §5).

### Rủi ro

**Đạo đức, neo và dữ liệu**

- **Neo giả thuyết ở lớp chủ đề:** nếu Linh làm đồ án về quản lý chi tiêu và luyện với chị Thu, tảng băng của chị Thu có thể thành giả thuyết trong đầu cô trước fieldwork, và giả thuyết sẵn có dễ dẫn tới câu dẫn dắt (thí nghiệm kinh điển [10], bị tranh cãi vì không tái lập được [34]; chưa có nghiên cứu nào về neo do persona AI, nên đây là suy luận thận trọng, không phải điều đã chứng minh). Giảm nhẹ: ràng buộc chống neo ở §4 (chủ đề kề bên, tảng băng về khía cạnh phụ, cảnh báo, không có khớp đề tài). **Cảnh báo chỉ giảm rủi ro đạo đức (coi lời persona là insight), không giảm neo**; neo vẫn là rủi ro còn lại.
- **Neo ở đường tự tạo chủ đề (chấp nhận):** người học gần như chắc chắn gõ chủ đề đồ án thật, và tảng băng sinh ra là bộ giả thuyết hợp lý nhất mà LLM nghĩ ra cho lĩnh vực đó (tương tự việc LLM làm phẳng nhóm nhân khẩu học khi đóng vai [33]; ở đây là ngoại suy sang giả thuyết lĩnh vực). Dòng "Đây không phải insight thật" và nhãn "chi tiết hư cấu" **giảm rủi ro đạo đức** (coi lời persona là insight về người dùng), **không giảm neo**: forge gốc (memlog, không phải research.md) đã ghi rằng đóng khung không ngăn được neo, kể cả với neo biết là tùy ý. Hệ thống không biết câu hỏi nghiên cứu thật của người học nên không loại trừ được nó; "câu hỏi của persona về một khía cạnh phụ" chỉ là chỉ dẫn cho generator, không kiểm được. Đây là **rủi ro còn lại được chấp nhận** trên đường này, và là một sự nới khóa "Người trong thế giới của bạn, không bao giờ là câu hỏi của bạn".
- **Quản trị viên xem được mọi thứ:** brainstorm-intent khóa "individual learner only, private" và brief hứa "Dữ liệu riêng tư theo mặc định, chỉ người học xem được"; định vị "không cần nhờ ai, lúc 11 giờ đêm" của forge dựa trên việc người học tập và sai mà không ai nhìn. Nay quản trị viên đọc được transcript, canvas và kết quả. Cái giá: người học có thể hỏi thận trọng hơn, viết canvas ít thật hơn, hoặc không dùng; câu dẫn dắt (điều sản phẩm muốn bắt) là thứ người ta ngại để người khác thấy nhất; chủ đề tự tạo có thể lộ ý tưởng dự án của người học. Định vị đó nay là copy bị ảnh hưởng, không chỉ là rủi ro: NFR-14 giới hạn nó ở nghĩa "không cần hẹn ai". Giảm nhẹ: thông báo rõ ở đăng nhập (FR-63), log truy cập (FR-57), không chia sẻ công khai, copy không hứa riêng tư (NFR-14). Theo dõi qua SM-C1 và buổi thử sinh viên (câu "hiểu thông báo ai xem được").
- **Người phân xử thứ hai là quản trị viên (quyết định của PM):** người này xem được mọi dữ liệu như quản trị viên, nên số người đọc được transcript, canvas và chủ đề tự tạo của người học rộng hơn chỉ Thanh. Thông báo FR-63 nói "quản trị viên InterviewLab" và vẫn đúng; số quản trị viên nên giữ ở mức tối thiểu.
- **Lưu dữ liệu không thời hạn:** không có xóa tự động; dữ liệu nằm tới khi người học xóa tài khoản. Cùng với quyền xem của quản trị viên, kho transcript lớn dần; việc áp dụng quy định của Việt Nam được kiểm ở §12.4.

**Đo lường và phán đoán**

- **Lỗi tương quan giữa các judge:** Call 1, judge cuối buổi, generator và verifier nhiều khả năng cùng họ model, nên verifier có thể đồng ý với đúng lỗi nó cần bắt. Giảm nhẹ: test set gán tay cho từng judge (NFR-7), theo dõi bất đồng verifier theo từng loại claim (SM-C3).
- **Phán đoán của Call 1:** ranh giới `boundary_probe` / `open` / `leading` là phán đoán LLM; một nhãn sai trên câu tốt làm mất niềm tin vào mọi nhãn. Giảm nhẹ: NFR-7, bằng chứng bắt buộc, verifier kiểm tính mới trước khi hiện.
- **Chất lượng "Hãy hỏi":** câu do LLM viết; chất lượng phụ thuộc classifier nhãn và verifier. Lỗi tương quan giữa các judge (ở trên) áp cả ở đây.
- **Grounding bịa:** một `grounded_turn_id` bịa làm openness tăng như câu tốt; follow-up vẫn được bảo vệ vì phải đúng lượt đã thả hook.
- **Thiên lệch persona thứ hai:** buổi thứ hai cùng chủ đề đến sau một reveal vừa dạy người học về lĩnh vực đó; tỉ lệ khai thác cao hơn có thể là kiến thức lĩnh vực chứ không phải kỹ năng. Số đoán ở buổi này cũng bị kéo theo, nên **SM-6 của buổi thứ hai cùng chủ đề không so được với buổi đầu** và được báo cáo tách riêng. Giảm nhẹ: tag không trùng trong chủ đề (FR-33), SM-4b khác chủ đề là tín hiệu chính cho #9.
- **Rò rỉ trong production:** chưa có bộ dò tự động.
- **Không có thời điểm ghi chú:** không phân biệt "nhận ra lúc đó" với "nhận ra khi đọc lại cuối buổi". Chẩn đoán cho item replay vẫn đúng, vì item đó còn khóa tới cuối buổi.

**Niêm phong và replay**

- **Niêm phong lộ qua loại trừ (chấp nhận, quyết định của PM):** trước replay, ghi chú khớp item mục tiêu là đoạn không tô duy nhất giữa các đoạn được tô; cùng dòng "Bạn nghe được…", người học suy ra được ghi chú nào đúng. PM chấp nhận vì cổng mở khóa chấm câu hỏi, không chấm việc người học đã biết: biết đáp án không mở được item nếu câu hỏi không qua luật (ví dụ một câu đóng nêu thẳng nội dung là `leading`). Niêm phong chỉ thêm yếu tố bất ngờ; nó vẫn chặn nội dung item và câu hỏi mẫu tới trình duyệt. Điều này thay lý do trước đây "niêm phong là thứ làm replay thành bài kiểm".
- **Dòng chẩn đoán "Bạn nghe được, nhưng chưa hỏi tiếp":** dòng này (khóa của forge ghi chú) cho người học biết canvas của mình có chạm tới khoảnh khắc đang luyện lại, dù không nói ghi chú nào và không lộ nội dung item. Chấp nhận, vì nó nói về việc nghe, không xác nhận phỏng đoán nội dung; các dấu trên canvas thì bị giữ hẳn (Màn 6).

**Đường tự tạo chủ đề**

- **Kịch bản tự tạo không có người đọc:** eval rút gọn với 1 run tốt và 1 run xấu, mỗi run tối đa 10 lượt (để đạt p95 2 phút), nhiễu (cả trượt sai lẫn qua sai) và không thấy item chỉ mở muộn; rubric "≥2 item không đoán được từ khuôn mẫu" không tự động được. "Kiểm tra nhẹ" nghĩa là chưa ai đọc. Giảm nhẹ: kiểm an toàn đầu ra, ngưỡng hook, nút báo lỗi kèm trả lại kịch bản miễn phí, công tắc tắt.
- **Chi phí đường tự tạo chủ đề:** mỗi kịch bản tự tạo chơi được ước tính ~4–7 USD gồm lần trượt (addendum §5, chưa đo), vẫn đáng kể so với mốc giá gói prep-sprint. Giữ bằng hạn mức FR-56, ngân sách sinh giữ trước, và công tắc tắt ở 12 USD; theo dõi SM-C8.

**Nội dung và trải nghiệm**

- **Độ thật của persona:** persona bám tài liệu kém thật hơn người đóng vai [8]. Giảm nhẹ: persona nói thoải mái ngoài item, openness bắt đầu ở mức bình thường, câu hỏi chốt thả hook, buổi thử sinh viên, SM-11 cho BA/PM.
- **Người đọc BA/PM:** nếu không tìm được người làm nghề, độ thật BA/PM chỉ được kiểm một phần (giả định #7), và AI critic không bù được (cùng họ model với generator).
- **Nội dung kịch bản nhạt:** kiểm của CLI và eval là cơ học; giảm nhẹ: rubric soạn kịch bản, AI critic, hiệu chỉnh 50–75%. Với 14 persona và tag không trùng trong chủ đề, item có thể bị đẩy vào góc lạ; theo dõi qua SM-11 và buổi thử.
- **Canvas trên mobile:** notepad che phần dưới, mỗi ghi chú tốn mở–gõ–thu; SM-9 tách theo thiết bị sẽ cho biết.
- **Độ trễ reveal:** 3 call tuần tự, chỉ được che một phần bằng màn đoán (NFR-2, SM-C6).

**Lịch**

- **Ước tính vượt 2 tháng:** ước tính từ dưới lên ~64 ngày dev chưa buffer, so với ~42–44 ngày làm việc trong 2 tháng (addendum §6). PM đã nói lịch không phải mối lo; lát phát hành quyết định thứ tự, và ra mắt là khi cả 5 lát xong. Cái giá của thứ tự: BA/PM (S4) đi cuối, nên tín hiệu độ thật của giả định #7 (người đọc làm nghề, buổi thử vòng 2) đến muộn nhất.

### Câu hỏi mở

- **Ai trả tiền?** (hoãn có chủ đích) B2C gói prep-sprint; B2B2C qua giảng viên hoặc trung tâm; kịch bản tự tạo trả phí (SM-5 sau kịch bản miễn phí); "Panel Rehearsal". MVP chỉ thu tín hiệu.
- **Điều gì kéo người học quay lại?** (hoãn có chủ đích) lứa mới mỗi học kỳ; vòng pre-flight → buổi thật → post-flight; ôn lại sau 1 tuần; persona kế tiếp trong chủ đề; chủ đề tự tạo theo dự án. Tín hiệu đầu tiên: SM-3.
- **Rubric project brief có yêu cầu nguyên văn "LLM gọi tool" không?** Nếu có, verifier thành vòng gọi tool có giới hạn (`get_turn(id)`, `get_ledger_event(id)`), ~0,25 ngày. Người chịu trách nhiệm: Thanh, trước khi bắt đầu S3.
