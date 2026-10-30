# AGENTS.md

## Current scope

This repository implements **Robyn Creative Studio**. [docs/README.md](docs/README.md) is the documentation index; [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) defines the current architecture and scope; [docs/CURRENT-STATUS.md](docs/CURRENT-STATUS.md) is the current acceptance index. Dated plans, checkpoints, reviews and release narratives live in [docs/archive/](docs/archive/README.md). CLAUDE.md imports this file, so keep the instructions here.

The pilot is invitation-only and passwordless. Public signup must remain disabled. The authenticated studio, all registered Crafts and Robyn’s browser/Notes tools are **desktop-only**. Compact/mobile editor work is outside the pilot and must not block completion. The public homepage supports mobile presentation. Explain the desktop requirement on unsupported first entry and preserve an already-open native editor when the window is temporarily narrowed. Do not restart speculative homepage performance work without a concrete reported issue or new request.

Independent app integrations live in src/studio/apps/*.json. Native images, browser adapter patches and workstation client sources belong in the companion ../robyn-artcraft-runtime, not a Dockerfile here. Never mark a manifest verified before its actual native → browser edit → confirmed save → native continuation passes. Do not overwrite a published release version with changed bytes.

The current architecture is one visible Robyn and one shared workstation per creator, with all registered Craft applications installed. Application instructions load as skills when needed. Browsing and research are tools; saved notebooks remain Notes. Do not recreate the retired Director/specialist/Researcher roster. Run one production job per workspace and preserve task-specific credentials, working folders, internal profiles and uncertain-operation fences. Historical employee rows retain attribution only.

## Authorization and provider boundaries

All private reads and writes use this app's BFF in src/app/api/**. The browser uses Supabase for Auth, not direct table access. Server requireUser, requireMember, requireAdmin, requireAgentAccess and Studio ownership checks are the authorization boundary. The service-role database client bypasses RLS, so keep the TypeScript owner checks. RLS/grants remain a private backstop: no direct table access for anon/authenticated roles.

src/lib/agent37.ts is the **only** client that calls Agent37. Control-plane calls use https://api.agent37.com/v1 with Bearer authentication. Instance data-plane calls use https://{instanceId}.agent37.app/v1 with X-Agent37-Key; its Authorization header passes through to the app. Keep both behind the server. metadata.app_workspace, employee identity and the Supabase mirror must agree before operating an instance. Never expose AGENT37_API_KEY or the service-role key to browser code, logs or artifacts.

Before adding or changing an agent capability, read the relevant authoritative API documentation:

- Index: https://www.agent37.com/docs/llms.txt
- Full reference: https://www.agent37.com/docs/llms-full.txt
- Instances, templates, URLs, budgets, billing, exec, errors, integrations and messaging: https://www.agent37.com/docs/agents-api
- Data-plane chat/responses, streaming, sessions/models and files are separate from instance lifecycle control.

The API determines supported shapes, disks, templates and budgets. Studio resources are chosen on the server. The Studio allowance is an application allocation policy over Agent37's per-instance caps, not an upstream atomic pooled budget. Legacy lifecycle controls must reject Studio employees. Preserve uncertain dispatch/payment fences; elapsed time does not authorize another external action.

Messaging/integration legacy routes still require owner checks. Messaging credentials must be validated where the provider supports it, and channel allowlists must be populated. Do not broaden connected-account access as part of an unrelated change.

## Setup, verification and release

Follow [SETUP.md](SETUP.md). Setup uses a private checksummed migration ledger and atomic incremental execution. Existing installations require a verified explicit baseline; never blindly replay migration files or clear the ledger to bypass an error. The two historical 0007 filenames are distinct ledger entries. Add a new migration for schema corrections.

    npm ci
    npx playwright install chromium firefox webkit
    npm run typecheck
    npm test
    npm run build

Use Node 24 and Python 3. Browser fixtures exercise actual component transitions and request identities. Homepage changes require visual review at desktop and mobile widths. Verify affected runtime tests in the companion repository; native/editor changes also need their actual round trip. CI is in .github/workflows/check.yml in both repositories.

Never print .env.local or credential values. Do not indiscriminately add ignored QA artifacts: some contain private access material. Keep sanitized summaries/hashes in docs/acceptance/; keep private receipts and recovery records outside version control. Distinguish local tests, recorded historical acceptance and a deployed release. Record matching web/runtime commits, migration state, editor pins and workstation client version in the release record.

Keep top-level docs focused on maintained system references and procedures. Update the owning document instead of appending one-pass plans or release logs. Temporary checkpoints belong in chat or ignored local notes; retain useful historical records in docs/archive/. Keep unresolved acceptance gaps in CURRENT-STATUS.md or the owning runbook, and preserve original source paths/hashes inside historical JSON receipts.

## Main locations

| Path | Responsibility |
| --- | --- |
| src/lib/agent37.ts | Single Agent37 control/data-plane client |
| src/lib/auth.ts, src/studio/server.ts | Server authentication and ownership checks |
| src/lib/supabase/admin.ts | Server-only database client |
| src/app/api/studio/** | Studio BFF, exact files, revisions, budgets and media |
| src/studio/apps/*.json | Independent Craft manifests and immutable release pins |
| src/studio/transfer-client.ts, package-store.ts | Private direct package transfers and recovery |
| src/studio/workstation.ts | Persisted employee provisioning and recovery |
| src/workflows/** | Fenced assignment, campaign and media orchestration |
| src/studio/media-worker.py | Bounded media acquisition, receipt recovery and safe local cleanup |
| src/config/agents.ts | Server-selected workstation defaults and legacy catalog |
| src/config/branding.ts, support.ts | Code-owned identity and support address |
| supabase/migrations/, scripts/migrations.mjs | Private schema and checksummed setup |
| docs/OPERATIONS.md | Health, settlement, retention, export/closure and restore runbooks |

Keep changes focused. Subscription billing and creator hosting/storage budgets are outside the pilot. Separate Storage-file backups were explicitly deferred by the owner on October 25; do not add them or treat them as a current completion blocker. Database recovery remains a separate documented gap.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
