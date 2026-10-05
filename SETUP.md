# Setup

Robyn uses Doppler for secrets, Supabase for authentication/database, and the
existing Vercel project for deployment. Every checkout gets secrets at process
startup; do not create `.env.local`. See [SECRETS.md](SECRETS.md) for the complete
config map and [.env.example](.env.example) for the blank key inventory.

## Local development

1. Install dependencies with `npm install` and the
   [official Doppler CLI](https://docs.doppler.com/docs/install-cli). On Windows,
   use `winget install --id Doppler.doppler --exact --source winget`.
2. Run `doppler login` once. Local CLI authentication stays outside the repository.
   Main and every worktree reuse it.
3. In Doppler project `robyn`, set `AGENT37_API_KEY` in `dev`. Agent37 requires a
   funded operator wallet even for development. Keep optional `INKBOX_ADMIN_KEY`
   blank until needed. Set Stripe test credentials only in `dev`/`stg`.
4. Set `SUPABASE_ACCESS_TOKEN` in `ops_dev`. Existing-project setup needs Project
   Settings, Database, and Auth Config with Read-write access, plus API Keys and
   API Key Secrets with Read access. Creating a project additionally needs
   Organizations Read and Organization Projects Read-write. A token scoped
   only to an existing project's database can run
   `npm run setup -- --no-create --migrations-only` instead.
5. Set `NEXT_PUBLIC_SITE_URL=http://localhost:3000` in `dev`. For a fresh backend,
   leave the three Supabase runtime values blank and run `npm run setup`. It
   creates a free project, records its URL in Doppler immediately, reads the
   public/service keys, applies migrations, and configures email/password auth.
   If the account has multiple organizations, set `SUPABASE_ORG` in `ops_dev`.
   If no free project slots remain, setup stops; it never upgrades a paid plan.
6. For an existing development backend, put its URL, anon key, and service-role
   key into `dev`, then run `npm run setup -- --no-create`. Keep development data
   isolated from the production database. Preview may use the same non-production
   backend with separate Stripe/webhook settings in `stg`.
7. Run `npm run secrets:check`, then `npm run dev` and open
   `http://localhost:3000`. Sign up using email and password. New workspaces start
   with zero balance. Host can add credit to a development workspace without a payment;
   provisioning/chat still incurs real Agent37 charges.

Commands default to `dev`. Use `--config stg` or `--config prd` explicitly for
other environments. Setup-generated credentials are saved to the selected Doppler
configs. Never print tokens, export secret files into the repository, or put a
server credential under a `NEXT_PUBLIC_` name.

## Existing production deployment

The Vercel project **robyn** remains the deployment target. Its native Doppler
integration syncs `dev` to Development, `stg` to Preview, and `prd` to Production.
`NEXT_PUBLIC_*` values are Unmasked and server secrets Masked; the sync uses
Dynamic variable types. Never sync operations configs to Vercel.

For a new installation, configure production Supabase values in `prd` and its
setup token in `ops_prd`. Set `NEXT_PUBLIC_SITE_URL` to the production origin,
then run `npm run setup -- --config prd --no-create`. This sets the production
auth redirect allowlist while retaining localhost callbacks. A migration-only
token can apply schema updates with `--migrations-only`; it cannot change auth
settings or reveal project keys.

Run `npm run typecheck` and `npm run build -- --config prd` before shipping.
Pushing a branch produces a Vercel preview; merging main deploys production.
Secret changes apply to new deployments, so redeploy after editing deployed
Doppler configs. Vercel builds use synced variables directly; no Doppler CLI/token
is needed on Vercel. [BILLING.md](BILLING.md) covers Stripe webhooks, workspace
credit grants, and the required reconciliation schedule.

## Optional Inkbox

Set `INKBOX_ADMIN_KEY` in the appropriate runtime config and deploy. The existing
identity migration must be applied. An admin or assigned member can enable Inkbox
from an agent's retained Messaging page. New agents and reads never allocate an
identity. Provisioning uses an identity-scoped key, email allowlist, signed Hermes
webhook, and a persisted lease. A retry reuses the same identity.

Enabling Inkbox restarts the agent once. Allow phone numbers before activating
phone access. The operator admin key always stays server-side.
