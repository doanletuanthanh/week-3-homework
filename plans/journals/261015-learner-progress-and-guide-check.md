# Learner progress and the guide checker (phase 9)

2026-10-15 · branch `feat/lean-eval-admin` · one paid run, 0.045 USD

## What shipped
- `/progress`: the learner's last 10 sessions with a result, as trends, plus the habit to work on. It is computed from the stored reveal and from Call 1's checked labels. No model call.
- `/guide-check`: a developer pastes the questions they plan to ask real users of their app idea. One ANALYSIS call labels each question `leading`, `compound`, `hypothetical_future`, `closed` or `open`, with a fix hint. The app idea, when given, is moderated first. There are 5 checks per day, and the spend counts against the session cap. The database keeps counts only.

## Budget
The user's Gemini credit is ~30k VND, and they approved exactly one paid run. With 32 guides and 131 questions it gave leading recall 36/36 and labels 131/131, for 0.045 USD (about 1,150 VND). Making each line of the set a whole guide, rather than a single question, cut the calls fourfold for the same number of labelled questions.

## What review caught
The first version gave a check back when its call failed. That sounds kind, but those attempts were already billed. A guide built to break the schema (or a prompt injection) would then run without limit and drain the shared session cap, so nobody could start a session that day. Now a failed check counts. A reply longer than 40 questions is cut in code rather than refused by the schema, so it never turns into three billed retries.

## Small things worth remembering
- `LABEL_DEFINITIONS` was split per label for reuse. Before relying on that, I checked that the joined Call 1 text is byte-identical to HEAD.
- The e2e stub found `<bo_cau_hoi>` in the system prompt's rules before the data block. It now anchors on the block's own opening line.
- `dataBlock` rewrites `</b>` as `<\/b>` inside learner text. That is correct, but it surprised an XSS test that used a closing tag.
- Do not run `pnpm test:int` while e2e runs: both reset the same local database.
