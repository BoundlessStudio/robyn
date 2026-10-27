# Application icon refresh — October 27, 2026

Fresh local acceptance for the application icon refresh. The application-led workspace and native continuation evidence remain in their separate release records.

## Artwork and scope

Ten unchanged 256 × 256 WebP originals come from the [ArtCraft catalogue](https://getartcraft.com/apps). At the owner's request, WordCraft, DeckCraft and GridCraft instead use engraved elephant, peacock and beaver illustrations, retaining blue, orange and green tiles. Research uses a matching raven on periwinkle. These four illustrations were created with the built-in image generation tool and encoded as 256 × 256 WebP with alpha preserved.

The shared icon component supplies project launchers and choosers, application and specialist cards, project file badges, library placeholders, native placeholders and Research browser links. Adjacent text supplies accessible names; the images are decorative. Registry order and application names are preserved. Source URLs, exact prompts, output sizes and SHA-256 hashes are in [the asset manifest](../../public/brand/apps/sources.json).

## Local verification

- Node 24: typecheck, all 109 web tests and the production build passed.
- The six application workspace transitions passed in Chromium (full suite), Firefox and WebKit. Coverage includes all thirteen launches, manual creation without AI allowance, cancelled replacement, supporting panels, narrowing, common types, catalogue selection and interrupted-launch identity.
- Visual review covered 1200, 1440 and 1920 pixel desktop launchers, the chooser, employee cards, office catalogue cards, 28-pixel file badges and 96-pixel library placeholders. All fourteen launcher images loaded at square dimensions, with no horizontal overflow or icon clipping.
- An interactive WordCraft transport fixture preserved unsaved text when another application was cancelled, then saved and appeared in the library with its new elephant icon. The fixture uses a transport peer; it is not fresh native-editor acceptance.
- The launcher had zero axe violations and no browser page errors. Research and office images use the same shared rendering path as the other Crafts.

Screenshots and detailed logs remain in ignored local QA storage. Native/editor packages, version-1 starter bytes, manifests, workstation client 0.1.23, migrations and runtime sources are unchanged. No new native round trip or runtime test run is claimed for this visual-only change. Production deployment is recorded separately after verification.
