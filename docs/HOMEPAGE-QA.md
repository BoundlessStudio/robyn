# Homepage verification inventory

The visual target is an original editorial composition: confident typography, tactile artwork, asymmetric layering, and consistent craft across every section. Initial desktop view must show the headline, product explanation, artwork, and invitation action. Mobile must have its own composition with all controls reachable through native scrolling.

| Claim or control | Functional check | Visual evidence |
| --- | --- | --- |
| Hero composition | Home loads without private service configuration; no editor bundles loaded | 1440×1000 and 390×844 initial viewport |
| Movable artwork | Pointer drag, keyboard arrows, Escape reset, global reset | Before / moved / restored compositions |
| Campaign explorer | Every artifact button changes artwork, employee, and dependencies | Identity, image, website, sound, film, and slides |
| Registry roster | Director and every specialist selectable; next control wraps | Director plus representative distinct crafts; densest roster |
| Revision story | Five steps, arrows forward and backward, wraparound | Brief, crop, saved revision, and continued work |
| Invitation request | Invalid email / missing consent; unavailable backend; successful persistence only when configured | Field focus, error, and confirmed success states |
| Navigation | All anchors, sign-in, privacy, request links | Focus rings and destination states |
| Motion | Pause / resume; reduced-motion context; no hidden section after navigation | Settled and intermediate states |
| Responsive layout | Desktop, tablet, 390px, 320px; no horizontal page overflow | All sections and footer |
| Accessibility | Keyboard controls, labels, contrast, screen-reader state updates; automated axe scan | Visible focus and error announcement |
| Off-path exploration | Move art toward bounds; switch specialties quickly; retry failed submit; navigate back from sign-in | No overlay blocking required controls |

Live invitation success and authentication must be verified against configured Supabase; mocked browser success is not evidence of database persistence. All campaign art and the workflow are labeled illustrative. Application integrations require their own native round-trip acceptance beyond this page.

## Local results — October 21, 2026

- Production build and type check pass. Ten Node/PostgreSQL tests pass. `npm audit` reports zero vulnerabilities after updating the starter dependencies.
- Chromium reviewed at 320, 390, 768, 1024, and 1440 pixels; no horizontal page overflow. Desktop and mobile hero compositions, campaign, roster, workflow, invitation, and footer inspected.
- Pointer and keyboard repositioning, Escape reset, global reset, all seven campaign selections, all 14 employees, employee wraparound, all five workflow steps, and forward/backward wrapping pass.
- Reduced-motion context disables animation. Pause control stops movement. Sticky navigation keeps sign-in accessible. Waveform coordinates are rounded to avoid cross-engine hydration differences.
- Invalid email and absent consent prevent submission. Same-origin requests reach the endpoint; missing service configuration returns 503 with an explicit unsaved message and a usable retry button. Cross-origin requests are rejected.
- Axe checks of reviewed desktop/mobile states report no WCAG 2 A/AA or 2.1 A/AA violations. Original art captions and drag-control accessible names were corrected during review.
- Initial production render has no browser console errors. Responsive hero image is served as a roughly 49 KB optimized image at the tested desktop viewport. No ArtCraft WASM/editor bundles are requested by the homepage.
- Local evidence is in ignored `artifacts/qa/`, including `home-desktop-production.png` and `home-mobile-production.png`.

## Hosted and private studio results — October 21, 2026

- Deployed site returns 200 at `https://robyn-creative-studio.vercel.app`; signed-out studio APIs return 401. An isolated invited test account signs in successfully, with no browser errors. Public signup is confirmed disabled through Supabase's Auth configuration.
- A synthetic invitation request submitted through the hosted form produced the success state and exactly one live database record. No invitation email was sent during QA.
- The signed-in collection, employee/application galleries, asset library, settings, and project canvas received desktop/mobile visual review. The studio uses artwork, warm charcoal, editorial serif accents, and compact tools. There are no KPI widgets or repetitive dashboard cards.
- Projects: create, save brief, archive/reactivate, active/archive filters, no-result search, project covers, and persisted studio-name changes pass.
- Assets: folder imports retain relative paths; a preview becomes a gallery/project cover; the master downloads with the exact original bytes. A 12 MiB linked file paused after its first 6 MiB chunk and resumed with HEAD 200 / PATCH 204. Restoring revision 1 created revision 3. Competing saves preserved a conflict, and the conflict fork opened as a new asset.
- All five detail panels and the desktop width control were exercised. Conversation, assignments, and review accurately describe the pending employee integration. The editor canvas is currently a package preview, not a simulated working ArtCraft editor.
- Second-account probes returned 404 for the first account's project and revisions. New onboarding produced the Director and 13 independent employee profiles.
- Final selected-asset workspace, application gallery, employee gallery, mobile collection, and hosted workspace axe checks report zero violations. Reviewed widths: 320, 390, 768, 1440 pixels. No horizontal page overflow or overlapping preview/toolbar controls remain. Small-screen navigation and asset rails intentionally scroll horizontally.
- Screenshots and machine-readable evidence are in ignored `artifacts/qa/`, including `deployed-studio-desktop.png`, `deployed-studio-mobile.png`, `deployed-workspace-desktop.png`, `deployed-invitation-saved.png`, `studio-conflict-desktop.png`, and `live-service-results.json`. Fixtures and QA credentials remain ignored.

Still required: configure the hosted email-link return URL/allow-list, all 13 actual native/browser round trips, Director orchestration, durable cancellation/recovery and duplicate-run prevention, and a cross-application campaign. The full pilot is not complete.
