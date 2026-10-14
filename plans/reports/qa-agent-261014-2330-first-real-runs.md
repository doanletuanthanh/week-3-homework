# Persona QA agent (lean eval): first real runs (2026-10-14)

Setup: `pnpm il eval <persona> --profile lean` on the production DB with real Gemini models (`LLM_QA_PLANNER` and `LLM_EVAL_LEAK_JUDGE` = gemini-3.8-flash:low, set for the run only; ANALYSIS and PERSONA come from `.env.local`). Synchronous mode (slice 3a; Batch mode comes in slice 3b). Cap `eval_lean_budget_usd` = 0.10.

## Run 1 (chi-thu): two artifacts of the agent found
- 0.0708 USD, 32 calls. The agent asked 3 questions of its own in its reflect round.
- **Artifact 1, budget:** the per-call price was the average over all calls, so the large planner call priced every probe and 9 planned probes were dropped. Fix: probes are priced from ANALYSIS/PERSONA calls only, and additions are decided after the floor has run.
- **Artifact 2, seeding:** the hook line followed a neutral question, so a sample question that builds on the topic read as `leading` (work-fatigue). Fix: the seeded learner turn asks about the item's public topic, as live hook selection requires.

## Run 2 (three personas): two more artifacts found
| Persona | USD | Calls | Unmet |
|---|---|---|---|
| chi-thu | 0.0826 | 41 | no_public_leak, floor_unlocks (installment, work-fatigue), deliveries (installment not opened) |
| anh-khoa | 0.0829 | 38 | deliveries (unpaid-work not opened, although the floor check opened it) |
| co-lan | 0.0851 | 40 | none |
- **Artifact 3, Call 1 is not deterministic:** the same question on the same state opened unpaid-work in one run and not in the next. Fix: a miss runs once more. 1/2 is a warning ("mở không ổn định"), 0/2 is a failure. A delivery only asserts "told" when the item opened.
- **Artifact 4, the planner over-flags public fields:** for example, "cẩn thận trong công việc nhưng dễ dãi với tiền" was flagged as revealing work fatigue. Fix: the planner classifies each case as `content` (blocks) or `topic_hint` (warning) and must quote the overlapping words.

## Run 3 (three personas, after the fixes)
| Persona | USD | Calls | Unmet | Notes |
|---|---|---|---|---|
| chi-thu | 0.0907 | 44 | floor_unlocks: installment 0/2 (`leading` both times) | work-fatigue now opens on its sample question; 2 topic hints are warnings |
| anh-khoa | 0.0923 | 43 | floor_unlocks: friend-cafe 0/2 (`leading`) | agent: the sample question presupposes "something happened after handover"; afraid-to-lose-client opens 1/2 (warning) |
| co-lan | 0.0875 | 39 | no_leaks: on delivering deposit-software, the persona said I6's hook line *and explained the reason* | the persona prompt says "không giải thích gì thêm" about a hook; this is a real persona behaviour leak |

~~The remaining failures are stable across runs.~~ Runs 4–5 contradict this: installment passed in run 4 and failed again in run 5. These failures are probabilistic, not deterministic defects. The agent's explanations (for example friend-cafe's presupposition) remain plausible authoring advice. Phase 4 (mutation calibration) has to decide whether they are defects: the curated personas are the "clean" reference, so either they get fixed, or the thresholds are shown to be too strict.

## Run 4 (chi-thu, Batch mode, after the review fixes)
- **0.0397 USD for 41 calls**: 45% of the synchronous cost for the same probe mix (0.088–0.092). It took **26 min as 11 batch jobs** of 1–14 calls each, 1.5–3 min per job. The waves follow the graph: plan, floor ANALYSIS, attack turns, additions, retries, judge, reflect.
- All thresholds were met. installment and work-fatigue opened, after failing 0/2 in runs 2 and 3.

## Run 5 (chi-thu, `--fast`, right after)
- 0.0904 USD, 45 calls. installment failed again 0/2 (`leading`), and a topic leak appeared (delivering paid-app raised tried-methods).
- **Verdicts are not stable between runs**, in both transports and on both the unlock and the leak rows. One run is not enough to gate a persona. Phase 4 has to measure this and decide the rule, for example majority of 3 runs, or k-of-n per probe, priced against the cap.

## Run 6 (four more personas, Batch mode, in parallel, 2026-10-15)
| Persona | USD | Calls | Jobs | Time | Unmet |
|---|---|---|---|---|---|
| ban-phuc | 0.0388 | 40 | 11 | 20.5 min | none |
| chi-my | 0.0403 | 40 | 10 | 20.3 min | floor_unlocks: form-tool 0/2 (`leading`) |
| chi-hanh | 0.0397 | 40 | 11 | 21.6 min | none |
| anh-tung | 0.0399 | 40 | 10 | 20.4 min | none |

All 7 curated personas are now measured under the 0.10 cap: in batch at 0.039–0.040 (5 personas), and in sync at 0.083–0.092 (3 personas).

## Run 7 (cache)
- chi-thu after the probe cache, before the run cache: 12 calls, 0.0151 USD. The planner chose different additions, which were not cached.
- After the run-level cache, with every input the same: **0 calls, 0 USD**. `--no-cache` measures again.

## Cost
- Synchronous: 0.088–0.092 USD per persona, which is near the 0.10 cap. Retries of misses and up to 8 agent additions account for the spread.
- Batch mode, measured: 0.0397 USD (run 4). It takes about 26 min instead of about 2.

## Not verified
- The new CLI path has no automated integration test. The local Supabase stack was down, and the int tests' `resetDatabase` must never run on production. The CLI path (create run, lock, agent, `finishQaRun`, leak-flag insert) was exercised by the real runs above, for example co-lan's flag `il adjudicate list co-lan`.

## Unresolved
- Are installment (chi-thu) and friend-cafe (anh-khoa) sample questions to be rewritten, or is ANALYSIS's `leading` label on them wrong? This is an authoring decision (phase 4 / user).
