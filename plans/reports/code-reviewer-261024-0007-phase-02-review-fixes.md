# Code review, cycle 2: phase 2 review fixes (Director v2 topic routing)

2026-10-24 ~00:20. Scope: the fix delta in `hooks.ts`, `contexts.ts`, `plan-turn.ts`, `analysis.ts`, `schema.ts`, four test files and the phase-02 spec. Read-only, no paid calls.
My runs: `pnpm typecheck` exit 0, `pnpm lint` exit 0, `pnpm test` 1176/1176 (62 files). The int and e2e results come from the tester. `unlock.ts`, `persona.ts`, `apply-verdict.ts` and `eval/isolation.ts` have no diff.
Probe (pure engine, chị Thu, openness 4): `C:/Users/thanh/AppData/Local/Temp/claude/D--Tekmium-week-3/384f2ed6-ca1b-47e9-988c-f420f1a841c1/scratchpad/probe-hooks-cycle2.ts`.

## Score: 9/10
Every finding was fixed as the user decided. The new tests tell the old union apart from the fallback, and the gates pass. Nothing blocks the phase or the paid re-measure. Two doc lines overclaim, and one decided trade-off deserves a look in its concrete form (N1).

## Original findings
- C1 RESOLVED (`hooks.ts:60-72`). The candidates are now `pickable`, then `own` (direct topic, prerequisite just opened, or closing question), then the hints only when `own` is empty.
  - Probe: direct last-attempt + hint paid-app opens last-attempt with hook `shame`; direct small-spend + hint installment gives hook `small-spend`. The tests would fail under the union (`hooks.test.ts:108-118`).
  - No starvation. A broad-only question has no direct topic and is not closing, so `own` is non-empty only when a hook pickup opened an item whose next step is locked; the chain hook wins there, as decided.
  - Probe: broad [paid-app, small-spend] gives `paid-app`; pickup opens paid-app + broad [installment, small-spend] gives `installment`; pickup opens last-attempt + broad [paid-app] gives `shame`.
- W1 RESOLVED as decided (`contexts.ts:137,155`, `plan-turn.ts:110`).
  - At most one constraint is structural (`doNotAssert: string | null`), and never an open item's: `lockedItem` filters `stateAfter.unlocked` (`:136`).
  - The constraint belongs to the direct topic or to the item whose hook is dropped this turn (`hookFromHint` equals `selectedHook`). Probe: broad-only gives paid-app's hook and paid-app's constraint.
- W2 RESOLVED. `plan-turn-adversarial.test.ts:159-177` covers all three branches and guards against a vacuous pass with `fromHint > 10`. The direct topic's priority is pinned deterministically at `hooks.test.ts:145-151`.
- W3 RESOLVED with different wording that fits the fallback: `analysis.ts:75` "tối đa 3, không tính chủ đề direct".
- S1 RESOLVED (`analysis.ts:65-70`; its claims check out against `:102`, `:108` and `:114`). Small gap: it does not say that span indices are `engine/tokens.tokenize`'s, which the span check counts with.
- S2 RESOLVED (`schema.ts:231-234`). The note is accurate: the only reader is `session-trace`, which just runs `JSON.stringify` on the column.
- S3 deferred to phase 5 (user decision). S4 RESOLVED (`check-analysis.test.ts:119-121`; the duplicated hint assertion is gone). S5 needed no change.

## Warnings (non-blocking)
N1. The decided trade-off in concrete form. Take a direct turn whose topic stays locked and has no hook to give (hook already spent, or prerequisite locked). The hint fallback then drops a neighbour's hook under the direct topic's constraint.
- Probe: small-spend (hook spent) + hint installment gives installment's hook with small-spend's constraint; shame (prerequisite locked) + hint paid-app gives paid-app's hook with shame's constraint.
- The persona gets "Ngoài câu ở trên, tránh…" (`persona.ts:74`) with another item's constraint. Only "không giải thích gì thêm" (`:67`) guards the hook item.
- Before phase 2 these turns dropped no hook. It matches C1 and W1 as worded and is pinned (`hooks.test.ts:120-124`, `:145-151`).
- The only alternative that keeps each hook with its own constraint: no hint fallback while the direct item is locked (engine-only, Call 1 untouched). Watch for it in the phase 4 transcripts.

N2. Two doc lines overclaim: `contexts.ts:119-120` ("so that hook never goes out without its constraint") and phase-02:38 ("so a hook never goes out without its constraint").
- Both are false on the N1 path and for chain hooks (probe: the chain hook `shame` has no constraint).
- Wording: "…or else, when no direct topic is locked, the touched topic whose hook is dropped."

## Suggestions
- S-a. `contexts-isolation.test.ts:87,94` still requires the constraint to be the tag's, which holds only because THIRTY_TURN_SCRIPT has no broad topic. Accept "the tag's or `hookToDrop`'s", so that adding a broad line to the script cannot fail a correct engine.
- S-b. Pairing goes by membership, not by where the hook came from: direct last-attempt + hint shame gives the chain hook `shame` with shame's constraint, while the same turn without the hint gives none. Harmless, and it matches the code-flow (phase-02:68) and the adversarial oracle. The prose "drawn from" (phase-02:38) reads as provenance; align it.
- S-c. Implementation step 3 says "a hint makes a hook eligible" (phase-02:95). Add "when the turn has no reason of its own".

## Side effects
- SE-A. Direct and chain turns keep their own hook again; the union's displacement is gone.
- SE-B. On broad-only turns, Call 2 now gets the hook item's constraint. The lean-eval fingerprint (`eval/qa/tools.ts:119`) plans a no-topic turn, so W1 does not change it.
- SE-C. The N1 path drops more hooks on repeat-direct turns, so there are more ledger entries and more "heard but not followed" notes in the reveal (extends cycle-1 SE2).
- SE-D. A chain hook carries a constraint only when Call 1 also lists its item as broad (S-b).
- No DB, env, API, unlock or persona-template change. `schema.ts` changed only in a comment.

## Checks
(a) PASS. AC3: `hooks.ts:60-72` plus tests. AC4: `contexts.ts:137,155` plus tests. AC6: `analysis.ts:65-80`. AC7: `unlock.ts` has no diff, and Call 2 gets at most one constraint, only of a locked item. Still open in the Todo list and success criteria (phase-02:107-118): the paid re-measure and the curated tag rewrites.
(b) PASS. `chooseHook` and `isClosingQuestion` are used only at `plan-turn.ts:79`; `buildPersonaContext` only at `plan-turn.ts:108` and `curated-scenarios.test.ts:98`. Outside N1, hook choice is as before the phase, except broad-only turns (validation Q4) and cycle-1 SE3.
(c) PASS. `buildPersonaContext` gains a required `hintItemIds`: an internal API, both callers updated, compiler-enforced. The PersonaContext keys are unchanged (`contexts-isolation.test.ts:115`), and the Call 2 text change is in the spec (phase-02:38).
(d) PASS. The fix reuses `lockedItem`, the stable weight sort and the `topic`/`a` fixtures, and adds no new abstraction.
(e) PASS. typecheck 0, lint 0, unit 1176/1176. The added lines have no `.only`, `.skip`, `eslint-disable`, `ts-ignore` or `console`.

Paid re-measure: no open item changes the Call 1 prompt. N1, N2 and S-a to S-c touch only the engine or the docs, so the re-measure is not blocked.

## Unresolved questions
1. N1: keep the hint fallback on locked-direct turns under the direct topic's constraint (as decided), or drop no hook there, so a hook always ships with its own constraint?
2. N2 and S-a to S-c: fix them now, or with phase 3?
