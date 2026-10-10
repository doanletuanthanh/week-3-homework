# 2026-10-10 · Library plan, phase 3: Topic screen and persona cards

Work history, not product authority. Decisions live in the phase file and `plan.md`.

## What shipped

- Màn 2b at `/topics/[topicId]`, readable by a guest: breadcrumb, role label, persona count, the FR-51 warning, and one card per playable persona with the label and button of PRD §7. A demo account's card also has "Bắt đầu buổi mới". A topic the learner made carries "Kiểm tra nhẹ" and the AI line. Unknown topics and another learner's own topic are one 404.
- `PersonaAvatar` reads `avatar_key`: chị Thu keeps her drawing, every other persona shows the initial of its given name on a neutral tone. Threaded through Màn 3, the interview bar and "Buổi của tôi".
- Màn 3's breadcrumb is "Thư viện › topic (linked) › persona" for a curated persona.
- `topic_opened` for consenting learners, sent by the page once it is on screen.
- 6 product strings (`TOPIC`) in the fixed-string check.

Verified on the final code: typecheck, lint, 970 unit, 576 integration. Playwright: the full suite ran once before the review fixes, 279 of 280 (the one failure was an old assertion on the list API that needed the two portrait fields). After the fixes the topic, library, my-sessions and access-isolation specs passed (65 tests), and the topic spec passed twice in a row. The full suite was not run again after the review fixes. No migration and no new environment variable.

## What went wrong, and what it taught

- **The plan's "record the event in the render" could not work here.** The page refreshes itself once shown, so the back button never shows a stale card; that refresh is a second render. Seen while reading `RefreshOnShow`, before any test. The event moved to a client effect calling a server action, with every guard on the server.
- **A test that passed by racing a redirect.** A session with no question redirects from its URL to Màn 3. The first version asserted the session URL and passed on the instant before the redirect; the second run caught it. It now asserts where the learner ends up.
- **A test read a count before the write it depended on.** The isolation test took its event baseline while the owner's own event was still on its way. It waits for that row first.
- **Shell heredocs with Vietnamese text and backticks failed to parse twice** in this environment. Edits went through script files after that.
- **`node_modules/next/dist/docs/` is denied by a hook on this machine**, so the repo rule to read it first could not be followed. The page copies the patterns of `library`, `my-sessions` and `prep`.

## From the review

No Critical or High. Fixed: "Bạn đã luyện" now counts as the library does (a demo account could read 0/1 here and 1/1 there); the avatar tone ignores case; the initial is always a letter; each card is a region named by its persona; a back-button step in the event test. Report: `plans/reports/code-reviewer-261010-1730-phase-03-topic-screen-and-persona-cards.md`.

## Left open

- What `topic_opened` counts. Today: every time the page is shown, a reload and each return included, with no limit on the server. A consenting learner who replays the request can write as many rows as they like. Needs a decision before the event is used as a metric.
- Màn 3 of a pulled persona still offers "Về trang chủ"; the PRD wants the way back to the topic. Phase 4 touches that screen.
- Not tested: the foot of a demo card (two buttons) on a phone; a key list for the interview screen's `persona` payload.
- `pnpm il check-strings product` and `approve-strings product` on each database before the next `il publish` (19 strings since phase 2).
