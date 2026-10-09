# 2026-10-09 · Phase 9: Custom topics

Work history, not product authority. Decisions live in the phase file and `plan.md`.

## What shipped

Not committed yet.

- Màn 10 (`/custom-topic`): topic, optional focus, limits line, every blocked state.
- One moderation call inside the submit request; a refusal creates nothing.
- Background runner: generate, `validate` with two feedback loops, output safety check, reduced eval, gate. Fenced by a run token, a heartbeat, a 270 s deadline and a cost meter.
- Limits of FR-56, a generation budget apart from the session cap, and a sweep that closes dead attempts wherever a limit is read.
- Màn 11, the custom labels on every session screen, the report button, first-turn cost cap.
- `il custom list | stats | takedown | refund`, and three config keys including the kill switch.
- Starter test sets for moderation and output safety, wired into `il judgement-eval`.

Verified: typecheck, lint, 886 unit, 515 integration, 216 Playwright. Real models were used for two measurements only; the real database was not touched.

## What went wrong, and what it taught

- **The gate rejects everything with real models.** 0 of 10 sample topics pass; chị Thu fails it too. The code is done and the feature is not usable. This was visible in the first timing run, before most of the code existed: a cheap measurement on an authored persona told more than the plan's risk list.
- **A dead attempt of another learner held budget.** The pre-check swept only the caller's own attempts. An integration test with two learners found it; a single-learner test never would.
- **The test double ignored an aborted signal**, so the cost-meter test passed a run that should have stopped. A fake provider has to refuse what a real one refuses.
- **Seven episodes share the scripted models in no fixed order.** Queue-based scripted models cannot serve them; the fakes answer from role and prompt instead.
- **Constraints failed open.** An unknown constraint name was dropped and the topic generated without bounds. The review caught it. A closed set that is clamped needs a decision for the "asked for something I cannot read" case.
- **Four existing tests encoded contracts this phase changes on purpose** (kept-row columns, config list, env roles, route table). Each was updated to the new contract, not loosened.
- **The generator needs more than 45 s** at medium effort: 4 of 10 real attempts died there.

## Decisions taken along the way

- No runner takeover: a dead runner means a system error, which costs the learner nothing.
- The budget is serialised with an advisory lock, the learner with their row lock, always in that order.
- `focus_raw` lives on the attempt; the session carries only the closed-set focus.
- The 10-topic run used the graph without a database, so it could run before the migration reaches the real project.

## Later the same day: the redesign

The user asked for a cheaper, looser, cut-off-proof design and chose to drop the reduced evaluation.

- Pipeline is now generate → `validate` → safety. Three real topics: 3 of 3 pass, 32–75 s, 0.018–0.046 USD (was 155–214 s, about 0.45 USD, 0 of 10).
- The validated scenario is stored on the attempt; an attempt is up to three runs of at most 270 s inside the PRD's 10 minutes; the polling screen, the session page and the session list start the next run.
- **What it taught:** 95 % of the cost and most of the time was a check that passed nothing. The measurement on chị Thu showed that on the first day; building the gate anyway cost a day of code that is now deleted.
- **A takeover changes what "stale" means.** Every test that used an old heartbeat to mean "dead for good" had to be rewritten: an old heartbeat now means "someone else may go on", and only the deadline or the run count ends an attempt.
- **A cut-off function cannot be produced from a browser.** The Playwright test for resuming rewinds a finished attempt to the state such a run leaves; the takeover test only ages the heartbeat of a live run.
- Not known: how generated personas behave in a real session. Nothing automated looks at that any more.
