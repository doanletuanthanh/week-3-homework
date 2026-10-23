# Measuring the wrong-topic unlock before fixing it (chat agent plan, phase 1)

2026-10-23 · branch `main` · one paid batch run, 0.051 USD, plus 0.002 USD lost

## What shipped
- The `topic-route` judgement kind with one set of 56 hand-labelled questions over three personas (chị Thu, cô Lan, chị Hạnh). It reads `planTurn().analysis.tag_item_id`, the item code acts on, so the same set measures today's prompt and the routing rebuilt in phase 2.
- `judgement-eval --batch --concurrency`. The runners for labels, verdicts, guides and routes now go through `mapPooled`, and the QA graph and calibration use it too.
- `il transcript-run`. It plays a fixed question list through the real turn graph in memory, with no app needed. It prints each reply with its words, sentences, tokens, latency and cost, and shows the estimate unless `--yes` is given.

## What the baseline showed
The router opens the wrong item, or opens one when it should open none, on 16.1% of the questions (9/56), against a 2.1% gate. It misses no direct question (0/36).

All nine errors are general questions forced onto a single tag. Three times it was `tried-methods`, from "kể em nghe chuyện ghi chép chi tiêu đi". There were no confusions between sibling tags. So the critical weakness is not that tags look alike. It is that the prompt makes the model choose exactly one tag, and the code then opens a surface item on that tag alone. That is what phase 2 removes.

## What went wrong
- **The Supabase project was unreachable.** The pooler answered "tenant/user not found", most likely a free project paused after 8 idle days. The CLI pays for the model call first and writes `llm_call` after. So the transcript run crashed after its first billed call. The batch run crashed as well, but only after its job had succeeded.
- **Rescue:** a batch job keeps its responses, and our requests are queued in case order. A scratch script fetched the job, mapped response i to case i, and scored it with the repo's own `planTurn` and `scoreTopicRouteSet`. Nothing was paid twice.
- **Rule from now on:** no paid CLI run while the configured database is down.

## Small things worth remembering
- `sentenceCount` first counted "Ờ… để chị nhớ coi." as two sentences. An ellipsis is a spoken pause, and the test caught it before any paid run.
- One QA graph test runs five scripted QA runs. It takes about 2 s alone but passed 5 s under full-suite load with Docker up, so its timeout is now 15 s.
- Review (8/10) flagged three arguable lines (ch-15, cl-12, ct-11). The user kept them. Two of them are among the nine errors; without them the rate is 13%, so the conclusion stands.
- Scripts run from the scratchpad cannot resolve the repo's npm packages. Use `process.loadEnvFile` instead of `dotenv` there.
