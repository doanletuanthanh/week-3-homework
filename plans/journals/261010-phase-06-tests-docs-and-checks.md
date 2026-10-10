# 2026-10-10 · Library plan, phase 6: Tests, docs and checks

Work history, not product authority. Decisions live in the phase file and `plan.md`.

## What shipped

- The security headers and the Content-Security-Policy walk cover `/library` and `/topics/[id]`, by the links and through a role chip's form post.
- The home page, the library and a topic: one `h1`, Tab reaches every link and button in page order with an outline, at 1280px and on a Pixel 7.
- A visitor's presses on the role filter and visits to a topic write nothing but the `il_role` cookie; a learner's own topic is in nobody else's library.
- Two unit tests: what the docs point at exists (files, `pnpm il` commands, package scripts) and the launch checklist counts the library on disk; no fixed string breaks the wording rule of NFR-14.
- `docs/launch-checklist.md`, `docs/operations.md`, `docs/setup.md`, `docs/design/README.md`, `README.md` and the bootstrap plan no longer say there is no library.

Verified: typecheck, lint, 1074 unit, 601 integration, 316 Playwright on a production build, `pnpm build`. The real database has all 13 migrations; this phase adds none.

## What went wrong, and what it taught

- **The checklist I wrote gave a command that approves nothing.** `pnpm il approve-strings product` without `approve` only lists. I copied it from `plan.md` instead of reading the command; the reviewer read the command. The test I had just written for the docs checks that a command exists, not that its arguments do what the sentence says.
- **The string count was wrong in three files** (28, in truth 29): each phase note had added to the one before without counting the keys.
- **Two integration tests sat at 3.3 s of a 5 s limit** and failed only in the full run. Their scenes approve every fixed string in turn, so every string a phase adds makes them slower. Run alone they pass, which is how they stayed unnoticed for three phases.
- **The first full Playwright run died at test 178**, the machine out of memory. Everything after it failed in 0 ms: a list of fourteen failures that were one stopped server.
- **Fixtures imported before their `try`** would have left personas in the shared database on a failed import, and failed five unrelated specs after it.
- **My first sentence about the design table said every screen is built.** I had checked two rows.

## Decisions taken along the way

- The keyboard rule is a Playwright test, not a check by hand: it fails on a skipped element, a wrong order or a removed outline. It does not see a ring that is clipped or the colour of its background.
- `check-strings product` was not run: it calls a model and writes to the database it is pointed at. It stays a user task.
- Tests of the real personas read the number of items from the file, since three personas are due for tuning.
