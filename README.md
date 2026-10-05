# robyn

A branded agent dashboard on the [Agent37](https://www.agent37.com) Cloud API: auth, Hermes agents, chat, files, messaging apps (Telegram, WhatsApp, Slack, Discord), integrations, schedules, and fleet management.

Host administrators use `/host` for visibility across tenants, recorded billing, and application configuration, and to set workspace agent limits and issue single-use credit coupons. Each workspace remains a tenant and defaults to an agent limit of 1. [HOST.md](HOST.md) covers the migrations, controls, and Doppler-backed invitation bootstrap for the dedicated `master@rgbknights.com` account.

Admins manage **Billing** at `/dashboard/billing`: a prepaid USD balance starting at $0, Stripe top-ups, saved payment methods, optional automatic top-up, and workspace-scoped coupon credits. No usage or tiers appear on Billing. [BILLING.md](BILLING.md) covers the migration, Stripe webhook, required reconciliation schedule, and `npm run billing:coupon` for issuing credits. The app's balances are separate from the operator's Agent37 wallet.

Click your name in the workspace dropdown to open **Your profile** at `/profile`. Admins and members can change their display name (which defaults to their email address) and add or clear an optional phone number. The sign-in email is read-only. Profiles apply across workspaces and use existing Supabase user metadata; no database migration is needed.

Each agent's **Identity** tab sets its name and icon and edits [Hermes SOUL.md](https://hermes-agent.nousresearch.com/docs/user-guide/features/personality) as its single personality editor. Names sync to Agent37; icons appear in the fleet, agent switcher and Chat. SOUL edits target the running Hermes profile, preserve Markdown, and reject stale saves while keeping your draft. Start a new conversation to hear the changed personality. Run `npm run setup` to apply the agent-icon migration when upgrading an existing installation.

Each agent's **Schedule** tab manages [Agent37 crons](https://www.agent37.com/docs/agents-api/crons): recurring instructions with a timezone, pause/resume, run now, and run history linked to Chat conversations. Access stays scoped to the agent's workspace. Jobs can wake sleeping agents, skip explicitly stopped agents, and use the agent's normal compute and model budget. No extra database setup or scheduler is required.

Click an agent's name in the fleet list to open Chat. Its **[…]** menu contains Edit (Identity), Budget, Assignment, app links, and lifecycle actions. Admins choose **Assignment** to change the assigned workspace user in a dialog; saving refreshes the fleet list. Assignment is managed here rather than in the agent's Settings tab.

Admins can choose **Budget** from an agent's **[…]** menu in the **Agents** list to open the agent's budget page at `/dashboard/budgets/{agentId}`. It shows the monthly allowance used and remaining, edits the monthly managed-spend limit, and adds extra budget in USD. Monthly limits reset each UTC month; extra budget is used after the monthly portion and carries over until consumed. Limits cover managed services, exclude compute, and do not fund the Agent37 wallet. The agent's **Settings** tab remains a read-only budget and usage view. No database migration is required.

The Budget page also previews an always-on resource baseline (730 running hours at the documented CPU, RAM and disk rates) plus the managed monthly allowance as a planned total. Admins can increase a running agent's resources using supported shapes and disk ranges; the price preview updates before confirmation. Agent37 permits growth only, restarts the agent, and may move it to another host. The page follows an asynchronous resize until it finishes. Account tiers and available capacity still apply. Actual spending on both Budget and Settings includes resources, models, search, Composio and paid tools, using the authorized instance's current UTC-month usage. Compute can take up to an hour to appear; extra budget remains separate from the monthly plan, and resource charges do not consume the managed-services allowance.

Use **Channels** and **Integrations** for agent connections. The optional **Messaging** page is hidden from agent navigation; its existing `/dashboard/agents/{agentId}/messaging` route remains available for managing [Inkbox](https://www.agent37.com/docs/agents-api/imessage) email, iMessage and calls. Creating or viewing an agent never consumes an Inkbox identity. Add the server-only `INKBOX_ADMIN_KEY` and run `npm run setup` to apply the identity-state migration. Enabling Inkbox restarts that agent once; failed setup can be retried with the same identity.

The inbox allowlist uses the agent creator's account email. Add an allowed phone number in Messaging and send the displayed connection message to activate iMessage and calls. Inkbox's hosted voice agent handles calls and delivers transcripts to Hermes. Deleting an agent also deletes its Inkbox identity and revokes its scoped keys.

## Setup

Use Doppler for secrets in main and every Git worktree. Follow
**[SETUP.md](SETUP.md)** for Supabase setup and deployment, and
**[SECRETS.md](SECRETS.md)** for config selection and secret updates.

The two bootstrap credentials are:

- `AGENT37_API_KEY` — Agent37 dashboard → **Cloud → API keys**, then **fund the wallet** (Cloud → Billing).
- `SUPABASE_ACCESS_TOKEN` — [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens).

Store the Agent37 key in the runtime config and the Supabase management token in
the matching operations config. Then:

```
npm install
doppler login
npm run setup
npm run dev
```

Commands default to development. Production commands require `--config prd`.
No `.env.local` copy or worktree hook is needed.
