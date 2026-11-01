# Robyn feature showcase

The original ASCII robin guides a 60-second, 1920 × 1080 feature showcase. Seven chapters cover 26 Crafts grouped into Creative (10), Drafting (9) and Analysis (7), real editors including SolidCraft, one Robyn across the studios, sources, the Asset library, compatible files moving between Crafts, media and exact revisions. The standalone browser/Notes chapter and its historical Research capture have been removed. The current source catalog has all 26 integrations ready, including the read-only DashCraft report viewer and the editable DataCraft SQLite workspace. Includes local brand fonts, recorded editor captures, current application icons and monograms, an original stereo soundtrack and a poster composition. Previously exported videos retain their dated acceptance scope; changing the source does not create a new export.

## Preview and edit

Use Node 24. From this directory:

```powershell
npm ci
npm run dev -- --no-open
```

Open the URL printed by Remotion and choose **RobynShowcase**. Press Space to play. The `music` default prop toggles the soundtrack. The **Chapters** folder opens each scene's own timeline with the robin at its matching master time. The master holds one continuous bird track and the score.

- `src/Composition.tsx`: master sequence, timing, sound and output dimensions.
- `src/scenes/`: individually editable chapters and their copy.
- `src/components/AsciiBird.tsx`: mascot animation and flight path.
- `src/bird-model.ts`: original homepage robin geometry.
- `src/theme.ts`: brand palette and local fonts.
- `public/catalog.json`: presentation and readiness snapshot of all 26 app manifests, refreshed by `npm run assets`.
- `PRODUCTION.md`: storyboard, asset provenance, claim limits and validation.

## Export when needed

Use Studio's **Render** button, or:

```powershell
npm run render
```

This exports `out/robyn-showcase.mp4` with H.264 at CRF 16 and AAC audio. No MP4 is exported automatically. To export the poster:

```powershell
npx remotion still src/index.ts RobynPoster out/robyn-poster.png
```

## Maintain and verify

```powershell
npm run lint
npm run build
npm run qa:mascot
npm run qa:stills
npm audit
```

`qa:mascot` compares every geometry point, material, color and character against the original homepage robin. `qa:stills` validates metadata and captures 42 master frames, including all five featured editors, both parts of the sources/Assets chapter and takeoff, wipe and landing samples at every chapter transition, plus all seven standalone chapters into ignored `out/qa`. Use `npm run qa:stills -- --chapters-only` to inspect just the chapter previews. Pass `--out-dir=out/qa-name` to preserve an earlier check's frames. These are still-frame checks, not an MP4 export. The first run may download Remotion's Chrome Headless Shell.

All required public assets are checked in. `npm run assets` refreshes them and the catalog from the web repository using Node 24 (run the web root's `npm ci` first to make its font files available). Existing icon provenance determines which applications use images; pending applications without an icon use their catalog monogram. Image/font bytes are preserved and license text uses LF line endings. `npm run score` reproduces the original soundtrack from source, without external services.

The video has its own lockfile and dependencies and is excluded from the web application's TypeScript scope and Vercel uploads. No application credentials or live backend access are needed.
