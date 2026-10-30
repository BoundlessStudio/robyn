# Robyn — Ideas have wings

A 60-second feature showcase at 1920 × 1080, 30 fps. Designed to communicate with sound off; the original stereo score adds rhythm and bird cues. All assets are local.

## Editorial sequence

| Start | Chapter | Feature |
| --- | --- | --- |
| 00:00 | Ideas have wings | Robyn's creative promise and original ASCII robin |
| 00:07.5 | Fourteen Crafts | All fourteen applications, including SolidCraft's current armadillo icon |
| 00:16 | Real tools, your touch | Actual PhotoCraft, FilmCraft and SolidCraft editor captures |
| 00:29.5 | One Robyn, every Craft | One shared workspace, the four project destinations, conversation/jobs/review/skills, and one monthly AI allowance |
| 00:39 | Creative ingredients | Imports, Commons media, generated images/speech/video, and retained sources and credits |
| 00:47.5 | Save and continue | Private Assets, native files, exact saved revisions and continuation with Robyn |
| 00:55 | Invitation | robyn.academy; private pilot; desktop studio |

Scene starts include the half-second incoming wipe. The seven authored sequences total 63 seconds; six 0.5-second overlaps produce exactly 60 seconds. The removed research/notebook chapter's time is redistributed to Crafts, the three editor captures, Robyn and media. The final invitation holds through the last frame.

## Art direction

Warm paper `#e9e8dc`, forest ink `#1b2a20`, rust `#cb4c2c`. Space Grotesk paired with Instrument Serif. Oversized editorial headlines, subtle glyph-like dot texture, restrained wipes and a single continuous mascot track.

The robin's original sampled geometry, seven ink colors and character ramp are preserved from `src/components/home/AsciiRobin.tsx`. Its render uses the composition frame and fps, with no wall clock, scrolling, random animation, external renderer or requestAnimationFrame loop. It flies between chapters, folds its wings, and retains its orange breast. A warm-paper spotlight supplies contrast on dark chapters and during flights; the bird itself is never recolored. The responsive glyph spacing matches the homepage (`max(4.2, width / 112)`, with 1.4 line spacing), drawn at twice the display resolution to retain legible ASCII detail in smaller appearances.

The master has exactly one continuous mascot layer. Standalone chapters include the same guide with their master-clock offset, so reviewing a chapter never drops or restarts the character. Feature-scene perches use 350–420px canvases, and the opening and invitation use 780px canvases. The Craft-chapter perch sits above the icon rows so all fourteen tools remain visible. Flight clearance protects the chapter header.

`Paper and Wings` is a deterministic original 96 BPM score: warm plucked tones, sustained harmony, soft percussion, stereo room taps, and short bird cues at chapter changes. Its six transition cues follow the seven-chapter timeline. It is 48 kHz, stereo PCM, 60 seconds, with a measured sample peak of -2.99 dBFS and RMS of -17.72 dBFS before the composition's 0.85 volume setting. These are sample measurements, not an integrated LUFS or true-peak certification. No voiceover, licensed music, stock samples or paid generation service was used.

## Source and claim boundaries

- Product scope follows `docs/ARCHITECTURE.md`, `docs/CURRENT-STATUS.md` (October 30, 2026), `docs/MEDIA-ACCEPTANCE.md` and the fourteen app manifests. This cut focuses on one Robyn, the Crafts, media and saved native work. The retired Director/specialist roster remains excluded.
- PhotoCraft and FilmCraft imagery is copied unchanged from `public/artwork/editors`. Their crops exclude the old surrounding QA shell at x184, y88, width1256, height912.
- SolidCraft uses the unchanged 1600 × 1000 `public/artwork/editors/solidcraft.png` capture from the accepted 0.27.0 editor exercise, with its original model and feature history. It is a recorded demonstration, not a claim that this image records the subsequent 0.27.1 release.
- The dedicated research/notebook chapter, its capture and its standalone composition were removed at the owner's request. Earlier receipts retain that image's original source path and hash. The current video does not use it. `docs/HOMEPAGE-ARTWORK.md` owns the retained editor captures' provenance.
- The brief → Robyn → editable-work flow, project destinations and revision stack are explanatory motion graphics. They do not represent a fresh authenticated UI capture, a new AI job or new saved production revisions. The media waveform is illustrative. The sunset comes from the actual FilmCraft capture.
- The generation caption covers the accepted image, speech and short-video profiles only. It does not claim generated music, image editing, sound effects, video reference inputs or unrestricted models. Sources and credits refer to the existing provenance and attribution workflow.
- Application icons are the existing public originals and generated animal illustrations documented in `public/brand/apps/sources.json` in the web repository. The original flower artwork is also reused.
- `public/asset-sources.json` records the copied source paths, byte sizes and SHA-256 hashes, including SolidCraft's armadillo icon. Font licenses are included in `public/fonts`; the historical SolidCraft attribution is retained with the app assets.
- The closing invitation accurately identifies the private desktop pilot. There is no public signup, subscription pricing, mobile editor, unrestricted generation, or new integration claim.

## Current verification

Remotion lint/TypeScript, the standalone bundle and mascot fidelity checks pass. QA renders 34 master samples, including all three editor captures, the final frame and four phases around each of six transitions, plus all seven standalone chapters. Renderer errors are empty. Every chapter image matches its corresponding master pixels exactly after excluding the master's five-pixel progress bar. All 24 copied assets match their recorded byte counts and SHA-256 hashes. Visual review covers the retained editor captures and all six transitions. The poster renders at 1920 × 1080 with the seven-chapter footer.

The original 38,460 mascot geometry points, seven colors and character ramp remain exact; geometry SHA-256 is `c88cf59c4c08e4cc109f360798474d8b8c25dcf665d6baef6d2a53e2e3ef1255`. Current QA samples and comparisons are in ignored `out/qa-without-notes/`.

The [seven-chapter acceptance and export receipt](../../docs/acceptance/2026-10-30-remotion-showcase-without-notes.md) records the current `out/robyn-showcase-without-notes.mp4`: 15,638,568 bytes, 1920 × 1080, 30 fps, exactly 1,800 frames, H.264 CRF 16 with PNG intermediate frames and 48 kHz stereo AAC audio. Full video/audio decoding and ten decoded-frame comparisons pass. The earlier MP4 is preserved separately. These are local creative artifacts, not deployed application/runtime releases.

Earlier acceptance remains scoped to its original cut: [October 27 export](../../docs/acceptance/2026-10-27-remotion-showcase-export.md), [October 30 eight-chapter refresh](../../docs/acceptance/2026-10-30-remotion-showcase-refresh.md), and [October 30 eight-chapter MP4](../../docs/acceptance/2026-10-30-remotion-showcase-export.md). Their original source paths, hashes and local-test boundaries are preserved in those receipts.
