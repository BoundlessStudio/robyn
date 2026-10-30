# Robyn feature showcase

The original ASCII robin guides a 60-second, 1920 × 1080 feature showcase. Seven chapters cover fourteen Crafts, real editors including SolidCraft, one Robyn across every tool, media and exact revisions. The project navigation and shared monthly AI allowance reflect the October 30 studio. Includes local brand fonts, recorded editor captures, current application icons, an original stereo soundtrack and a poster composition.

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

`qa:mascot` compares every geometry point, material, color and character against the original homepage robin. `qa:stills` validates metadata and captures 34 master frames, including all three featured editors and takeoff, wipe and landing samples at every transition, plus all seven standalone chapters into ignored `out/qa-without-notes`. Use `npm run qa:stills -- --chapters-only` to inspect just the chapter previews. These are still-frame checks, not an MP4 export. The first run may download Remotion's Chrome Headless Shell.

All required public assets are checked in. `npm run assets` refreshes them from the web repository (run the web root's `npm ci` first to make its font files available). `npm run score` reproduces the original soundtrack from source, without external services.

The video has its own lockfile and dependencies and is excluded from the web application's TypeScript scope and Vercel uploads. No application credentials or live backend access are needed.
