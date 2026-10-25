# Robyn Creative Studio

An invitation-only creative studio at **[robyn.academy](https://robyn.academy)**: a Creative Director, thirteen Craft specialists and Research, working with private native files that the creator can keep editing. Built with Next.js, Supabase, Agent37 and Vercel. Public editor releases are delivered through Cloudflare R2 and a separate read-only Worker.

The authenticated pilot is **desktop-only**. The public homepage is a mobile-capable, continuous ASCII robin tour with real Craft interface captures. Sign-in uses invitation-only email links; public signup and subscription billing are disabled. [Current status and acceptance](docs/CURRENT-STATUS.md) is the concise entry point. [PLAN.md](docs/PLAN.md) retains complete scope and dated history.

All thirteen native/browser integrations and Research have recorded production round trips. The deployed budget/media release supports shared Commons media, three generation services with bounded evidence, immutable provenance, exact revision handoffs and Studio AI allowance allocation. Broader generation options, browser coverage and recovery claims remain limited to their documented acceptance.

The October 25 review fixes are a **local release candidate**, separate from the deployed application. See the [remediation report](docs/PROJECT-REVIEW-2026-10-25.md), [release record](docs/RELEASE-2026-10-25.md) and [operator runbook](docs/OPERATIONS.md). Support forwarding is live at **support@robyn.academy**.

## Develop and verify

Use Node 24 and Python 3. The browser regression fixtures require Playwright Chromium.

    npm ci
    npx playwright install chromium
    npm run dev

Configure secrets privately using [SETUP.md](SETUP.md). Never print or commit .env.local. Fresh setup uses a checksummed migration ledger. Existing deployments require a verified explicit baseline before incremental execution; do not replay old migrations. Native workstations require a funded Agent37 account.

    npm run typecheck
    npm test
    npm run build

Maintained tests exercise ownership, private grants, exact packages, conflicts/restores, migration replay, persisted retry identity, uncertain dispatch/payment recovery, media capacity/space, expired URLs and older-library discovery. CI runs these gates; the companion runtime has its own tests and bundle gate. Isolated fixtures do not replace live native/provider acceptance.

## Application and deployment boundaries

Each src/studio/apps/*.json owns one Craft's role, instructions, formats, release pins, native template and readiness. npm run registry validates/generates the registry before development and builds. The companion ../robyn-artcraft-runtime owns native images, browser adapters and immutable workstation bundles. Mark an integration verified only after its real native/browser round trip passes.

All private actions go through server ownership checks. src/lib/agent37.ts is the single Agent37 client; service-role and Agent37 secrets never reach the browser. Package bytes transfer directly using short-lived private Storage authorization. File/media links renew against their exact saved revision.

Vercel runtime variables: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, AGENT37_API_KEY, NEXT_PUBLIC_SITE_URL. The Supabase management token is setup-only. Preserve invitation-only Auth and [passwordless confirmation](docs/PASSWORDLESS-AUTH.md). Domain and independent support-mail deployment are recorded in [DOMAIN-SETUP.md](docs/DOMAIN-SETUP.md).

## Attribution

Built on [agent37-platform/starter-kit](https://github.com/agent37-platform/starter-kit), imported at e6caed10767a0c7aafc77d76b0a54c9050169e8b, under its retained MIT license. [Historical starter documentation](docs/UPSTREAM-STARTER.md) is reference material, not current product scope. [Homepage artwork provenance](docs/HOMEPAGE-ARTWORK.md) and the maintained acceptance index distinguish illustrations from verified integrations.
