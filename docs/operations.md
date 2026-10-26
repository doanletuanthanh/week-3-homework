# Operations

Operators work from the CLI or from the admin console at `/admin`. The console is open to the addresses in `ADMIN_EMAILS`; anyone else gets the same 404 as an unknown address. It has an overview (spend against the caps, a 30-day chart, the costliest roles, session cost), scenario review, learners, custom topics, config and the audit log. CLI commands run on your machine and act on the database `.env.local` points at (`DATABASE_URL_DIRECT`, else `DATABASE_URL`).

```bash
pnpm il help            # every command with its one-line summary
pnpm il <command>       # a command run with wrong arguments prints its usage
```

Commands that change settings or read a learner's data need `OPERATOR_EMAIL` (one of `ADMIN_EMAILS`) and write a line to `admin_access_log`. Messages are in Vietnamese.

The authority for options is each command's own usage line in `cli/commands/`. This page says which command to reach for.

## Author a persona

| Task | Command |
|---|---|
| Check a scenario file against the schema and the authoring rules (FR-33) | `pnpm il validate scenarios/<topic>/<persona>.json` |
| Store it as a new draft version | `pnpm il import scenarios/<topic>/<persona>.json` |

`import` reads `topic.json` from the same folder and writes nothing unless the file passes `validate`. A draft is playable while `require_published` is off.

### Topics and the library

A topic is a folder under `scenarios/` with a `topic.json` and one file per persona. `import` takes one persona file at a time and creates the topic, or overwrites it, from the `topic.json` beside that file.

- `topic.json` needs all of `id`, `title`, `summary`, `role` and `display_order`; `import` refuses the file without one of them. `role` is `ux`, `ba` or `pm` and is the chip the library files the topic under. `display_order` is a whole number from 0: the library and the home page list topics from the lowest up (the four on disk use 10, 20, 30, 40).
- A scenario's `topic_id` must be the `id` of that `topic.json`.
- Two personas of one topic may not share a `topic_tag`. `validate` checks a file against the personas of its topic that are already in the database, so import the first persona before validating the second.
- Inside a topic, personas are listed by the time of their first import. Import them in the order they should appear.
- The library lists a topic while at least one of its personas can be played. A topic leaves it when every persona is pulled or, with `require_published` on, when none is published.

## Evaluate and publish

| Task | Command |
|---|---|
| Run the persona QA agent on the newest version (the lean eval) | `pnpm il eval <persona> [--fast] [--no-cache] [--concurrency N] [--trace]` |
| Calibrate the lean eval: clean personas must pass every run, known-bad mutants must fail their declared row on the changed item | `pnpm il eval-calibrate [--persona <id>] [--operator <key>] [--runs N] [--only clean\|mutants] [--fast] [--yes]` |
| List the leak flags of the newest lean run, read one, rule on it | `pnpm il adjudicate list <persona>`, `pnpm il adjudicate show <flag id>`, `pnpm il adjudicate <flag id> leak\|not-leak "<reason>"` |
| Check the fixed strings automatically (FR-36) | `pnpm il check-strings <persona\|product>` |
| Approve or return fixed strings | `pnpm il approve-strings <persona\|product> [list]`, `... approve <key...>\|--all`, `... return <key> "<note>"` |
| Approve the newest version on its newest finished lean run | `pnpm il approve <persona> "<note>"` |
| Publish if the gate passes; otherwise it lists every reason | `pnpm il publish <persona>` |
| Unpublish; `--stop-sessions` also withdraws its unfinished sessions | `pnpm il unpublish <persona> [--stop-sessions]` |

`/admin/scenarios` does the same from the browser: it starts a lean eval as a background job, shows the report and the probes, takes rulings and approvals, and publishes or unpublishes.

The lean eval asks nothing before spending: `eval_lean_budget_usd` caps one run and `eval_daily_budget_usd` caps the day. By default its Gemini calls go through Batch Mode at half price and a run takes minutes to hours (20–26 minutes measured); `--fast` calls the models directly. Probes that already ran on the same content and models come from a cache, so an unchanged version costs nothing to evaluate again; `--no-cache` runs them again. Tracing is off unless `--trace` is given.

The gate reads only the newest lean run of the exact version. A version is published when it passes `validate`, its lean run is done and meets every threshold but `no_leaks`, every leak flag of that run is ruled `not-leak` (the rulings settle `no_leaks`), its fixed strings and the product's are checked and approved, and an admin approved it on that same run. One ruling settles a flag, and the latest ruling of any admin counts; every ruling is kept. The rules are a table in `src/eval/publish-gate.ts`.

The simulated-interview profiles (`quick`, `full`, `reduced`) and their prompt-only baseline were removed. Their stored runs stay readable for history; the gate ignores them.

## Judgement test sets (NFR-7)

```bash
pnpm il judgement-eval evalsets/turn-verdict.jsonl
pnpm il judgement-eval <file.jsonl> --kind <kind> --scenario <scenario file>
pnpm il judgement-eval evalsets/topic-route.jsonl --batch
```

Runs a hand-labelled set through the production prompt and prints the rates NFR-7 names. Kinds:
- `label-classifier`, `turn-verdict`, `canvas-judge`, `leading-novelty`, `moderation`, `output-safety`.
- `reply-judge`: the lean eval's reply judge.
- `qa-plan`: the lean eval's planner. Each line names its own scenario file and mutation operator, so `--scenario` is not used.
- `guide-check`: the learner guide checker. Each line is one guide, with the label of each question in order; no scenario is used. Gate: leading recall ≥ 90%.
- `topic-route`: which item Call 1 routes a question to, read where code acts on it. Each line names its own scenario file, so one set pools several personas. `expected` is an item id, `broad` (a general question, or one about several topics) or `none` (no topic). Gates over the whole set: wrong-route ≤ 2.1% (one line in 48) and missed ≤ 20%. It also prints the confusion pairs (expected → predicted), which show which tags to rewrite.

The kind is taken from the file name when `--kind` is left out.

`--batch` sends the Gemini calls through Batch Mode at half price, all cases at once. A run then takes minutes instead of seconds. `--concurrency N` sets how many cases run at the same time (default 1, or 64 with `--batch`). It applies to `topic-route`, `label-classifier`, `turn-verdict` and `guide-check`.

Format: one JSON object per line, with an `id`, the input fields of that kind, `expected`, and a free `note`. The files in `evalsets/` are the reference for each kind's fields. A set proves a gate only from 100 lines up; the committed sets are starters of 8 to 24 lines. `topic-route` (56 lines) has its own floor of 48.

## Reading persona replies before and after a prompt change

```bash
pnpm il transcript-run scenarios/ux-chi-tieu/chi-thu.json --turns 10        # prints the estimate, calls nothing
pnpm il transcript-run scenarios/ux-chi-tieu/chi-thu.json --turns 10 --yes  # plays the turns
```

Plays a list of questions through the real turn engine in memory, with no app, no session and no sign-in. The default list is the demo transcript `evalsets/demo/<persona>-transcript.json`; use `--questions <file>` for another one with the same `questions` field. Past the end of the list, the questions start over.

For each turn it prints the question, the reply, its words and sentences, whether it is a list, the opened item, the label, the reply shape Call 2 was asked for (`src/engine/reply-plan.ts`), and for each call the input, output and reasoning tokens, the latency and the cost. From turn 6 it also prints the gist Call 1 wrote for the exchange leaving the 5-exchange window. At the end it prints medians and the gist fill rate (non-empty gists against turns that asked for one). An empty gist is not an error, but that exchange then stays word for word in both prompts, so a low rate means the token savings are lost. Only `llm_call` rows are written, with scope `eval`. A 10-turn run costs about 0.03–0.04 USD on 3.8 Flash.

## Sessions

| Task | Command |
|---|---|
| Print a session turn by turn: analysis, corrections, unlock rules, hook, openness (FR-44). Calls no model | `pnpm il trace <session id>` |
| Play the prepared transcript through the real engine for a demo account, stopping at the result (FR-45) | `pnpm il seed-demo <email> --persona <id> --guess <n>` |
| Measure turn and reveal latency on a deployed app (NFR-2) | `pnpm il measure-latency <url> --session <id>` |

`seed-demo` only accepts an address in `DEMO_ACCOUNT_EMAILS`. Its transcript is `evalsets/demo/<persona>-transcript.json`.

### Measuring latency

1. Sign in to the deployed app with a demo account, accept the data notice, press "Bắt đầu". The address is now `/sessions/<id>`.
2. In the browser's DevTools > Network, open any request to the app and copy the value of the `Cookie` request header.
3. Run:

   ```bash
   IL_MEASURE_COOKIE='<the Cookie header>' pnpm il measure-latency https://<your-app> --session <id>
   ```

   In PowerShell: `$env:IL_MEASURE_COOKIE = '<the Cookie header>'; pnpm il measure-latency https://<your-app> --session <id>`. The cookie is the account's sign-in: do not paste it anywhere else, and it stays in the shell's history unless you clear it. Copy it right after signing in and start the run at once: a run takes minutes, and a sign-in that runs out midway stops it.

It asks the demo transcript's questions, repeated up to 30 turns (`--turns n` for fewer), ends the session, sends a guess at once and waits for the result. It prints each turn, p50 and p95 of the turns, the reveal wait, and whether each meets NFR-2 (turn p95 ≤ 6 s, reveal ≤ 15 s after the guess). One run costs one session and gives one reveal sample; run it several times for a reveal p95. Record the numbers in `docs/launch-checklist.md`.

## Settings

```bash
pnpm il config list
pnpm il config get <key>
pnpm il config set <key> <value>
```

Admins can also edit these at `/admin/config`. The CLI and the console accept the same values. Every change, from either one, writes an `admin_access_log` row (`config set <key>: <old> → <new>`), and `/admin/audit` shows it. Learners, session transcripts and custom-topic requests are at `/admin/learners` and `/admin/custom-topics`, and every read there is logged.

| Key | Default | Meaning |
|---|---|---|
| `require_published` | `false` | Only published persona versions can be played (FR-35). Turned on, the library, the topic page, the home page's library section and the next-persona suggestion show published personas only: with none published the library lists no topic and keeps the way to a topic of one's own |
| `session_daily_cap_usd` | `5` | LLM spend of sessions per day (UTC+7). At the cap, new sessions and guide checks are refused |
| `session_demo_reserve_usd` | `1` | The part of the cap kept for demo accounts |
| `custom_path_enabled` | `true` | The switch of "Tạo chủ đề của bạn" (FR-56) |
| `generation_daily_budget_usd` | `10` | LLM budget of scenario generation per day, apart from the session cap. One account may use 20 % |
| `generation_reserve_usd` | `1` | Held for each generation attempt; the attempt stops when it has spent this |
| `eval_lean_budget_usd` | `0.1` | Cap of one lean eval run. The agent drops its optional probes as it nears the cap, and the run stops at it |
| `eval_daily_budget_usd` | `5` | LLM budget of evaluation per day (UTC+7), apart from the session cap. A lean run is not started when the day's eval spend plus its cap would go over it; calibration counts against it |
| `guide_checks_per_day` | `5` | Guide checks (`/guide-check`) per account per day (UTC+7). Each check is one ANALYSIS call charged to the session scope with no session id, so the per-session cost report leaves it out but the daily cap counts it. A check whose call failed still counts. Demo accounts are not limited. `0` turns checks off |

A change takes effect on the next request. The defaults are placeholders for a small pilot, not measured values.

## Cost

- **Sessions.** Every model call of a session is a row in `llm_call` with its cost. The day's total is compared with `session_daily_cap_usd` when a session starts. At the cap: learners get "Hôm nay InterviewLab đã hết chỗ cho buổi luyện mới. Quay lại sau 0 giờ đêm nay."; sessions that exist run to their end, reveal and replay included; demo accounts still start until the reserve is spent too; a custom session that has not had its first question is refused at that question. To close the day early, set the cap to what has been spent plus the reserve; the query under this list reads what has been spent. `tests/server/cost-cap.int.test.ts` holds each of these cases.
  ```sql
  -- Session spend since midnight in Vietnam. `daily_spend` keeps the spend of deleted accounts.
  SELECT COALESCE((SELECT sum(cost_usd) FROM llm_call WHERE scope = 'session'
                   AND created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh'), 0)
       + COALESCE((SELECT sum(usd) FROM daily_spend WHERE scope = 'session'
                   AND day = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date), 0) AS spent_usd;
  ```

- **Custom topics.** A separate daily budget. An attempt reserves `generation_reserve_usd` before it starts and gives back what it did not spend. When the budget cannot hold another reserve, new attempts are refused and sessions are not affected.
- **Evaluation.** A lean run measured 0.039–0.055 USD per persona in batch mode (calibration included) and 0.083–0.092 USD with `--fast`, on the curated personas; an unchanged version costs 0. A calibration of all 7 personas cost about 3.85 USD (`plans/reports/calibration-261015-lean-eval.md`). `pnpm il cost-report [--days n] [--run <id>]` prints spend by scope, role, day, session and eval run, from `llm_call`, without calling a model.
- **Tracing.** The LangSmith free plan holds 5,000 traces a month and a session is up to about 70.

## Custom topics

| Task | Command |
|---|---|
| The newest requests | `pnpm il custom list [--limit N]` |
| Pass rate and cost per playable scenario, and whether the switch-off rule is met | `pnpm il custom stats` |
| Take a generated scenario down; its unfinished sessions become `withdrawn` | `pnpm il custom takedown <scenario id> --reason <reason>` |
| Give a learner's free scenario back | `pnpm il custom refund <learner id>` |
| Pause or reopen the whole path | `pnpm il config set custom_path_enabled false\|true` |

A generated scenario is only lightly checked: `validate` (a failure is repaired, at most twice), a routing check of its topic tags, and an output safety check. It is not played before the learner gets it. The attempt page under `/admin/custom-topics` lists each repair and any tags the routing check could still not tell apart; such a scenario still passes. The report button on its result screen and `custom takedown` are the controls after the fact.

## Do not lose evaluation data

`pnpm test:int` and `pnpm test:e2e` empty the local database. If you ran `pnpm il eval` against the local stack, its runs, rulings and string approvals are deleted by the next test run. Run evaluations you want to keep against a real project.
