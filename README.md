# Robyn Creative Studio

An invited personal creative studio with a Creative Director and independent AI specialists paired with ArtCraft applications. Built on Next.js, the Agent37 starter kit, Supabase, and Vercel.

The site is deployed at [robyn-creative-studio.vercel.app](https://robyn-creative-studio.vercel.app). The creative homepage includes original artwork, movable prints, an interactive campaign, an employee roster, a revision demonstration, and an invitation form with verified Supabase persistence.

The private studio carries that art direction into Projects, Asset Library, AI Employees, Applications, and Settings. It includes real project briefs, preview-led collections, native package imports with relative linked files, direct signed/resumable Storage transfers, immutable revision history, restoration, and preserved conflicts with save-as-new-asset. Desktop, tablet, mobile, and hosted sign-in have been reviewed.

The full pilot is **in development**. The 13 editor and native workstation integrations remain pending and are explicitly marked as such in their manifests. A visible roster is not a completed integration. [The implementation plan](docs/PLAN.md) defines the full acceptance criteria.

## Local development

```sh
npm install
npm run setup
npm run dev
```

The first setup run creates ignored `.env.local`. Add the Agent37 key and Supabase management token there, then rerun setup to configure Supabase, apply all migrations, and disable public signup. Do not put secrets into tracked files. See [SETUP.md](SETUP.md) for credentials and deployment details. Native workstations require a funded Agent37 account.

```sh
npm run typecheck
npm test
npm run build
```

Tests exercise invitation validation, redirect and origin boundaries, database grants, tenant isolation, atomic revision commits, missing dependencies, conflicts, restores, forks, and independent app registration. Live Supabase checks cover invitation persistence, onboarding, cross-tenant denial, resumable transfers, exact download bytes, and revision recovery. These package-service fixtures do not count as ArtCraft native/browser round trips.

## Application modules

Each `src/studio/apps/*.json` owns an application's role, instructions, capabilities, formats, editor release, native template, and readiness. `npm run registry` generates the registry and runs automatically before development and builds. Add a module without changing existing specialists. Mark an integration verified only after pinning and testing its artifacts.

## Deployment

Deploy through Vercel. Runtime variables are `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AGENT37_API_KEY`, and `NEXT_PUBLIC_SITE_URL`. The Supabase management token is setup-only and must not be deployed. The homepage does not load ArtCraft editor bundles.

Public signup is disabled. Hosted email/password sign-in works, and Supabase's Site URL and callback allow-list are configured for the live site and local development. The scoped setup token can verify these settings; changing them requires the dashboard or `project_admin_write`. Setup skips an unnecessary Auth update when the intended settings already match.

## Attribution

The foundation is [agent37-platform/starter-kit](https://github.com/agent37-platform/starter-kit), imported at `e6caed10767a0c7aafc77d76b0a54c9050169e8b`, under its retained MIT license. [Original starter documentation](docs/UPSTREAM-STARTER.md) is preserved for reference. [Artwork provenance](docs/ARTWORK.md) and [homepage QA](docs/HOMEPAGE-QA.md) document the public experience.
