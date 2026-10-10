# 2026-10-10 · Library plan, phase 2: Library screen and role filter

Work history, not product authority. Decisions live in the phase file and `plan.md`.

## What shipped

- Màn 2 at `/library`, readable by a guest: role chips, the grid of curated topics, the "Không thấy chủ đề bạn cần?" tile, the empty state of a role, and for a learner "Chủ đề bạn tự tạo".
- The filter is one form posting `selectRoleFilter`. `chooseRoleFilter` reads the value from the closed set; a consenting learner's choice goes to `user.role_filter` with one `role_filter_selected` event, in one transaction. A guest, and a learner who has not accepted the data notice, get the `il_role` cookie only.
- `toOwnTopicCard`: a custom topic's card opens Màn 11 while it is prepared or did not pass, and `/topics/[id]` once it can be played.
- 13 product strings (`ROLE_LABEL`, `LIBRARY`) in the fixed-string check.

Verified: typecheck, lint, 941 unit, 565 integration, Playwright 254 of 255 on the full run. The one failure was the sealed-content test of this phase, rewritten after the run; the library and hardening specs then passed on the final code (37 tests). The full suite was not run again after that last change, and its build may predate two small edits to the page (stale-attempt sweep, refresh for learners only). No migration: the deployed database was already at `0012`.

## What went wrong, and what it taught

- **Two lines of the plan excluded each other.** "A skeleton while loading" and "works with JavaScript off": a Suspense boundary sends the content in a hidden block that an inline script swaps in, so without scripts the skeleton stays. Found by the JavaScript-off test, not by reading. Kept the skeleton (PRD); the test now blocks the script bundles and proves the chips work as plain form posts. The user has to confirm.
- **Assertions raced the skeleton.** Reading the pressed chips right after a reload returned nothing: the grid had not replaced its skeleton yet. Every such check now waits for the four chips first.
- **A test that could pass on nothing.** The first sealed-content test read response bodies inside an event handler and turned an unreadable body into an empty string. The reviewer saw it; removing the `catch` showed the bodies really were unreadable once the page moved on. It now asks for the page itself, as a document and as the data of a client navigation, and requires the topic title in each answer. The body of the action's own answer cannot be read from the browser at all.
- **The plan's precedence rule has a hole.** `user.roleFilter ?? cookie` cannot tell "never chose" from "cleared", and the cookie is written for learners too. A filter cleared in one browser comes back from another's cookie. Built as the plan says; open before phase 4.
- **The library skipped what "Buổi của tôi" does first.** It listed a learner's topics without closing attempts whose runner died, so a card could say "Đang chuẩn bị" for nothing. One line, found in review.

## Left open

- Role filter source for a learner (review M1), and the JavaScript-off deviation.
- `pnpm il check-strings product` and `approve-strings product` on each database before the next `il publish`.
- Topic cards link to `/topics/[id]`, which phase 3 builds.
