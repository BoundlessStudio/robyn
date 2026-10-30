# Robyn Creative Studio

An invitation-only creative studio at **[robyn.academy](https://robyn.academy)**: one Robyn works across fourteen Craft applications, with Chrome and Brave Search as tools. Each creator has one shared workstation; application instructions load as skills and production jobs run one at a time. Saved research notebooks remain editable as Notes. Native files stay private and editable. Built with Next.js, Supabase, Agent37 and Vercel. Public editor releases are delivered through Cloudflare R2 and a separate read-only Worker.

The authenticated pilot is **desktop-only**. The public homepage is a mobile-capable, continuous ASCII robin tour with real Craft interface captures. Sign-in uses invitation-only email links; public signup and subscription billing are disabled. [Current status and acceptance](docs/CURRENT-STATUS.md) is the concise entry point. [PLAN.md](docs/PLAN.md) retains complete scope and dated history.

The October 30 refresh is deployed at web `2459805694711db6cd1a3117cfb3979babe5e2eb`, paired with runtime `833e70ab99480f3d6c779591b44fa10e6a031af6`. All fourteen refreshed native/browser integrations, including SolidCraft **0.27.1**, passed actual private-library round trips. The combined **0.1.1** image and workstation client **0.2.0** are connected to the primary QA studio. An ordinary production AI workflow confirmed fourteen allowed tools and ran native version checks for CADCraft 0.14.0 and SolidCraft 0.27.1 before completion and creator approval. The private migration ledger has **29 matching entries through 0028**. [The release record](docs/acceptance/shared-workstation-release-20261030.json) records the exact pins and separate editor, operator-MCP and AI acceptance scopes.

**The rollout and cleanup are complete.** Authenticated production UI/browser-control checks passed. All seventeen retired workstations were deleted after their private archives passed rehash verification; exactly one linked primary workstation remains. Saved Notes, exact revisions, historical jobs and spending are preserved. Shared Commons media and bounded generation use the same Studio allowance. [The production receipt](docs/acceptance/shared-workstation-production-20261030.json) records the outcomes; [current acceptance](docs/CURRENT-STATUS.md) and the [operator runbook](docs/OPERATIONS.md) retain broader provider/browser and disaster-recovery limits. Support forwarding is live at **support@robyn.academy**; the [October 25 remediation record](docs/RELEASE-2026-10-25.md) remains historical evidence.

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

Built on [agent37-platform/starter-kit](https://github.com/agent37-platform/starter-kit), imported at e6caed10767a0c7aafc77d76b0a54c9050169e8b, under its retained MIT license. [Historical starter documentation](docs/UPSTREAM-STARTER.md) is reference material, not current product scope. [Homepage artwork provenance](docs/HOMEPAGE-ARTWORK.md) and the maintained acceptance index distinguish illustrations from verified integrations.
