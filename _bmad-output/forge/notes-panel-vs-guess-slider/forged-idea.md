# Forged Idea — Ghi chú trong buổi + hai con số (InterviewLab)

> Forge 2026-09-30 → 10-01, **HARDENED**. Nguồn: `.memlog.md` cùng thư mục. Đầu vào để sửa `prd.md` và `addendum.md` (prd-week-3-project-2026-09-24); thay chúng ở mọi điểm khác nhau dưới đây. Lịch build: 2 tháng.

## Cam kết trước reveal
- Giữ **1 câu, 1 số**: "Bạn nghĩ chị Thu đã kể cho bạn bao nhiêu trong 11 điều?" SM-6 = số đoán so với KHAI THÁC, nguyên nghĩa. Số đoán không bao giờ vào LLM call nào.
- Trả lời reviewer: con số vẫn trần; **nội dung chuyển từ con số sang reveal**.

## Hai con số
- **KHAI THÁC** (chat, kỹ năng hỏi): item persona thật sự đã kể.
- **NHẬN BIẾT** (canvas, kỹ năng nghe): item quan trọng người học ghi lại, dù được xác nhận hay chưa. Mẫu số = item **đã lộ ra trong transcript** (hook đã thả hoặc đã kể). Chỉ số mới SM-8.
- Kết quả phán đoán trên canvas:
  - item đã kể → tính cả hai;
  - item chưa xác nhận → chỉ NHẬN BIẾT, dòng có tên "Bạn đoán đúng, nhưng chị Thu chưa xác nhận — trong buổi thật, bạn sẽ không biết mình đúng";
  - fact bề mặt → không tính, **không gắn nhãn** (ghi chú bình thường);
  - chưa từng được nói → không tính, gắn tên: phiên bản ghi chú của `leading`.
- Dòng chẩn đoán một câu ngay trên nút replay ("Bạn nghe được, nhưng chưa hỏi tiếp").
- **Lớp ghi chú là cộng thêm, có chủ đích:** canvas rỗng → "Không có ghi chú trong buổi này" (không bao giờ là 0), chẩn đoán dùng lại câu chữ PRD hiện tại, không nhắc "lần sau"; canvas được giới thiệu ở Màn 3.

## Canvas
- Desktop: notepad cố định cạnh chat. Mobile 360px: bong bóng ✎ nổi; chạm thì notepad trượt lên che 60% dưới, 40% trên còn 1–2 tin cuối; chạm ra ngoài hoặc vuốt xuống để thu.
- Một khối văn bản, tự lưu im lặng (resume theo FR-10), sửa tự do trong buổi, **đóng băng ở "Kết thúc buổi"**; chỉ bản cuối được chấm. Không đo thời điểm nhận ra.
- Chấm: LLM nhận cả canvas (bọc như dữ liệu), trả token range cho mỗi kết quả; code cắt theo chỉ số; ngoài phạm vi hoặc rỗng → bỏ. Reveal highlight đúng các range đó kèm giải thích (vàng cho item; màu khác cho "chưa từng được nói"). Cùng item nhắc hai lần → tính một lần.
- **Chống gợi ý (FR-8):** canvas không bao giờ vào context của call nào trong buổi; không gì đọc canvas trước "Kết thúc buổi"; không autocomplete, không điền sẵn, không đếm so với 11.

## Lớp phán đoán (mở lại 3 khóa)
- **Ranh giới:** LLM quyết định **nghĩa**; code quyết định **tham chiếu** (cắt theo chỉ số, resolve ID lượt), **số học**, **trạng thái** (cổng là luật trên bằng chứng đã phán đoán), **ranh giới context**. Không tìm chuỗi, không regex, không template ra quyết định. Bất biến: **không lời nào được chấm bởi chính call đã viết ra nó.**
- **Cụm neo → verdict:** Call 1 của lượt t+1 phán đoán lượt persona t đã thả hook được chọn / đã kể item đã mở chưa (0 call thêm; ranh giới rò không đổi). Verdict lưu gắn với lượt được chấm; replay chép verdict các lượt ≤ điểm rẽ. Lượt cuối: pass cuối buổi. Lượt replay: judge ngay sau khi hiện câu trả lời. Mọi claim "bạn bỏ qua hook" được verifier đọc lại.
- **`introduced_content` → token span:** lượt lưu dạng token đánh số; Call 1 trả token range; code cắt; ngoài phạm vi/rỗng → `open`. "Persona chưa từng nói ý này" là phán đoán của verifier.
- **Template → generator:** output có cấu trúc `{text, cited_turns, item_id?, canvas_range?, suggested_question?}`; code resolve mọi tham chiếu; verifier kiểm từng claim + luật FR-30 (không khẳng định về người dùng thật); mọi `suggested_question` qua classifier nhãn, `leading` bị loại (khôi phục khóa guide của forge); lỗi hết → dòng trạng thái trống.
- **"Item đã kể"** = verdict disclosure dương cho lượt đó, verifier xác nhận lại khi được tính trên reveal; verifier bác thì giữ tín dụng, ghi chỉ số.

## Sửa PRD bắt buộc
- §9.2: mục 3 bỏ "cụm neo", thêm "canvas không trong context"; mục 4 thay 3 bullet cụm neo bằng verdict (judge giả lập) và kiểm span; mục 5 "Đã mở khóa" theo verdict; mục 2 "persona truyền đạt hook ≥95% theo judge"; mục mới: test set cho judge disclosure/hook, tính mới của `leading`, canvas (≥100 đoạn: diễn đạt khác, chỉ chạm chủ đề, phủ định, bịa, nhắc trùng), cổng cứng vào lỗi đổ cho người học (≤5% diễn đạt đúng bị bỏ lỡ).
- **NFR-1:** lượt chính ≤2 call; lượt replay ≤3; reveal 3 call tuần tự (judge canvas → generator → verifier), khởi chạy lúc "Kết thúc buổi" trong khi màn đoán hiện. Sửa §9.2 mục 6 theo đó.
- §10: rủi ro lỗi tương quan (Call 1, verifier, judge canvas cùng họ model); theo dõi bất đồng verifier theo từng loại claim.
- Chỉ số chấp nhận: tỉ lệ buổi có canvas không rỗng lúc kết thúc `[ASSUMPTION]` xem lại vị trí nếu <30% sau 30 người học.

## Mặc định chốt lúc harden (Thanh xác nhận)
- Judge canvas cũng trả span "chưa từng được nói", không chỉ item.
- Canvas khớp item **chưa từng lộ ra** trong transcript: không tính NHẬN BIẾT, hiện dòng "chưa xác nhận".
- "X điều quan trọng trong Y ghi chú" → "X điều quan trọng trong ghi chú của bạn" (canvas không có số ghi chú).

## Đã bác
- Thanh trượt đếm trần là toàn bộ cam kết → không nội dung; nội dung chuyển sang reveal.
- Đánh dấu sao ghi chú → việc nặng ở lúc tệ nhất, bắt người học làm việc của agent.
- Một điểm số gộp → che mất "hỏi tốt nhưng không nghe" vs "nghe nhưng không hỏi tiếp".
- Tính suy luận đúng chưa xác nhận là KHAI THÁC → thưởng đúng lỗi giả định sản phẩm trừng phạt.
- Gắn nhãn ghi chú fact bề mặt → phạt việc ghi chép bình thường.
- "Nhận biết: 0" khi không ghi chú → nói sai; vắng không phải điểm.
- Panel ẩn trên mobile; drawer gập; nút ghi chú điền sẵn lời persona (biến nhận ra thành bấm chép).
- Character offset → LLM đếm sai, cắt giữa chữ tiếng Việt.
- Neo chuỗi + chuẩn hóa dấu, kiểm chuỗi con → thay bằng phán đoán + cắt theo chỉ số.

## Rủi ro còn lại
- Lỗi tương quan giữa các judge cùng họ model.
- Mobile: notepad che composer, mỗi ghi chú tốn mở–gõ–thu; chỉ số chấp nhận sẽ cho biết.
- Không có thời điểm nên không phân biệt "nhận ra lúc đó" với "nhận ra khi đọc lại cuối buổi" trong cùng canvas; chẩn đoán cho item replay vẫn đúng vì item đó còn khóa tới cuối.
- Độ trễ reveal (3 call tuần tự), che một phần bằng màn đoán.
- "Hãy hỏi" do LLM viết: chất lượng phụ thuộc classifier và verifier.
