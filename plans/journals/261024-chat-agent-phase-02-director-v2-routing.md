# Routing that abstains unless it can quote the question (chat agent plan, phase 2)

2026-10-24 · branch `main` · three paid Flash runs, 0.1053 USD (plan total ≈ 0.210 of 0.5)

## What shipped
- Call 1 returns `topic: {direct, direct_span, broad}` instead of `topic_tags`. Code keeps a direct topic only when its span lies inside the question; otherwise it becomes a hint with a `topic.direct` correction. Hints are capped at 3 (`ROUTE_BROAD_MAX`). `src/engine/unlock.ts` has no diff.
- `ROUTING_RULES` is an exported prompt block that replaces "pick the clearest match". Phase 5 reuses it.
- Rows stored before the phase lack both new fields. A `StoredAnalysis` type makes them optional, so the compiler forces `??` on every reader. The trace prints `direct = …; direct_span = …; broad = …`.
- One `topic()` builder replaced about 137 `topic_tags` literals across 33 test files; the e2e stub and markers use `directTopic()`.

## What the measurement showed
Same 56 hand-labelled questions as phase 1, Flash, tags unchanged, so the numbers measure the prompt alone.
- Wrong-direct 16.1% (9/56) → **1.8% (1/56)**, gate ≤ 2.1%. Missed-direct still 0/36, so it does not over-abstain. General questions that open nothing: 11/20 → 19/20.
- Labels 100% (24/24), 0/18 leading false positives: the extra routing task cost nothing there. This run is phase 3's baseline.
- The last error was ch-15, "Chị nắm tiến độ của nhóm qua những cách nào ạ?" (broad → `private-notebook`), a line phase 1's review called arguable and the user kept. The tag "cách chị tự theo dõi việc đã giao" read as the generic tracking topic, so a natural interview question would have opened chị Hạnh's secret.
- The user approved a tags-only rewrite: "cách riêng của chị để nhớ từng việc đã giao" (echoes the public hook line, passes `validate`). With only the tag changed, her 18 lines re-ran at 0/18 wrong, 0/11 missed, 7/7 general questions open nothing. Adding run 1's other 38 lines gives 0/56, but from two runs, not one pooled run. No sibling confusion showed, so no other tag changed.

## What went wrong / what changed in review
- **The spec was wrong and the code followed it.** Validation decided only that a broad question may drop one hook. The phase spec turned that into a union where touched topics compete on weight with the turn's own hook, which also changed direct and chain turns. The implementation pinned the union in `tests/engine/hooks.test.ts`, so every test was green on behaviour nobody asked for.
- **The first review (7.5/10) found it** with a pure-engine probe script, in minutes: after `last-attempt` opened, `paid-app`'s hook took the slot of `shame`, the story's next step. Tests written from the same spec line could not. When a spec widens a narrow decision into a formula, probe the turn types it was not about.
- **Decisions:** hints are a fallback pool only, the turn's own reasons first (rejected: keep the union with a sign-off). A hook from a touched topic carries its own do-not-assert (the persona prompt pairs a hook with "Ngoài câu ở trên, tránh điều sau…"), still at most one per Call 2. Chain and closing hooks carry none, as before.
- **The second review (9/10) found one more.** On a direct question about a locked item with no hook to give, the fallback dropped a neighbour's hook under the wrong constraint (`small-spend`, hook spent, plus a hint on `installment`). The user chose no hook there, as before phase 2; it also keeps ignored hooks from piling up in the reveal.
- **Third test cycle:** one unit timeout in `plan-turn-adversarial.test.ts` (`Test timed out in 5000ms`, ran 7578 ms) while tsc and eslint ran beside 62 vitest workers. On a quiet machine the test takes 1.08 s, the same as before the phase; the tester's own 2.3 s rerun still overlapped other load. So no timeout was padded. Run the gates one after another. A quiet unit run then passed 1178/1178; int 673/673 and e2e 328/328 had passed in the same cycle.

## Small things worth remembering
- **The Call 1 prompt change invalidates the lean-eval probe cache.** The next `pnpm il eval` pays for every probe again; phase 6 owns that run.
- The phase 1 rule held: the DB answered before each paid run, and every call wrote its `llm_call` row.
- Expect more ignored-hook notes in the reveal: broad questions now drop hooks from touched topics. Intended.
- Handed forward: generated scenarios are not checked against the fixed prompt wording (the commuting examples in `ROUTING_RULES` could trip the lean eval's isolation check on a commuting custom topic), phase 5. The rewritten tag is on disk only; the DB import and the lean eval wait for phase 6. The PRD addendum §2.1/§3 still describes `topic_tags`; `src/llm/schemas.ts` notes the divergence.
