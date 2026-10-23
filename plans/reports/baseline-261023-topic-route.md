# Baseline: topic routing of today's Call 1 (2026-10-23)

Prompt and engine at HEAD 19d553f + phase-1 tooling. Model: ANALYSIS google:gemini-3.8-flash:low via Gemini Batch. Set: evalsets/topic-route.jsonl (56 lines: chị Thu 21, cô Lan 17, chị Hạnh 18). The CLI run could not record llm_call rows (configured Supabase DB unreachable: 'tenant/user not found', likely a paused free project), so the finished batch job was scored offline from its stored responses with the same code (planTurn + scoreTopicRouteSet). Response i ↔ case i: requests are enqueued synchronously in case order (mapPooled starts workers in order; geminiBatchModel enqueues before any await), keys 0..55.

```
Bộ thử topic-route (chấm lại từ job batch): 56 ca, mỗi ca một kịch bản riêng
[CHƯA ĐẠT] Câu hỏi mở nhầm điều, hoặc mở một điều khi không nên mở: 16.1% (9/56), cổng ≤ 2.1%
[ĐẠT] Câu hỏi đúng vào một chủ đề mà không được nhận ra: 0.0% (0/36), cổng ≤ 20.0%
Câu chung chung hoặc không chạm chủ đề nào mà không mở gì: 11/20
Cặp nhầm (gán tay → máy):
  broad → tried-methods ×3
  broad → private-notebook ×3
  broad → empty-hours-loss
  broad → paper-ledger
  broad → stuck-signal
Các ca lệch:
  ct-14: gán tay broad, máy tried-methods
  ct-16: gán tay broad, máy tried-methods
  ct-17: gán tay broad, máy tried-methods
  cl-12: gán tay broad, máy empty-hours-loss
  cl-14: gán tay broad, máy paper-ledger
  ch-11: gán tay broad, máy private-notebook
  ch-12: gán tay broad, máy private-notebook
  ch-13: gán tay broad, máy stuck-signal
  ch-15: gán tay broad, máy private-notebook
  chi-thu: trỏ nhầm 3/21, bỏ lỡ 0/14
  co-lan: trỏ nhầm 2/17, bỏ lỡ 0/11
  chi-hanh: trỏ nhầm 4/18, bỏ lỡ 0/11
Chi phí job: 0.0514 USD (batch), 108221 token vào, 5753 token ra, 56 lần gọi.
```

## Reading
- All 9 wrong routes are broad questions forced onto one tag; 36/36 direct questions route right, 0 sibling confusions. Most of those tags are surface items (tried-methods, private-notebook, paper-ledger), so live, a general question opens a secret and the persona is told to tell it now.
- cl-12 and ch-15 (flagged as arguable in review, kept by user decision) are 2 of the 9; without them: 7/54 = 13%, same conclusion.
- Cost: 0.0514 USD batch (estimate 0.067). Plus 0.0021 USD lost on the transcript-run baseline that crashed at its first llm_call write (same DB error). Phase-1 spend: ≈ 0.054 USD.

## Unresolved
- Transcript 'before' run waits for the DB restore (user, 2026-10-23).
