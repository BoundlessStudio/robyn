# Secrets

Secrets live in ignored local environment files. Local npm commands select a
runtime file at startup; trusted setup commands also load its operations file.
`.env.example` is a blank inventory, and `secrets.config.json` defines the files
and supported keys. No Doppler installation or login is required.

| Selection | Runtime file | Operations file | Vercel environment |
| --- | --- | --- | --- |
| `dev` (default) | `.env.local` | `.env.ops.local` | Development |
| `stg` | `.env.preview.local` | `.env.ops.preview.local` | Preview |
| `prd` | `.env.production.local` | `.env.ops.production.local` | Production |

Use `--config stg` or `--config prd` explicitly, for example
`npm run email:setup -- --config prd`. `ROBYN_ENVIRONMENT` selects the environment
for a shell session. Files are resolved relative to the checkout, regardless of
the terminal's working directory. Do not add other `.env` variants: they can mix
values when Next.js loads its environment.

Keep runtime credentials in the runtime file. Keep `SUPABASE_ACCESS_TOKEN`,
`RESEND_API_KEY`, sender settings, webhook endpoint setup metadata, and
`VERCEL_AUTOMATION_BYPASS_SECRET` in the operations file. Normal app commands strip
inherited operations credentials. Only `setup`, `email:setup`, `billing:setup`,
and `billing:schedule` load operations files. Setup commands
save generated values atomically to the matching file without printing them.

Use Stripe test credentials for development/preview. Prefer a separate
non-production Supabase backend unless a shared project is explicitly selected.
Agent37 has no test wallet: provisioning and chat incur real operator charges.
Optional Inkbox credentials can stay blank until needed.

## Main and worktrees

The committed [`.worktreeinclude`](.worktreeinclude) lists all six ignored
runtime/operations files. Codex copies matching files from the main repository
when creating a managed worktree. This is a snapshot: edits in an existing
checkout do not automatically update other checkouts. Update main, then explicitly
refresh any worktree that needs the change. Never commit actual `.env*` values.
Keep `.env.example` blank and retain `.env*` in `.gitignore`.

## Vercel

Manage the existing Robyn project's runtime variables directly in Vercel.
Upload only the matching runtime file, or set the values individually; never
upload an operations file. Vercel builds consume its provided environment
directly and do not read local files or invoke a secrets CLI. Runtime secret
changes apply to subsequent deployments, so redeploy after changing them.
Local files and `.worktreeinclude` do not sync to Vercel.

## Email and billing setup

Supabase Auth sends account emails through Resend SMTP. Keep the key and sender
settings in the operations file, then run `npm run email:setup`. The command
verifies the sender domain and saved configuration. See
[SETUP.md](SETUP.md#account-email-through-resend).

For local Stripe webhook forwarding, install `@stripe/cli`, then run
`npm run billing:listen` before `npm run dev`. The launcher uses only test
credentials, saves the signing secret locally, and hides it from terminal output.
Use `--port 3002` if needed. Protected previews keep their bypass credential only
in `.env.ops.preview.local`; setup stores it in the private webhook URL and
Supabase Vault, never in the public origin or browser bundle. See [BILLING.md](BILLING.md).
