# Forged Idea — AI luyện phỏng vấn (buồng mô phỏng bay)

> Forge 2026-09-22, trạng thái **HARDENED**. Nguồn: `.memlog.md` cùng thư mục; nền: `brainstorm-intent.md` (các lock §2 vẫn giữ).
> Sản phẩm production thật, 1 dev, MVP ~2 tuần, deploy + demo end-to-end.

## Ý tưởng
Persona AI giữ **tảng băng ẩn cố định** (mục + đường mở khóa: bề mặt / 1 follow-up / chuyện quá khứ / tin tưởng). Người học phải tự khai thác; cuối buổi: đoán → lộ tảng băng (trích dẫn theo turn ID) → **luyện lại từ khoảnh khắc bị lỡ** → guide cho buổi phỏng vấn thật của mình. Chỉ đánh giá kỹ năng người học, không bao giờ tạo phát hiện về người dùng thật.

## Người dùng & GTM
- Kiến trúc đa vai trò, **vai trò là dữ liệu** (kịch bản, unlock path, trọng số, must-do, template). UX / BA / PM đều first-class, cùng chuẩn chất lượng, không nhãn beta. Onboarding: vai trò + kinh nghiệm; đổi vai trò bất cứ lúc nào. Đa vai trò là **ràng buộc từ project brief**, không phải bằng chứng thị trường.
- **Beachhead:** sinh viên HCI/UX năm cuối ở VN, 5 buổi phỏng vấn stakeholder trong 10 ngày. Thông điệp ra mắt chỉ nói với nhóm này.
- BA = phỏng vấn stakeholder 1:1. Workshop nhiều người: ngoài phạm vi.

## Khác biệt & định vị
- Hơn ChatGPT: ChatGPT bịa "tảng băng" sau buổi; ở đây trạng thái cố định và **replay chứng minh được**. Bộ đếm niêm phong từ lượt 1 ("đang giữ 11 điều").
- So với con người: **bổ trợ, không thay thế**. Senior giữ phán đoán; mình sở hữu: lỗi chính xác, chứng minh bằng replay, lúc 11 giờ đêm, không phải nhờ ai.
- Ẩn dụ chính: **buồng mô phỏng bay**. OSCE/standardized patient chỉ là trích dẫn uy tín. Bỏ "bạn tập đấu".
- Headline: EN "Practice on ours. Walk into yours prepared." / VI "Luyện trên kịch bản của chúng tôi. Tự tin bước vào buổi phỏng vấn của bạn."
- Custom: EN "Someone from your world, never your question." / VI "Người trong thế giới của bạn, không bao giờ là câu hỏi của bạn."

## Cơ chế (đã khóa)
- **Luật câu hỏi chung mọi vai trò** (verifier kiểm, trả turn ID; grounding theo nghĩa): `confirm-grounded` (nội dung đã có trong lời persona) = tốt; `boundary-probe` (chủ đề đã grounded, chỉ thêm phạm vi: mọi/luôn/không bao giờ/trường hợp nào) = tốt; `leading/assumption` (thêm nguyên nhân, phán xét, nội dung mới) = xấu. Không có turn trích được = không grounded.
- **Cổng mở khóa do logic agent**, áp dụng cả buổi (replay chạy lại từ trạng thái khôi phục). Item follow-up phải bám vào hook persona thực sự đã thả (hook ledger); câu chung chung chỉ mở item bề mặt. Item tin tưởng: openness > ngưỡng VÀ câu phù hợp.
- **Replay = bằng chứng lõi:** 1 khoảnh khắc/buổi, khôi phục trạng thái, 3 lượt. Thành công: "Đã mở: item X"; thất bại: hiện item + 1 câu mẫu lẽ ra mở được.
- **Tin cậy theo cấu trúc:** (1) persona chỉ thấy danh tính + fact bề mặt + item đã mở + hook line của item khóa; item khóa có ràng buộc do-not-assert, self-check theo đó; (2) trích dẫn theo tham chiếu: LLM chỉ xuất turn ID, UI render từ transcript, không resolve được thì bỏ claim; (3) nội dung feedback tính từ ledger, LLM chỉ diễn đạt. Mọi nhãn hiện bằng chứng.
- **Kinh nghiệm đổi độ sâu, không đổi sự thật hay độ gắt.** Khen có căn cứ (turn được gắn nhãn tốt) được phép ở mọi mức. Bộ đếm "đã mở" live chỉ cho mức sinh viên; mức khác chỉ thấy tổng niêm phong.

## Kịch bản
- **Pick:** thư viện curated, chuẩn đầy đủ. **Describe (tính phí sau):** người học mô tả người được phỏng vấn + câu hỏi nghiên cứu; AI sinh persona **cùng lĩnh vực, khác câu hỏi**: tảng băng về quy trình khác, câu hỏi nghiên cứu bị loại bằng do-not-assert + verifier kiểm tảng băng sinh ra. Nhãn "kiểm tra nhẹ".
- **Chuẩn chất lượng (mọi kịch bản library, mọi vai trò, mọi ngôn ngữ):** 8–12 item, đủ 4 đường mở, ≥2 item chỉ mở bằng chuyện/tin tưởng; run tốt vs xấu phải cách biệt (tốt ≥2× và ≥3 item); run BA tốt có câu xác nhận đóng đúng lúc; 0 leak / 20 run adversarial. **Người phỏng vấn "tốt" mù tảng băng** (chỉ transcript + luật kỹ thuật chung).
- **Custom eval rút gọn:** 2 scripted + 5 adversarial (nhắm do-not-assert và loại trừ câu hỏi nghiên cứu), cùng ngưỡng cách biệt. Eval fail không tốn lượt miễn phí.
- Soạn kịch bản giao cho AI (grounded tài liệu BA/PM thật, AI critic đóng senior BA/PM, eval làm cổng); người chỉ duyệt kết quả eval. Nếu topic người học trùng kịch bản của vai trò → gợi ý kịch bản vai trò khác.
- Trường tùy chọn "chủ đề phỏng vấn thật" trước buổi: bật overlap check, điền sẵn cho guide.

## Guide (đầu ra dùng sau buổi, lối thoát đạo đức)
Xây từ ledger, nhắm câu hỏi nghiên cứu thật của người học. Verifier: cấm mọi câu khẳng định về người dùng thật (chỉ câu hỏi, ghi chú kỹ thuật, nhắc hành vi của người học); mọi câu hỏi trong guide chạy qua bộ phân loại 3 nhãn, câu thêm nội dung về người dùng = assumption, bị loại. Pre-flight card gộp vào guide.

## Ranh giới đạo đức
Sản phẩm luyện kỹ năng người học, **không bao giờ tạo nhận định về người dùng thật**: đầu ra chỉ về hành vi người học; guide không khẳng định; không persona nào sinh từ câu hỏi nghiên cứu; trích dẫn chỉ từ transcript; riêng tư mặc định.

## MVP xếp hạng
**Must-ship (nửa này đủ demo end-to-end):**
1. Schema + kịch bản UX (hook line, do-not-assert)
2. Engine: persona ẩn thông tin + openness, classifier 3 nhãn, hook ledger, cổng
3. Reveal: đoán trước, tảng băng, trích dẫn theo tham chiếu, nhãn kèm bằng chứng
4. Replay-from-here
5. Deploy, đăng nhập tối thiểu, lưu riêng tư
6. Eval harness (run tốt mù, run xấu, 20 adversarial)
7. Bộ đếm niêm phong
8. Guide tối thiểu + verifier
9. Cap chi phí theo ngày (env var)
10. Plumbing song ngữ (i18n + tham số ngôn ngữ cho mọi LLM call); VI mặc định, ship trước
11. Nút waitlist "mở thêm" (ship kể cả khi đường Describe chưa có)

**Next (theo thứ tự):** pipeline sinh + eval (CLI trước, 0,5 ngày) → admin dashboard (1 admin, JSON editor + schema validation, chỉ publish kịch bản pass full eval) → BA + PM (sàn 8 item) → onboarding vai trò + kinh nghiệm + dữ liệu tier → đường Describe của người học (1 miễn phí + waitlist) → bản EN của thư viện (mỗi bản pass full eval riêng; test set classifier EN riêng).
**Tripwire:** dashboard chỉ bắt đầu nếu must-ship xong trước ngày 6; nếu không, BA/PM làm qua CLI, dashboard → Later.
**Later:** diễn đạt feedback theo tier nâng cao, timeline + tỉ lệ nói, trình soạn kịch bản trực quan, đưa kịch bản người học vào thư viện.

## Đã bác (và lý do)
- Chỉ định vị UX, ẩn BA/PM sau nhãn beta → brief yêu cầu cả ba; giải scoring thay vì giấu.
- Chấm theo "loại câu hỏi" đơn thuần / luật riêng từng vai trò → phạt BA giỏi hoặc thưởng câu dẫn dắt; thay bằng luật grounding chung.
- Replay "cắt đầu tiên nếu trễ" → đó là bằng chứng khác biệt duy nhất.
- Persona sinh thẳng từ câu hỏi nghiên cứu → gây neo giả thuyết trước fieldwork, không qua được chuẩn chất lượng.
- Tone mềm cho người mới → là chiều lòng trá hình.
- Workshop nhiều người; "sparring partner"; OSCE làm headline.

## Rủi ro đã ghi nhận
- BA/PM ship **không có người làm nghề thật kiểm tra độ thật**. Giảm nhẹ: grounded tài liệu, AI critic, proxy (giảng viên/thực tập sinh BA/PM, ghi là kiểm tra một phần), link phản hồi trong mode BA/PM.
- Ranh giới "chỉ thêm phạm vi vs thêm nội dung mới" là phán đoán LLM ("luôn thấy bực, đúng không?") → cần edge case trong test set VI + EN.
- Khác biệt so với ChatGPT chỉ lộ đầy đủ cuối buổi 1 (bộ đếm niêm phong làm dịu).
- Lịch: ước tính của tôi must-ship ~12,5/14 ngày; người dùng tin chặt hơn. Tripwire ngày 6 là rào chắn.
- Chờ eval custom (~100–200 LLM call) có thể vài phút.
- Giả định: ngôn ngữ cố định từ đầu buổi (verifier grounding/trích dẫn giả định 1 ngôn ngữ transcript).

## Câu hỏi mở (hoãn có chủ đích)
- **Ai trả tiền?** Sinh viên giá VN (gói prep-sprint gắn ngày phỏng vấn thật) / nhà tài trợ (trường, gia đình; hóa đơn) / kịch bản custom trả phí (waitlist đo WTP) / chuyển sang hướng dự phòng "Panel Rehearsal".
- **Điều gì kéo người học quay lại?** Lứa mới mỗi học kỳ / vòng pre-flight → phỏng vấn thật → post-flight gắn ngày thật / ôn lại sau 1 tuần / lộ trình đối kháng nhắm thói quen xấu / kịch bản custom theo từng dự án.
