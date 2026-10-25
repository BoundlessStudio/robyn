# Setup

This app runs on two secrets you supply (both behind a login, so a human must fetch them):

- **`AGENT37_API_KEY`** (`sk_live_…`) — Agent37 dashboard → **Cloud → API keys**. Then
  **fund the wallet** (Cloud → Billing): creating an agent costs real money, and an empty
  wallet returns a `402` at create time.
- **`SUPABASE_ACCESS_TOKEN`** (`sbp_…`) — [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) (~30s).

`npm run setup` does everything else: creates a free Supabase project (or configures the one
whose URL you paste into `NEXT_PUBLIC_SUPABASE_URL`), runs the migration, enables email auth,
and writes the Supabase URL, anon key, and **server-only service-role key** back into
`.env.local`. (Clients never touch the DB directly — the app reads/writes every table server-side
with the service-role key; see [`AGENTS.md`](AGENTS.md).) It's idempotent and fills only blank
values. Per-variable docs live in [`.env.example`](.env.example).

## Migration history and existing installations

Setup records each complete filename and its SHA-256 checksum in the private
`robyn_setup.migrations` ledger. It applies only the remaining suffix, under one
database transaction and lock. A failure rolls back the whole suffix; a retry
after a lost response skips committed work. Changed or missing applied files,
or migrations inserted before an applied file, stop setup before application SQL
runs. Add corrections in a new migration. Checksums normalize CRLF to LF.
Both `0007_assignment_dispatch.sql` and `0007_storage_object_names.sql` are distinct
entries; do not rename them or use the numeric prefix alone as a version.

Older installations have no ledger. Setup refuses to replay their schema. Verify
the last **fully applied** file against the deployment/migration record and the
database, then baseline it once. The reviewed October 25 pilot is through
`0017_budget_queue_slots.sql`:

```bash
npm run setup -- --no-create --baseline 0017_budget_queue_slots.sql
```

This explicitly records the verified prefix without executing it and applies any
later files atomically. It does not infer schema state, repair a partially applied
migration, or make an unknown database current by marking every file applied. If
the old setup already failed during replay, restore or repair its regressed
definitions before baselining. Do not baseline such a database from column
existence alone. On subsequent runs, use `npm run setup` normally. Keep the ledger
in database backups; do not clear it to bypass checksum errors.

## For your coding agent

The README tells adopters to paste a one-liner that points here. If you're that agent, follow
these steps in order; don't skip the checks.

1. **Scaffold.** Run `npm install`, then `npm run setup` once. On a fresh clone this creates
   `.env.local` from `.env.example` and exits asking for two secrets — that exit is
   **expected**, not an error.
2. **Ask me for the two secrets.** You can't fetch them (both are behind a login). Print where
   to get each, then stop and wait for my reply:
   - `AGENT37_API_KEY` (starts with `sk_live_`): Agent37 dashboard → Cloud → API keys
     (<https://www.agent37.com/dashboard/cloud/api-keys>). Creating agents also needs a
     **funded** wallet (Cloud → Billing), or it later fails with a `402`.
   - `SUPABASE_ACCESS_TOKEN` (starts with `sbp_`): <https://supabase.com/dashboard/account/tokens>.
3. **Validate.** Confirm the prefixes (`sk_live_`, `sbp_`). If one's wrong, ask again — don't proceed.
4. **Write the secrets into `.env.local` only** (confirm it's gitignored first). Fill only
   those two lines; leave everything else as-is. Never print the full `sk_live_` value back
   (mask as `sk_live_…last4`), never `cat .env.local`, never `git add`/commit it.
5. **Complete setup.** Run `npm run setup` again. If it fails, read its message and act on it
   instead of retrying blind:
   - "free-project limit" → ask me for an existing project's URL in `NEXT_PUBLIC_SUPABASE_URL`
     (or free a slot at supabase.com/dashboard), then re-run.
   - "more than one organization" / `403` on create → my account has multiple Supabase orgs (or
     can't create in the default one). Setup prints the orgs with a `SUPABASE_ORG=<slug>` for each;
     re-run as `SUPABASE_ORG=<slug> npm run setup` for the one I want (usually my personal org).
   - `401` → my Supabase token is wrong/expired; ask for a new one.
   - `404` → `NEXT_PUBLIC_SUPABASE_URL` points at a project this token can't see.
6. **Verify.** Run `npm run typecheck`, `npm test`, `npm run build` and `npm run test:public`.
   Install all three Playwright engines first (`npx playwright install chromium firefox webkit`). Media
   dialog and public-page checks use them; those checks do not certify every native editor in those engines.
7. **Start.** Run `npm run dev` and report the URL (<http://localhost:3000>). The public homepage
   accepts access requests; studio accounts are invited individually. Public signup is disabled. Remind me
   that creating an agent needs a funded wallet — a `402` at create time is the wallet, not a bug.

Constraints: keep changes minimal; add no features; the `sk_live_` key stays server-side;
branding stays code-side (`src/config/branding.ts`).

## By hand

```bash
npm install
npm run setup     # first run creates .env.local and prints the two keys to paste
#                 → paste both into .env.local, then:
npm run setup     # creates/configures Supabase, runs the migration, sets up auth
npm run dev       # http://localhost:3000 → invited creators use an email sign-in link
```

<details>
<summary><b>Manual Supabase setup</b> — if you'd rather not use an access token</summary>

Prefer the checked setup runner above. Applying only `0001_init.sql` creates the historical
starter, not Creative Studio. A manual installation must apply the complete ordered migration
set with the same private ledger/checksums from `scripts/migrations.mjs`; an existing database
needs the explicit verified baseline described above. Do not run every SQL file again.

Keep Email authentication enabled and **new public signup disabled**. Configure the trusted
site URL, `/auth/callback` redirect and the preview-safe email confirmation templates from
`scripts/setup.mjs`. Configure the sign-in sender before inviting creators. Add the project URL,
anonymous key and server-only service-role key to `.env.local`; keep administrative tokens and
database passwords out of the browser and deployment environment. Complete the same test/build
checks before granting access. See [current status](docs/CURRENT-STATUS.md) for the pilot flow.
</details>

## Deploy to production (Vercel)

The Vercel button alone is **not** enough — it deploys the app but can't create your Supabase
backend or register your sign-in URLs. Run setup locally once first, then:

1. Run `npm run setup` locally (creates Supabase + schema + auth config).
2. Push your fork to GitHub, then in Vercel: **Add New → Project → Import Git Repository**.
3. Add **only these** env vars: `AGENT37_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only — the runtime needs
   it for all DB access), `NEXT_PUBLIC_SITE_URL` (your prod URL).
   **Never add** `SUPABASE_ACCESS_TOKEN` — it's setup-only (used to create/configure the project,
   never at runtime).
   (Branding is code-side now — edit `src/config/branding.ts`, not env.)
4. Register your prod sign-in URL with Supabase: set `NEXT_PUBLIC_SITE_URL` to your prod URL
   in `.env.local` and re-run `npm run setup` (it adds `<prod>/auth/callback` for you).
