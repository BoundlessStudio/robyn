# Secrets

Doppler's **robyn** project is the source of truth. Local npm commands fetch the
selected config at startup and inject values into the child process. No secret
file is written inside a checkout. Main and Git worktrees use the same commands;
their paths do not need individual Doppler setup. `.env.example` is a blank key
inventory and `secrets.config.json` defines which keys each command receives.

| Purpose | Doppler config | Vercel environment |
| --- | --- | --- |
| Local development | `dev` | Development |
| Preview | `stg` | Preview |
| Production | `prd` | Production |
| Development setup credentials | `ops_dev` | Never synced |
| Preview setup credentials | `ops_stg` | Never synced |
| Production setup credentials | `ops_prd` | Never synced |

Install the [official Doppler CLI](https://docs.doppler.com/docs/install-cli),
then run `doppler login` once on your machine. On Windows:

```powershell
winget install --id Doppler.doppler --exact --source winget
doppler login
npm install
npm run secrets:check
npm run dev
```

The default is `dev`. Select another config explicitly, for example
`npm run build -- --config prd`. `ROBYN_DOPPLER_CONFIG` can select a config for a
shell session; `ROBYN_DOPPLER_PROJECT` overrides the project for a fork. Personal
configs such as `dev_personal` use the matching environment's operations config.
The wrapper clears inherited app/management values before injecting the selection.
Normal app commands never receive `SUPABASE_ACCESS_TOKEN`, webhook endpoint setup
metadata, or `DOPPLER_TOKEN`. Only `setup`, `billing:setup`, and `billing:schedule`
fetch the matching operations config.

Edit values in the Doppler dashboard. Setup commands save generated Supabase
credentials and Stripe webhook secrets back to the selected configs using stdin,
without displaying their values. Keep the Supabase management token in operations
only. A database-scoped token can run `setup --migrations-only` and
`billing:schedule`; creating projects, revealing API keys, and configuring auth
require the permissions listed in [SETUP.md](SETUP.md), including both Project
Settings and Auth Config Read-write for auth updates. Replace expiring tokens in
Doppler, not in local files.

Use a non-production Supabase database for `dev`/`stg` and Stripe test keys in
those configs. The launcher rejects Stripe live keys outside production.
Agent37 has no separate test wallet: provisioning or chatting still spends from
the operator's Agent37 wallet. Optional Inkbox credentials can stay blank until
that feature is needed.

The existing Robyn Vercel project has three native Doppler syncs. Use **Dynamic**
variable type: `NEXT_PUBLIC_*` values are **Unmasked**, server secrets **Masked**.
Vercel builds consume its synced environment directly and do not need the CLI or
a Doppler token. Secret changes apply to subsequent deployments, so redeploy
after changing a deployed config. Sync only runtime configs. Never sync `ops_*`.
See [Doppler's Vercel guide](https://docs.doppler.com/docs/vercel).

Local `.env` files are rejected because Next.js would otherwise load values from
them alongside the selected config. The old restore/save npm scripts, postinstall
step, and local Git environment-copy hooks are retired after migration verification.
Do not reintroduce `.env.local` copies or commit exported credentials. Keep all
`.env*` files ignored except the blank `.env.example` inventory.
