# InterviewLab design source

Snapshot of the design canvas "InterviewLab MVP" (https://claude.ai/artifact/8HHCXH3F4iQuCkFhYFRGBx), copied 2026-10-03 so implementation can read it offline. The canvas is the source of truth; re-copy if it changes.

- `theme.css` — tokens ("Verdant Clarity") and every component class the artboards use. Fixed 1280px container, no media queries: responsive rules are added in the app, following the mobile artboards.
- `artboards/*.dc.html` — one file per screen state. Only the markup inside `<x-dc>` matters; `support.js` and the `x-dc` script block are canvas runtime, not app code.
- `artboards/canvas.json` — board titles plus data notes per screen group (`notes.d1`–`d9`).

Fonts: Newsreader (headlines), Plus Jakarta Sans (UI), JetBrains Mono (turn numbers, times, codes).

Colour meaning (always paired with a text label): green secondary = told · indigo tertiary = sealed / unlocked · amber = missed, unconfirmed, in progress · red error = leading, never said.

## Screen → artboard

| PRD screen | Artboards |
|---|---|
| 0 Thông báo dữ liệu | `Notice` |
| 1 Trang chủ | `Main` |
| 2 Thư viện | `Library`, `LibraryGuest` |
| 2b Chủ đề | `Topic` |
| 3 Chuẩn bị | `Prep`, `PrepSignIn`, `PrepCustom`, `CapReached` |
| 4 Buổi phỏng vấn | `Interview`, `InterviewEnd`, `InterviewMobile`, `InterviewMobileNotes` |
| 5 Đoán | `Guess` |
| 6 Tảng băng lộ diện | `RevealComputing`, `Reveal`, `RevealDrawer`, `RevealMobile`, `RevealStates`, `RevealCustom`, `Review` (done), `GuidePrint` (A4) |
| 7 Luyện lại | `Replay`, `ReplaySuccess`, `ReplayFail`, `ReplayStates` |
| 9 Buổi của tôi | `Sessions`, `SessionsEmpty`, `DeleteAccount`, `Withdrawn` |
| 10 Tạo chủ đề của bạn | `CustomTopic`, `CustomStates` |
| 11 Đang chuẩn bị / Chưa qua kiểm tra | `Generating`, `FailedEval` |
| 6.0 Luật chung (tải, lỗi, header) | `SystemStates` |

Not copied (out of the current build scope): `Method` (Màn 12) and Review Console `C1`–`C10`.

The library screens are built: Màn 2 is the route `/library` and Màn 2b is `/topics/[topicId]`; a persona's Màn 3 is `/prep/[personaId]`.
