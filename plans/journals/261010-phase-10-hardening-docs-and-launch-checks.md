# 2026-10-10 · Phase 10: Hardening, docs, launch checks

Work history, not product authority. Decisions live in the phase file and `plan.md`.

## What shipped

- Cost cap proven by `tests/server/cost-cap.int.test.ts`: new sessions blocked with the message, running sessions finish reveal and replay, demo accounts still start, a custom session is refused at its first question, the generation budget is apart.
- Security headers in `next.config.ts`; a Content-Security-Policy with a nonce per request in `src/proxy.ts`.
- Learner text with `<script>` and `<img onerror>` shown as text in the question, the notes and the custom-topic fields: unit tests on the components, Playwright on the screens.
- `/phuong-phap` answers 404 and nothing links to it.
- Accessibility notes of the phase 8 review: dialogs name their consequence sentence, the loading state has a status line, "Tải thêm" says what it added and moves focus, one transcript row component.
- `pnpm il measure-latency`: plays a session over HTTP on a deployed app and prints turn and reveal latency.
- `.github/workflows/ci.yml`; `README.md`, `docs/setup.md`, `docs/operations.md`, `docs/launch-checklist.md`.

Verified: typecheck, lint, 920 unit, 528 integration (the cap and session files again after the last fixes), 233 Playwright on a production build. Nothing was deployed: latency, the phone demo and the auth tables of the real project are open.

## What went wrong, and what it taught

- **The cap let one more session start on an exact cent.** `spent < cap - reserve` in floating point: `1.3 - 1` is above `0.3`. My first test hid it twice: it rounded the spend down, and it used 0.25, which is exact in binary. The reviewer found it with a probe over 2,000 cent values. A boundary test has to use the values an operator types, not the ones that make the arithmetic clean.
- **`page.evaluate` is not bound by the page's policy.** `new Function` ran inside it under a policy that forbids it, and the test read that as "eval is allowed". A string handed to `setTimeout` is judged by the page's own policy, and that is what the test uses now.
- **A locator by name matched the wrong button.** "Lượt 1" also matched "Quay lại lượt 1" and started a replay. Exact names for buttons whose words are part of another button.
- **A test that already failed was found only by the full run.** `interview-screen.spec.ts` read `main` right after a reload, when the loading state and the screen are both on the page. It failed on the commit before this phase too; running that commit was the only way to know it was not this phase's doing.
- **Two announcements would not have been read out.** The status line sat inside `aria-busy`, and the second "Tải thêm" wrote the same sentence as the first. Both passed their tests, which looked at markup. Neither has been heard through a screen reader yet.
- **Two docs claims did not hold**: queries with `psql` variables sent to the SQL editor, and "set the cap to what was spent" with no way to read what was spent.
- **The shell hook blocks `node_modules`, `.next` and the word `build`.** The bundled Next.js docs could not be read, so the nonce wiring rests on what Playwright saw on a production build. A dev server's own log could not be read either.

## Decisions taken along the way

- Nonce and `strict-dynamic` for scripts; inline styles allowed, because components size blocks with `style` attributes.
- `form-action` names the auth server and Google: the sign-in form posted before scripts load follows those redirects.
- CI starts the Supabase stack: the tests need the `auth` schema. A build needs no environment.
- `measure-latency` takes a session started in the browser and the account's cookie; it refuses plain http outside localhost and never repeats the cookie.
- The end-session dialog gets no description: it has no consequence sentence, and adding one is new product text.
- The skeletons dropped `aria-busy` rather than keep a status line inside it.

## The day after: "404, This page could not be found" on a session

Reported by the user on `localhost:3000/sessions/<id>` after signing in.

- The session existed, belonged to the account, and its scenario was visible to it. The code path could not answer "not found" for it.
- The running dev server answered the default 404 for every route with a parameter, signed in or not, `/prep/chi-thu` included; routes without one worked. The production build served all of them.
- After stopping that server and starting `next dev` again, the same requests answered as they should (200, and 307 to sign-in).
- **Not known: what put the dev server in that state.** It had been started after the last change of this phase. Its log is under `.next`, which the shell hook does not let me read. If it happens again, the log is the place to look.
