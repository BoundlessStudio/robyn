# AGENTS.md

Guidance for AI coding agents (and humans) working in the **Agent37 Starter Kit**.
`CLAUDE.md` imports this file via `@AGENTS.md`, so this is the single source of
truth — edit here, not there.

## First-time setup

Setting this up from a fresh clone? Follow **[`SETUP.md`](SETUP.md)** — the complete runbook
(it's what the README tells adopters to hand you). Two login-gated secrets are human-supplied:
`AGENT37_API_KEY` (plus a **funded** Agent37 wallet) and `SUPABASE_ACCESS_TOKEN`.
Store them in the selected runtime and operations environment files respectively;
`npm run setup` does the rest. Never print or commit credentials.

Secrets live in ignored local environment files; see `SECRETS.md`. Local npm
commands select development (`dev`) by default; select `prd` explicitly for
production. `.worktreeinclude` copies the listed files from the main repository
when Codex creates a managed worktree. Existing worktrees require an explicit
refresh after local secret updates; do not back-sync automatically. Keep management
tokens and Resend setup credentials only in `.env.ops.*` files and never upload
them to Vercel. Runtime commands strip inherited management credentials. Keep
`.env.example` synchronized with `secrets.config.json`, with blank values only.
Use Stripe test keys for development/preview. Prefer a separate non-production
Supabase backend unless the user explicitly selects a shared project. The existing
Robyn Vercel project receives only runtime values through its environment settings;
local configuration does not automatically sync to Vercel.

## What this project is

A full-stack starter for building your own agent app, built entirely on top of the
public **[Agent37](https://www.agent37.com) B2B Agents API**: email + password auth
(open signup, no verification), a multi-agent fleet, and, for each agent, native
in-dashboard **Chat**, **Identity** (name, icon and Hermes SOUL.md), a **Files** browser, **Channels** (connect the agent to
Telegram, WhatsApp, Slack, Discord and two dozen more), **Integrations** (Composio),
**Schedule** (Agent37 crons), and a **Settings** tab. Forkers rebrand it (`src/config/branding.ts`) and ship it; their
end users sign up, get workspaces, invite teammates, and create / manage agents.

Everything this app can do is a **subset of the Agent37 `/v1` API** — control plane
*and* data plane. This repo is a *client* of that API — it does not implement agent
infrastructure itself. So **the API docs, not this code, are the authority on what an
agent can and cannot do.**

## The API this is built on — read the docs first

This product is built on top of our public API. **Before adding or changing any
agent capability, consult the docs** — they define the full surface and its
limits. Two machine-readable entry points are designed for you (an AI agent) to
fetch directly:

- **<https://www.agent37.com/docs/llms.txt>** — concise index of every doc page.
  *Start here* to find the right page.
- **<https://www.agent37.com/docs/llms-full.txt>** — the entire documentation
  inlined into one file. Use for deep reference.
- Human-browsable docs: **<https://www.agent37.com/docs>**
  (append `.md` to any page URL to get raw markdown.)

### Documented capability map

Two planes, one `sk_live_` key — and this template now drives **both**. The
**control plane** manages instances (and the per-agent Composio integrations); the
**data plane** powers the native Chat and Files tabs.

**Control plane — `https://api.agent37.com/v1/*`** (the `sk_live_` key this app holds):

| Page | Covers | Used here |
|---|---|---|
| [Core concepts](https://www.agent37.com/docs/agents-api/concepts) | the model, auth, the two planes | read first |
| [Instances](https://www.agent37.com/docs/agents-api/instances) | create / list / get / start / stop / restart / update / resize / delete | ✅ |
| [Instance URLs](https://www.agent37.com/docs/agents-api/urls) | short-lived signed URLs to open an agent's ports | ✅ |
| [Templates](https://www.agent37.com/docs/agents-api/templates) | the agent images you can provision | ✅ |
| [Managed services & budgets](https://www.agent37.com/docs/agents-api/budgets) | per-agent managed-spend cap | ✅ |
| [Billing](https://www.agent37.com/docs/agents-api/billing) | wallet, compute prepay, usage | ✅ (usage) |
| [Run commands](https://www.agent37.com/docs/agents-api/exec) | exec a command inside an instance | ✅ (Channels + Inkbox setup + SOUL editor) |
| [Crons](https://www.agent37.com/docs/agents-api/crons) | recurring prompts, pause / resume, run now, run history | ✅ (Schedule) |
| [Errors](https://www.agent37.com/docs/agents-api/errors) | machine-readable error codes | ✅ (mapped in `Agent37Error`) |

The **Integrations** tab is also control plane: it manages a per-agent Composio
entity through `/instances/{id}/integrations/*` (toolkits / connect / connections).

The **Channels** tab is control plane too, but through `exec`: messaging channels are
configured *inside* the agent, not by our API, so the tab drives the agent's own
messaging API (loopback port `9119`) over `POST /v1/instances/{id}/exec`. The agent
reports the channel catalog, each channel's fields, and its live connection state, so
the UI renders a form it did not write and a channel a later image adds needs no change
here. See [Messaging channels](https://www.agent37.com/docs/agents-api/messaging).

The retained **Messaging** page is hidden from agent navigation; **Channels** and
**Integrations** are the visible connection tools. Its existing `/messaging` deep
link and Inkbox BFF remain available. It provisions optional Inkbox identities only when an admin or assigned member clicks
**Enable Inkbox**. Read [iMessage, email and calls](https://www.agent37.com/docs/agents-api/imessage)
before changing it. `INKBOX_ADMIN_KEY` stays server-side in `src/lib/inkbox.ts`; each
agent receives only an identity-scoped key. `src/lib/inkbox-provisioning.ts` persists
setup stages and a lease in `agent_inkbox_identities`, restricts inbound email to the
creator, and closes phone access until a number is allowlisted. New agents and reads
never allocate identities. The Hermes plugin receives signed webhooks on port 8765;
Inkbox Voice AI handles calls and sends transcripts to Hermes.

The **Schedule** tab uses control-plane `/instances/{id}/crons` endpoints through
`agent37.ts`. Jobs live on Agent37, including jobs created by the agent itself;
there is no local scheduler or database mirror. Admins and assigned members can list jobs
and history and manage schedules. Send only changed PATCH fields:
unchanged `schedule`, `timezone` or `enabled` would recompute `next_run`. A run's
`triggered` status means it was requested, not that it succeeded; its linked Chat
conversation contains the result. Explicitly stopped agents are never woken.

The **Identity** tab uses SOUL.md as its single personality editor; do not add a
second personality/preset selector. Consult the [Hermes personality guide](https://hermes-agent.nousresearch.com/docs/user-guide/features/personality)
before changing it. The name/icon PATCH is authorized through the agent mirror:
names also sync upstream without touching ownership metadata, and icons are bounded
catalog IDs stored in `agents.icon`. `/api/agents/{id}/soul` reads/writes only SOUL.md
in the running Hermes worker's profile over `exec`. Writes require admin or assigned-member access,
are atomic, and require a content/profile revision so stale drafts cannot overwrite
newer edits. Symbolic/hard links and oversized files are refused. Markdown travels
as encoded data, never shell source. No configuration secrets are returned.

**Data plane — `https://{instanceId}.agent37.app/v1/*`** (talk to one agent's
gateway). Data-plane requests authenticate with the `X-Agent37-Key: sk_live_...`
header (raw key, no Bearer prefix; `Authorization` passes through to the app inside
the instance), while the control plane stays `Authorization: Bearer`. The native
**Chat** and **Files** tabs call these endpoints directly
(through this app's BFF). The signed-URL "open in new tab" shortcuts still exist
too — they just complement the in-dashboard UIs now rather than replace them:

| Page | Covers | Used here |
|---|---|---|
| [Send a message](https://www.agent37.com/docs/agents-api/chat) | post a message, get a response (`/v1/responses`) | ✅ (Chat) |
| [Streaming](https://www.agent37.com/docs/agents-api/streaming) | stream responses (SSE) | ✅ (Chat) |
| [Sessions & models](https://www.agent37.com/docs/agents-api/sessions) | conversation state, model selection | ✅ (Chat) |
| [Files](https://www.agent37.com/docs/agents-api/files) | list / read / write / archive files | ✅ (Files) |
| [Health & version](https://www.agent37.com/docs/agents-api/health) | agent readiness and gateway build | ✅ (Settings) |
| [Build a chat app](https://www.agent37.com/docs/agents-api/chat-app) | end-to-end guide for a chat UI | reference |

So: **what's possible** = the whole map above, and this template now exercises most
of it: the control-plane rows marked ✅, the native data-plane Chat and Files tabs,
the per-agent Integrations tab, *and* the signed-URL buttons that open each agent's
own dashboard / terminal / files UI in a new tab.

## How this app fits together

**Host represents this deployment above all tenant workspaces.** `/host` is an
operator console for Overview, Tenants, and Configuration. `host_admins` stores Host access
by verified Supabase user ID, independently of workspace roles. Every Host page and read
uses `src/lib/host-auth.ts`; service-role-only SQL functions and explicit DTOs return only
operational metadata and billing records. Host reads never contact Agent37, settle billing,
charge cards, or return agent content or credentials. Host accounts land in `/host` without
bootstrapping a workspace. The first normal email signup becomes Host atomically through
`0010_first_signup_host.sql`, with no fixed email or invitation command. A service-role-only
singleton claim prevents concurrent signups, revocation, deletion, or migration replay from
assigning another Host. Upgrades preserve existing Host grants; if none exist, the earliest
normal signup is assigned once. Host can change each workspace's agent limit (default 1) and add credit directly to its
balance. These writes recheck Host permission in both the DAL and SQL; credit grants update the
wallet atomically, record the Host creator, and use a request ID to prevent duplicate credits.
Creation reserves capacity atomically before calling Agent37; uncertain outcomes retain a slot
for operator review. Tenant creation buttons require available capacity and a positive wallet.
See [HOST.md](HOST.md). Removing a Host permission revokes access on the next request.

```
Browser ─▶ Next.js (this app) ─▶ control plane  https://api.agent37.com/v1   (instances, integrations)
   │            │              └▶ data plane     https://{instance}.agent37.app/v1   (chat, files)
   │            │                                 (one server-side sk_live_ key, both planes:
   │            │                                  Bearer on the control plane, X-Agent37-Key on the instance)
   │            │
   │            └─▶ Supabase: Auth (browser, anon key) + Postgres (server-only, service-role key):
   │                          users, workspaces, members, agent mirror
   │
   └──────────────▶ https://{instance}.agent37.app  (agent's own UI, via short-lived signed URLs)
```

- **One key, many app workspaces.** A single `sk_live_` key, server-side only, is
  shared by the whole app. Every agent is created under your one Agent37 workspace
  and tagged `metadata.app_workspace`; a Supabase mirror table is the source of
  truth for which app-workspace owns which agent.
- **Workspace roles and assignment.** Invitations select `admin` or `member`, defaulting to
  `member`. Admins manage the fleet, members and workspace settings. Members have full
  access only to agents whose `agents.assigned_user_id` matches their verified session.
  Every per-agent page and BFF route uses `requireAgentAccess`; creation and reassignment
  require an admin and an assignee from the same workspace. `created_by` stays an audit
  field and never grants access. Removing membership clears its assignments. The member
  dashboard opens a sole assignment directly, otherwise shows a simple agent chooser.
  Admins reassign agents through **Assignment** in the fleet's […] menu, which opens
  a dialog and refreshes the list after saving. Agent Settings has no assignment editor.
- **Isolation is enforced in the server (BFF), not in the browser.** Clients have **no**
  direct table access — the schema migration (`0001_init.sql`) grants tables only to the
  service role, so the browser only uses Supabase for *auth*. Every read and write
  goes through `src/app/api/**` using the **service-role** client (`src/lib/supabase/admin.ts`,
  which bypasses RLS); the TypeScript checks in `src/lib/auth.ts` (`requireUser` /
  `requireMember` / `requireAdmin` / `requireAgentAccess`) are the authorization boundary. RLS
  policies stay enabled as a backstop but are dormant (clients can't reach the tables). Neither
  the `sk_live_` key nor the service-role key ever reaches the browser.
- **`src/lib/agent37.ts` is the only thing that calls the Agent37 API**
  (`server-only`) — both the control-plane base and each instance's data-plane host.
  Internal `src/app/api/**` routes are this app's BFF: the browser calls them, they
  authenticate + check workspace ownership in TS, then call `agent37.ts` and/or the DB via the
  service-role client. The browser never calls the upstream API or the DB directly.
- **Extra budget requests are review-only.** Assigned members submit an amount and
  optional note from Settings → Budget & usage. Requests live in the service-role-only
  `agent_budget_requests` table; members see only their own requests, while admins
  see the agent's recent requests at the bottom of its Managed usage budget section.
  Submitting a request never changes an allowance. Admins use the existing Add button
  to grant extra budget; requests remain a history without approval/decline controls.
- **The UI is a fleet + a per-agent workspace.** The `(fleet)` route group is the
  multi-agent dashboard (agents, members, invitations, workspace settings). Clicking
  an agent opens `/dashboard/agents/{agentId}/{tab}` — a tabbed workspace (Chat /
  Identity / Files / Channels / Integrations / Schedule / Settings) where the active agent is bound to the URL and
  switchable from a dropdown. New agents use Hermes with server-side shape and starting budget
  (`DEFAULT_AGENT`). Admins can choose Budget from an agent's […] menu in the fleet list to open
  `/dashboard/budgets/{agentId}` and set monthly limits, add one-time headroom, or increase
  resources on a running agent. A top Monthly summary previews the always-on baseline
  and combined monthly plan. Resizes restart the agent, only grow resources, and can return `updating`;
  poll the resource profile until the move finishes. The per-agent Settings budget panel
  stays read-only and includes actual resource spending. Budget and resize
  writes require `requireAgentAccess(id, "admin")` and use only Agent37's control plane.
  `/api/agents/{id}/costs` reads `/v1/usage` for the current UTC month and returns only
  the authorized instance's spend: the upstream rollup includes **every app workspace**
  under the shared key, so never return it directly to the browser. Compute settles hourly.
- **Naming:** the upstream API calls these resources **instances**; this app brands
  them **agents**. Paths stay `/instances`; the client methods read `agent…`.

Settings shows the gateway build from `/v1/version` and readiness from `/v1/health`.
`/api/agents/{id}/version` requires agent access and probes only running instances;
opening Settings must not wake sleepers. Admins and assigned members can upgrade
through the existing authorized `/update` action when a newer template image is
available. Show the restart and operating-system reset notice before upgrading,
and confirm readiness after the update acknowledgement. Stopped instances stay stopped.

The admin-only **Usage** page at `/dashboard/usage` reads
`/api/workspaces/{id}/usage` for an inclusive window within the last 90 UTC days.
The BFF verifies workspace admin access, reads current and retained `billing_agents`
ownership, and reconstructs daily totals from each day's authorized instance rows.
Shared-key totals and other tenants' instances never reach the browser. Current
agents with zero spend and deleted agents with spend are included. Model rollups
are shown only when all daily spenders are owned by this workspace and model totals
reconcile; otherwise the breakdown is explicitly unavailable. Reads do not settle
billing, refill wallets, or wake instances.

## Where things live

| Path | What |
|---|---|
| `src/lib/agent37.ts` | The Agent37 `/v1` client — the single egress to both planes |
| `src/app/api/**` | This app's own API routes (BFF); enforce auth + ownership |
| `src/app/api/profile/`, `src/app/api/workspaces/[id]/members/[userId]/profile/`, `src/lib/user-profile.ts`, `src/components/ProfileDialog.tsx` | Shared profile dialog in the account menu and admin Members page. Self-service writes are session-bound; admin reads/writes require same-workspace membership. Only display name and contact phone are editable; email stays read-only. `/profile` bookmarks retain the dialog through `ProfileView`. |
| `src/app/api/agents/[id]/{chat,files}/**` | Data-plane BFF: native Chat + Files proxied to the instance |
| `src/app/api/agents/[id]/integrations/**` | Composio integrations BFF (control plane) |
| `src/app/api/agents/[id]/channels/**` | Messaging channels BFF (list / write / disconnect, Telegram checks, WhatsApp pairing) |
| `src/lib/hermes-messaging.ts` | The agent's own messaging API, reached over `exec`; the only module that speaks it |
| `src/lib/telegram.ts` | Telegram Bot API calls made BEFORE anything is written into the agent (token check, owner lookup) |
| `src/lib/channels.ts` | Channel types + the featured list, shared by the BFF and the Channels tab |
| `src/components/channels/**` | The Channels tab: channel list, Telegram flow, WhatsApp QR, generic credentials form |
| `src/components/MessagingTab.tsx` | Optional Inkbox inbox, phone allowlist and iMessage connection instructions |
| `src/components/IdentityTab.tsx`, `src/components/AgentIcon.tsx` | Name, icon and the single SOUL.md personality editor |
| `src/lib/agent-profile-input.ts`, `src/lib/soul-input.ts` | Shared profile catalog and bounded input validation |
| `src/app/api/agents/[id]/soul/`, `src/lib/hermes-soul.ts`, `src/lib/hermes-soul-command.ts` | Authorized, profile-aware SOUL reads and revision-checked atomic saves over exec |
| `src/components/ScheduleTab.tsx`, `src/lib/cron-input.ts` | Cron editor, run history, input validation and minimal PATCH fields |
| `src/app/dashboard/budgets/[agentId]/`, `src/components/AgentBudgetPage.tsx`, `src/components/AgentResourcesBudget.tsx` | Admin-only budget page; managed limits, extra budget, resource increases, baseline preview and monthly plan |
| `src/app/api/agents/[id]/{costs,resources,resize}/`, `src/lib/{agent-costs,resource-input}.ts`, `src/components/AgentCostSummary.tsx` | Tenant-scoped actual resource and managed costs, live resource profiles, grow-only admin resizes and always-on pricing |
| `src/app/api/agents/[id]/version/`, `src/components/AgentVersionSection.tsx` | Authorized gateway version and readiness checks; member-accessible upgrade action in Settings |
| `src/app/dashboard/(fleet)/usage/`, `src/app/api/workspaces/[id]/usage/`, `src/lib/{usage-report,workspace-usage}.ts`, `src/components/{UsageView,WorkspaceUsageDashboard}.tsx` | Admin Usage page with UTC date filters, tenant-scoped cards, daily charts, model and agent breakdowns |
| `src/app/api/agents/[id]/budget/**`, `src/lib/budget-input.ts` | Authorized budget reads, admin-only writes, and exact USD-to-micros validation |
| `src/app/api/agents/[id]/crons/**` | Per-agent cron BFF; admins and assigned members can read and manage |
| `src/app/api/agents/[id]/identity/` | Inkbox state and provisioning / phone updates for admins and assigned members |
| `src/app/api/agents/[id]/assignment/` | Admin-only assignment updates, restricted to workspace users |
| `src/components/AgentAssignmentDialog.tsx` | Admin fleet-menu assignment editor; loads workspace users only when opened |
| `src/lib/inkbox.ts`, `src/lib/inkbox-provisioning.ts` | Server-only Inkbox client and resumable provisioning |
| `supabase/migrations/0002_inkbox.sql` | Service-role-only identity setup state; no plaintext keys |
| `supabase/migrations/0003_agent_icon.sql` | Bounded display icons in the tenant-scoped agent mirror |
| `supabase/migrations/0004_member_assignments.sql` | Member roles, tenant-scoped assignment, member display names and invite acceptance |
| `src/app/dashboard/agents/[agentId]/[[...tab]]/` | The per-agent tabbed workspace route (Chat / Identity / Files / Channels / Integrations / Schedule / Settings; Messaging is a retained hidden route) |
| `src/config/agents.ts` | `SHAPE_PRESETS`, `DEFAULT_AGENT`, the `AGENT_TYPES` catalog, `PORT_LABELS` (labels only), and `templateAppPorts` — the per-template openable app ports (the API no longer reports per-instance ports) |
| `src/config/branding.ts` | `appName` / `logoUrl` code constants (branding lives here, not in env) |
| `src/lib/types.ts` | App + upstream `/v1` types |
| `supabase/migrations/0001_init.sql` | Schema, RLS policies (dormant backstop), SECURITY DEFINER RPCs; grants tables to the service role only (clients have no direct DB access) |
| `src/lib/supabase/admin.ts` | Service-role client (server-only, bypasses RLS) — the DB egress |
| `scripts/setup.mjs` | One-command Supabase setup (`npm run setup`) |

## Commands

```bash
npm install
npm run setup       # configure Supabase end-to-end (idempotent; needs SUPABASE_ACCESS_TOKEN)
npm run dev         # http://localhost:3000
npm run build
npm run typecheck   # tsc --noEmit
```

Focused regressions run with `node --experimental-strip-types --test scripts/*.test.mjs`;
the gate before shipping is a clean `npm run typecheck` and `npm run build`.
Setup reads the selected local runtime/operations files and saves generated
credentials there. `.worktreeinclude` propagates ignored files to new managed
worktrees; refresh existing worktrees explicitly when credentials change.

## Custom agent image (out of scope here)

**There is no Docker in this repo.** New agents use Hermes, which runs
on Agent37's stock images, and nothing in `src/**` or `scripts/**` builds, pushes, or
references an image. Don't add a Dockerfile here — building a custom agent image is a
separate concern with its own repo and its own docs page:

- [agent37-platform/custom-agent-image](https://github.com/agent37-platform/custom-agent-image)
  — a GitHub template repo: a Dockerfile on the Hermes base, an example skill, a
  register script (Agent37 cloud build or a public registry), and an optional
  bring-your-own-model proxy.
- [Build a custom image](https://www.agent37.com/docs/agents-api/custom-image) — the guide.

Once that template is registered in your workspace, wiring it into this app is one
entry in `AGENT_TYPES` (`src/config/agents.ts`) whose `template` is the template name.

## House rules

- **The API is the final authority.** Shapes, disks, templates, budgets — the
  `/v1` API can reject anything your account's tier disallows, regardless of what
  `src/config` lists. Check the docs before assuming a capability exists.
- **Never expose `AGENT37_API_KEY` to the browser.** It stays server-side; all
  agent calls go through `src/app/api/**` → `src/lib/agent37.ts`.
- **A messaging channel is a door into the agent, so fill its allowlist.** Every channel
  takes an allowed-users field; empty means anyone who finds the bot reaches the agent,
  its files, and its connected accounts. The Telegram flow learns the owner from the
  first message sent to the bot rather than asking for a numeric id nobody knows.
- **Check a channel credential before writing it** where the provider lets you (Telegram's
  `getMe`). The agent's messaging gateway refuses to start on a bad token, which takes
  every other channel on that agent down with it.
- **Workspace billing uses a separate prepaid wallet.** See `BILLING.md`. Stripe payments
  and Host credit grants credit an atomic service-role ledger; every new workspace
  starts at zero. Only admins can manage billing. `src/lib/billing-sync.ts` reconciles
  tenant-owned Agent37 costs and runs automatic refills via the operator-authenticated
  `/api/billing/sync` sweep. Keep the shared upstream Agent37 wallet funded separately.
  Billing has no usage display or tiers. Credit grants require Host authorization. Payment
  credits require verified Stripe payments; browser amounts and checkout redirects never establish payment.
- **Branding lives in `src/config/branding.ts`** (`appName` / `logoUrl` constants),
  not in env. The old `NEXT_PUBLIC_APP_NAME` / `NEXT_PUBLIC_LOGO_URL` vars are gone;
  keep it code-side.
- Keep changes small and focused; don't add unrequested features or touch
  unrelated code.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
