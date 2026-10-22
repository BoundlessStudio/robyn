# Robyn Creative Studio

Build an invited solo-creator pilot on the Agent37 starter kit, Supabase, and Vercel. The public homepage is a piece of creative work in its own right. The product is a private, practical workspace for making and continuing that work.

## Creative direction: one imagination, an entire studio

Treat the homepage like an experimental editorial spread coming to life. Aim for the craft, distinctiveness, and interaction quality of an award-entry creative website. Avoid a conventional software landing page composed of repeated feature cards.

**Visual language.** Warm paper, near-black ink, electric cobalt, vermilion, and occasional acid green. Oversized tightly set display type meets expressive italic serif accents. Asymmetric compositions, generous breathing room, small editorial annotations, and a recurring hand-drawn orbit motif give the page a recognizable identity. Original campaign art supplies texture and specificity.

**Opening scene.** “Make something only you could imagine.” A viewport-filling composition layers a photographic art print, a typographic poster, a motion study, and technical marks around the headline. Selected pieces can be rearranged with a pointer or keyboard. Restrained pointer depth and coordinated entrance motion make this a living studio table. Explain the product plainly: a personal team of AI specialists using real creative applications, with files the creator can keep editing. Primary action: Request an invite. Secondary action: Explore the studio. Sign-in remains accessible.

**One brief, many expressions.** An original fictional campaign, OFFSCRIPT, becomes identity, imagery, poster, website, film, sound, and presentation work. Visitors select an artifact to see its application, specialist, and exact input relationships. These are labeled illustrative campaign examples; they must not imply a completed live integration.

**Meet the studio.** A browsable creative roster changes the featured artwork as visitors select a specialist. Generate it from the application registry. The Creative Director coordinates the project; each application has its own independent employee, instructions, tools, release, and workstation. Adding an application adds a module and employee without rewriting the existing specialists. The verified current ArtCraft catalog has 13 applications; the count is data, not an architectural limit.

**The work stays yours to change.** An interactive product demonstration follows Brief → employee creates → native file appears → creator edits → employee continues. Show saved revisions and the actual intended project model. Do not pretend the demonstration is a live editor.

**Closing invitation.** A memorable large typographic composition leads to a short, accessible invitation form. Persist requests to Supabase and acknowledge success only after storage succeeds.

**Motion and accessibility.** Native scrolling; purposeful entrance, reveal, and hover choreography; no heavy animation framework by default. Respect reduced motion. Give every drag interaction a keyboard alternative. Compose mobile separately, preserve touch scrolling, maintain visible focus, and avoid hover-only information. Load editor bundles only inside the workspace.

**Visual acceptance.** Review desktop and mobile in a real browser: artwork resolution, type wrapping, composition, contrast, focus order, reduced motion, selected states, successful and failed invitation requests, and no overflow. A polished hero alone does not satisfy this milestone.

## Platform and independent specialists

**Private studio art direction (user refinement).** Carry the public site's creative identity into the signed-in experience. Use Adobe and Apple as references for precision, calm tools, and giving the work prominence. Build a gallery-like project collection with large original artwork, expressive editorial typography, an understated horizontal application rail, and generous space. Use discipline-specific visual studies for employee/application discovery. Keep editor controls compact around the canvas; avoid repetitive dashboard cards, KPI widgets, and generic SaaS chrome. Label illustrative studio artwork clearly and use real project previews when available. Verify this direction on desktop and mobile alongside functional workflows.

- Next.js and TypeScript from `agent37-platform/starter-kit`; preserve its server-side authorization and Agent37 client boundaries.
- Supabase Auth with public signup disabled, server-authorized Postgres access, private Storage, and genuine access requests. Each invited creator receives a private studio.
- Vercel for the site and versioned browser editor bundles; Vercel Workflows for durable orchestration. Agent37 Hermes workstations execute creative work and rendering.
- Project navigation: Projects, Asset Library, AI Employees, Applications, Settings. Restrained dark editing workspace with asset rail, editor tabs, and resizable conversation / assignments / activity / review panels.
- Creative Director plus Photo Artist / PhotoCraft, Illustrator / VectorCraft, Photographer / LightCraft, Film Editor / FilmCraft, Motion Designer / EffectCraft, Sound Engineer / SoundCraft, Layout Designer / DesignCraft, PDF Specialist / PdfCraft, Writer / WordCraft, Presentation Designer / DeckCraft, Spreadsheet Specialist / GridCraft, Interface Designer / FigCraft, CAD Designer / CADCraft.
- Independently versioned `StudioAppManifest` modules supply identity, employee instructions, formats, capabilities, editor bundle, native template, and adapter version. Generate navigation, employee discovery, and routing from this registry.
- Create employee profiles at onboarding. Provision one separate persistent workstation per employee when first assigned; reuse and autosleep. Default to three active specialist jobs per studio, one at a time per employee.
- Keep native builds, browser builds, and explicit storage-hook patches in the companion `robyn-artcraft-runtime` repository. Pin tested releases. Missing integrations remain visibly unavailable until verified.

## Shared assets and coordination

Store projects, assignments, assets, immutable revisions, package files, dependencies, reviews, and activity in Postgres. `AssetRef` always identifies an asset and an exact revision. Each revision packages its native master, previews, exports, and linked media using safe relative paths.

Use scoped signed and resumable transfers directly between browser/workstation and private Supabase Storage. Large media must not pass through a Vercel request body. Commit revisions atomically against an expected base. Keep conflicting saves recoverable; offer reload or save as a new asset. Restoring creates a new revision.

The editor bridge implements `openAsset`, `saveAsset`, `listProjectAssets`, `insertAsset`, `notifyChanges`, and `requestAgentEdit`. Adapt genuine ArtCraft browser APIs and patch explicit save hooks where needed. A browser download is not a confirmed library save. Human and AI exchange saved revisions, without simultaneous shared-canvas editing.

Expose authenticated `/api/studio/*` operations and a scoped, revocable `studio-mcp` client on workstations. Let the Director coordinate intermediate handoffs and bring final outputs for human review. Persist workflow, assignment, session, and response identifiers; reconcile interrupted dispatch before retrying so production is not duplicated.

## Delivery sequence and acceptance

1. Import starter; invitation-only auth; Supabase foundation; Vercel preview.
2. Complete and visually verify the art-directed homepage and real invitation flow.
3. Build project workspace, registry, lazy employee profiles, and asset service.
4. Complete all 13 browser adapters and native employee integrations.
5. Connect Director orchestration, revision handoffs, final review, cancellation, and recovery.

Pilot completion requires every application to pass employee creates → creator opens and edits in-browser → saves → employee continues, preserving native editability. A cross-application campaign must pass Director coordination. Validate tenant isolation, interrupted uploads, missing dependencies, save conflicts, restoration, cancellation, and duplicate-run prevention. A test app must register without changing existing specialist modules. Type checks, production builds, integration checks, and deployed browser verification must pass.

Robyn is the working name. Billing and native desktop takeover are deferred. All 13 integrations remain required; a catalog or simulated editor is not a completed integration.

## Implementation record

- Starter imported from upstream commit `e6caed10767a0c7aafc77d76b0a54c9050169e8b` on branch `codex/creative-studio`.
- Homepage implemented and reviewed at 320, 390, 768, 1024, and 1440 pixels. All campaign choices, 14 employee profiles, revision-story steps, pointer/keyboard movement, resets, pause controls, and reduced motion exercised. Initial production page has no browser errors.
- Invitation API, consent validation, duplicate handling, private grants, and database rate limits implemented. Hosted form submission was confirmed in live Supabase.
- Thirteen independent manifests and automatic registry generation implemented. Test module addition leaves existing specialist files unchanged. All native/browser integrations remain pending.
- Type checking, thirteen web application tests, and the production build pass. Automated accessibility checks found no violations in reviewed desktop/mobile states after fixes.
- Supabase project `aipgsgijclnrdegwodks` is configured with migrations 0001–0005, private Storage, and public signup disabled. A scoped setup token can apply migrations; changing Auth configuration requires `project_admin_write` or the dashboard. The live Site URL and callback allow-list were saved through the dashboard and verified through the management API.
- Agent37 authentication and wallet funding were verified. A FilmCraft verification workstation is running the pinned native template with five-minute automatic sleep. Employee provisioning and managed-agent configuration remain pending.
- Vercel project `venatio-studios/robyn-creative-studio` is deployed at `https://robyn-creative-studio.vercel.app`. Vercel assigned the first deployment to production despite the deprecated `--target preview` CLI option; subsequent preview deployments must use `--environment preview`.
- Private studio art direction implemented and reviewed at 320, 390, 768, and 1440 pixels: horizontal navigation, editorial type, original discipline studies, real project previews, asset gallery, compact canvas tools, and responsive layouts.
- Live package-service QA passed with isolated synthetic accounts: 14 onboarding profiles, cross-tenant 404s, linked folder imports, direct signed TUS upload, interruption after a 6 MiB chunk followed by HEAD/PATCH resume, exact download bytes, restore as a new revision, competing saves, and preserving a conflict as a new asset. These are storage fixtures, not verified ArtCraft native documents.
- Companion repository `BoundlessStudio/robyn-artcraft-runtime` created with independently pinned checksums and commits for all 13 upstream releases. FilmCraft 0.10.0 has an explicit asynchronous save hook, lossless native JSON packaging, a separate-origin editor host, and a scoped package builder. Its browser bundle is deployed at `https://robyn-artcraft-editors.vercel.app/filmcraft/v0.10.0-0.1.0/`.
- FilmCraft native CLI → actual browser edit → confirmed library revision → native CLI continuation passed with a linked original PNG. Keyboard Save and File-menu Save both work. Edits during an upload remain dirty after the earlier acknowledgement; two editors preserve a conflict, and the conflicting native package reopens as a new asset. Seven runtime tests and five affected upstream engine tests pass. This verifies the file/editor foundation, not AI employee execution; the manifest remains pending.
- All 13 editor/native integrations, durable orchestration, final review, and cross-application campaign acceptance remain outstanding.
