# Lean publish gate and eval job: shipped with no paid calls

**Date**: 2026-10-15
**Severity**: Low
**Component**: Publish gate (`src/eval/publish-gate.ts`), lean eval job (`src/server/eval-job.ts`, `src/db/repo/eval-jobs.ts`), CLI `publish` / `adjudicate` / `approve` / `eval`
**Status**: Done (phase 5)

Work history only. Current state lives in the phase 5 file and the code.

## What Happened

Phase 4 left the gate rule open: clean personas fail `no_leaks` 50–100% of runs. The plan text said "every threshold met", which would have blocked every persona and made the admin rulings pointless. I asked before planning. The user chose to let admin rulings settle `no_leaks`: one ruling per flag, the latest counts, `leak` blocks. Every other lean threshold must still be met.

The user's Gemini key had about 30,000 VND left (≈ 1.15 USD), so the whole phase ran with 0 paid calls. Every test uses the scripted model or the e2e LLM stub.

Built:
- the gate as a rule table;
- `version_approval` tied to the eval run;
- the adjudication history (an `id` key instead of `(flag, admin)`);
- the lean run as a job on `eval_run`: claim token, heartbeat, stale takeover, `run_attempt`, one live lean run per version through a partial unique index;
- `eval_daily_budget_usd`;
- `il approve`.

The CLI lean path now runs the same job.

## Decisions and Mistakes

- **Job code.** The generation job code is tied to `generation_attempt` (deadline, draft, session), so I wrote a small copy for `eval_run` instead of extracting shared code.
- **Abort signal.** `runQaAgent` overwrote the caller's abort signal with its own budget stop, so a job could not have stopped it. It now combines both with `AbortSignal.any`.
- **High finding from review.** A takeover checked the floor against the cap that was left, at list price, before it looked in the probe cache. A runner killed after spending 0.07 USD of a 0.10 cap would fail the resumed run on budget, even though its probes were free from the cache. Fixed: cached floor probes are not counted. A unit test covers it.
- **Cost on finish and on fail.** The two paths could store different costs. Both now read `llm_call`.
- **Two stale int tests** were left over from phase 3 (`--fast`, the `--profile` message). They showed that `--fast` on a quick run was silently ignored while it still spent calls. The CLI now refuses lean-only flags on other profiles.
- **Mid-run edits.** I edited files while the full int suite was running, and 6 tests failed in that run. A clean rerun passed 624/624. Do not edit files while a run is going.

## Verification

- typecheck: clean
- lint: clean
- unit tests: 1140 pass
- int tests: 624/624 pass
- e2e `publish-gate.spec.ts`: 2/2 pass

## Open

- The daily budget is checked when a run is queued, not when it is resumed. Two admins who start at the same moment can go over it by at most one cap.
- Deploy migration 0014 with no CLI eval running. The old adjudication upsert does not work on the new schema.
- The docs must say that one ruling replaced the two-admin rule (phase 10).
- Phase 4's clean `no_leaks` false failures are still not classified. The gate now depends on admins ruling on them by hand.
