---
title: 'Đối chiếu đầu vào vòng 2: research.md ↔ PRD + addendum'
input: '_bmad-output/planning-artifacts/research/competitive-ai-interview-practice-agent-positioning-2026-09-22/research.md'
targets: 'prd.md, addendum.md (bản 2026-10-01)'
created: '2026-10-01'
mode: read-only (không sửa prd.md / addendum.md)
---

# Đối chiếu research.md với PRD vòng 2

Phạm vi: (1) mọi trích dẫn [n] PRD dùng; (2) gói grounding BA/PM (FR-65, addendum §2/§6); (3) khuyến nghị của research bị bỏ im lặng; (4) chỗ PRD mâu thuẫn research.

Mức độ: **Cao** = PRD dẫn tới build/eval sai hoặc khẳng định trái nguồn; **Trung bình** = mất lưu ý quan trọng, dễ thành sai khi viết copy/kịch bản; **Thấp** = chỉnh chữ, truy vết.

## Tóm tắt

| # | Khoảng trống | Mức |
|---|---|---|
| G1 | Mẫu "ngưỡng tiền phê duyệt" chưa có nguồn, nhưng tiêu chí eval BA và chủ đề BA ví dụ dựa vào nó | Cao |
| G2 | FR-65 / gói grounding không mang các lưu ý §6 (lệch y tế/mua sắm công, 0 mẫu doanh nghiệp VN, độ tin từng mẫu, 5 quy tắc sinh, dấu hiệu fluff PM) | Cao |
| G3 | PRD §4 dùng [10] như điều đã xác lập; research ghi bị tranh cãi [34] và chưa chứng minh với persona AI | Trung bình |
| G4 | Màn 12 bỏ lưu ý [5] chỉ đọc abstract / SP nói chung, và bỏ khoảng trống "phản hồi trích theo lượt chưa có bằng chứng" | Trung bình |
| G5 | "5–8 phỏng vấn người học trước khi khóa thông điệp" bị thay bằng buổi thử usability; headline đã khóa | Trung bình |
| G6 | Kiểm tra độ thật BA bằng "AI critic + người đọc proxy" thay vì "1–2 BA thật" như research khuyến nghị | Trung bình |
| G7–G13 | Các chỉnh nhỏ: định vị bỏ chữ "stakeholder", giả định #2/#11 đánh giá thấp bằng chứng, NFR-6 thiếu lưu ý so sánh với [7], [14]/[50] đã cũ, cách ghi "[research 10]", câu tuyệt đối "chưa được nghiên cứu", [33] ngoại suy | Thấp |

## (1) Trích dẫn: kiểm từng chỗ

| Chỗ trong PRD | Trích dẫn | Khớp research? | Ghi chú |
|---|---|---|---|
| Màn 12: SP trong đào tạo y khoa | [5][27] | Đúng nguồn, đúng chiều | Mất lưu ý: [5] "lấy từ abstract, chưa đọc full text (độ tin trung bình)", dị biệt cao; [27] "quá khác nhau để gộp"; SMD 0,74 là cho SP nói chung, không cho cơ chế thông tin ẩn (research bảng giả định, dòng OSCE). → G4 |
| Màn 12: phản hồi trong mô phỏng | [26] | Đúng | Nếu sau này nhắc "lặp lại" thì phải kèm "không có ý nghĩa thống kê" (ES 0,68, 7 nghiên cứu) |
| Màn 12: phản hồi khi luyện với AI | [6] (ghi rõ preprint) | Đúng, giữ lưu ý preprint | Có thể nêu thêm phát hiện bất lợi của chính [6]: luyện không phản hồi thì không tiến bộ, đồng cảm giảm, vì đây là lý do khác biệt so với ChatGPT tự dựng |
| Màn 12: persona bám tài liệu + phát hiện bất lợi | [8] | Đúng chiều (người thật được đánh giá thật hơn) | OK |
| Màn 12: thông tin ẩn chưa được nghiên cứu riêng; replay chưa được nghiên cứu cho hội thoại | [28] | Đúng hướng; [28] giữ "chỉ hồi sức, độ chắc chắn rất thấp" | Research nói "chưa có nghiên cứu nào **tách riêng**" và "chưa có bằng chứng" trong một lần tìm có giới hạn. PRD viết tuyệt đối "chưa được nghiên cứu". → G12 |
| Màn 12: chưa chứng minh chuyển sang buổi thật | [30] | Đúng ý | [30] là tổng quan **bệnh nhân ảo LLM**; PRD mở rộng thành "persona AI" nói chung. Chấp nhận được nếu viết "trong tổng quan về bệnh nhân ảo LLM". → G13 |
| §4: neo giả thuyết dẫn tới câu dẫn dắt | "[research 10]" | **Lệch lưu ý** | Research §5: [10] bị tranh cãi, Pennington 1987 không tái lập [34]; "không tìm thấy nghiên cứu nào cho thấy luyện với persona AI làm lệch giả định… rủi ro là suy luận hợp lý, chưa được chứng minh". → G3 |
| §13 rủi ro neo đường tạo chủ đề riêng: "LLM làm phẳng nhóm người" | [33] | Đúng nguồn | [33] đo LLM đóng vai **nhóm nhân khẩu học**; PRD dùng cho "tảng băng là bộ giả thuyết hợp lý nhất của lĩnh vực" là ngoại suy. → G13 |
| §13: "forge gốc đã ghi rằng đóng khung không ngăn được neo, kể cả neo biết là tùy ý" | (không có) | Không có trong research.md | Nguồn là forge, không phải research; không sai, nhưng không truy được về bằng chứng. Ghi rõ nguồn là forge |
| §13 giả định #1 | (không số) | Đúng; giữ "kiểm lại trước 2026-12-22", "theo dõi mom-test, UXPressia" | Khớp bảng độ cũ và khuyến nghị 7 |
| §13 giả định #2 "Một preprint ngoài lĩnh vực [6]" | [6] | Đúng nhưng **thấp hơn** research | Research ghi "Ủng hộ" bởi [6][26][29]; [26] là tổng hợp 80 nghiên cứu. Dạng "trích theo lượt" thì chưa kiểm. → G8 |
| §13 giả định #3 | [8] | Đúng (n=69) | OK |
| §13 giả định #11 "Chưa kiểm" | (không) | Thấp hơn research | Research: "ủng hộ một phần" bởi [7] (prompt-only rò ~0,6/episode). → G8 |
| §13 rủi ro độ thật | [8] | Đúng | OK |
| NFR-6 "Mốc ~0,6/episode… tham chiếu nội bộ" | (không số) | Đúng con số, không đưa ra copy | Thiếu: [7] là benchmark một tác giả, gpt-4o-mini, định nghĩa "thông tin cấm" khác định nghĩa (a)/(b) của FR-34, nên không so trực tiếp được. → G9 |

**Số liệu trong copy cho người học:** không thấy số liệu research nào trong Màn 1–11. NFR-14 cấm số chưa kiểm; FR-62 và Màn 12 chặn số tới khi research học thuật kiểm lại; addendum §5 ghi giá đối thủ không dùng trong copy. Đạt. Lưu ý: FR-62 vẫn **cho phép** số sau lần research học thuật; nếu khi đó dùng SMD 0,74 [5] thì phải kèm "cho SP nói chung, không cho cơ chế thông tin ẩn" (khuyến nghị 4: OSCE chỉ ở mức "cùng họ phương pháp").

**Câu "cơ chế thông tin ẩn và replay cho kỹ năng hội thoại chưa được nghiên cứu":** khớp research về nội dung (§4 dòng 86, 94; câu hỏi mở dòng 204). Chỉ lệch ở mức tuyệt đối (G12).

## (2) Gói grounding BA/PM (FR-65, addendum §2, §6, PRD §3 S4, UJ-3, §12.2 mục 2)

PRD chỉ nói "gói grounding (research.md §6)" và ước tính 0,5 ngày. Không lưu ý nào của §6 đi theo.

### G1. Mẫu "ngưỡng tiền phê duyệt" chưa có nguồn, nhưng PRD dựa vào nó — **Cao**
- Research: §6 dòng 138 ("Chưa có nguồn… nên coi mẫu này là giả định, hoặc dựa vào mẫu 11–16"); khuyến nghị 5 ("Đánh dấu mẫu 'ngưỡng tiền' là chưa có nguồn"); bảng giả định dòng 183; "Bằng chứng mỏng ở" dòng 32; câu hỏi mở dòng 205.
- PRD: §12.2 mục 2 tiêu chí BA "ngay sau một lượt persona nêu quy trình hoặc **ngưỡng**"; UJ-3 chủ đề mẫu "Duyệt chi phí công tác ở công ty vừa" (chủ đề xoay quanh ngưỡng duyệt). Không chỗ nào đánh dấu ngưỡng là chưa có nguồn.
- Đề xuất: FR-65 thêm "mẫu ngưỡng tiền phê duyệt là `[ASSUMPTION]`, không có nguồn trong research §6; persona BA ưu tiên mẫu 11–16 (phê duyệt có nguồn [53]) và 1–9 (workaround [35])". Tiêu chí BA đổi "quy trình hoặc ngưỡng" thành "quy trình, người duyệt hoặc điều kiện ngoại lệ", hoặc giữ "ngưỡng" kèm thẻ `[ASSUMPTION]`. Ghi trong UJ-3 rằng chủ đề duyệt chi phí phải dựa vào mẫu 11–16, không bịa câu "dưới X thì tôi tự ký" như lời có nguồn.

### G2. Lưu ý độ lệch nguồn và quy tắc sinh không vào FR-65 — **Cao**
- Research: §6 dòng 107 (nguồn mạnh là y tế Đức/Mỹ [35] và NHS [53]; ERP là blog nhà cung cấp, độ tin thấp [38][39][40]); insight liên chiều 3 dòng 166 ("từ y tế và mua sắm công, không phải phần mềm doanh nghiệp VN"); 5 quy tắc sinh dòng 140–145; bảng giả định dòng 183.
- PRD: thiếu hết. Riêng quy tắc danh từ hóa [36] chỉ xuất hiện gián tiếp ở nhãn `boundary_probe` (§8.1 "kể cả tách một cụm danh từ hóa"), không có chỗ nào bảo generator cho persona **nói** bằng danh từ hóa. Dấu hiệu fluff PM [37][46] ("I usually", "I would", khen lịch sự) không có; chỉ BA có tiêu chí eval riêng, PM không có.
- Đề xuất: thêm vào FR-65 (hoặc addendum §2 "Generator kịch bản") một mục "Gói grounding gồm": (a) danh mục 24 mẫu kèm nguồn và độ tin từng mẫu, mẫu 19–21 ghi "suy ra"; (b) lưu ý "lệch về y tế và mua sắm công, 0 mẫu doanh nghiệp VN: generator phải chuyển bối cảnh, AI critic chấm riêng độ hợp bối cảnh VN"; (c) 5 quy tắc sinh của §6 (danh từ hóa giấu tác nhân, "hệ thống làm X nhưng thực tế Y" + bù đắp của người, ngoại lệ gắn điều kiện → item follow-up, truyền miệng → item tin tưởng, fluff PM → item chuyện quá khứ). Thêm tiêu chí eval PM tương tự BA: "≥2/3 run PM tốt có câu `past_specific` ngay sau một lượt persona nói thói quen chung hoặc hứa tương lai" `[ASSUMPTION]`. Ước tính 0,5 ngày của dòng "Gói grounding" có thể cần tăng.

### G6. Kiểm độ thật BA bằng AI thay vì người làm nghề — **Trung bình**
- Research: khuyến nghị 5 ("Vẫn nên tìm 1–2 BA thật để kiểm tra nhẹ, vì độ thật là điểm yếu đã được đo [8]"); bảng giả định "AI soạn kịch bản BA/PM, không cần người làm nghề duyệt — **Bị thách thức**".
- PRD: FR-65 "AI critic đóng senior BA/PM" + "1–2 người đọc proxy (kiểm tra một phần)". Không nói người đọc proxy có phải BA/PM đang làm nghề không. AI critic là AI chấm AI, cùng loại điểm yếu research nêu (và cùng rủi ro "lỗi tương quan giữa các judge" PRD §13 đã nhận).
- Đề xuất: FR-65 định nghĩa "người đọc proxy" là ≥1 BA (và ≥1 PM) đang làm nghề, tốt nhất ở doanh nghiệp VN; nếu không tìm được thì ghi rõ là rủi ro có tên ở §13, và không coi AI critic là kiểm độ thật.

### Phụ: khung lời BA ở VN — **Thấp**
- Research §3 dòng 82: văn viết BA ở VN đổ lỗi cho stakeholder; cần đổi khung sang "câu hỏi của bạn quyết định họ nói được gì" (chưa kiểm).
- PRD: không có. Đề xuất: ghi vào câu hỏi mở hoặc NFR-14 như hướng copy cho chủ đề BA, đánh dấu chưa kiểm.

## (3) Khuyến nghị của research bị bỏ hoặc làm yếu

| Khuyến nghị (research) | Trong PRD | Trạng thái |
|---|---|---|
| KN1 định vị "phòng tập phỏng vấn người dùng / **stakeholder** có phản hồi kèm bằng chứng"; tránh "phỏng vấn" đứng một mình | §1 "phòng tập phỏng vấn người dùng, kèm bằng chứng bạn sai ở đâu"; NFR-14 cấm "phỏng vấn" đứng một mình | Giữ, nhưng **bỏ chữ "stakeholder"** dù BA/PM ra mắt cùng lúc. → G7 (Thấp) |
| KN2 "bắt lỗi trước buổi thật", không dùng "feedback" | Headline, NFR-14 | Giữ |
| KN3 tỉ lệ rò/episode vào eval harness, [7] làm mốc | FR-34 rò mỗi episode, baseline; NFR-6 | Giữ (thiếu lưu ý so sánh, G9) |
| KN4 không nói replay "có bằng chứng khoa học"; OSCE chỉ "cùng họ phương pháp" | FR-62, NFR-14, Màn 12 "lấy cảm hứng từ" | Giữ |
| KN5 grounding BA/PM, ưu tiên mẫu 11–16 và 1–9, quy tắc danh từ hóa, đánh dấu ngưỡng tiền, 1–2 BA thật | FR-65 chỉ "gói grounding (research.md §6)" | **Bỏ phần lớn**. → G1, G2, G6 |
| KN6 thử B2B2C song song B2C | §13 câu hỏi mở "Ai trả tiền? (hoãn có chủ đích)"; giả định #8 "2–3 cuộc nói chuyện với giảng viên hoặc trung tâm"; "sản phẩm cho giảng viên" ngoài phạm vi | Hoãn có ghi, không im lặng. Thiếu người chịu trách nhiệm và thời điểm cho 2–3 cuộc nói chuyện (Thấp) |
| KN7 giám sát mom-test | Giả định #1 | Giữ |
| Độ cũ: kiểm lại [1][2][3][4][11] trước 2026-12-22 | Giả định #1 chỉ ghi cho [1] | Giữ ý chính |
| Độ cũ: [14] giá ChatGPT VN **đã cũ**, "kiểm lại trước khi định giá" | NFR-3 dùng mốc 100–200k (suy từ [14]) làm mục tiêu chi phí, không nhắc nguồn đã cũ | **Bỏ**. → G10 (Thấp) |
| Độ cũ: [50] tiếng nói người học **đã cũ** và là nguồn đọc đầy đủ duy nhất | NFR-14 "ngôn ngữ của nỗi sợ" dựa trên [50] | Không ghi. → G10 (Thấp) |
| "Cần 5–8 phỏng vấn người học thật **trước khi khóa thông điệp**" (dòng 30, câu hỏi mở dòng 200–201) | §12.4: 5–8 buổi thử **sau S2 và S5**, câu hỏi chỉ về usability; headline đã khóa ở NFR-14 | **Làm yếu**. → G5 |
| §4: "phản hồi trích theo lượt so với phản hồi tổng quát: không tìm thấy bằng chứng" | Màn 12 không nêu; giả định #2 không nêu | **Bỏ**. → G4 |

### G5. Phỏng vấn người học trước khi khóa thông điệp — **Trung bình**
- Research: dòng 30 ("Cần 5–8 phỏng vấn người học thật trước khi khóa thông điệp"); câu hỏi mở dòng 200–201 (VN/BA có thấy đau không; muốn phản hồi hay chỉ bớt sợ).
- PRD: §12.4 buổi thử 5–8 sinh viên chỉ có câu usability (60 giây, tìm thấy replay, canvas, thông báo ai xem); NFR-14 khóa headline. Giả định #4, #10 đo bằng SM sau ra mắt.
- Đề xuất: thêm vào §12.4 ít nhất 2 câu hỏi khám phá ở buổi thử đầu (sau S2): "lần phỏng vấn người dùng gần nhất, điều gì làm bạn lo nhất?" và "bạn muốn biết mình sai ở đâu, hay muốn bớt run?"; ghi NFR-14 headline là tạm thời cho tới khi các buổi này xong.

### G4. Màn 12 thiếu hai lưu ý — **Trung bình**
- Research: §4 dòng 88 ([5] abstract, dị biệt cao), dòng 95 (không có bằng chứng cho dạng phản hồi trích theo lượt); bảng giả định dòng 176, 178.
- PRD: Màn 12 dàn ý.
- Đề xuất: thêm vào dàn ý: "[5] số liệu lấy từ abstract, dị biệt cao, cho SP nói chung" (để lần research học thuật kiểm lại full text) và vào phần "nói thẳng": "chưa tìm thấy bằng chứng rằng phản hồi trích theo từng lượt tốt hơn phản hồi tổng quát". Đây là chính lõi sản phẩm, nên trang trung thực phải nêu.

## (4) Mâu thuẫn hoặc nói mạnh hơn research

### G3. Neo giả thuyết trình bày như điều đã xác lập — **Trung bình**
- Research: §5 dòng 102 ([10] bị tranh cãi, [34] không tái lập; chưa có nghiên cứu về persona AI gây neo; "suy luận hợp lý, chưa được chứng minh"); bảng giả định dòng 182 ("thận trọng hợp lý, không nên quảng bá như điều đã có bằng chứng").
- PRD §4: "…đúng loại thiên kiến xác nhận dẫn tới câu dẫn dắt [research 10]".
- Đề xuất: sửa thành "…có thể thành thiên kiến xác nhận dẫn tới câu dẫn dắt (thí nghiệm kinh điển [10], bị tranh cãi [34]; chưa có nghiên cứu với persona AI, đây là suy luận)". Quyết định giảm nhẹ giữ nguyên; chỉ đổi mức chắc chắn. Không mâu thuẫn với việc PRD coi neo là rủi ro, vì research cũng ủng hộ thận trọng.

### Thấp
- **G7** §1 bỏ "stakeholder" khỏi định vị (KN1). Đề xuất: "phòng tập phỏng vấn người dùng và stakeholder, kèm bằng chứng bạn sai ở đâu", hoặc ghi lý do bỏ (VN-first, UX beachhead).
- **G8** Giả định #2 chỉ dẫn [6] "ngoài lĩnh vực"; research ghi ủng hộ bởi [6][26][29], chỉ dạng trích theo lượt là chưa kiểm. Giả định #11 "Chưa kiểm" trong khi research "ủng hộ một phần" bởi [7]. Đề xuất: #2 "Ủng hộ cho phản hồi nói chung [6][26][29]; dạng trích theo lượt chưa kiểm"; #11 "Ủng hộ một phần [7] (một benchmark); tự đo bằng baseline".
- **G9** NFR-6: thêm "[7], một benchmark một tác giả, gpt-4o-mini, định nghĩa rò khác (a)/(b) của FR-34; không so trực tiếp".
- **G10** NFR-3 / NFR-14 dựa vào [14] (đã cũ, research yêu cầu kiểm lại trước khi định giá) và [50] (đã cũ, một người). Đề xuất: ghi chú độ cũ cạnh NFR-3 và giả định #10.
- **G11** "[research 10]" khác cách ghi [6], [8] ở chỗ khác. Đề xuất: thống nhất "[n]" và thêm một dòng ở đầu PRD: "[n] = số nguồn trong research.md".
- **G12** Màn 12 "chưa được nghiên cứu riêng / chưa được nghiên cứu": research là tìm kiếm có giới hạn. Đề xuất: "chúng tôi chưa tìm thấy nghiên cứu nào…", để lần research học thuật kiểm lại.
- **G13** [30] và [33] bị mở rộng phạm vi (bệnh nhân ảo LLM → persona AI; nhóm nhân khẩu học → giả thuyết lĩnh vực). Đề xuất: nêu phạm vi gốc hoặc ghi "tương tự".
- **§1 câu mở đầu** "Người mới… **thường** chỉ biết mình hỏi sai sau khi…": research chỉ có câu dẫn dắt và không hỏi sâu đạt chuẩn hai cộng đồng [41][42][32]; "biết muộn" là từ một người [50]. Đây là văn PRD, không phải copy, nên chấp nhận; nếu đưa ra copy thì bỏ "thường".

## Không có vấn đề
- [6] giữ lưu ý preprint; [8] đúng chiều (người thật được đánh giá thật hơn); [28] giữ "chỉ hồi sức, độ chắc chắn rất thấp".
- Không số liệu research nào trong copy cho người học; FR-62 chặn trang phương pháp sau research học thuật.
- Khóa "không nói replay/phương pháp đã chứng minh" (KN4) có ở FR-62 và NFR-14.
- Giả định #1 giữ mốc 2026-12-22 và theo dõi mom-test, UXPressia.
- Ranh giới "chỉ đánh giá kỹ năng người học" khớp insight 4 và §5.

## Câu hỏi mở cho PM
1. Chủ đề BA mẫu "Duyệt chi phí công tác" có giữ không, khi mẫu ngưỡng duyệt chưa có nguồn (G1)?
2. "Người đọc proxy" là ai: BA/PM đang làm nghề, hay ai khác (G6)?
3. Có muốn khóa headline trước khi có phỏng vấn người học không (G5)?
