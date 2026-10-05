# Setup

Robyn uses Supabase for authentication/database, Resend SMTP for account emails,
and the existing Vercel project for deployment. Secrets live in ignored local
files; `.worktreeinclude` copies them into new Codex-managed worktrees. See
[SECRETS.md](SECRETS.md) and the blank [.env.example](.env.example) inventory.

## Local development

1. Run `npm install`. Put runtime keys from `.env.example` in `.env.local` and
   operations keys in `.env.ops.local`. Do not put management credentials in the
   runtime file.
2. Set `AGENT37_API_KEY` in `.env.local` and fund the operator's Agent37 wallet.
   Keep optional `INKBOX_ADMIN_KEY` blank until needed. Use Stripe test keys for
   development and preview.
3. Set `SUPABASE_ACCESS_TOKEN` in `.env.ops.local`. Existing-project setup needs
   Project Settings, Database, and Auth Config Read-write, plus API Keys and API
   Key Secrets Read. Creating a project also needs Organizations Read and
   Organization Projects Read-write. A database-scoped token can run
   `npm run setup -- --no-create --migrations-only` without auth configuration.
4. Set `NEXT_PUBLIC_SITE_URL=http://localhost:3000` in `.env.local`. For a fresh
   backend, leave the Supabase runtime values blank and run `npm run setup`.
   It creates a free project, saves its credentials locally, applies migrations,
   and configures signup without email verification. If multiple organizations
   exist, set `SUPABASE_ORG` in the operations file. Setup never upgrades a plan.
5. For an existing backend, set its URL, anon key, and service-role key in the
   runtime file, then run `npm run setup -- --no-create`.
6. Configure Resend below. Run `npm run secrets:check`, then `npm run dev` and
   open `http://localhost:3000`. New workspaces start with zero balance; Host can
   add credit. Agent provisioning and chat still incur real Agent37 charges.

Commands default to `dev`. Preview uses `.env.preview.local` and
`.env.ops.preview.local` with `--config stg`. Production uses
`.env.production.local` and `.env.ops.production.local` with `--config prd`.
Never print or commit actual credentials or use a `NEXT_PUBLIC_` secret name.

## Existing production deployment

Use the existing Vercel project **venatio-studios/robyn**. Manage matching runtime
values in Vercel's Development, Preview, and Production environment settings;
operations files stay local. Local changes do not automatically sync to Vercel.
Update Vercel and redeploy when runtime credentials change.

Set the production Supabase runtime values and application origin in
`.env.production.local`, plus its setup token in `.env.ops.production.local`.
Run `npm run setup -- --config prd --no-create` to configure the production auth
redirect allowlist while retaining localhost callbacks. Explicitly shared
Supabase projects need redirects for every deployed/local origin they serve.

Run `npm run typecheck` and `npm run build -- --config prd` before shipping.
Pushing a branch produces a preview; merging main deploys production.
[BILLING.md](BILLING.md) covers webhooks, credit, and reconciliation.

## Account email through Resend

Use [Resend SMTP](https://resend.com/docs/send-with-supabase-smtp) for Supabase
Auth invitations, password resets, and other account emails. Supabase generates
the links and applies its templates.

1. Verify a sending domain in Resend and create an API key with full access so
   the setup command can verify the domain before changing Supabase.
2. Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in the selected operations file.
   The address must use that verified domain. `RESEND_FROM_NAME` is optional and
   defaults to `src/config/branding.ts`. The Supabase token needs access to the
   selected project with Project Settings / Auth Config Read-write permissions.
3. Run `npm run email:setup`, or select another environment explicitly with
   `--config stg` / `--config prd`. The runtime Supabase URL determines the target.
   When environments share a project, one run updates their shared mail provider.
   No application redeployment is needed for the SMTP change.

The command uses `smtp.resend.com:465`, username `resend`, and the key as its
password. It verifies the domain before saving and reads the settings back.
Signup policy, redirects, and templates remain unchanged. An active Send Email
hook must be reviewed first because it overrides SMTP. The command sends no mail.

It raises the built-in 2/hour email limit to 30/hour, preserving higher limits.
Supabase rate limits and Resend plan quotas still apply. See
[Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## Optional Inkbox

Set `INKBOX_ADMIN_KEY` in the selected runtime file and Vercel environment, and
apply the identity migration. An admin or assigned member can enable Inkbox from
the retained Messaging page. New agents and reads never allocate an identity.
Provisioning uses an identity-scoped key, email allowlist, signed Hermes webhook,
and persisted lease. Retry reuses the identity. Enabling restarts the agent once;
allow phone numbers before activating phone access. The admin key stays server-side.
