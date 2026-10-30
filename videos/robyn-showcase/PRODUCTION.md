# Robyn — Ideas have wings

A 60-second feature showcase at 1920 × 1080, 30 fps. Designed to communicate with sound off; the original stereo score adds rhythm and bird cues. All assets are local.

## Editorial sequence

| Start | Chapter | Feature |
| --- | --- | --- |
| 00:00 | Ideas have wings | Robyn's creative promise and original ASCII robin |
| 00:07.5 | Fourteen Crafts | All fourteen applications, including SolidCraft's current armadillo icon |
| 00:15 | Real tools, your touch | Actual PhotoCraft, FilmCraft and SolidCraft editor captures |
| 00:25 | One Robyn, every Craft | One shared workspace, the four project destinations, conversation/jobs/review/skills, and one monthly AI allowance |
| 00:32.5 | Browser tools and Notes | Robyn's search and browser control; saved findings remain editable Notes documents |
| 00:40 | Creative ingredients | Imports, Commons media, generated images/speech/video, and retained sources and credits |
| 00:47.5 | Save and continue | Private Assets, native files, exact saved revisions and continuation with Robyn |
| 00:55 | Invitation | robyn.academy; private pilot; desktop studio |

Scene starts include the half-second incoming wipe. The eight authored sequences total 63.5 seconds; seven 0.5-second overlaps produce exactly 60 seconds. The final invitation holds through the last frame.

## Art direction

Warm paper `#e9e8dc`, forest ink `#1b2a20`, rust `#cb4c2c`. Space Grotesk paired with Instrument Serif. Oversized editorial headlines, subtle glyph-like dot texture, restrained wipes and a single continuous mascot track.

The robin's original sampled geometry, seven ink colors and character ramp are preserved from `src/components/home/AsciiRobin.tsx`. Its render uses the composition frame and fps, with no wall clock, scrolling, random animation, external renderer or requestAnimationFrame loop. It flies between chapters, folds its wings, and retains its orange breast. A warm-paper spotlight supplies contrast on dark chapters and during flights; the bird itself is never recolored. The responsive glyph spacing matches the homepage (`max(4.2, width / 112)`, with 1.4 line spacing), drawn at twice the display resolution to retain legible ASCII detail in smaller appearances.

The master has exactly one continuous mascot layer. Standalone chapters include the same guide with their master-clock offset, so reviewing a chapter never drops or restarts the character. Feature-scene perches use 350–420px canvases, and the opening and invitation use 780px canvases. The Craft-chapter perch sits above the icon rows so all fourteen tools remain visible. Flight clearance protects the chapter header.

`Paper and Wings` is a deterministic original 96 BPM score: warm plucked tones, sustained harmony, soft percussion, stereo room taps, and short bird cues at chapter changes. It is 48 kHz, stereo PCM, 60 seconds, with a measured sample peak of -2.60 dBFS and RMS of -17.72 dBFS before the composition's 0.85 volume setting. These are sample measurements, not an integrated LUFS or true-peak certification. No voiceover, licensed music, stock samples or paid generation service was used.

## Source and claim boundaries

- Product scope follows `docs/ARCHITECTURE.md`, `docs/CURRENT-STATUS.md` (October 30, 2026), `docs/MEDIA-ACCEPTANCE.md` and the fourteen app manifests. The update removes the retired Director/specialist roster and separate Research application. Browsing and research are Robyn's tools; Notes is a saved document format.
- PhotoCraft and FilmCraft imagery is copied unchanged from `public/artwork/editors`. Their crops exclude the old surrounding QA shell at x184, y88, width1256, height912.
- SolidCraft uses the unchanged 1600 × 1000 `public/artwork/editors/solidcraft.png` capture from the accepted 0.27.0 editor exercise, with its original model and feature history. It is a recorded demonstration, not a claim that this image records the subsequent 0.27.1 release.
- The Notes source remains the unchanged historical `public/artwork/editors/research.jpg`, copied locally as `editors/notes.jpg`. Its x184, y130, width1256, height870 crop shows the saved notebook body below the retired Research toolbar. No replacement controls are painted onto the capture. These recorded product captures are not a newly recorded production session; `docs/HOMEPAGE-ARTWORK.md` owns their provenance.
- The brief → Robyn → editable-work flow, project destinations and revision stack are explanatory motion graphics. They do not represent a fresh authenticated UI capture, a new AI job or new saved production revisions. The media waveform is illustrative. The sunset comes from the actual FilmCraft capture.
- The generation caption covers the accepted image, speech and short-video profiles only. It does not claim generated music, image editing, sound effects, video reference inputs or unrestricted models. Sources and credits refer to the existing provenance and attribution workflow.
- Application icons are the existing public originals and generated animal illustrations documented in `public/brand/apps/sources.json` in the web repository. The original flower artwork is also reused.
- `public/asset-sources.json` records the copied source paths, byte sizes and SHA-256 hashes, including SolidCraft's armadillo icon. Font licenses are included in `public/fonts`; the historical SolidCraft attribution is retained with the app assets.
- The closing invitation accurately identifies the private desktop pilot. There is no public signup, subscription pricing, mobile editor, unrestricted generation, or new integration claim.

## Current validation, October 30, 2026

- Remotion lint/TypeScript and the standalone bundle pass. The master remains 1920 × 1080, 30 fps and exactly 1,800 frames / 60 seconds.
- The final QA pass renders 39 master samples, including PhotoCraft, FilmCraft, SolidCraft, the last frame and four phases around every transition, plus all eight standalone chapters. Renderer errors are empty. All eight chapter images match their corresponding master pixels exactly, excluding the master's five-pixel progress bar.
- Visual review covers all chapters and seven transitions. The bird clears both rows of Craft icons and the Notes caption. The three editor captures retain their correct individual aspect ratios, and the Notes shot excludes the retired toolbar.
- All 25 copied assets match their recorded byte counts and SHA-256 hashes. The fourteen icon IDs match the current Craft manifests exactly. The mascot fidelity check preserves all 38,460 original geometry points, seven colors and character ramp.
- The updated poster renders at 1920 × 1080. Studio loads the revised master, its player advances with music enabled, and no browser errors or warnings were recorded.
- The web application's typecheck, all 233 tests (229 main tests and four Markdown tests), and production build pass. The three Playwright engines are installed. Video and web dependency installation audits each report zero vulnerabilities. The existing Remotion/Zod compatibility notice remains with the security override; lint, both bundles, Studio and still rendering pass without changing dependencies.
- One earlier still pass encountered a local Chromium `ERR_NO_BUFFER_SPACE` font fetch failure. A complete rerun passed; the final visual adjustment was followed by another clean full pass.

The [sanitized local acceptance record](../../docs/acceptance/2026-10-30-remotion-showcase-refresh.md) identifies the checked samples and hashes. Updated stills, comparisons, review boards and poster remain in ignored `out/`. At the owner's subsequent request, the updated composition was exported to `out/robyn-showcase.mp4`: 16,905,335 bytes, 1920 × 1080, 30 fps, exactly 1,800 frames, H.264 CRF 16 with PNG intermediate frames, and 48 kHz stereo AAC audio. Full video/audio decoding passed; eleven decoded chapter/editor/end frames were compared with the approved stills and visually reviewed. The [October 30 export receipt](../../docs/acceptance/2026-10-30-remotion-showcase-export.md) records the file hash and measurements. This is a local creative artifact; no application/runtime release was deployed. The original export receipt below remains historical.

## Original validation and export, October 27, 2026

The following records apply to the original thirteen-Craft cut, before the October 30 editorial update. They do not certify the updated composition.

- Remotion lint and TypeScript pass; the standalone bundle builds.
- npm audit reports zero vulnerabilities in the video project. The Zod security override uses 4.6.7. Remotion 4.0.539 emits a compatibility notice because it recommends 4.5.4; lint, bundling, Studio and still rendering were checked with the override in place.
- The QA script renders 38 master samples: each chapter, both editor captures, the last frame, and four phases around each of the seven transitions. It also renders all eight standalone chapters. It asserts 1920 × 1080, 30 fps and 1,800 frames, and checks renderer browser errors. Images and JSON check records stay in ignored `out/qa`.
- The mascot fidelity check confirms all 38,460 evaluated geometry points and their materials match the homepage exactly, along with the seven colors and the character ramp. Geometry SHA-256: `c88cf59c4c08e4cc109f360798474d8b8c25dcf665d6baef6d2a53e2e3ef1255`.
- At the eight chapter review frames, standalone scene pixels match the corresponding master frames exactly (excluding the master's five-pixel progress bar). The original pose, colors, motion clock and placement are preserved across the two preview modes. Review boards and pixel comparison records remain in ignored `out/`.
- Visual review corrected editor/footer spacing, the guide's caption clearance, brief wrapping, revision text wrapping and the sunset crop. The live Studio preview loads the local images and plays the composition with audio enabled.
- The web application's typecheck, all 109 tests and production build pass. No native/runtime source, application behavior, database, release pin or deployed site was changed.

The editable composition and live Studio preview remain available. On October 27, 2026, the requested local MP4 was exported to `out/robyn-showcase.mp4`: 1920 × 1080, 30 fps, 1,800 video frames, H.264 CRF 16 with PNG intermediate frames, and 48 kHz stereo AAC audio. The file is 16,538,173 bytes. Full video/audio decoding passed, and nine decoded chapter/end frames were compared with the approved stills. The video stream is exactly 60 seconds; the MP4 container reports 60.011 seconds because of AAC packet duration. Nothing was published or deployed. The sanitized export receipt is in [`docs/acceptance/2026-10-27-remotion-showcase-export.md`](../../docs/acceptance/2026-10-27-remotion-showcase-export.md).
