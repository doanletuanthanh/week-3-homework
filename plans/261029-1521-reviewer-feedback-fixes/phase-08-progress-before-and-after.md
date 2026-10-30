---
phase: 8
title: "Progress before and after"
status: pending
priority: P1
effort: "1d"
dependencies: [2]
---

# Phase 8: Progress before and after

## Overview

Fix F6. Replace the percentage dashboard on `/progress` with a before/after comparison in plain words: the newest session against the previous one with the same persona (else the learner's first session), as counts plus one pair of the learner's own questions (D4).

## Context

- Reviewer p.3: tiles "Câu bám lời persona 37%", "Câu dẫn dắt 42%", "Khai thác 18%", "Nhận biết —", "Đoán đúng 64%" with sparklines, a % table "Từng buổi", and "Thói quen cần sửa nhất … · 50% trung bình".
- `src/app/progress/page.tsx` (`MEASURES`, tiles, table), `src/server/progress.ts` (`sessionProgress`, `progressOf`, `HABITS`; shares 0–1), `src/components/progress/sparkline.tsx`, CSS `src/app/globals.css:1041-1052` (`.prog-grid`, `.prog-tile`, `.prog-value`, `.prog-spark*`; `.prog-habit` is shared with the guide check and stays).
- `listProgressSources` (`src/db/repo/sessions.ts:262`): newest N with a result; per question only `{ label, question_type }` (no text, no persona id).
- Per session in `reveal_json`: `counts.told/total`, `items[].hook/state`, `leading[]` (`novel` = verifier agreed).

## Requirements

- Functional
  - Baseline: the previous session (by `revealedAt`) with the newest session's persona; if none, the learner's first session with a result. Only one session: a "buổi đầu" view with its facts and a link "Luyện lại với {persona}" → `/prep/{personaId}`.
  - Three lines, each "trước → sau" plus a word, never a percentage:
    1. Same persona: "{Persona} kể: {a} → {b} điều"; different personas: "Nhân vật kể: {a}/{n} → {b}/{m} điều".
    2. "Câu dẫn dắt: {a} → {b} câu" (questions labelled `leading`, as today's measure counts them).
    3. "Lời gợi mở bị bỏ qua: {a} → {b} lần" (items with a hook, not told).
    Words: "Tốt hơn" / "Như cũ" / "Cần chú ý" (told: higher is better; the other two: lower).
  - "Trước / Sau" pair when both exist: before = the baseline's first leading question, preferring one the verifier marked `novel`; after = the newest session's first `confirm_grounded` / `boundary_probe` question. Rendered as text.
  - Habit line for the newest session in counts ("Ở buổi này, 3 lần {persona} gợi mở mà bạn hỏi sang chuyện khác."); no average, no %.
  - Links kept/added: "Xem các buổi" → `/my-sessions`; "Kiểm tra bộ câu hỏi cho ý tưởng app của bạn" → `/guide-check`.
  - Empty state unchanged.
- Non-functional: no model call; pure functions; old sessions without stored analysis render counts from the reveal and no example pair.

## Architecture

```ts
// src/server/progress.ts
type SessionFacts = {
  sessionId: string; personaId: string; personaName: string; revealedAt: Date;
  told: number; total: number; leading: number; ignoredHints: number;
  leadingExample: string | null; groundedExample: string | null;
};
type Line = { key: "told" | "leading" | "ignored"; before: number; after: number; trend: "better" | "same" | "worse" };
export type Comparison =
  | { kind: "single"; latest: SessionFacts }
  | { kind: "pair"; samePersona: boolean; before: SessionFacts; after: SessionFacts; lines: Line[]; pair: { before: string; after: string } | null };
export function factsOf(source: ProgressSource): SessionFacts;
export function compareProgress(newestFirst: ProgressSource[], first: ProgressSource | null): Comparison | null;
```

- Repo: `listProgressSources` adds `personaId` and, per main-branch question, `learner_text` next to the analysis; new `findFirstProgressSource(db, userId)` (oldest with a result) for the fallback baseline. Keep N = 10.
- Page: renders `Comparison` with existing `.card`, `.eyebrow`, `.headline-*`; new small `.prog-cmp` rules; delete `.prog-grid`, `.prog-tile`, `.prog-value`, `.prog-spark*`.
- Delete `src/components/progress/sparkline.tsx` and the share helpers; keep `HABITS` names for the habit line.

## Related Code Files

- Modify: `src/server/progress.ts`, `src/db/repo/sessions.ts`, `src/app/progress/page.tsx`, `src/app/globals.css`
- Delete: `src/components/progress/sparkline.tsx`
- Tests: rewrite `tests/server/progress.test.ts`; extend `tests/e2e/progress-and-guide.spec.ts`

## Implementation Steps

1. Repo query changes + first-session finder.
2. `factsOf`, `compareProgress` (baseline choice, lines, trend words, example pair).
3. Page rewrite (single / pair / empty), CSS cleanup, sparkline deleted.
4. Unit tests: single session; same-persona pair skips another persona's session in between; no repeat → first session; trend words; example pair prefers a `novel` leading turn; null analysis → no pair; habit count.
5. e2e (stub): two finished sessions with one persona (phase 2 retry) → page shows the three "→" lines, "Trước"/"Sau" quotes, and `page.content()` has no "%"; empty-state test kept.
6. `pnpm test && pnpm test:e2e`.

## Todo

- [ ] Query + first-session finder
- [ ] `compareProgress`
- [ ] Page + CSS, sparkline removed
- [ ] Unit + e2e tests

## Success Criteria

- [ ] Tests green
- [ ] Reviewer-style read: with two chị Thu sessions the page says in words what got better, with one of the learner's own questions before and after

## Risk Assessment

- Two sessions can swing by chance; the page says "Lần trước → Lần này", not "xu hướng".
- Different-persona baseline compares unequal scenarios; totals are shown so the counts are honest.
- Dropping "Nhận biết" and "Đoán đúng" from this page removes two measures; both stay on each result screen. Confirmed by the user (Validation Session 1).
<!-- Updated: Validation Session 1 - user confirmed dropping both measures from /progress -->


## Security Considerations

Reads only the learner's own sessions through the existing `user_id` filter; learner text rendered as text nodes.
