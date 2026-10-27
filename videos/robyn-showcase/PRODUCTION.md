# Robyn — Ideas have wings

A 60-second feature showcase at 1920 × 1080, 30 fps. Designed to communicate with sound off; the original stereo score adds rhythm and bird cues. All assets are local.

## Editorial sequence

| Start | Chapter | Feature |
| --- | --- | --- |
| 00:00 | Ideas have wings | Robyn's creative promise and original ASCII robin |
| 00:07.5 | Thirteen Crafts | All thirteen current applications and their animal icons |
| 00:15 | Real tools, your touch | Actual PhotoCraft and FilmCraft editor captures |
| 00:25 | Your creative team | A brief, the Creative Director, Research and Craft specialists |
| 00:32.5 | Follow your curiosity | The actual editable Research notebook and human control |
| 00:40 | Creative ingredients | Image, audio and video assets; local imports and Commons |
| 00:47.5 | Save and continue | Native files, saved revisions and specialist continuation |
| 00:55 | Invitation | robyn.academy; private pilot; desktop studio |

Scene starts include the half-second incoming wipe. The eight authored sequences total 63.5 seconds; seven 0.5-second overlaps produce exactly 60 seconds. The final invitation holds through the last frame.

## Art direction

Warm paper `#e9e8dc`, forest ink `#1b2a20`, rust `#cb4c2c`. Space Grotesk paired with Instrument Serif. Oversized editorial headlines, subtle glyph-like dot texture, restrained wipes and a single continuous mascot track.

The robin's original sampled geometry, seven ink colors and character ramp are preserved from `src/components/home/AsciiRobin.tsx`. Its render uses the composition frame and fps, with no wall clock, scrolling, random animation, external renderer or requestAnimationFrame loop. It flies between chapters, folds its wings, and retains its orange breast. A warm-paper spotlight supplies contrast on dark chapters and during flights; the bird itself is never recolored. The responsive glyph spacing matches the homepage (`max(4.2, width / 112)`, with 1.4 line spacing), drawn at twice the display resolution to retain legible ASCII detail in smaller appearances.

The master has exactly one continuous mascot layer. Standalone chapters include the same guide with their master-clock offset, so reviewing a chapter never drops or restarts the character. Feature-scene perches use 350–420px canvases, and the opening and invitation use 780px canvases. Flight clearance protects the chapter header.

`Paper and Wings` is a deterministic original 96 BPM score: warm plucked tones, sustained harmony, soft percussion, stereo room taps, and short bird cues at chapter changes. It is 48 kHz, stereo PCM, 60 seconds, with a measured sample peak of -2.60 dBFS and RMS of -17.72 dBFS before the composition's 0.85 volume setting. These are sample measurements, not an integrated LUFS or true-peak certification. No voiceover, licensed music, stock samples or paid generation service was used.

## Source and claim boundaries

- Product scope comes from the repository's `docs/CURRENT-STATUS.md` (October 27, 2026), app manifests and existing homepage copy.
- PhotoCraft, FilmCraft and Research imagery is copied unchanged from `public/artwork/editors`. The video crops out the old surrounding QA shell at x184, y88, width1256, height912. These are recorded product captures, not a newly recorded production session. `docs/HOMEPAGE-ARTWORK.md` documents their provenance.
- The team flow and revision stack are explanatory motion graphics. They do not represent a new AI job or new saved production revisions. The media waveform is illustrative. The sunset comes from the actual FilmCraft capture.
- Application icons are the existing public originals and generated animal illustrations documented in `public/brand/apps/sources.json` in the web repository. The original flower artwork is also reused.
- `public/asset-sources.json` records the copied source paths, byte sizes and SHA-256 hashes. Font licenses are included in `public/fonts`.
- The closing invitation accurately identifies the private desktop pilot. There is no public signup, subscription pricing, mobile editor, unrestricted generation, or new integration claim.

## Local validation, October 27, 2026

- Remotion lint and TypeScript pass; the standalone bundle builds.
- npm audit reports zero vulnerabilities in the video project. The Zod security override uses 4.6.7. Remotion 4.0.539 emits a compatibility notice because it recommends 4.5.4; lint, bundling, Studio and still rendering were checked with the override in place.
- The QA script renders 38 master samples: each chapter, both editor captures, the last frame, and four phases around each of the seven transitions. It also renders all eight standalone chapters. It asserts 1920 × 1080, 30 fps and 1,800 frames, and checks renderer browser errors. Images and JSON check records stay in ignored `out/qa`.
- The mascot fidelity check confirms all 38,460 evaluated geometry points and their materials match the homepage exactly, along with the seven colors and the character ramp. Geometry SHA-256: `c88cf59c4c08e4cc109f360798474d8b8c25dcf665d6baef6d2a53e2e3ef1255`.
- At the eight chapter review frames, standalone scene pixels match the corresponding master frames exactly (excluding the master's five-pixel progress bar). The original pose, colors, motion clock and placement are preserved across the two preview modes. Review boards and pixel comparison records remain in ignored `out/`.
- Visual review corrected editor/footer spacing, the guide's caption clearance, brief wrapping, revision text wrapping and the sunset crop. The live Studio preview loads the local images and plays the composition with audio enabled.
- The web application's typecheck, all 109 tests and production build pass. No native/runtime source, application behavior, database, release pin or deployed site was changed.

The editable composition and live Studio preview remain available. On October 27, 2026, the requested local MP4 was exported to `out/robyn-showcase.mp4`: 1920 × 1080, 30 fps, 1,800 video frames, H.264 CRF 16 with PNG intermediate frames, and 48 kHz stereo AAC audio. The file is 16,538,173 bytes. Full video/audio decoding passed, and nine decoded chapter/end frames were compared with the approved stills. The video stream is exactly 60 seconds; the MP4 container reports 60.011 seconds because of AAC packet duration. Nothing was published or deployed. The sanitized export receipt is in [`docs/acceptance/2026-10-27-remotion-showcase-export.md`](../../docs/acceptance/2026-10-27-remotion-showcase-export.md).
