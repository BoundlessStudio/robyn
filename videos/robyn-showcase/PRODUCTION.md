# Robyn — Ideas have wings

A 60-second feature showcase at 1920 × 1080, 30 fps. Designed to communicate with sound off; the original stereo score adds rhythm and bird cues. All assets are local.

## Editorial sequence

| Start | Chapter | Feature |
| --- | --- | --- |
| 00:00 | Ideas have wings | Robyn's creative promise and original ASCII robin |
| 00:07.5 | Three studios | All 26 Crafts in Creative, Drafting and Analysis; twenty-four ready and two connecting |
| 00:15 | Real tools, your touch | Actual PhotoCraft, FilmCraft and SolidCraft editor captures |
| 00:25 | One Robyn, three studios | One workstation, fourteen ready Crafts, four project destinations, conversation/jobs/review/skills, and one monthly AI allowance |
| 00:32.5 | Browser tools and Notes | Robyn's search and browser control; saved findings remain editable Notes documents |
| 00:40 | Creative ingredients | Imports, Commons media, generated images/speech/video, and retained sources and credits |
| 00:47.5 | Save and continue | Private Assets, native files, exact saved revisions and continuation with Robyn |
| 00:55 | Invitation | robyn.academy; private pilot; desktop studio |

Scene starts include the half-second incoming wipe. The eight authored sequences total 63.5 seconds; seven 0.5-second overlaps produce exactly 60 seconds. The final invitation holds through the last frame.

## Art direction

Warm paper `#e9e8dc`, forest ink `#1b2a20`, rust `#cb4c2c`. Space Grotesk paired with Instrument Serif. Oversized editorial headlines, subtle glyph-like dot texture, restrained wipes and a single continuous mascot track.

The robin's original sampled geometry, seven ink colors and character ramp are preserved from `src/components/home/AsciiRobin.tsx`. Its render uses the composition frame and fps, with no wall clock, scrolling, random animation, external renderer or requestAnimationFrame loop. It flies between chapters, folds its wings, and retains its orange breast. A warm-paper spotlight supplies contrast on dark chapters and during flights; the bird itself is never recolored. The responsive glyph spacing matches the homepage (`max(4.2, width / 112)`, with 1.4 line spacing), drawn at twice the display resolution to retain legible ASCII detail in smaller appearances.

The master has exactly one continuous mascot layer. Standalone chapters include the same guide with their master-clock offset, so reviewing a chapter never drops or restarts the character. Feature-scene perches use 300–420px canvases, and the opening and invitation use 780px canvases. The catalog perch sits above the three studio columns so all 26 tools remain visible. Flight clearance protects the chapter header.

`Paper and Wings` is a deterministic original 96 BPM score: warm plucked tones, sustained harmony, soft percussion, stereo room taps, and short bird cues at chapter changes. It is 48 kHz, stereo PCM, 60 seconds, with a measured sample peak of -2.60 dBFS and RMS of -17.72 dBFS before the composition's 0.85 volume setting. These are sample measurements, not an integrated LUFS or true-peak certification. No voiceover, licensed music, stock samples or paid generation service was used.

## Source and claim boundaries

- Product scope follows `docs/ARCHITECTURE.md`, `docs/CURRENT-STATUS.md` (October 31, 2026), `docs/MEDIA-ACCEPTANCE.md` and the 26 app manifests. Creative contains 10 Crafts, Drafting 9 and Analysis 7 in manifest order, including DetailCraft. The current source catalog has twenty-four ready integrations; DashCraft and DataCraft remain pending and display Connecting. SubCraft source acceptance is separate from its production activation. Dated exports retain their original readiness scope. Installation does not claim new editing or paid-task readiness. Browsing and research are Robyn's tools; Notes is a saved document format.
- PhotoCraft and FilmCraft imagery is copied unchanged from `public/artwork/editors`. Their crops exclude the old surrounding QA shell at x184, y88, width1256, height912.
- SolidCraft uses the unchanged 1600 × 1000 `public/artwork/editors/solidcraft.png` capture from the accepted 0.27.0 editor exercise, with its original model and feature history. It is a recorded demonstration, not a claim that this image records the subsequent 0.27.1 release.
- The Notes source remains the unchanged historical `public/artwork/editors/research.jpg`, copied locally as `editors/notes.jpg`. Its x184, y130, width1256, height870 crop shows the saved notebook body below the retired Research toolbar. No replacement controls are painted onto the capture. These recorded product captures are not a newly recorded production session; `docs/HOMEPAGE-ARTWORK.md` owns their provenance.
- The brief → Robyn → editable-work flow, project destinations and revision stack are explanatory motion graphics. They do not represent a fresh authenticated UI capture, a new AI job or new saved production revisions. The media waveform is illustrative. The sunset comes from the actual FilmCraft capture.
- The generation caption covers the accepted image, speech and short-video profiles only. It does not claim generated music, image editing, sound effects, video reference inputs or unrestricted models. Sources and credits refer to the existing provenance and attribution workflow.
- The current source uses matching animal artwork for all 26 Crafts, documented in `public/brand/apps/sources.json`, including the corrected icon backgrounds. The original flower artwork is also reused. Dated exports retain their recorded icon/readiness scope; the final export after all 26 integrations are ready remains separate.
- `public/asset-sources.json` records copied asset paths, byte sizes and SHA-256 hashes plus the generated catalog and all 26 source-manifest hashes. Source-manifest and text-license line endings are normalized to LF. Font licenses are included in `public/fonts`; the historical SolidCraft attribution is retained with the app assets.
- The closing invitation accurately identifies the private desktop pilot. There is no public signup, subscription pricing, mobile editor, unrestricted generation, or new integration claim.

## Recorded export validation, October 31, 2026

- Remotion lint/TypeScript and bundling pass. The master is 1920 × 1080, 30 fps and exactly 1,800 frames / 60 seconds.
- All 25 copied assets and the 26-entry catalog match their recorded hashes. The catalog has fourteen ready integrations, twelve Connecting labels, fourteen existing icons and twelve monograms. The mascot check preserves all 38,460 original geometry points, seven colors and character ramp.
- QA renders 39 master samples and all eight standalone chapters. Renderer errors are empty; all eight chapters match their master pixels exactly, excluding the master's five-pixel progress bar. Visual review covers the catalog, revised Robyn scene, recorded editors and chapter transitions.
- The poster renders at 1920 × 1080. Studio loads and plays the revised master with music enabled. Preview and export use local assets and require no backend credentials.
- The requested export is `out/robyn-showcase-2026-10-31.mp4`: 16,582,295 bytes, H.264 CRF 16 with PNG intermediate frames, and 48 kHz stereo AAC. The video stream is exactly 60 seconds; AAC packet duration makes the container 60.011 seconds.
- Full video/audio decoding passes. Eleven decoded frames cover all chapters, the three recorded editors and the last frame; RGB PSNR ranges from 34.593 to 38.691 dB against approved source stills. Measured audio sample peak is −4.1 dBFS and mean volume −19.1 dBFS; these are sample measurements, not LUFS or true-peak certification.
- No editor pins, model permissions or verified-integration claims are changed by the video. The existing Remotion/Zod compatibility notice remains with the security override; dependencies are unchanged.

The [October 31 export receipt](../../docs/acceptance/2026-10-31-remotion-showcase-export.json) records the source commit, catalog, file and image hashes, decode checks and comparison results. Renders, raw checks and review boards stay in ignored `out/`. Website and workstation deployment evidence belongs to its separate release record; exporting this video does not itself deploy either service.

Earlier cuts retain their original scope in the [October 30 editorial receipt](../../docs/acceptance/2026-10-30-remotion-showcase-refresh.md), [October 30 export receipt](../../docs/acceptance/2026-10-30-remotion-showcase-export.md) and [October 27 export receipt](../../docs/acceptance/2026-10-27-remotion-showcase-export.md).
