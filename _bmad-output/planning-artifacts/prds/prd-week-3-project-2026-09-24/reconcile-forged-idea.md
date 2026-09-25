---
title: Reconciliation — forged-idea.md vs PRD (2026-09-24)
created: '2026-09-25'
---

# Reconciliation: forged-idea.md → prd.md / addendum.md

Input: `_bmad-output/forge/ai-interview-practice-agent/forged-idea.md` (HARDENED, 2026-09-22)
Against: `prd.md`, `addendum.md`, `.memlog.md` (same folder, 2026-09-24/25)

Per task scope, the following forge → PRD changes are **logged, deliberate, and excluded from Gaps** even though they change or narrow forge content: 2 LLM calls/turn (was 4), sealed counter only / no live unlocked count, experience question + tiers cut, bilingual plumbing cut (VI only), guide feedback templated instead of LLM-authored at runtime, admin dashboard → Later, and the full replay mechanical spec (§6). These are all traceable to explicit `.memlog.md` decisions.

## Gaps

### 1. Flight-simulator metaphor dropped — no logged rationale
**Severity: High**
Forge locks the primary metaphor as **buồng mô phỏng bay** (flight simulator) — "OSCE/standardized patient chỉ là trích dẫn uy tín. Bỏ 'bạn tập đấu' (sparring partner)." This is called out as a deliberate positioning decision (`Đã bác`: sparring partner and OSCE-as-headline both explicitly rejected in favor of the simulator frame).

The PRD carries none of this. Product name is "Phòng tập phỏng vấn người dùng" (**practice room**, not flight simulator/cockpit), and Màn 1 homepage copy ("Luyện phỏng vấn người dùng. Xem chính xác bạn đã bỏ lỡ điều gì.") uses neither the simulator metaphor nor forge's locked headline ("Luyện trên kịch bản của chúng tôi. Tự tin bước vào buổi phỏng vấn của bạn."). No `.memlog.md` entry addresses this metaphor/positioning change — the only logged copy-related decision is that the *promise* in the headline had to weaken because topic-personalized guide was cut ("guide MVP ... launch copy must match (weakens 'walk into yours prepared')"), which explains softening the promise, not replacing the whole metaphor.
**Where it should go:** PRD §1 (Sản phẩm), product-name decision, and Màn 1 homepage copy in the UJ-1 walkthrough. If the metaphor was deliberately dropped, it needs a decision entry in `.memlog.md`; if not, PRD copy should be reconciled to it (title still marked `[tên tạm]` / "chưa chốt" in §11, so this is still open).

### 2. Overlap check / "chủ đề phỏng vấn thật" field silently dropped
**Severity: High**
Forge locks two related items: (a) an optional "real interview topic" field before a session that turns on an **overlap check** and pre-fills the guide, and (b) "nếu topic người học trùng kịch bản của vai trò → gợi ý kịch bản vai trò khác" (if the learner's real topic overlaps an existing scenario, suggest a different scenario) — this is an integrity/anti-contamination safeguard, not just a convenience feature.

PRD §3 only logs cutting **guide personalization by real topic** ("Copy ra mắt chỉ được hứa guide dựa trên lỗi của bạn, không được hứa guide theo đề tài của bạn"). It never mentions the overlap-check safeguard itself, and there is no field, FR, or screen anywhere in the PRD (Màn 3 chuẩn bị has no topic field) that captures the learner's real topic or checks it against scenario content. `.memlog.md` likewise only logs the guide-copy consequence, not a decision to drop the overlap check.
**Where it should go:** PRD §3 "Cắt và hệ quả" table (add explicit row + consequence), or a new FR near FR-6/FR-28, or explicitly move to Next/Ngoài phạm vi with a logged reason if the intent was to cut it too.

### 3. Grounded praise not specified in reveal/guide templates
**Severity: Medium**
Forge locks: "Kinh nghiệm đổi độ sâu, không đổi sự thật hay độ gắt. **Khen có căn cứ (turn được gắn nhãn tốt) được phép ở mọi mức.**" The experience/tier system was cut (logged, not a gap), but the underlying principle — grounded good turns should be acknowledged, not just corrected — survives independently of tiers.

PRD's reveal-notes example (Màn 6, FR-20) and guide spec (Màn 8, FR-28) are corrective-only: "Bạn hỏi 3 câu giả định tương lai...", "Thay vì hỏi / Hãy hỏi", "Thói quen cần để ý." Nothing in FR-20, FR-28, or §5.3 requires the template to ever surface a well-grounded question positively. No memlog entry discusses dropping praise; it appears to have been lost as a side effect of the tier cut rather than a deliberate call.
**Where it should go:** FR-20 (reveal nhận xét) and FR-28 (guide) template rules, §5.3.

### 4. BA/PM risk-mitigation plan not carried into PRD roadmap/risks
**Severity: Medium**
Forge's risk list includes a specific mitigation for shipping BA/PM without a real practitioner validating authenticity: "grounded tài liệu, AI critic, proxy (giảng viên/thực tập sinh BA/PM, ghi là kiểm tra một phần), link phản hồi trong mode BA/PM." Forge's own Next list already defers BA/PM (so deferring itself is *not* a gap — it matches forge), but the mitigation plan for when BA/PM ships is a separate locked item.

PRD §3 Next and §11 (Giả định và câu hỏi mở) don't carry this mitigation forward at all — §11 only lists giả định #6 (no in-product signal, measured via 3 fresher-BA interviews) and #8 (payment). The proxy-review/feedback-link plan for BA/PM quality is absent from both PRD and addendum, and not logged in `.memlog.md`.
**Where it should go:** PRD §3 Next roadmap detail, or §11, when BA/PM scope is picked up.

### 5. "Role as data" not concretely specified in schema
**Severity: Low**
Forge locks multi-role architecture as **data** (kịch bản, unlock path, trọng số, must-do, template all data-driven per role). PRD text asserts "BA và PM dùng chung kiến trúc" but FR-33's schema checklist only requires a `language` field (mirroring forge's own field) — no `role` field is required, and addendum §3's data model has no `scenario` table/schema at all (only `session`, `turn`, `snapshot`, `branch`), so where "role" lives structurally is unstated.
**Where it should go:** FR-33 schema checklist; addendum §3 data model (add a `scenario` schema entry with a role field).

## Intentionally changed (logged, not gaps)

- 2 LLM calls/turn instead of forge's ~4 (code decides unlock, not the model) — `.memlog.md` decision, reasoned against forge's own "cổng do logic agent" lock re: injection risk.
- Sealed counter shown as total only, no live "đã mở" count during interview — logged, reason: no tier to gate visibility, live count invites gaming.
- Experience question + tier-based feedback depth — cut, logged, consequence stated in PRD §3 ("mọi người thấy cùng một bộ đếm").
- Bilingual plumbing — cut to VI-only, `language` field kept on scenario for future EN migration; logged in PRD §2/§3 and `.memlog.md`.
- Guide and reveal notes — templated from ledger, zero runtime LLM calls, instead of forge's implied LLM-authored feedback; logged decision, guide verifier moved to authoring time.
- Admin dashboard — deferred to Later per forge's own tripwire language (forge already said dashboard starts only if must-ship done by day 6); PRD/memlog confirm this same call.
- Replay full mechanical spec (§6: snapshot, candidate selection, fallback 1/2, isolation) — this is forge's single-line replay concept turned into a detailed, reviewer-requested spec; consistent with, not contradicting, the forge lock that replay is "bằng chứng khác biệt duy nhất" (kept, not cut, matching forge's own rejection of cutting replay under time pressure).
- Describe/custom scenario path — deferred entirely to Next (generation pipeline not in MVP); logged in `.memlog.md`, consistent with forge's own MVP ranking (Describe was already last must-ship item / early Next item in forge).
- Headline promise weakened ("Tự tin bước vào buổi phỏng vấn của bạn" underclaimed) — logged consequence of cutting topic-personalized guide.
- "Buổi của tôi" dashboard added beyond forge's must-ship list — logged addition (§3, memlog), needed to make FR-3/FR-5 and pre-real-interview guide review functional; pushed schedule to ~14.75d, PRD explicitly de-scopes 2nd scenario from launch blocking instead of cutting this screen.

## Covered

- Tảng băng cố định + 4 đường mở (bề mặt / follow-up / chuyện quá khứ / tin tưởng) — PRD §5.1, addendum §2.
- 3-label grounding rule (confirm-grounded / boundary-probe / leading), common across roles, `grounded_turn_id` required — PRD §5.1, §5.2, FR-12/13, addendum §1.
- Ethics boundary: never generate insight about the real interviewee; guide never asserts; citations only from transcript; privacy by default — PRD §1, FR-30, NFR-9, NFR-13.
- Replay as core evidence, single moment/session, 3 turns, same gate/pipeline, isolated branch, never overwrites main — PRD §6 (full), FR-23–27, acceptance criteria §5.
- Quality bar: 8–12 items, all 4 unlock paths present, ≥2 story/trust-only items, good-run ≥2× and ≥3 items vs bad-run, 0 leak / 20 adversarial runs — FR-33/34, addendum, acceptance criteria §2.
- Good interviewer blind to the iceberg for eval — PRD UJ-2, FR-34.
- Structural trust: persona only sees identity/surface facts/opened items/dropped hooks, do-not-assert constraints; citations resolved from transcript by turn ID, unresolvable citations dropped; feedback content computed from ledger, LLM only phrases it — PRD §5.2, §5.3, FR-21, addendum §1.
- Rejected-idea list honored: no per-role scoring rules (common grounding rule instead); no "cut replay if behind schedule" (replay kept in must-ship); personas never generated straight from the learner's real research question (PRD §3 Ngoài phạm vi); no group/workshop interviews (out of scope).
- Multi-role deferral itself (UX launches alone, BA/PM to Next) matches forge's own Next ordering — not a gap.
- Guide's 3-label verifier at authoring time, blocking any real-user assertion or unresolved assumption — FR-30, FR-36.
- Cost/call budget discipline (≤2 calls/turn, 1 verifier/session) — NFR-1, addendum §4, acceptance criteria §6.
- Classifier accuracy target with VI test set incl. boundary-probe edge cases ("luôn thấy bực, đúng không?") — NFR-7, addressing forge's noted risk about LLM judgment on scope-vs-new-content boundary.
- Fixed language per session — NFR-12, addressing forge's "giả định: ngôn ngữ cố định" risk (elevated from assumption to hard requirement).

**File:** `D:\Tekmium\week-3\_bmad-output\planning-artifacts\prds\prd-week-3-project-2026-09-24\reconcile-forged-idea.md`
