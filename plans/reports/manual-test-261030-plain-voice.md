# Manual test: plain voice in prompts (phase 6), 2026-10-30

Real-model check of phase 6. User approved the run (≈ 0.17 USD estimate). Design changed mid-phase (user, 2026-10-30): **no banned-word list and no keyword matching**. Voice is taught by descriptive rules plus a bad/good pair, and measured by an eval-only model judge (`voice-judge` set, role STRING_CHECK). See D13 in `plan.md`.

## Spend

| Run | Calls | Cost (USD) |
|---|---|---|
| `voice-judge` set ×3 on Luna (34 cases each) | 102 | ≈ 0.008 |
| Generation before (HEAD prompt) + after, Sol, incl. 1 repair each | 5 gen + route/safety | 0.0927 (generator) + route/safety |
| Voice judge on both scenarios (42 texts each) + 8 transcript replies | 92 | ≈ 0.008 |
| `transcript-run` chị Thu, 8 turns, Terra | 16 | 0.0233 |
| Second review fixes: hardened set ×3 (46 cases) + re-judge before/after (84 texts) | 222 | ≈ 0.020 |
| **Phase 6 total** (day 0.4332 − 0.2767 before phase 6) | | **≈ 0.157** |

Plan spend so far: ≈ 0.43 USD of 1 USD (D12).

## Judge calibration: `pnpm il judgement-eval evalsets/voice-judge.jsonl` on `gpt-6-luna:low`

34 cases: 17 plain, taken word for word from the library; 17 AI-voice, hand-written on the same four topics.

| Run | AI voice passed as plain (gate ≤ 10%) | Library flagged (gate ≤ 10%) |
|---|---|---|
| 1 | 0/17 | 1/17 |
| 2 | 0/17 | 1/17 |
| 3 | 0/17 | 1/17 |

3/3 pass, so the role stays on Luna. The miss is always `vj-p09` (chị Hạnh: "Chị nhận ra một việc đang kẹt nhờ sự im lặng…"). That phrasing is arguably literary. The set was not tuned to hide it.

**Second review (same day):**
- The judge prompt quoted cue phrases that also appeared in the set and in the generator's bad example, which inflated the first result. The rules now describe each sign instead of quoting it, with washing-machine examples only.
- 12 hard cases were added (46 total). Plain side: library lines that name a feeling tied to an event. AI side: concrete events that end in a moral, and facts-first identities with a slogan as the last sentence.
- Floor is 40, with the reason given in code.

| Run (46 cases) | AI voice passed (≤ 10%) | Library flagged (≤ 10%) |
|---|---|---|
| 1 | 0/23 | 2/23 |
| 2 | 0/23 | 2/23 |
| 3 | 0/23 | 2/23 |

The misses are `vj-p09` and `vj-p22` (chị Thu: "Tự thấy mình cẩn thận trong công việc nhưng khá dễ dãi…"). 3/3 pass, but at 8.7% against the 10% gate: the judge leans toward over-flagging trait self-statements.

## Generator before/after

Topic "người đi chợ online cho cả nhà", focus `general`, `gpt-6.1-sol:medium`.

| | Before (HEAD prompt) | After |
|---|---|---|
| Outcome | passed | passed |
| Repairs | 1 targeted (route-check tags, 3 items) | 1 targeted (route-check tags, 2 items) |
| Texts judged AI voice (first judge prompt) | 3 / 42 | 0 / 42 |
| Texts judged AI voice (fixed judge prompt) | **1 / 42** | **0 / 42** |
| Items with a concrete detail (read by a person) | most; several abstract hooks | 8 / 8 |

**Identity**
- Before: "Chị Miên là một nhân vật hư cấu, sống cùng chồng, mẹ và con gái đang học tiểu học. Chị làm hành chính tại một văn phòng nhỏ và phụ trách mua phần lớn thực phẩm cho gia đình qua mạng. …" (meta "nhân vật hư cấu", report register)
- After: "Vân Miên, 37 tuổi, nhận sửa trang phục tại một khu chung cư ven đô. Chị sống cùng bố, chồng và con gái tám tuổi. Ban công có sáu thùng rau nhưng chị vẫn đặt thực phẩm qua mạng ba lần mỗi tuần. …"

**voice_notes**
- Before: "…giọng đời thường và hơi dè dặt lúc đầu. Chị thường trả lời trong một đến ba câu… Khi chưa nhớ rõ, chị phân biệt điều mình nhớ với điều mình chỉ ước chừng."
- After: "…nói giọng miền Bắc và thỉnh thoảng dùng từ đệm “ừ”. Chị hay ngừng một nhịp để nhớ lại ngày hoặc món hàng…"

**Three items (content / hook)**

| Before | After |
|---|---|
| Chị chia thịt theo mức đầy của chiếc bát dùng để ướp, chứ không chia theo số gam trên đơn… / "Lượng chị đặt với lượng chị coi là đủ một bữa không hẳn giống nhau." | Chị giữ một hộp nhựa rỗng 1,2 lít trong ngăn đá… / "Chị phải chừa chỗ từ trước lúc đồ về." |
| Chị cắt phần nhãn có ngày đóng gói rồi kẹp dưới hộp… / "Chuyển đồ sang hộp rồi thì chị vẫn cần biết nó từ lần mua nào." | Chị chọn chai nước mắm nắp bật, dù đắt hơn loại nắp vặn 8 nghìn. Bố chị chỉ dùng được một tay… / "Có chai chị xem vỏ kỹ hơn xem giá." |
| Với gia vị vừa hết, chị để vỏ rỗng cạnh ấm nước… / "Có một nhóm đồ chị không nhớ bằng ghi chú trên điện thoại." | Lần cửa hàng hết cải ngọt, chị nhận rau dền thay vào nhưng nhặt bỏ gần nửa túi… / "Riêng rau thì chị có thêm một bước trước khi chốt." |

Before texts the judge flagged:
- "Có một lần nhận rau khiến chị đổi thứ tự kiểm tra đến giờ." (abstract milestone)
- "Chuyện cơm trưa của chồng cũng làm chị đổi danh sách mua, nhưng không hẳn từ lời anh ấy nói."
- "…Chị sợ mọi người nghĩ mình lo việc chợ búa không xong…" (named feeling)

Note: with the fixed judge, the before/after gap in AI-voice counts is small (1 vs 0). The before scenario was already fairly concrete. On the topic it was given, Sol is a strong writer even without voice rules. The gain shows in register (no meta, no report tone), in numbers in every item, and in hooks that stay short.

## Transcript: chị Thu, 8 turns, Terra, new persona prompt

- Voice judge: 8/8 plain.
- Lists: 0/8. Gists with content: 3/3. Median 31 words, 3 sentences. Total 0.0233 USD.
- First words, in turn order: Chị, Chị, Có, Mỗi, Chị, Lần, Không, Chắc. **Turns 1–2 both start with "Chị"**, so the "no two consecutive replies start with the same word" criterion fails once. Here "Chị" is the subject pronoun, not a filler opener like "Dạ" or "Ừm". The rule names fillers, and none appeared.
- Sample replies: "Mỗi tháng chị gửi ba mẹ 3 triệu á. Khoản đó chị coi là không được đụng tới…" / "Không phải do bận việc đâu em." (leading question, nod shape)

## Gates

`pnpm typecheck`, `pnpm lint`, `pnpm test` (1308/1308) are green after the redesign. `pnpm test:e2e` was 331/331 on the first design (tester run). It was re-run after the redesign: 331/331.

## Unresolved

None. The user accepted the "Chị, Chị" pronoun opener on 2026-10-30.
