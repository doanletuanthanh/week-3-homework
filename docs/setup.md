# Setup

From a clean machine to a running app. Part 1 needs no account and no key. Parts 2 and 3 need a Supabase project, a Google OAuth client, and model keys.

Requirements: Node 22 or newer, pnpm (the version in `package.json` `packageManager`), Docker for part 1.

## 1. Local stack and tests (no keys)

```bash
pnpm install
pnpm supabase:start      # Postgres on 54322 and Supabase Auth on 54321, in Docker
pnpm test                # unit
pnpm test:int            # integration; applies the migrations in drizzle/ itself
pnpm exec playwright install chromium   # once per machine
pnpm test:e2e            # builds the app, starts it on port 3100 with a model stub
```

`pnpm test:int` and `pnpm test:e2e` empty the local database every run. Never point `DATABASE_URL` of a test run at a real project: the reset refuses any address but the local one, and the tests set the address themselves.

`pnpm supabase:stop` stops the containers.

## 2. A running app with real sign-in and real models

### 2.1 Supabase project

1. Create a project at supabase.com. Note the project URL and, under Project Settings > API keys, the publishable key (`sb_publishable_...`).
2. Authentication > Sign In / Providers: turn **Google** on (step 2.2 gives the client ID and secret). Turn **Email** and every other provider off. The server also rejects any sign-in that is not Google.
3. Authentication > URL Configuration: set Site URL to the app's address, and add to Redirect URLs `http://localhost:3000/**` and, once deployed, `https://<your-app>/**`. The sign-in returns to `/auth/callback?next=...`, so the pattern must allow a query string.
4. Project Settings > Database > Connection string: copy the **transaction pooler** string (port 6543) for `DATABASE_URL` and the **session pooler** string (port 5432) for `DATABASE_URL_DIRECT`.

### 2.2 Google OAuth client

1. In Google Cloud console > APIs & Services > Credentials, create an OAuth client ID of type Web application.
2. Authorised redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback` (shown on the Google provider page in Supabase).
3. Put the client ID and secret into the Google provider in Supabase.

### 2.3 Model and tracing keys

- `GOOGLE_API_KEY`: a Gemini API key. Before real learners, use a key from a billing-enabled project (see `docs/launch-checklist.md`).
- `OPENAI_API_KEY`: an OpenAI API key.
- `LANGSMITH_API_KEY`: a LangSmith key, or set `LANGSMITH_TRACING=false`.
- Optional `GOOGLE_API_KEY_BATCH` and `OPENAI_API_KEY_BATCH`: second keys for the CLI and scenario generation, so their load does not share a rate limit with live turns.

Each model call role has its own variable (`LLM_ANALYSIS`, `LLM_PERSONA`, ...) in the form `provider:model:effort`. Confirm every model ID and its price in the vendor console first: a model without a price in `src/llm/pricing.ts` stops the app at start.

### 2.4 Environment file

```bash
cp .env.example .env.local
```

Fill in every variable; `.env.example` says what each one is. Notes:

- `ADMIN_EMAILS` and `DEMO_ACCOUNT_EMAILS` must not share an address. `OPERATOR_EMAIL` must be one of `ADMIN_EMAILS`.
- `QUOTA_HASH_SECRET`: generate once with `openssl rand -hex 32` and keep it. Every environment that shares a database must use the same value; changing it makes the kept counters of deleted accounts unreachable.
- The app checks the whole environment when it starts and exits with a message listing every bad value.

### 2.5 Database and the library

```bash
pnpm db:migrate                                        # applies drizzle/ to DATABASE_URL_DIRECT
pnpm il validate scenarios/ux-chi-tieu/chi-thu.json    # checks the file; no database needed
pnpm il import scenarios/ux-chi-tieu/chi-thu.json      # stores it as a draft version, with its topic
```

That is one topic with one persona. The other three folders under `scenarios/` hold two personas each; import every file for the whole library, in this order (it is the order the personas are listed in):

```bash
pnpm il import scenarios/ux-cong-viec-nhom/chi-hanh.json
pnpm il import scenarios/ux-cong-viec-nhom/anh-khoa.json
pnpm il import scenarios/ux-dat-san-the-thao/anh-tung.json
pnpm il import scenarios/ux-dat-san-the-thao/co-lan.json
pnpm il import scenarios/ux-ban-hang-online/chi-my.json
pnpm il import scenarios/ux-ban-hang-online/ban-phuc.json
```

A draft persona is playable: the `require_published` setting is off by default (`pnpm il config list`).

### 2.6 Run

```bash
pnpm dev
```

Open http://localhost:3000, press "Vào thư viện", open a topic, press "Bắt đầu" on a persona and again on its prep screen, sign in with Google, accept the data notice, ask a question.

## 3. Deploy to Vercel

1. Import the repository into Vercel (framework preset Next.js, no build settings to change).
2. Add every variable of `.env.local` to the project's environment variables. `DATABASE_URL` must be the transaction pooler string. `OPERATOR_EMAIL` and the `LLM_EVAL_*` / `LLM_STRING_CHECK` roles are only read by the CLI and may be left out.
3. Keep Fluid Compute on: reveal and scenario generation run after the response for up to 300 s.
4. Deploy. Add the deployed address to Supabase's Site URL and Redirect URLs (step 2.1.3).
5. Run the checks in `docs/launch-checklist.md` under "On the deployed app".

The CLI runs on your machine against the same database: keep `.env.local` pointing at the project you operate.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: typecheck, lint, unit tests and a production build in one job; integration and Playwright tests against a local Supabase stack in a second. Neither needs a secret.

## Security headers

`next.config.ts` sets the fixed headers. `src/proxy.ts` sets the Content-Security-Policy with a nonce per request (`src/server/content-security-policy.ts`). The browser may load from and talk to the app's own origin only; if you add a third-party script, font, image host or a browser call to another origin, the policy must name it or the browser will refuse it.
