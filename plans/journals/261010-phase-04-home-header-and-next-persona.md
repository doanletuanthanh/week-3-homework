# 2026-10-10 · Library plan, phase 4: Home, header and next persona

Work history, not product authority. Decisions live in the phase file and `plan.md`.

## What shipped

- Header: "Thư viện" for everyone. A learner's folded menu on a phone has it beside "Buổi của tôi"; a visitor's one link stays next to "Đăng nhập". Marked on `/library`, and (without `aria-current`) inside a topic.
- Home page as the `Main` artboard has it: "Vào thư viện" and "Tạo chủ đề của bạn", the first three topics of the library with no one's progress, step 1 "Chọn chủ đề và persona", and the closing band. It no longer depends on a persona existing.
- Reveal item 7: `pickNextPersona`'s three outcomes on screen. A persona of the same topic, then of another topic of the role ("Luyện tiếp với …" to its prep screen); "Bạn đã luyện mọi persona của vai trò này." only when the role has personas; for a role with none, just the library and the waitlist.
- Empty "Buổi của tôi" leads to the library. Màn 3 of a persona that cannot be started leads back to its topic.
- `getFirstPersonaId` is gone: no link names a persona by "the first one".
- 9 product strings in the fixed-string check.

Verified: typecheck, lint, 988 unit, 577 integration. Playwright full suite: 294 of 295 on the phase's code; the one failure was a 43px link where the test asked for 44px on a phone. After that CSS fix the spec of this phase and the responsive spec passed (22 tests). The full suite was not run again after that one-line change. No migration and no new environment variable.

## What went wrong, and what it taught

- **Two touch targets were too small on a phone.** The visitor's header link (35px, then 43px after padding alone) and the suggestion's button (not full width, because the card aligns its children to the start). Both were caught by size assertions written with the spec, not by looking. A line box with padding does not add up to a round number; a minimum height does.
- **A home page with two "Tạo chủ đề của bạn" links** broke one old test that asked for "the" link. Tests of the home page now say which part of the page they mean.
- **The plan's prop shape lost information.** `next | null` cannot tell "all practised" from "the role has no persona", which the user had decided must read differently. The component takes the three-outcome value.
- **Tests need a second and third persona that the repo does not have yet.** A helper imports copies of chị Thu under other names and removes them, with their sessions and topics, in a `finally`. If a run is killed between the two, later specs see extra personas until the next global setup resets the database.

## Left open

- No code review for this phase: the user moved it to after phase 6, for phases 4 to 6 together.
- Settled the same day: `topic_opened` counts visits. One event per learner and topic within 30 minutes, checked on the server, so a reload, a return or a repeated request adds nothing. "One session" was read as that window; the server knows no browser session.
- Two tests of account deletion failed in two full integration runs made while the machine was slow (the suite took over six minutes instead of one), passed alone, and passed in the third full run (579 of 579). Not traced to a cause.
- The home page's reveal preview is still the skeleton placeholder, until a real `seed-demo` run exists (plan decision).
- `pnpm il check-strings product` and `approve-strings product` on each database before the next `il publish` (28 strings since phase 2).
