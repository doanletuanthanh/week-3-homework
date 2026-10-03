---
title: 'Reconcile: brief addendum (2026-09-22) vs PRD + PRD addendum (2026-09-24)'
created: '2026-09-25'
---

# Reconciliation: brief addendum → PRD

Input: `_bmad-output/planning-artifacts/briefs/brief-week-3-project-2026-09-22/addendum.md`
Against: `prd.md`, `addendum.md`, `.memlog.md` in `prds/prd-week-3-project-2026-09-24/`.
Method: read all four files in full, matched every mechanism/rule/quality-bar/rejected-alternative in the brief addendum's six sections (§1 agent architecture, §2 scenarios & eval, §3 schedule/tripwire, §3b cost, §4 pricing signals, §5 fallback/competitors, §6 rejected alternatives) against PRD FRs/NFRs, PRD addendum §1–§6, and memlog decisions. Items memlog explicitly logs as deliberate changes (2-call cap, self-check lag, sealed-counter-only, bilingual cut, guide templated/CLI-authored, generation pipeline & dashboard deferred) are excluded from gaps.

## Gaps (silently dropped or contradicted — not logged in memlog)

### 1. Nominalization rule for boundary-probe — **Medium-High**
Brief §2: "Đưa quy tắc danh từ hóa vào luật boundary-probe. Ví dụ persona nói 'rồi nó đi qua phê duyệt', người học được thưởng khi mở ra 'ai duyệt, khi nào, ngưỡng bao nhiêu'." This is stated as a rule for boundary-probe in general (the 3-label classifier that applies to every role per PRD §5.1), not a BA-only aside. It does not appear anywhere in `prd.md` or `addendum.md` — not in §5.1 (concept definitions), addendum §2 (unlock rule table), or FR-33 (schema/quality-bar checks). Nothing in memlog logs this as cut.
**Where it should go:** PRD `addendum.md` §2 (Luật mở khóa) under the Boundary-probe row, or FR-33's per-item authoring checklist (hook line + do-not-assert + weight should also require a nominalization-style probe target for boundary-probe items).

### 2. Pricing signals (verified vs. unverified sources) — **Medium**
Brief §4 lists verified competitor prices ([11] Capi Demy 9.99tr, ColorME 2.2tr, Keyframe 5.2–5.8tr) and explicitly-unverified sources that must not be used in copy (ChatGPT VN pricing [14], Synthetic Users [2], Yoodli [3], VN BA course [25]) plus the caveat that the "100–200k VND prep-sprint" figure is itself inferred, not verified. PRD `addendum.md` §4 (cost estimate, which explicitly supersedes brief §3b) references the "100–200k VND" mark three times as the comparison target but drops the citation/verification-status list entirely. NFR-3 also points to "mốc giá gói prep-sprint (addendum §4)" without the verified/unverified split.
**Where it should go:** PRD `addendum.md` §4, as a short subsection carrying forward the verified list and the "chưa kiểm, không dùng trong copy" list — needed before any pricing/payment work in Next, and before launch copy cites a price comparison.

### 3. "Pre-flight card gộp vào guide" — **Medium**
Brief §1 (Guide verifier): "Pre-flight card được gộp vào guide" — the pre-interview readiness card is merged into the take-home guide artifact, not kept separate. PRD instead has two separate artifacts: Màn 3 "Chuẩn bị" (generic, same static text for everyone, shown before the session starts) and Màn 8 "Mang về" / FR-28 (personalized take-home guide, built from the learner's own ledger). FR-28's guide content list (dẫn dắt/pattern swap, thói quen card, sample questions for missed items) has no pre-flight/technical-notes component. It is unclear whether this is an intentional simplification or an oversight — memlog does not mention it.
**Where it should go:** PRD §4 (Màn 3 / Màn 8 descriptions) and FR-28 — either confirm Màn 3 content is reused inside the Màn 8 guide, or note the split as an intentional deviation.

### 4. BA/PM grounding-material caveats not carried to Next — **Low-Medium**
Brief §2 (research.md §6 pointers): prefer templates 11–16 (NHS-sourced) and 1–9 (JMIR 2025); the "pre-approval threshold" example template is unsourced — treat as assumption or replace; the whole example catalog skews toward healthcare/public procurement with no Vietnamese enterprise-software examples; PM-specific "fluff" language signals ("I usually", "I would", polite praise) as reward material for pulling a story back to a specific past instance. None of this appears in PRD's Next line for BA/PM ("kịch bản BA/PM (sàn 8 item), kèm câu hỏi vai trò ở onboarding"). Since BA/PM authoring is wholesale deferred this is lower severity, but the caveats exist specifically to stop a future author from shipping an unsourced or unrepresentative BA/PM scenario.
**Where it should go:** PRD §3 "Next" line for BA/PM, or a short authoring-caveat note referencing brief addendum §2 directly (a link is enough — content doesn't need to be copied).

### 5. Leak-per-episode metric scoped to production only, not the authoring eval gate — **Low**
Brief §2: "đưa tỉ lệ rò rỉ trên mỗi episode vào eval harness như một chỉ số" (add it into the eval harness as a metric). PRD only tracks it as a live counter-metric (NFR-6, §9 counter-metrics) and as a binary "0 leaks in 20 adversarial runs" publish gate (FR-34) — there is no per-episode rate metric reported by the CLI `eval` command itself (UJ-2 / §10.2). This is arguably subsumed by the stricter 0-leak gate, so it's informational rather than a hard miss.
**Where it should go:** FR-34 / UJ-2 eval report, if the rate (not just pass/fail) is wanted at authoring time too.

## Intentionally changed (logged in memlog or PRD addendum — not gaps)

- 4 LLM calls/turn → 2 calls/turn (Call 1 analysis-only + Call 2 persona); unlock decision moved fully to code. Logged in memlog and PRD §2/§5.2, addendum §1.
- Self-check do-not-assert moved into Call 1, lagged one turn (detect, not prevent) instead of a separate call. Logged in memlog; PRD §5.2/§5.3, FR-16.
- Sealed sequence counter only, no live "opened" count, no experience-question tiers. Logged in memlog ("Counter: sealed total only... no tier source, live count invites gaming"); PRD §3, FR-7, addendum §5.
- Bilingual plumbing cut to a `language` field only; brief's "ngôn ngữ cố định + mọi call nhận tham số ngôn ngữ" narrowed to Vietnamese-only launch. Logged in memlog and PRD §2/§3, NFR-12.
- Guide and reveal commentary templated from ledger (0 LLM), verifier runs at authoring time instead of live. Logged in memlog and PRD §5.3, FR-20/28/30/36.
- Scenario-generation pipeline and admin dashboard deferred to Later/Next; CLI-only authoring for MVP. Logged in memlog and PRD §3.
- "Báo tôi khi BA/PM sẵn sàng" role-tagged notify button cut, replaced by a generic waitlist button (assumption #6 has no in-product signal at launch). Logged in memlog and PRD §3/§7 FR-32.
- Free-text "moment you think you missed" box dropped (brief already noted nothing downstream used it) — brief itself already flags this as unused; PRD Màn 5 confirms the cut with the same reasoning. Consistent, not a PRD-introduced gap.
- Cost model fully superseded: brief §3b (~135–150 calls/session) replaced by PRD addendum §4 (≤67 calls/session) under the 2-call architecture — addendum explicitly states "thay thế addendum brief §3b."
- Schedule fully re-estimated bottom-up in PRD addendum §6 (13.75–14.75 days) replacing the brief's unitemized forge estimate (~12.5/14 days); PRD addendum explicitly notes the forge estimate "không có bảng chi tiết."
- Dashboard tripwire (conditional on must-ship finishing by day 6) simplified to an unconditional "dashboard → Later" decision. Not explicitly justified in memlog beyond the decision itself, but the underlying reasoning (schedule pressure) matches brief intent — treated as intentional, not a silent drop.
- "Chỉ định vị UX, ẩn BA/PM sau nhãn beta" (rejected at forge) vs. PRD's UX-only launch with BA/PM deferred to Next: not a contradiction — brief's own §3 already conditions BA/PM launch on passing eval by day 6 ("BA/PM ship ở full bar... hoặc không ship. Onboarding chỉ hiện các vai trò đã pass eval"), which is what PRD implements.

## Covered (present and consistent)

- Iceberg: 8–12 items, 4 unlock paths, ≥2 items past-story/trust-only — PRD §5.1, FR-33 (exact match to brief §2 quality bar).
- Persona openness state, hook ledger (dropped/picked/ignored) — PRD §5.1, addendum §2.
- 3-label classifier (confirm-grounded / boundary-probe / leading), one shared rule across roles — PRD §5.1, addendum §1.
- "Not quotable turn = not grounded": a good label without a resolvable `grounded_turn_id` is downgraded to leading — PRD §5.1, §5.2, addendum §1 code-check list, FR-13/FR-21.
- Gate decided by code, not persona "mood"; same rule for main session and replay — PRD §5.2, §6.4, addendum §2.
- Three structural trust rules (locked content never in context; citation by turn-ID reference, not raw span; feedback content derived from ledger, LLM only phrases it) — PRD §5.2 step 1/3, §5.3, FR-12/FR-15/FR-20/FR-21.
- Replay mechanics (full spec) — PRD §6 (snapshot, moment selection, context restore, 3 turns same gate, success/partial/fail, isolation) — matches and formalizes brief §1's one-paragraph replay note; this was the reviewer-driven expansion, logged.
- Guide verifier: rejects claims about the real user; runs scenario sample questions through the 3-label classifier even with no transcript, flags content that adds new info as assumption — PRD FR-30, FR-36 (near-verbatim match, including the "no transcript → assumption" mechanic).
- Iceberg-blind good interviewer in eval ("mù tảng băng") — PRD UJ-2, §10.2.
- Leak-per-episode metric present as a tracked signal with the Harada-benchmark caution against using the number in copy — PRD NFR-6 (see Gap #5 above for the narrower authoring-gate point).
- 0 leaks / 20 adversarial runs, good-run ≥2× and ≥3 items vs. bad-run — PRD FR-34, §10.2 (exact match).
- Rejected alternatives: model-decided unlock (Call 1 returning "which item unlocks"), separate self-check call, live "easy-judgment unlock" indicator, live-LLM feedback/guide, live unlocked-count, free-text "missed moment" box — all re-argued and rejected in PRD addendum §5, consistent with or superseding brief §6's earlier rejections (role-specific scoring rules rejected in favor of one shared grounding rule; persona generated straight from the learner's research question rejected, reflected in PRD's out-of-scope list and in the deferred custom/"Describe" path's do-not-assert safeguard; workshop/group interviews out of scope; lecturer-facing product out of scope).
- Custom "Describe" path, scenario-generation pipeline, admin dashboard, BA/PM library, English library — all correctly deferred to Next/Later in PRD §3, consistent with brief §2's pipeline note and §3's tripwire.

## Status: DONE

Input reconciled: brief addendum `_bmad-output/planning-artifacts/briefs/brief-week-3-project-2026-09-22/addendum.md`.

Top gaps:
1. Nominalization rule for boundary-probe is entirely absent from PRD/addendum, despite being stated as a general (not BA-only) classifier rule — belongs in PRD addendum §2 or FR-33.
2. Verified vs. unverified pricing-source list (Capi Demy/ColorME/Keyframe verified; ChatGPT VN/Synthetic Users/Yoodli/VN BA course unverified) dropped from PRD addendum §4's cost section, which still cites the 100–200k VND mark.
3. Brief's "pre-flight card merged into guide" decision isn't reflected — PRD keeps a separate generic Màn 3 prep screen and a separate personalized Màn 8/FR-28 guide, with no stated link between them.
4. BA/PM grounding-material caveats (unsourced "pre-approval threshold" template, healthcare/procurement skew, no VN enterprise examples, PM "fluff"-signal guidance) aren't carried into PRD's Next note for BA/PM.
5. Leak-per-episode is tracked as a production counter-metric (NFR-6) but not reported by the CLI eval harness itself, narrower than the brief's "add it into the eval harness as a metric."

Full extract written to: `D:\Tekmium\week-3\_bmad-output\planning-artifacts\prds\prd-week-3-project-2026-09-24\reconcile-brief-addendum.md`

Status: DONE
