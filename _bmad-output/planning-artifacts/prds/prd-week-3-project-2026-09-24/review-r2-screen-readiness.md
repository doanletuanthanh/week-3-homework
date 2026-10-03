---
title: 'Review r2: screen readiness of PRD InterviewLab (§5–§7)'
reviewed: 'prd.md (updated 2026-10-01), with FRs/NFRs referenced from §6–§7; addendum §3.3 for "Mang về"'
date: '2026-10-02'
lens: 'UX designer who must design every screen from the PRD without asking the PM'
---

# Screen-readiness review (r2)

**Verdict: not ready to design end-to-end without guessing.** The PRD is unusually strong on content and state copy for the core loop (Màn 3–6 strings, §7 table, "chuẩn" loading/error rule). But six screens and the §7 mapping have gaps that would make a designer invent behaviour on the money path:
- reveal citations jump "tới lượt" when Màn 6 has no transcript to jump to;
- the PRD does not say what Màn 6 shows after the guess is submitted but before the reveal is ready, when the learner reopens it;
- `done` maps to two different views;
- the guess slider has no default or keyboard rule;
- the replay results for fallback 1 have no copy;
- moderation rejection has no state;
- the login and FR-63 consent step has no screen spec;
- there are no accessibility statements, although the canvas highlights carry meaning by colour alone.

Each of these can be fixed with a short spec addition (proposed text below). None needs a new mechanism.

Severity scale:
- **critical**: no reasonable default exists and it touches the core loop or data contract.
- **high**: the designer must guess learner-visible behaviour on a main path.
- **medium**: the designer must guess copy or an edge-path behaviour.
- **low**: polish, or consistency.

## 1. Per-screen readiness

| Screen | Readiness | Findings |
|---|---|---|
| Cross-cutting (§6 preamble, header, login, FR-63 notice, a11y) | **blocking** | G-1 – G-8 |
| Màn 1 · Trang chủ | minor gaps | M1-1, M1-2 |
| Màn 2 · Thư viện | minor gaps | M2-1, M2-2, M2-3 |
| Màn 2b · Chủ đề | minor gaps | M2b-1, M2b-2, M2b-3 |
| Màn 3 · Chuẩn bị | minor gaps | M3-1, M3-2, M3-3 |
| Màn 4 · Phỏng vấn | **blocking** | M4-1 – M4-7 |
| Màn 5 · Đoán | **blocking** | M5-1, M5-2, M5-3 |
| Màn 6 · Tảng băng lộ diện | **blocking** | M6-1 – M6-11 |
| Màn 7 · Luyện lại | **blocking** | M7-1 – M7-5 |
| Màn 9 · Buổi của tôi | minor gaps | M9-1, M9-2 |
| Màn 10 · Tạo chủ đề riêng | minor gaps | M10-1 – M10-4 |
| Màn 11 · Đang chuẩn bị / Chưa qua | **blocking** | M11-1 – M11-3 |
| Màn 12 · Phương pháp | ready | (none; gated content, outline is enough) |
| C1 · Truy cập | ready | (C-0 nav note only) |
| C2 · Chủ đề | ready | (none) |
| C3 · Chi tiết chủ đề | minor gaps | C3-1 |
| C4 · Soạn persona | minor gaps | C4-1 |
| C5 · Eval | minor gaps | C5-1, C5-2 |
| C6 · Phân xử rò rỉ | minor gaps | C6-1 |
| C7 · Duyệt chuỗi | **blocking** | C7-1 |
| C8 · Publish | ready | (C8-1 low) |
| C9 · Buổi học | minor gaps | C9-1 |
| C10 · Chủ đề riêng | minor gaps | C10-1 |
| §7 state table | **blocking** | S-1 – S-5 |

Of the 22 numbered screens: **4 ready, 12 with minor gaps, 6 with blocking gaps**. Cross-cutting rules and §7 are also blocking.

Findings by severity: **critical 3 · high 15 · medium 39 · low 16** (73 total). Two of the critical entries, M6-1 and S-2, are the same root cause, so there are 2 distinct critical problems.

## 2. Findings

### Cross-cutting

**G-1 · critical · Màn 6 items 3–5, Màn 7, FR-21. Citations jump to a transcript that does not exist on the reveal.**
"Bấm thì nhảy tới lượt" appears in Đã khai thác, in the canvas highlights and in FR-21, and Màn 7 has "xem toàn bộ transcript trước đó". But Màn 6 lists 7 sections and none of them is a transcript. Only the Màn 9 review shows one.
- *Designer must guess:* whether the target is a drawer, a modal, an inline expansion or a separate page; how it behaves at 360px; and whether sealed content is hidden inside it (the hook turn of the target item is sealed under the Màn 6 sealing rule).
- *Proposed spec:* "Màn 6 có **transcript buổi chính** dạng ngăn trượt (desktop: panel phải; 360px: toàn màn, nút đóng 'Về kết quả'). Bấm trích dẫn mở ngăn và cuộn tới lượt đó, tô nền lượt trong 2 giây. Trước khi replay kết thúc, transcript vẫn hiện đủ mọi lượt (lời persona không phải thứ bị niêm phong) nhưng không có dấu hay nhãn nào trên lượt thả hook của item mục tiêu. Màn 7 'xem toàn bộ transcript trước đó' mở cùng ngăn này, chỉ tới điểm rẽ nhánh."

**G-2 · high · §6 preamble, Màn 3, FR-2, FR-63. The login and consent step has no screen spec.**
- *Designer must guess:*
  - whether the FR-63 notice is a modal or a page;
  - whether there is a way to decline, and what happens on decline;
  - what happens if the Google popup is cancelled or blocked;
  - where the notice appears when a returning user deep-links into Màn 4 after the notice text has changed ("hỏi lại");
  - whether the learner lands back on Màn 3, or continues straight into session creation.
- *Proposed spec:* "**Màn 0 · Thông báo dữ liệu** (FR-63): trang đầy đủ, không đóng được bằng cách bấm ra ngoài; nội dung FR-63; nút chính 'Tôi hiểu'; link phụ 'Quay lại' về trang trước, không lưu đồng ý, không tạo buổi. Hiện sau đăng nhập lần đầu và mỗi khi phiên bản thông báo đổi, **trước bất kỳ trang đòi đăng nhập nào** (kể cả link thẳng tới Màn 4–9). Sau 'Tôi hiểu' tiếp tục đúng hành động đã khởi động (ví dụ 'Bắt đầu' ở Màn 3 thì tạo buổi luôn, không bắt bấm lại). Hủy cửa sổ Google → ở lại trang cũ, không thông báo lỗi. Đăng nhập lỗi → 'Không đăng nhập được. Thử lại'."

**G-3 · high · §6 preamble. There is no rule for routing, deep links or the back button on session screens.**
Only Màn 2b has a "not found" case.
- *Designer must guess:*
  - what an old URL shows (for example Màn 5 when the session is already `done`, or Màn 4 after it has ended);
  - what the browser back button does from Màn 6 to Màn 5 or Màn 4, and from Màn 7;
  - what another user's session URL shows.
- *Proposed spec:* "Mỗi buổi có một URL `/buoi/[id]`; trang luôn render đúng màn theo trạng thái hiện tại (§7), không theo màn đã mở trước đó. Nút quay lại của trình duyệt từ một màn trong buổi về màn trước buổi (Màn 2b hoặc Buổi của tôi), không về bước trước của buổi. Buổi không tồn tại hoặc không phải của mình → 'Không tìm thấy buổi này.' kèm nút 'Buổi của tôi' (không phân biệt hai trường hợp)."

**G-4 · high · §6 global; FR-46/48a; Màn 4, 5, 6. The PRD states no accessibility baseline.**
- *Designer must guess:*
  - canvas highlights use "vàng / màu thứ hai / màu thứ ba", so the meaning is carried by colour alone;
  - the slider has no keyboard or screen-reader rule;
  - the mobile ✎ bubble has no focus or escape rule;
  - "đang gõ…" and new persona turns are not announced;
  - there is no contrast target.
- *Proposed spec (new NFR-15):*
  - "Mọi nghĩa của màu trên canvas đi kèm nhãn chữ ngắn hoặc biểu tượng có tên (ví dụ 'Đã kể', 'Chưa xác nhận', 'Chưa từng được nói') và chú giải ở đầu mục 5.
  - Thanh trượt điều khiển được bằng phím mũi tên/Home/End, đọc được giá trị 'X trên N'.
  - Canvas mobile: mở bằng nút có nhãn 'Ghi chú', Esc/nút 'Thu' để đóng, focus trả về nút.
  - Tin persona mới và trạng thái 'đang gõ' được đọc qua live region lịch sự.
  - Tương phản chữ ≥4.5:1 (WCAG 2.2 AA).
  - Mọi thao tác dùng được không cần chuột."

**G-5 · medium · Header (Màn 1, FR-42). The account menu, sign-out and role persistence have no UI.**
Màn 1 lists both "Buổi của tôi" (after login) and "Đăng nhập" without saying that one replaces the other. There is no sign-out anywhere.
- *Proposed spec:* "Header: logo → Màn 1; 'Thư viện'; sau đăng nhập 'Buổi của tôi' và avatar mở menu ('Đăng xuất'). Trước đăng nhập chỉ 'Đăng nhập'."

**G-6 · medium · "Lỗi chuẩn". There is no copy for an expired login or for repeated failures.**
"Không kết nối được" is wrong when the login has expired (a 401) or when the server returns a 5xx, and the retry can loop forever.
- *Proposed spec:* "Hết phiên đăng nhập → chuyển đăng nhập rồi quay lại đúng trang, giữ nội dung đang gõ (ô hỏi, canvas, ô chủ đề) trong bộ nhớ trình duyệt. Thử lại 3 lần vẫn lỗi → 'InterviewLab đang gặp sự cố. Tiến độ của bạn đã được lưu; quay lại sau ít phút.'"

**G-7 · medium · Màn 3, Màn 10, FR-37, FR-56. "[giờ reset]" has no format or timezone.**
- *Proposed spec:* "Mọi hạn mức theo ngày reset lúc 00:00 giờ Việt Nam (UTC+7); hiện 'sau 0 giờ đêm nay' hoặc 'lúc 0:00 ngày dd/mm'."

**G-8 · low · Persona name inside copy strings.**
`[Persona]` appears both at the start of a sentence and mid-sentence ("Chị Thu" / "chị Thu"), and the PRD does not name a source field.
- *Proposed spec:* "Persona có `display_name` dạng xưng hô ('chị Thu'); viết hoa chữ đầu khi đứng đầu câu. Persona sinh cho chủ đề riêng cũng có trường này."

### Màn 1 · Trang chủ

**M1-1 · medium · Demo button "Bắt đầu buổi mới" (FR-45).** The PRD does not say which persona this button starts.
- *Proposed spec:* "Nút demo mở Màn 2 (thư viện); mọi thẻ persona của tài khoản demo có thêm 'Bắt đầu buổi mới'." Alternatively, remove the button from Màn 1.

**M1-2 · low · The reveal screenshot.** It must not show numbers or stats that would break NFR-14.
- *Proposed spec:* "Ảnh chụp từ buổi `seed-demo` thật, không số liệu tổng hợp."

### Màn 2 · Thư viện

**M2-1 · medium · The role chip "Khác" means "all".** The chip is labelled "Khác" but shows every topic, which reads as "other roles". The empty state's "Xem mọi chủ đề" implies a different action.
- *Designer must guess:* the label, and whether "Xem mọi chủ đề" just selects Khác.
- *Proposed spec:* State that "Xem mọi chủ đề" = chọn chip Khác. Alternatively, confirm the label is intentional (it is also an FR-50 event value).

**M2-2 · medium · Custom topic cards versus the role filter.** A custom topic has no role chosen by the user (§4 `role` field).
- *Proposed spec:* "Khu 'Chủ đề của bạn' không chịu bộ lọc vai trò; luôn hiện trên lưới chủ đề curated."

**M2-3 · low · Card order is unspecified.**
- *Proposed spec:* "Theo thứ tự quản trị viên đặt; chủ đề riêng mới nhất trước."

### Màn 2b · Chủ đề

**M2b-1 · medium · Button labels conflict.** Màn 2b says "Tiếp tục", while §7 says "Tiếp tục buổi luyện". Choose one.

**M2b-2 · medium · Unpublished persona with an existing session.** The "Trống" rule hides the topic when no persona is published, and nothing says whether a learner's own unpublished-persona session still shows on Màn 2b.
- *Proposed spec:* "Persona bị gỡ publish không hiện ở Màn 2b; buổi của người học vẫn mở được từ Màn 9."

**M2b-3 · low · The persona "ảnh" has no source.** C4 has no image field, and generated personas have no image.
- *Proposed spec:* "Ảnh là avatar minh họa chọn từ bộ có sẵn trong C4; persona sinh tự động dùng chữ cái đầu."

### Màn 3 · Chuẩn bị

**M3-1 · high · FR-5 enforcement and a resumed session are not defined on Màn 3.** "Bắt đầu" creates a session for a curated persona. The PRD does not say:
- what happens when the learner already has a session for this persona (for example from a stale tab or a deep link), or
- which label the button shows for the §7 state "`interviewing`, 0 lượt", which routes through Màn 3.
- *Proposed spec:* "Đã có buổi cho persona này → nút đổi thành 'Tiếp tục' và mở màn theo §7; buổi `done` → 'Xem lại kết quả'. Server từ chối tạo buổi thứ hai và chuyển tới buổi hiện có."

**M3-2 · medium · FR-37 versus a custom session that already exists.** The custom session is created at "Tạo kịch bản". The PRD does not say whether the cost cap blocks opening Màn 4 for it.
- *Proposed spec:* State "buổi chủ đề riêng đã tạo không bị cap chặn" or the opposite.

**M3-3 · low · Persona identity block.** The PRD does not say whether Màn 3 shows the persona's photo, name and one-liner.
- *Proposed spec:* State yes, and reuse the Màn 2b card header.

### Màn 4 · Phỏng vấn

**M4-1 · high · On mobile, the canvas, chat and keyboard compete for space.** At 360px with the virtual keyboard open, a sheet covering 60% leaves almost no room for "1–2 tin cuối". The PRD also does not say whether the question box stays usable while the sheet is open.
- *Proposed spec:* "Khi notepad mở, ô gửi câu hỏi ẩn; bàn phím chỉ phục vụ notepad; sheet co theo vùng nhìn còn lại, vẫn giữ ≥1 tin cuối của persona. Thu sheet thì ô gửi trở lại với nội dung đang gõ. Breakpoint: <768px dùng bong bóng (khớp FR-38), ≥768px notepad cố định."

**M4-2 · high · LLM error presentation and repeated failure.** The PRD does not say whether "Chị Thu chưa nghe rõ, bạn gửi lại nhé" is a persona bubble or a system notice. A persona bubble would put a fake turn into the transcript the learner sees. It also does not say what happens after N failures.
- *Proposed spec:* "Hiện dưới ô gửi dạng thông báo hệ thống, không phải bong bóng persona, không vào transcript. Lỗi 3 lần liên tiếp → 'InterviewLab đang gặp sự cố. Buổi của bạn đã được lưu ở lượt [n]; quay lại sau.'"

**M4-3 · medium · Question input limits.**
- *Designer must guess:* the maximum length, Enter versus Shift+Enter, and whether an empty question can be sent.
- *Proposed spec:* "Tối đa 500 ký tự `[ASSUMPTION]`; Enter gửi, Shift+Enter xuống dòng (desktop); mobile có nút gửi; ô rỗng không gửi được."

**M4-4 · medium · Warning before turn 30.** The PRD does not say whether there is a warning, so the designer might add one or might rule it out.
- *Proposed spec:* "Không có cảnh báo riêng; bộ đếm 'Lượt n/30' là đủ." Alternatively: "từ lượt 28 bộ đếm đổi kiểu chữ."

**M4-5 · medium · The "Kết thúc buổi" confirmation.** Its button copy is missing, and the PRD does not say whether ending is allowed while the persona is typing (a turn in flight).
- *Proposed spec:* "Hộp xác nhận: 'Kết thúc và đóng băng ghi chú?' · 'Kết thúc buổi' / 'Hỏi tiếp'. Khi persona đang gõ, nút Kết thúc khóa tới khi lượt ghi xong."

**M4-6 · medium · Header at 360px.** The header has a long research question, a turn counter and the sealed counter, and the PRD does not say how they fit.
- *Proposed spec:* "360px: câu hỏi nghiên cứu thu gọn một dòng, chạm để mở; luôn hiện lượt và bộ đếm niêm phong."

**M4-7 · low · Canvas affordances.** The canvas has no placeholder, no length cap, and no rule for "lưu lỗi liên tục".
- *Proposed spec:* "Placeholder 'Ghi điều bạn thấy quan trọng…'; tối đa 5.000 ký tự `[ASSUMPTION]`; báo lỗi sau 2 lần lưu thất bại liên tiếp."

### Màn 5 · Đoán

**M5-1 · high · The slider has no initial value and no must-touch rule.** A default value anchors the guess (SM-6 compares the guess with KHAI THÁC), and a default of 0 or the midpoint biases the metric.
- *Proposed spec:* "Thanh trượt không có giá trị ban đầu (núm ẩn, nhãn 'Kéo để chọn'); 'Xem kết quả' khóa tới khi người học chọn. Hai đầu ghi '0' và '[N]'; giá trị đang chọn hiện to phía trên."

**M5-2 · medium · Can the canvas be viewed?** The PRD does not say whether the frozen canvas or transcript can be seen while guessing.
- *Proposed spec:* "Không: Màn 5 chỉ có câu hỏi và thanh trượt." Alternatively, allow it in read-only form; either way the PRD must say.

**M5-3 · medium · Long wait.** "Đang đối chiếu…" has no ceiling. The p95 is 15 s, but there is no copy beyond that.
- *Proposed spec:* "Sau 30 giây thêm dòng 'Vẫn đang đối chiếu. Bạn có thể đóng trang; kết quả sẽ ở trong Buổi của tôi.'"

### Màn 6 · Tảng băng lộ diện

**M6-1 · critical · Reveal still pending after the guess is submitted.** See also S-2. The guess moves the session to `revealed`, but the reveal may still be computing. Reopening Màn 6 ("đọc kết quả đã lưu, không gọi LLM") has no "not ready yet" view.
- *Proposed spec:* "Mở Màn 6 khi số đoán đã lưu nhưng 3 call chưa xong → hiện 'Bạn đoán [g]. Đang đối chiếu transcript và ghi chú của bạn…' (không số nào khác), tự cập nhật khi xong; quá 2 lần thử lại → dạng suy giảm."

**M6-2 · high · Content of the sealed card "Giữ lại để bạn thử (1)".** The PRD does not say what it shows: a lock only, the topic tag, or the hook turn number. The diagnostic line already says "Lượt 5".
- *Proposed spec:* "Thẻ chỉ có biểu tượng khóa, tiêu đề 'Giữ lại để bạn thử', dòng 'Một điều [persona] chưa kể. Mở ra sau khi bạn luyện lại hoặc bỏ qua.' Không topic tag, không trọng số."

**M6-3 · high · A tap on a highlight both explains and jumps.** "Một câu giải thích" per highlight and "Bấm… nhảy tới lượt" both claim the tap, and on mobile there is no hover.
- *Proposed spec:* "Câu giải thích hiện ngay dưới đoạn tô (luôn hiện, không cần bấm); link 'Lượt N' ở cuối câu là nơi duy nhất nhảy tới transcript."

**M6-4 · high · The view after replay ("chế độ đã xong").** It is not specified where the replay outcome lives once the learner returns from Màn 7, or whether the replay block still shows "Quay lại lượt 6".
- *Proposed spec:* "Khối replay được thay bằng thẻ kết quả: thành công / một phần / thất bại kèm đúng chuỗi của Màn 7, nội dung item mục tiêu, câu hỏi mẫu, link 'Xem 3 lượt luyện lại'. Không còn nút replay."

**M6-5 · medium · The "Bỏ qua, cho tôi xem luôn" link is irreversible.** There is one replay per session, and no confirmation is specified.
- *Proposed spec:* "Hộp xác nhận: 'Bỏ qua lần luyện lại? Bạn sẽ không thử lại được khoảnh khắc này.' · 'Cho tôi xem luôn' / 'Ở lại'."

**M6-6 · medium · The replay button label rule.** "Quay lại lượt 6" is only an example.
- *Proposed spec:* "Nhãn = 'Quay lại lượt [điểm rẽ + 1]': ứng viên chính h+1; dự phòng 1 l."

**M6-7 · medium · Labels for đường mở in Bỏ lỡ.** The PRD names no learner-facing labels. "follow-up" is English, and the copy for the trust line ("nói bằng lời") has a template only in the addendum §7 rejected-options table, with no stated source (template or generator).
- *Proposed spec:* Define the fixed labels "Hỏi tiếp chi tiết / Kéo về một lần cụ thể / Tạo tin tưởng / Hỏi thẳng". Make the trust line a fixed template, "[Persona] chưa đủ tin để kể. Lượt [a, b, c] làm [persona] dè dặt hơn.", built by code from the ledger and approved in C7.

**M6-8 · medium · Where leading turns appear.** FR-19 says every turn flagged as leading shows its introduced phrase, but leading turns are not items. It is unclear whether they belong under Bỏ lỡ, under Mang về, or in their own list.
- *Proposed spec:* "Lượt dẫn dắt chỉ hiện trong 'Mang về' (cặp Thay vì hỏi / Hãy hỏi) và trong transcript (nhãn 'Dẫn dắt' kèm cụm tự thêm gạch chân)."

**M6-9 · medium · NHẬN BIẾT = 0 with a non-empty canvas.** The copy is unspecified (FR-49 only covers an empty canvas).
- *Proposed spec:* "Canvas có chữ nhưng không khớp item nào → 'Nhận biết: chưa có điều quan trọng nào trong ghi chú của bạn.'"

**M6-10 · medium · Next-persona card when nothing is left (FR-31), and the waitlist.** There is no copy for these cases:
- no untried persona remains in this topic or in other topics of the same role;
- after the waitlist button is clicked;
- the waitlist was already clicked;
- what "mở thêm" actually offers.
- *Proposed spec:* "Hết persona → 'Bạn đã luyện mọi persona của vai trò này.' kèm link thư viện bộ lọc Khác. Waitlist: 'Muốn thêm persona? Báo tôi khi có' → sau bấm 'Đã ghi. Chúng tôi sẽ báo qua email Google của bạn.' `[ASSUMPTION: kênh báo]`."

**M6-11 · low · Tải về / PDF.** The print header (persona, date) and the file name are unspecified.
- *Proposed spec:* "Bản in có tên persona, chủ đề, ngày buổi; tên file `thoi-quen-hoi-[persona]-[ngay].pdf`."

### Màn 7 · Luyện lại

**M7-1 · high · Fallback 1 has no result copy.** Màn 7 only has strings for the main candidate. Fallback 1 ("hỏi lại mà không dẫn dắt") succeeds or fails under different rules (§9.5) and has no item to "unlock".
- *Proposed spec:* "Dự phòng 1: mở đầu 'Hỏi lại từ đây, lần này không dẫn dắt.'; thành công → 'Ba câu không dẫn dắt, có [k] câu bám vào lời [persona].'; thất bại → 'Lượt [n] vẫn thêm ý của bạn: \"[cụm]\".' kèm câu hỏi mẫu."

**M7-2 · medium · What partial success shows.** There is no copy for "item vừa mở".
- *Proposed spec:* "'Bạn mở được một điều khác: [item].' rồi chuỗi thất bại."

**M7-3 · medium · Result, then return.** The PRD does not say whether the result is shown in the chat or as a panel, or whether the return to Màn 6 is automatic or needs a button.
- *Proposed spec:* "Kết quả hiện dưới lượt cuối; nút 'Về kết quả buổi' (không tự chuyển)."

**M7-4 · medium · Dừng.** There is no confirmation, although Dừng is irreversible.
- *Proposed spec:* "'Dừng luyện lại? Điều bị giữ sẽ được mở ra.' · 'Dừng' / 'Hỏi tiếp'."

**M7-5 · medium · The replay judge fails after the persona has answered.** "Như Màn 4; lượt không tính" is ambiguous because the persona reply is already on screen.
- *Proposed spec:* "Judge replay lỗi sau 2 lần thử lại → lượt vẫn tính, item coi như chưa kể, dòng nhỏ 'Chưa kiểm được lượt này.'"

### Màn 9 · Buổi của tôi

**M9-1 · medium · The replay branch in the review view.** "Kết quả replay" is listed, but the PRD does not say whether the 3 replay turns are shown, or where (see M6-4).
- *Proposed spec:* "Bản xem lại = Màn 6 chế độ đã xong + ngăn transcript (G-1) + mục 'Luyện lại' hiện 3 lượt nhánh, tách rõ khỏi transcript chính."

**M9-2 · low · Pagination and filtering.**
- *Proposed spec:* "Không lọc; tải thêm 20 buổi mỗi lần."

### Màn 10 · Tạo chủ đề riêng

**M10-1 · high · Moderation is synchronous on Màn 10 but the first step of the worker pipeline (FR-54).** If it runs async, a rejected attempt has already created a `generating` session, and §7 has no rejected state. See M11-1.
- *Proposed spec:* "Phân loại trọng tâm và kiểm duyệt chạy đồng bộ trong request 'Tạo kịch bản' (trước khi tạo buổi); chỉ khi qua mới tạo buổi `generating`. FR-54 bắt đầu từ bước sinh."

**M10-2 · medium · The moderation "[lý do chung]" set is undefined.**
- *Proposed spec:* Fixed reasons mapped from FR-55: "có tên hoặc nhận ra được người thật", "nội dung tình dục", "liên quan trẻ vị thành niên", "nội dung tự hại", "hoạt động phạm pháp".

**M10-3 · medium · Precedence when several limits apply at once.** The free scenario is used, there are no attempts left today, and the budget is exhausted.
- *Proposed spec:* "Thứ tự: đang có lần thử chạy → đã dùng kịch bản miễn phí → hết ngân sách hệ thống → hết lần thử hôm nay. Chỉ hiện trạng thái đầu tiên thỏa."

**M10-4 · medium · Exact text of the disclosure block and the trọng tâm labels.** Every string on custom-topic screens must pass C7, but the PRD gives a list of points instead of strings. "Buổi này tập trung vào: [trọng tâm]" has no Vietnamese labels for the enum, including `general`.
- *Proposed spec:* "Nhãn: follow_up 'Hỏi tiếp chi tiết vừa nghe'; past_story 'Kéo về một lần cụ thể'; trust 'Người dè dặt'; no_leading 'Tránh câu dẫn dắt'; general → không hiện dòng 'tập trung vào'." Also write out the disclosure block verbatim.

### Màn 11 · Đang chuẩn bị / Chưa qua

**M11-1 · high · There is no state for a moderation rejection.** C10 lists "bị kiểm duyệt từ chối" as a result, but §7 has no such state. This is resolved by M10-1, or else the PRD needs a `rejected` state with its own Màn 9 label.

**M11-2 · medium · A stuck or overlong `generating` run.** The p95 is 10 min, but there is no timeout.
- *Proposed spec:* "Quá 30 phút → worker đánh `failed_eval` mã 'lỗi hệ thống', không tính lần thử `[ASSUMPTION]`."

**M11-3 · medium · Failure reasons shown to learners are internal jargon.** "cách biệt tốt–xấu chưa đủ" and "có dấu hiệu lộ điều ẩn" are not written for learners, and "Chạy thử 7 buổi kiểm tra" is in the progress steps.
- *Proposed spec:* Learner-facing strings for the reasons:
  - "Nhân vật chưa đủ chặt chẽ";
  - "Nhân vật chưa phân biệt được câu hỏi tốt và câu hỏi dẫn dắt";
  - "Nhân vật dễ để lộ điều đang giữ";
  - "Lỗi hệ thống".

### Console

**C-0 · low · Console navigation.** There is no landing page after C1 and no global nav.
- *Proposed spec:* "Sau C1 vào C2; thanh bên: Chủ đề, Eval, Phân xử, Duyệt chuỗi, Buổi học, Chủ đề riêng."

**C3-1 · medium · There is no delete or archive for topics and personas.** The designer will guess. State "không xóa; persona chỉ gỡ publish", or add an archive action.

**C4-1 · medium · Version UI.** "Mỗi lần lưu là một bản nháp mới", but the PRD does not say how to see or pick a version, or which version eval and publish target.
- *Proposed spec:* "Bộ chọn phiên bản; eval và publish luôn gắn phiên bản đang xem; mở bản cũ chỉ đọc kèm 'Tạo nháp từ bản này'."

**C5-1 · medium · The form for BA/PM reader notes.** There are no fields, and the reader-type values are not listed. FR-65 needs the distinction "người làm nghề" / "kiểm tra một phần".
- *Proposed spec:* Fields: reader type (BA đang làm nghề / PM đang làm nghề / sinh viên / giảng viên), name or initials, comment; the label is derived automatically.

**C5-2 · medium · A cost confirmation before a full eval (20–40 USD)** is not specified.
- *Proposed spec:* "Xác nhận kèm chi phí ước tính trước khi xếp hàng eval đầy đủ."

**C6-1 · medium · The flow for resolving disagreement.** "Cho tới khi thống nhất": the PRD does not say how a ruling is changed after the other ruling is revealed, or who counts as the two arbiters (any two allowlisted admins?).
- *Proposed spec:* "Bất đồng → cả hai thấy phán quyết của nhau và sửa được phán quyết của mình; cờ đóng khi hai phán quyết trùng. Hai người phân xử là hai email khác nhau trong allowlist."

**C7-1 · high · Product-level strings have no edit surface.** The C7 list includes FR-48a explanations, diagnostic lines, FR-63 and custom-topic strings, but no screen lets anyone edit them. C4 edits persona strings only. "Trả lại kèm ghi chú" has no recipient.
- *Proposed spec:* "Chuỗi cấp sản phẩm sửa ngay trong C7 (ô sửa + FR-36 chạy lại khi lưu); 'trả lại' gắn ghi chú vào chuỗi, hiện ở người sửa kế tiếp. Duyệt phải bởi người khác người sửa `[ASSUMPTION]`."

**C8-1 · low · Unpublish confirmation copy** is missing ("Buổi đang dở vẫn chạy tiếp trên phiên bản cũ").

**C9-1 · low · Presentation of trace (FR-44).** The JSON is long.
- *Proposed spec:* "Mỗi lượt một hàng thu gọn, mở ra xem JSON."

**C10-1 · medium · The session cost cap (FR-37, NFR-3) has no home.** It must be "cấu hình được không cần deploy", but only the generation budget has a field (in C10).
- *Proposed spec:* Add both caps to a C10 "Hạn mức" block.

**C-1 · low · Below 1024px (NFR-11).** The PRD does not say whether the Console blocks or scrolls.
- *Proposed spec:* "<1024px → 'Review Console cần màn hình ≥1024px.'"

### §7 state table

**S-1 · high · `done` maps to two views.** The table maps `done` to "Bản xem lại chỉ đọc (Màn 9)", while Màn 7 returns to "Màn 6 ở chế độ đã xong". This breaks one-state-one-view.
- *Proposed spec:* Declare them identical: "`done` → Màn 6 chế độ đã xong (= bản xem lại của Màn 9)". Then define that view once (M6-4, M9-1).

**S-2 · critical (same root as M6-1) · `revealed` is defined as "reveal đã render", but the transition happens on guess submission.** The table needs either a sub-row "`revealed`, reveal đang chạy" → Màn 6 pending view, or a redefinition: "`revealed` = số đoán đã lưu."

**S-3 · medium · Demo account with several sessions for one persona.** The Màn 2b card does not say which session "Tiếp tục" targets.
- *Proposed spec:* "Buổi mới nhất."

**S-4 · medium · Custom topic with several attempts.** A failed attempt and a later passing one are both in Màn 9. The PRD does not say which one the Màn 2 card or the Màn 2b persona card reflects.
- *Proposed spec:* "Thẻ phản ánh buổi chơi được; nếu chưa có, lần thử mới nhất."

**S-5 · low · Màn 2b cell for `interviewing`, 0 lượt** says "Màn 3, rồi Màn 4". Confirm that Màn 3 shows "Tiếp tục" in this case (M3-1).

### Copy and NFR-14

**K-1 · low · "Phỏng vấn" as a screen name** (Màn 4). If it becomes the page title or tab label, it breaks the rule against using "phỏng vấn" on its own.
- *Proposed spec:* "Tiêu đề trang: 'Buổi phỏng vấn người dùng với [persona]'."

**K-2 · low · The soft tone of "…bạn gửi lại nhé"** conflicts with "không tone mềm". Consider "[Persona] chưa nghe rõ. Gửi lại câu hỏi."

**K-3 · low · "[Persona] chưa từng nói điều này"** in FR-19 and the FR-48a "chưa từng được nói" both use the persona's name. Fine, but the FR-19 string is not listed in the C7 product-string set. Add it.

## 3. Mismatches in the existing prototype (`DESIGN.md`, `code.html`, `screen.png`; noted only, not spec)

The prototype contradicts the PRD in ways a designer could copy by mistake. The PRD should state that it overrides it, or the prototype should be marked superseded.

- The in-session "Câu hỏi dẫn dắt (Leading Question)" alert, the "Tín hiệu bị lỡ" tip and the "Độ mở lòng: biến thiên theo thời gian thực" meter break FR-8, which allows no labels, hints or state during a session. The DESIGN.md "Right Inspector: real-time AI coach feedback" layout breaks FR-8, and its wording breaks NFR-14 ("feedback").
- The unverified statistics "68%", "3.4x", "0%" and "Đã luyện: 1,420+ lần" break NFR-14 and FR-62.
- The footer "Bảo mật & Đạo đức dữ liệu… không được sử dụng để huấn luyện AI bên thứ ba" makes a training claim that FR-63 only allows after the §12.4 check. "Bảo mật" also borders on the privacy promise NFR-14 bans.
- The label "Vào phỏng vấn" uses "phỏng vấn" on its own. The persona button should follow the §7 labels.
- "14 góc khuất" conflicts with the 8–12 item limit (FR-33).
- The "Sắp ra mắt / Đặt chỗ trước" persona card is not in the PRD. The waitlist exists only on the reveal.
- The header shows "Bắt đầu buổi mới" (demo-only in the PRD) and "Phương pháp Tảng băng". The PRD puts the methodology link in the footer only, after FR-62.
- "Miễn phí cho sinh viên & UX Designer" is an unstated pricing promise.
