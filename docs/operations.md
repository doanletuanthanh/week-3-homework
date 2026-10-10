# Operations

Everything an operator does is a CLI command; there is no Review Console in this slice. Commands run on your machine and act on the database `.env.local` points at (`DATABASE_URL_DIRECT`, else `DATABASE_URL`).

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

## Evaluate and publish

| Task | Command |
|---|---|
| Quick simulated interviews while tuning | `pnpm il eval <persona> --profile quick` |
| The full evaluation (FR-34) | `pnpm il eval <persona> --profile full` |
| Continue a run that stopped | `pnpm il eval --resume <run id>` |
| List the leak flags of the full run, read one, rule on it | `pnpm il adjudicate list <persona>`, `pnpm il adjudicate show <flag id>`, `pnpm il adjudicate <flag id> leak\|not-leak "<reason>"` |
| Check the fixed strings automatically (FR-36) | `pnpm il check-strings <persona\|product>` |
| Approve or return fixed strings | `pnpm il approve-strings <persona\|product> [list]`, `... approve <key...>\|--all`, `... return <key> "<note>"` |
| Publish if the interim gate passes; otherwise it lists every reason | `pnpm il publish <persona>` |
| Unpublish; `--stop-sessions` also withdraws its unfinished sessions | `pnpm il unpublish <persona> [--stop-sessions]` |

A full run asks for confirmation with a cost estimate (`--yes` skips the question). Tracing is off during a run unless `--trace` is given. Each admin records their own ruling; two are needed.

## Judgement test sets (NFR-7)

```bash
pnpm il judgement-eval evalsets/turn-verdict.jsonl
pnpm il judgement-eval <file.jsonl> --kind <kind> --scenario <scenario file>
```

Runs a hand-labelled set through the production prompt and prints the rates NFR-7 names. Kinds: `label-classifier`, `turn-verdict`, `canvas-judge`, `leading-novelty`, `moderation`, `output-safety`; the kind is taken from the file name when `--kind` is left out.

Format: one JSON object per line, with an `id`, the input fields of that kind, `expected`, and a free `note`. The files in `evalsets/` are the reference for each kind's fields. A set proves a gate only from 100 lines up; the committed sets are starters of 8 to 18 lines.

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

| Key | Default | Meaning |
|---|---|---|
| `require_published` | `false` | Only published persona versions can be played (FR-35) |
| `session_daily_cap_usd` | `5` | LLM spend of sessions per day (UTC+7). At the cap, new sessions are refused |
| `session_demo_reserve_usd` | `1` | The part of the cap kept for demo accounts |
| `custom_path_enabled` | `true` | The switch of "Tạo chủ đề của bạn" (FR-56) |
| `generation_daily_budget_usd` | `10` | LLM budget of scenario generation per day, apart from the session cap. One account may use 20 % |
| `generation_reserve_usd` | `1` | Held for each generation attempt; the attempt stops when it has spent this |

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
- **Evaluation.** A quick run of chị Thu cost about 0.67 USD. A full run is 2,000 or more calls, roughly 20–40 USD.
- **Tracing.** The LangSmith free plan holds 5,000 traces a month and a session is up to about 70.

## Custom topics

| Task | Command |
|---|---|
| The newest requests | `pnpm il custom list [--limit N]` |
| Pass rate and cost per playable scenario, and whether the switch-off rule is met | `pnpm il custom stats` |
| Take a generated scenario down; its unfinished sessions become `withdrawn` | `pnpm il custom takedown <scenario id> --reason <reason>` |
| Give a learner's free scenario back | `pnpm il custom refund <learner id>` |
| Pause or reopen the whole path | `pnpm il config set custom_path_enabled false\|true` |

A generated scenario is only lightly checked: `validate` and an output safety check. It is not played before the learner gets it. The report button on its result screen and `custom takedown` are the controls after the fact.

## Do not lose evaluation data

`pnpm test:int` and `pnpm test:e2e` empty the local database. If you ran `pnpm il eval` against the local stack, its runs, rulings and string approvals are deleted by the next test run. Run evaluations you want to keep against a real project.
