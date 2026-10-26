# Short replies, a generator that repairs only what failed, and Flash kept (chat agent plan, phases 4–6)

2026-10-25 to 2026-10-26 · branch `main`. Paid runs: 0.0446 + 0.0577 + 0.0775 USD. Plan total ≈ 0.421 of 0.5.

## What shipped
- **Phase 4: short replies.**
  - A reply-shape table (`src/engine/reply-plan.ts`) picks the shape from typed outputs.
  - Call 2 tells at most one item a turn: the one just opened, the one asked about directly, or last turn's untold one, told briefly.
  - Output is capped per role on both the sync and the batch path.
  - Measured: median reply 140 → 45 words, Call 2 latency 4.5 → 2.4 s. The user accepted naturalness after playing chị Thu on production.
- **Phase 5: generator v2.**
  - `REPAIR_MODE` is a data table. Only shape codes rewrite the whole scenario; every other code repairs just the violated items or fields.
  - A routing check runs on Call 1's model, with one tag repair for items it cannot tell apart.
  - The attempt report and the admin attempt page record each repair and the routing check.
  - The leave-request topic went from 2 tries, 75 s and 0.046 USD in phase 9 to 1 try, 38 s and 0.0185 USD.
- **Phase 6: measure and ship.**
  - The Director stays on Flash.
  - Session cost is measured: 0.031 USD for an 8-turn interview.
  - chị Hạnh v3 is imported.
  - co-lan passes the lean eval, `no_leaks` included.

## What the measurements showed
- **Lite failed routing at once:** 7/56 wrong-direct against a gate of ≤ 1. Six of the seven are general questions pushed onto one topic. Abstaining is the hard part of the phase 2 prompt, and the smaller model does not do it. Stopping after run 1 saved ≈ 0.08 USD; a 3-of-3 rule never needs runs 2–3 once run 1 fails.
- **co-lan's `no_leaks` went from failing 6/6 runs to passing.** The calibration report traced every failure to `deliver_item` replies brushing a neighbouring locked item. Phase 4 cut what Call 2 hears to the one item a turn is about, so this is the expected effect. It is still one run, not a rate.
- **The plan's cost model was half right.** 8 turns cost 0.031 USD against the estimate of ≈ 0.032. But input does not stop growing after turn 5: gists and claims add ≈ 65–110 tokens a turn. No call hit Gemini's cache.
- **A targeted repair writes 10% of a scenario but bills 35%.** Reasoning tokens dominate: 965 of 1245 output tokens in the targeted repair, and 1426 of 1619 in the tag repair. The next lever is a lower effort for the repair calls, which would need a role of their own.

## What went wrong / what changed in review
- **Phase 4: a "leak" that was the design.** On turn 6 of the transcript, "thấy sao sao á" looked like a brush on the locked `shame` item. It is `shame`'s own hook line, dropped when `last-attempt` opens, so that the learner can follow up. Read the scenario file before calling something a leak.
- **Phase 5 review, 8.5/10, two medium findings:**
  - A targeted repair had no focus rule, so a rewritten item could move off the focus path, and `validate` does not count focus.
  - A tag repair dropped for breaking `validate` looked applied in the report.
  - Both are fixed: repairs carry `FOCUS_RULES`, and a dropped repair carries `dropped`.
- **Phase 5 tests:** the fixture had to tell the repair and route-check prompts apart from the generator's. It does that by their first line, the same way the e2e stub does. So no other prompt may reuse "người sửa kịch bản nhân vật" or "người kiểm tra định tuyến chủ đề".
- **Tooling:** bash heredocs with an apostrophe in an inline python script failed ("unexpected EOF"). Scripts written to the scratchpad worked. A tsx script outside the repo cannot resolve `node_modules`, so the paid runs were started from a temporary file under `cli/`, deleted afterwards.

## Small things worth remembering
- **Each run of an attempt starts its report empty.** A resumed attempt's report shows only the last run's repairs, and a tag repair can run again on resume. Both are low and left open.
- **chị Hạnh v3 is a draft.** It needs its own lean eval and approval before the admin console shows it approved.
- **Stale in the user's presentation script** (not edited), listed in phase 6: routing may name no topic, the window of 5 exchanges, one item for Call 2, and the targeted repair.
