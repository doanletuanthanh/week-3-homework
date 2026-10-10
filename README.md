# InterviewLab

A Vietnamese web app for practising user interviews. A learner interviews an AI persona that holds 8–12 things it will only say when asked well, takes notes, guesses how much it was told, then sees what the persona told (KHAI THÁC) and what the notes caught (NHẬN BIẾT), replays the moment it missed, and takes home a habit sheet. Personas are grouped into topics in a library with a role filter (UX, BA, PM). A learner can also have a persona generated for a topic of their own.

Next.js 16 (App Router) on Vercel, Supabase Postgres and Auth (Google sign-in), LangGraph JS with Gemini and OpenAI models, LangSmith tracing. The reasons for each choice are in [docs/tech-stack.md](docs/tech-stack.md).

## Quick start

Needs Node 22 or newer, pnpm, and Docker (for the local Supabase stack the tests use).

```bash
pnpm install
pnpm supabase:start        # local Postgres + Auth in Docker
pnpm test                  # unit tests, no services needed
pnpm test:int              # integration tests against the local stack
pnpm test:e2e              # Playwright: builds the app, runs it against the local stack and a model stub
```

The three test commands need no key and spend nothing. To run the app with real sign-in and real models, follow [docs/setup.md](docs/setup.md).

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | The app on http://localhost:3000, reading `.env.local` |
| `pnpm typecheck`, `pnpm lint` | TypeScript and ESLint |
| `pnpm test`, `pnpm test:int`, `pnpm test:e2e` | Unit, integration, end-to-end tests |
| `pnpm db:generate`, `pnpm db:migrate` | Write a migration from `src/db/schema.ts`; apply migrations to `DATABASE_URL_DIRECT` |
| `pnpm il <command>` | The operator CLI: scenarios, evaluation, publishing, config, custom topics. See [docs/operations.md](docs/operations.md) |

## Where things are

| Path | Holds |
|---|---|
| `src/app` | Pages and route handlers |
| `src/engine` | The turn engine: unlock rules, openness, reveal and replay logic. No I/O |
| `src/graphs`, `src/llm` | LangGraph graphs, model calls, prompts |
| `src/server` | Request-level services: sessions, turns, reveal, replay, custom topics, cost cap |
| `src/db` | Drizzle schema and the repository layer; `drizzle/` holds the migrations |
| `cli` | The operator CLI |
| `scenarios` | One folder per library topic: `topic.json` and its persona files; `evalsets` holds the judgement test sets and the demo transcript |
| `tests` | `*.test.ts(x)` unit, `*.int.test.ts` integration, `e2e/*.spec.ts` Playwright |

## Docs

- [docs/setup.md](docs/setup.md): from a clean machine to a running app, local and on Vercel.
- [docs/operations.md](docs/operations.md): the operator CLI by task, the test-set format, cost notes.
- [docs/launch-checklist.md](docs/launch-checklist.md): what is done, what is measured, what is still open before real learners.
- [docs/tech-stack.md](docs/tech-stack.md): the stack and where it departs from the PRD.
- Product requirements: `_bmad-output/planning-artifacts/prds/prd-week-3-project-2026-09-24/prd.md` and `addendum.md`. Design: `docs/design/`.
