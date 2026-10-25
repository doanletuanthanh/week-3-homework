# Phase 4 (Actor v2: short, natural replies) test report

Date: 2026-10-25. Scope: `pnpm test:int`, `pnpm test:e2e` (run sequentially). Unit, typecheck, lint were run by controller.

## Results
- Integration: 675/675 passed, 32/32 files. Duration 470s. Baseline 675/675. OK.
- E2E: 328/328 passed (15.9m). Baseline 328/328. OK.
- Failures: none. No retries or flaky reruns needed.
- Slowest e2e tests ~13.8s. No slow-test regressions noted.

## Environment note
- `pnpm test:int` initially failed: local Supabase not running (ECONNREFUSED 127.0.0.1:54322). Docker Desktop was stopped.
- Fix (no code change): started Docker Desktop, ran `pnpm exec supabase start`. DB reached healthy. Some non-DB services (storage, realtime, imgproxy, etc.) reported "stopped" in `supabase status`; int suite still passed.
- No paid LLM calls made. Tests use stubs.

## Coverage of changed areas (grep only, no coverage run)
- `src/engine/reply-plan.ts`: `tests/engine/reply-plan.test.ts` (6 cases).
- `SHAPE_TEXT` / `buildPersonaContext`: covered in `tests/engine/contexts-isolation.test.ts` and `tests/scenario/curated-scenarios.test.ts`.
- `MAX_OUTPUT_TOKENS` / `createModel(spec, options)`: covered in `tests/llm/call-model.test.ts`. No direct test found for `src/llm/gemini-batch.ts` or `src/server/generation.ts` option pass-through. Gap, worth a check.
- Persona prompt rule text: no test asserts the new wording. Changes are prompt-only, so the scenario tests are the only guard.

## Critical issues
- None blocking.

## Next steps
1. Add a unit test asserting `createModel` receives the `MAX_OUTPUT_TOKENS` cap from `gemini-batch.ts` and `generation.ts`.
2. Consider a snapshot or assertion on `SHAPE_TEXT` so accidental prompt edits fail tests.

## Unresolved questions
- Is the non-DB Supabase service stop (storage/realtime) acceptable for the int baseline, or should `supabase start` be rerun to bring all services up?
- Should a coverage run (`pnpm test:coverage`) be done to confirm the gap above numerically?

Status: DONE
Summary: Phase 4 int 675/675 and e2e 328/328 pass, matching baseline, no failures or flakes. Int needed Docker/Supabase started first.
Concerns/Blockers: Coverage gap for MAX_OUTPUT_TOKENS pass-through in gemini-batch and generation; persona prompt wording untested directly.
