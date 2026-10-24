# Re-measure: topic routing with Director v2 (phase 2), 2026-10-24

Engine and prompt: phase-2 working tree on HEAD edf2781 (Call 1 returns `topic: {direct, direct_span, broad}`; code keeps a direct topic only with an in-range span; `ROUTING_RULES` replaces the forced "clearest match" line). Model: ANALYSIS google:gemini-3.8-flash:low via Gemini Batch. Runs 1 and 2 use the unchanged tags, so they measure the prompt alone (red team #3). Run 3 follows the one curated tag rewrite. The remote DB answered before each run; every call wrote its `llm_call` row.

## Run 1: topic-route, 56 lines pooled, unchanged tags

```
Bộ thử topic-route: 56 ca, mỗi ca một kịch bản riêng
[ĐẠT] Câu hỏi mở nhầm điều, hoặc mở một điều khi không nên mở: 1.8% (1/56), cổng ≤ 2.1%
[ĐẠT] Câu hỏi đúng vào một chủ đề mà không được nhận ra: 0.0% (0/36), cổng ≤ 20.0%
Câu chung chung hoặc không chạm chủ đề nào mà không mở gì: 19/20
Cặp nhầm (gán tay → máy):
  broad → private-notebook
Các ca lệch:
  ch-15: gán tay broad, máy private-notebook
```

## Run 2: label-classifier, 24 lines (chị Thu)

```
Bộ thử label-classifier: 24 ca, kịch bản chi-thu
[ĐẠT] Câu tốt bị gắn nhầm leading: 0.0% (0/18), cổng ≤ 5.0%
[ĐẠT] Đồng thuận với nhãn gán tay: 100.0% (24/24), cổng ≥ 85.0%
Bộ thử có 24 ca, cần ≥ 100 ca gán tay: kết quả này chưa chứng minh được cổng NFR-7.
```
Exit 2 only flags the set size against NFR-7. The phase gate (≥ 94.4%, 0 leading false positives) passes.

## Run 3: chị Hạnh's 18 lines after the tag rewrite

`private-notebook` tag "cách chị tự theo dõi việc đã giao" → "cách riêng của chị để nhớ từng việc đã giao". Only the tag changed. The new tag echoes the public hook line ("Giao xong thì chị cũng có cách của chị để nhớ."), contains no secret term, and passes `pnpm il validate`.

```
Bộ thử topic-route: 18 ca, mỗi ca một kịch bản riêng
[ĐẠT] Câu hỏi mở nhầm điều, hoặc mở một điều khi không nên mở: 0.0% (0/18), cổng ≤ 2.1%
[ĐẠT] Câu hỏi đúng vào một chủ đề mà không được nhận ra: 0.0% (0/11), cổng ≤ 20.0%
Câu chung chung hoặc không chạm chủ đề nào mà không mở gì: 7/7
```
Exit 2 only flags that 18 lines is below the 48-line minimum.

## Reading

| | Baseline (old prompt) | Run 1 (new prompt, same tags) | Runs 1 + 3 (current tags) |
|---|---|---|---|
| Wrong-direct | 16.1% (9/56) | 1.8% (1/56) | 0/56 |
| Missed-direct | 0% (0/36) | 0% (0/36) | 0/36 |
| General questions that open nothing | 11/20 | 19/20 | 20/20 |

- **Prompt alone:** 8 of the 9 baseline errors (broad questions forced onto one tag) are gone. Direct questions are not over-abstained: 0 missed.
- **The one remaining error:** ch-15, "Chị nắm tiến độ của nhóm qua những cách nào ạ?". The phase 1 review had flagged it as arguable. Its routing to `private-notebook` was a tag problem: the old tag read as the general "how do you track" topic, so a very natural interview question would have opened chị Hạnh's secret at once.
- **Pooled result on current tags:** the other personas' tags are unchanged, so their 38 lines from run 1 stand (0 errors). Combined with run 3, that gives 0/56 wrong-direct and 0/36 missed-direct. This combines two runs; it is not one pooled run.
- **No other tag rewrites:** no sibling confusion appeared among direct questions in any run. The example rewrites in the phase file were not needed: cô Lan `bump-booking`/`double-booked` and chị Thu's "ghi chi tiêu" tags.
- **Labels:** the extra routing task in Call 1 did not cost label accuracy. Run 2 is also phase 3's baseline: full transcript, before the window and memory.

## Spend

| Run | Calls | Tokens in / out | USD | Estimate |
|---|---|---|---|---|
| 1 + 2 | 80 | 178,606 / 10,377 | 0.0864 | 0.09 |
| 3 | 18 | 38,675 / 2,335 | 0.0189 | 0.017 |
| **Phase 2** | 98 | | **0.1053** | 0.10 |

The plan's running total is ≈ 0.105 (phase 1) + 0.105 (phase 2) ≈ **0.210 / 0.5 USD**.

## Unresolved
- The tag rewrite is on disk only. Per the plan, the DB import and the lean eval wait for phase 6.
