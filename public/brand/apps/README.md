# Application icons

Nine icons are the original 256 × 256 WebP assets displayed in the [ArtCraft application catalogue](https://getartcraft.com/apps), retrieved October 27, 2026 and copied without modification. The embedded artwork includes each application's background colour and rounded silhouette.

At the owner's request, WordCraft (elephant), DeckCraft (peacock), GridCraft (beaver), CADCraft (spider) and Research (raven) use new engraved animal illustrations generated with the built-in `image_gen` tool. The office applications retain blue, orange and green tiles; CADCraft keeps turquoise and Research uses periwinkle. These five images are encoded as 256 × 256 WebP with their alpha preserved. A matching solid tile colour and rounded clipping provide a consistent interface silhouette.

SolidCraft uses a new engraved armadillo illustration generated with the built-in `image_gen` tool, matching the animal family on an azure-blue tile. Its 256 × 256 WebP preserves alpha. This replaces the original cube icon; the upstream attribution file is retained for its historical provenance.

`sources.json` distinguishes original assets from generated artwork and records source URLs or generation prompts, byte counts and SHA-256 digests. Filenames match the registered Craft IDs and Research. The Creative Director retains its own identity.

The shared `src/components/studio/AppIcon.tsx` renders these assets locally. Adjacent application or file names provide accessible labels; icon images are decorative. Published editor packages, native starters and workstation pins are independent of these interface assets.
