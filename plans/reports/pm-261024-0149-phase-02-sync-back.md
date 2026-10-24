# Sync-back: chat agent routing plan, after phase 2 (2026-10-24)

Plan: `plans/261023-1532-chat-agent-routing-memory-and-generator-v2/`. `ak plan validate` OK. Status `in-progress`: 2/6 phases done, 32% (20/62 tasks).

| Phase | Status | Checked | Note |
|---|---|---|---|
| 1 Routing test set, batch runs, baseline | completed | 11/11 | No change. |
| 2 Director v2 topic routing | completed | 9/9 | Results recorded; spec updated with the user's hook decisions (C1, W1, N1). |
| 3 Session memory | pending | 0/11 | No work started; nothing to backfill. |
| 4 Actor v2 | pending | 0/12 | Same. |
| 5 Generator v2 | pending | 0/9 | Same. It reuses `ROUTING_RULES` (now exported) and inherits review item S3. |
| 6 Measure, tier, ship | pending | 0/10 | Same. The curated tag import and the lean eval wait here. |

plan.md updates:
- Phase 2 row: Done.
- Spend: ≈ 0.210 / 0.5 USD.
- Budget table: the two phase 2 rows show actual spend.
- Success criterion 1 checked; it is re-proven in phase 6 if the Director model changes. The label criterion is annotated and stays open until phase 3's window comparison.
- New Decisions bullet for the hook rules.

## Next session
1. Phase 3 (session memory and bounded context) depends on 2.
2. Phase 5 (generator v2) depends on 2 and can run beside 3–4. It must take its `tests/e2e/llm-stub.mjs` edits in turn with phases 2 and 3.

## Unresolved mappings
None. Every completed item maps to a phase-02 checkbox.

## Unresolved questions
- Phase 6 should plan for the full cost of the next lean eval, because the prompt change invalidated the probe cache.
