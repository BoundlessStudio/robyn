# Robyn Creative Studio

An invitation-only creative studio at **[robyn.academy](https://robyn.academy)**: one Robyn works with Craft applications, Chrome and Brave Search. Each creator has one shared workstation; application instructions load as skills and production jobs run one at a time. Saved research notebooks remain editable as Notes. Native files stay private and editable. Built with Next.js, Supabase, Agent37 and Vercel. Public editor releases are delivered through Cloudflare R2 and a separate read-only Worker.

The authenticated pilot is **desktop-only**. The public homepage is a mobile-capable, continuous ASCII robin tour with real Craft interface captures. Sign-in uses invitation-only email links; public signup and subscription billing are disabled. Start with the [documentation index](docs/README.md) and [architecture and scope](docs/ARCHITECTURE.md).

The source catalog groups **34 ready Crafts into Creative (13), Drafting (10), Analysis (8) and Operations (3)**. Operations contains PlanCraft for project scheduling, LedgerCraft for bookkeeping and reconciliation, and MailCraft for connected mail and portable mailbox files. DashCraft provides read-only report computation and viewing. [Current acceptance](docs/CURRENT-STATUS.md) records the deployed web/runtime sources, migration state, editor/workstation pins and acceptance limits. The [operator runbook](docs/OPERATIONS.md) covers support and recovery. [Archived records](docs/archive/README.md) preserve dated release and rollback evidence. Support is **support@robyn.academy**.

GridCraft, WordCraft and DeckCraft support **VBA** through their original Developer controls in the browser and Robyn's native workstation. Macros require per-document consent; original Save actions confirm private-library revisions. [The deployed VBA receipt](docs/acceptance/office-vba-deployed-20261104.json) records the supported interpreter subset and actual round trips.

## Develop and verify

Use Node 24 and Python 3. Browser regression fixtures require Playwright Chromium, Firefox and WebKit.

    npm ci
    npx playwright install chromium firefox webkit
    npm run dev

Configure secrets privately using [SETUP.md](SETUP.md). Never print or commit .env.local. Fresh setup uses a checksummed migration ledger. Existing deployments require a verified explicit baseline before incremental execution; do not replay old migrations. Native workstations require a funded Agent37 account.

    npm run typecheck
    npm test
    npm run build

Maintained tests exercise ownership, private grants, exact packages, conflicts/restores, migration replay, persisted retry identity, uncertain dispatch/payment recovery, media capacity/space, expired URLs and older-library discovery. CI runs these gates; the companion runtime has its own tests and bundle gate. Isolated fixtures do not replace live native/provider acceptance.

## Application and deployment boundaries

Each src/studio/apps/*.json owns one Craft's identity, skill instructions, formats, immutable release pins and readiness. npm run registry validates/generates the registry before development and builds. The companion ../robyn-artcraft-runtime owns the combined native image, browser adapters and immutable workstation bundles. Adding a Craft adds a tool and skill to Robyn. Mark an integration verified only after its real native/browser round trip passes.

All private actions go through server ownership checks. src/lib/agent37.ts is the single Agent37 client; service-role and Agent37 secrets never reach the browser. Package bytes transfer directly using short-lived private Storage authorization. File/media links renew against their exact saved revision.

Vercel runtime variables: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, AGENT37_API_KEY, NEXT_PUBLIC_SITE_URL. The Supabase management token is setup-only. Preserve invitation-only Auth and [passwordless confirmation](docs/PASSWORDLESS-AUTH.md). Domain and independent support-mail deployment are recorded in [DOMAIN-SETUP.md](docs/DOMAIN-SETUP.md).

## Attribution

Built on [agent37-platform/starter-kit](https://github.com/agent37-platform/starter-kit), imported at e6caed10767a0c7aafc77d76b0a54c9050169e8b, under its retained MIT license. [Historical starter documentation](docs/archive/UPSTREAM-STARTER.md) is reference material, not current product scope. [Homepage artwork provenance](docs/HOMEPAGE-ARTWORK.md) and the maintained acceptance index distinguish illustrations from verified integrations.
