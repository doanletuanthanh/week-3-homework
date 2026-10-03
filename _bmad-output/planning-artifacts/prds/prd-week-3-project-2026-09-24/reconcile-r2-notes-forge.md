# Reconcile r2: forge ghi chú → PRD / addendum

- Input: `_bmad-output/forge/notes-panel-vs-guess-slider/forged-idea.md` (FI) + `.memlog.md` (ML) lock / kill / decision lines.
- Target: `prd.md`, `addendum.md` (this folder). Read-only check, 2026-10-01.
- Accepted deviations not reported: last-turn verdict inside the "judge cuối buổi" call; `suggested_question` labelling inside the verifier (addendum §7 vòng 2, line 298).

## Verdict

Coverage is high. Every lock, kill and mandated PRD edit has a home. None of the killed ideas came back: no starring, no combined score, no counting unconfirmed notes as KHAI THÁC, no labels on surface facts, no "Nhận biết: 0", no hidden or drawer panel on mobile, no prefill button, no character offsets, and no string anchors. The exact copy lines are present: "Bạn nghĩ chị Thu đã kể…", "Bạn đoán đúng, nhưng … chưa xác nhận — …", "X điều quan trọng trong ghi chú của bạn", "Không có ghi chú trong buổi này" and "Bạn nghe được, nhưng chưa hỏi tiếp". NFR-1 and §12.2 mục 6 match the forge. SM-8 is NHẬN BIẾT over surfaced items, and SM-9 is the adoption metric (<30% `[ASSUMPTION]`). The correlated-judge risk is in §13. Màn 3 has the canvas intro. Màn 4 and FR-46 carry the mobile spec. FR-8 carries the anti-hint rules.

The gaps are mostly rules the forge implied but the FR structure never spelled out. One of them, the sealed replay target, is high severity.

## Gaps

### G1 (high): canvas highlights and generator claims about the sealed replay target are not specified
- Forge source: FI l.28, "Verdict … replay chép verdict các lượt ≤ điểm rẽ". FI l.58, "chẩn đoán cho item replay vẫn đúng vì item đó còn khóa tới cuối". FI l.23, "Reveal highlight đúng các range đó kèm giải thích".
- PRD location: Màn 6 mục 2 (target "niêm phong"), mục 5 (highlight "kèm giải thích"), §12.2 mục 5 ("dữ liệu gửi về trình duyệt không chứa nội dung hay câu hỏi mẫu của item mục tiêu"), addendum §3.3 row "Nghe nhưng không hỏi tiếp", and UJ-1 step 6. UJ-1 itself highlights the note on the target item before replay.
- Problem: the three reveal calls run at "Kết thúc buổi" and can name the target item, either through the canvas match `reason`, a generator claim with `item_id`, or a `suggested_question` that is effectively the target's sample question. No rule says what renders before the replay ends. Gate mục 5 would fail with no spec telling the builder how to avoid it.
- Proposed fix: add one rule to §8.3 or Màn 6. Replay selection runs first (it is deterministic). Then:
  - any canvas match, claim or `suggested_question` whose `item_id` is the target renders without the item content: a yellow highlight plus a fixed line, or is held back;
  - the full explanation is unsealed together with the item (§9.6);
  - the generator input marks the target item as sealed.

### G2 (med): "bạn bỏ qua hook" in the replay block can contradict the verifier, and §9.2 contradicts §8.3
- Forge source: FI l.28, "Mọi claim 'bạn bỏ qua hook' được verifier đọc lại". ML l.25.
- PRD location: §8.3 says "Chọn khoảnh khắc replay không phụ thuộc call nào", but §9.2 mục 2 says "lượt `leading` sớm nhất *l* (sau verifier)", under the heading "tất định, không dùng LLM". Separately, the replay block's diagnostic line and the empty-canvas copy "Bạn đã chuyển chủ đề" are hook-ignored claims shown regardless of the verifier's `hook_ignored` result.
- Proposed fix: decide one of these:
  - (a) Replay selection uses the verifier: skip candidates whose `hook_ignored` or `leading_novelty` was disagreed, and fall back on verifier failure. Then delete the "không phụ thuộc call nào" sentence.
  - (b) Selection stays verifier-independent, but the copy changes to a neutral line when the verifier disagrees or fails.

  State what happens when the verifier fails in either case.

### G3 (med): the hard gate on learner-blamed errors covers only one error direction per judge
- Forge source: FI l.34, "cổng cứng vào lỗi đổ cho người học (≤5% diễn đạt đúng bị bỏ lỡ)", together with the test sets for disclosure/hook, `leading` novelty and canvas.
- PRD location: NFR-7 and §12.2 mục 7.
- Problem:
  - The verdict gate covers only disclosed-judged-not-disclosed. Wrong hook-drop verdicts in either direction also blame the learner. A false positive yields "bạn bỏ qua hook". A false negative means a good follow-up cannot unlock, so the item lands in "Bỏ lỡ".
  - The canvas gate covers only missed matches, not a correct note mis-tagged `never_said`. That tag is labelled with the notes version of "leading".
  - `leading` novelty (≤5%) is `[ASSUMPTION]` and excluded from the mục 7 hard gates, but a phrase the persona did say, called self-added, is the plainest learner-blamed error.
- Proposed fix:
  - Add a ≤5% hook-drop error gate (both directions) to the verdict test set.
  - Count wrong `never_said` tags inside the canvas ≤5% gate.
  - Promote `leading` novelty to a hard gate in mục 7. The threshold can stay `[ASSUMPTION]`.

### G4 (med): the canvas highlight explanation is LLM text with no verifier or FR-30-style check
- Forge source: FI l.27 (invariant), FI l.30 ("verifier kiểm từng claim + luật FR-30 (không khẳng định về người dùng thật)"), FI l.23 ("kèm giải thích").
- PRD location: Màn 6 mục 5 ("kèm giải thích") and addendum §2 judge output `reason`. No source is named for the learner-facing explanation.
- Problem: if the judge's `reason` is shown verbatim, it is runtime LLM text that skips the verifier and the no-real-user-claims rule (NFR-13). It is also a path for G1.
- Proposed fix: state that each explanation is either (a) a fixed approved string per outcome plus the item content, or (b) a generator claim with `canvas_range`, which therefore passes the verifier. Do not display `reason`.

### G5 (med): device class is not logged, so the forge's mobile risk cannot be read from SM-9
- Forge source: FI l.57, "Mobile: notepad che composer … chỉ số chấp nhận sẽ cho biết". ML l.41 (kill: SM-8 confounded by device; many learners on phones).
- PRD location: FR-38 (events have no device or viewport field), SM-9 (no split), and §13 "Canvas trên mobile: … SM-9 sẽ cho biết".
- Proposed fix: log device class (mobile <768px / desktop) on the session-start event. Report SM-8 and SM-9 split by device.

### G6 (low-med): "never 0" is not carried to Buổi của tôi or to the empty-canvas reveal section
- Forge source: FI l.18 ("không bao giờ là 0"; the notes layer is additive). ML l.40.
- PRD location:
  - Màn 9, "Kể 3/11 · Nhận biết 4", and FR-39 give no rule for an empty canvas or a failed judge.
  - Màn 6 mục 5, "Ghi chú của bạn", gives no rule for an empty canvas. An additive layer implies the section is hidden or shows the absence line.
  - When 0 items surfaced, the NHẬN BIẾT denominator is 0, which is undefined for SM-8.
- Proposed fix:
  - Màn 9: empty canvas shows "Kể 3/11 · Không có ghi chú", and a failed judge shows only "Kể 3/11".
  - Màn 6 mục 5: hidden when the canvas is empty.
  - SM-8: exclude sessions with 0 surfaced items.

### G7 (low): it is unclear whether the NHẬN BIẾT denominator is ever shown
- Forge source: FI l.11 ("Mẫu số = item đã lộ ra trong transcript") and FI l.42 (copy without Y).
- PRD location: Màn 6 mục 1 states the denominator in parentheses, but the copy shows only X.
- Proposed fix: say explicitly that the denominator is for metrics only (SM-8) and is not rendered. Otherwise, add the copy that renders it.

### G8 (low): source and condition of the diagnostic line are undefined
- Forge source: FI l.17.
- PRD location: Màn 6 mục 2 gives only examples. Addendum §3.3 "Nghe nhưng không hỏi tiếp" is a generator comment, which is a different surface.
- Proposed fix: state the trigger. The canvas matches the replay target, whose hook was ignored, so the line is "Bạn nghe được, nhưng chưa hỏi tiếp". Otherwise the line is the hook-ignored line. State that both are fixed approved strings, not generator text, so a generator failure does not remove them.

### G9 (low): the gate does not test span checks for canvas ranges or generator references
- Forge source: FI l.34 ("mục 4 … kiểm span") and FI l.23 ("ngoài phạm vi hoặc rỗng → bỏ … nhắc hai lần → tính một lần").
- PRD location: §12.2 mục 4 covers only `introduced_span` and `grounded_turn_id`. Mục 13 tests highlight rendering, not dropping or dedupe.
- Proposed fix: add to mục 13: with a mocked judge, an out-of-range or empty canvas range is dropped, a duplicate item counts once, and a generator claim with a broken `cited_turns` or `canvas_range` is dropped.

### G10 (low): smaller canvas-spec misses
- FR-46 omits the collapse gestures ("chạm ra ngoài hoặc vuốt xuống"), which are present in Màn 4.
- FR-47 freezes the canvas only on "Kết thúc buổi". The auto-end after turn 30 (Màn 4, FR-9) should also freeze the canvas and start the three reveal calls. Màn 5 and §8.3 say the calls start at "bấm Kết thúc buổi" only.
- The Màn 3 "(canvas là tùy chọn)" note does not say whether this is displayed copy or an authoring note.

### G11 (low): two forge residual risks are missing from §13
- Forge source: FI l.59 (reveal latency from 3 sequential calls) and FI l.60 ("Hãy hỏi" quality depends on the classifier and verifier).
- PRD location: §13 lists neither. NFR-2 has only the latency threshold. FI l.58's note that the replay diagnostic stays correct because the item remains locked is also dropped from the "Không có thời điểm ghi chú" risk.
- Proposed fix: add two §13 bullets and the half-sentence on replay correctness.

### G12 (low): stale anchor and template wording in addendum §7 rows that are still active
- Locations:
  - Addendum l.249, "Thay bằng: Code chọn hook và dò cụm neo nguyên văn (§3.2)". §3.2 no longer has anchors.
  - l.266, "LLM diễn đạt feedback … Hoãn sang Later → Template".
  - l.280, old FR-30 "không có nội dung LLM sinh lúc chạy".
  - l.281, `introduced_content` substring check.
  - l.278, NFR-7 ≥85% "chỉ số báo cáo".
- Problem: the round-2 rows (l.295–297, l.310) supersede these, but the old rows are not marked. Line 241 only covers renumbering.
- Proposed fix: append "(thay ở vòng 2, xem dưới)" to each of these rows. Addendum l.140, "lời khen (nếu còn)" when the generator or verifier fails, is also incoherent: praise is generator text and is dropped on verifier failure. Reword it to "lời khen chỉ khi generator và verifier đều chạy".

## Checked and clean (no action)
- §2 reopened-locks list
- §8.0 boundary statement and invariant
- §8.1 KHAI THÁC and NHẬN BIẾT definitions, including the never-surfaced-item and harden defaults
- §8.2 and NFR-4 (canvas never in context)
- §8.3 contracts
- §9.3 replay copies verdicts ≤ fork, with no canvas in context
- FR-14, FR-18, FR-19, FR-21, FR-22, FR-30, FR-46 to FR-49
- NFR-1, NFR-7 test-set sizes and categories, NFR-8 per claim kind
- §12.2 mục 2 (hook ≥95%), mục 3, mục 4, mục 5 ("Đã mở khóa" by verdict), mục 6
- SM-6 (guess vs KHAI THÁC), SM-8, SM-9
- §13 correlated judges and no timing
- Addendum §2 judge, generator and verifier contracts; §5 call count (≤72); §6 estimate lines for canvas, judge and generator
- Killed items: none reintroduced.
