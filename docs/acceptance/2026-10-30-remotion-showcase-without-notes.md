# Robyn showcase — seven-chapter cut without Notes

Updated and rendered October 30, 2026 at the owner's request to remove the dedicated research/notebook section. Based on web checkout `ec03ef366c7045afbd2d029ac1349b345d7b57df` plus local video changes. This accepts a local creative artifact, not an application/runtime deployment or a change to product capabilities.

The Notes scene, standalone composition, screenshot, asset-sync entry and `.md` format label are removed. Seven chapters retain the opening, fourteen Crafts, PhotoCraft/FilmCraft/SolidCraft editor captures, one Robyn, media, saved native revisions and invitation. The removed scene's time is redistributed across Crafts, editors, Robyn and media, preserving exactly 60 seconds. Chapter labels, standalone durations, the continuous mascot path, dark-scene contrast and original score's six bird cues follow the revised timeline.

## Validation

- Video lint/TypeScript, standalone bundle and mascot fidelity pass; all original 38,460 geometry points, seven colors and ASCII ramp remain exact.
- All 34 sampled master frames and seven standalone chapters render with no browser errors. Chapter pixels match their master frames exactly, excluding the five-pixel master progress bar. All six transitions were visually reviewed.
- All 24 copied assets match their byte counts and SHA-256 records. Source checks confirm the Notes scene, capture and old chapter registration are absent.
- The updated poster renders at 1920 × 1080. SHA-256: `2e2b5b6a1a3a1c6da6221367f7af0aaf45841dbe2d40b77811b15fbf7a401e7b`.
- The retimed original `public/audio/paper-and-wings.wav` remains 60-second, 48 kHz stereo PCM at 96 BPM. SHA-256: `2031e369fc8a64441d5f5316bdbe52279dff0560892bfe3471e66fe2639024a3`. Source sample peak is −2.99 dBFS and RMS −17.72 dBFS before the composition's 0.85 volume setting.
- Fresh verification covers the isolated video project. The earlier web checks remain recorded under [the preceding refresh](2026-10-30-remotion-showcase-refresh.md); application/runtime sources and dependencies are unchanged.

## MP4 export

- Output: `videos/robyn-showcase/out/robyn-showcase-without-notes.mp4` (ignored local artifact).
- Size: **15,638,568 bytes**.
- SHA-256: `b015ebbc7bf02803d17abfd12f270ad2fa4f68ee80840085d759010c94793d45`.
- Picture: **1920 × 1080, 30 fps, 1,800 frames / 60 seconds**, H.264 CRF 16, yuv420p, PNG intermediate frames, four render workers.
- Sound: original retimed score, AAC stereo at 48 kHz, 320 kbit/s target; measured bitrate 317,373 bit/s. Decoded sample peak −4.4 dBFS and mean volume −19.1 dBFS. These are sample-level measurements, not LUFS or true-peak certification.
- Container duration: **60.011 seconds**, including AAC packet duration.

ffprobe assertions and complete picture/audio decoding pass. Ten decoded frames (100, 350, 580, 700, 840, 995, 1290, 1540, 1740 and 1799) were compared with source stills, covering every chapter, all three editors and the final frame. RGB PSNR ranges from 35.194 to 38.575 dB after encoding; the decoded review board was visually inspected.

Detailed checks remain in ignored `out/qa-without-notes/` and `out/export-without-notes-qa-2026-10-30/`. Earlier receipts and the earlier MP4 remain preserved. No credentials, backend sessions, paid provider operations, database changes, editor pins or publication were involved.
