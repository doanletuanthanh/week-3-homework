# Manual test: takeaway copy without AI slop (phase 7), 2026-10-30

Paid check approved by the user ("real account then delete", then "ground the sentence" after the first run). Your own account was used. It already had an unfinished chị Thu session, so the script refused chị Thu (it would have resumed that session) and played **anh Khoa** with the same shape of questions: 2 leading, 1 hypothetical, 1 past story, plus notes with a guess. Each test session was deleted after the run.

## Spend

| Run | Cost (USD, from `il cost-report`) |
|---|---|
| Eval scope: `voice-judge` set 6 runs (66 lines each) + judging the 6 takeaway comments | 0.040 (0.4735 − 0.4332) |
| Session scope: two anh Khoa sessions, 8 turns + reveal each | 0.064 |
| **Phase 7 total** | **≈ 0.104** |

The phase estimate was 0.05. The overrun came from the second session, which the user approved after the regression below. Plan total: ≈ 0.54 USD of 1 USD.

## Voice judge with feedback cases (66 lines)

Added 10 plain feedback cases (hand-written mentor notes) and 10 AI-voice ones. 3 of the AI-voice ones are the reviewer's own screenshot sentences.

| Prompt | Run | AI voice passed (≤ 10%) | Hand-written flagged (≤ 10%) |
|---|---|---|---|
| first feedback rule | 1 | 2/33 | **4/33 (fail)** |
| | 2 | 2/33 | 2/33 |
| | 3 | 1/33 | 3/33 |
| sharpened rule | 1 | 0/33 | 2/33 |
| | 2 | 0/33 | 3/33 |
| | 3 | 0/33 | 3/33 |

- The first rule let the reviewer's praise (`vj-a24`) and "Điều này dễ khiến…" (`vj-a26`) through.
- The sharpened rule describes the sign without quoting it: "praises by naming a skill or quality, even with content mentioned; explains why a way of asking is bad; speaks of interviewees in general". With it, the judge passes 3/3.
- Margin: 9.1% flagged at worst, against a 10% gate. The flagged lines are trait self-statements in the library (`vj-p09`, `vj-p15`, `vj-p19`, `vj-p22`).

## Takeaway on a real session (Terra generator, Luna verifier)

### Session 1: rule "text = what to ask next time"

| Slot | Words | Judge | Shown | Text |
|---|---|---|---|---|
| praise | 19 | plain | **hidden** | Bạn hỏi tiếp chuyện “nghe lúc đang chạy xe rồi quên” của anh Khoa bằng một lần cụ thể. |
| leading | 14 | plain | **hidden** | Lần sau bạn hỏi anh Khoa ghi việc ở nhiều chỗ thế nào trước. (Q 10 words) |
| habit | 16 | plain | **hidden**, sealed | Lần sau bạn hỏi thêm điều anh Khoa vừa kể trước khi chuyển sang chuyện khác. |

**Regression:** the verifier disagreed with every comment, so the learner would see none. The verifier agrees only when "the cited turns contain what the comment talks about" (`src/llm/prompts/verifier.ts:21`), and a purely forward-looking sentence says nothing about the cited turn.

### Session 2: rule "text = what happened at the cited turn, then the next step"

The verifier is unchanged.

| Slot | Words | Judge | Shown | Text |
|---|---|---|---|---|
| praise | 19 | plain | shown | Bạn hỏi tiếp chuyện anh Khoa “nghe lúc đang chạy xe rồi quên”, bám vào lời anh vừa kể. |
| leading | 21 (cap 20) | plain | shown | Ở lượt 3, bạn hỏi chuyện ghi nhiều chỗ mất thời gian; lần sau hỏi anh Khoa ghi thế nào trước. Q: "Anh ghi việc ở những chỗ đó thế nào ạ?" (10 words) |
| habit | 21 | plain | hidden, sealed | Ở lượt 2 và 8, anh Khoa vừa kể thì bạn chuyển chuyện; lần sau hỏi tiếp điều anh vừa nói. |

- The habit card was hidden by a factual disagreement: "lượt 3 tiếp nối chủ đề… sau lượt 8 không có lượt hỏi nào". It is about which turns code counted, not about wording, and the habit card was hidden in session 1 too.
- Evidence for the cause is two samples (all hidden → praise and leading shown). That is strong but not a controlled A/B.

Compared with the reviewer's screenshot: one sentence per comment instead of three, no skill-praise, no lecture about leading, and the persona is named.

## After code review (no further model runs)

- Leak guard: terms already said in the session are exempt, so a learner who typed the word no longer loses the comment.
- `<dieu_bo_lo>` removed: the generator gets nothing of an untold item.
- Empty line split into `nothing_found` and `not_shown`. The session 1 outcome (every comment rejected) would now show "Chưa có nhận xét nào để hiện cho buổi này." instead of telling the learner they asked no leading question.

## Gates

`pnpm typecheck`, `pnpm lint`, `pnpm test` are green. e2e: see the phase file.

## Unresolved

- The leading comment ran to 21 words against a cap of 20. The plan accepts occasional overruns, so the cap stays a prompt rule.
- Was the habit card's turn 8 counted as an ignored hook when no question followed it? That is a slot-selection question outside this phase (code, not copy).
