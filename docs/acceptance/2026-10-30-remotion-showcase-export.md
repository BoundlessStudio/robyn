# Updated Robyn showcase — local MP4 export

Rendered October 30, 2026 at the owner's request from the [updated fourteen-Craft composition](2026-10-30-remotion-showcase-refresh.md). This is a local creative artifact, not a deployed application or runtime release. The October 27 export receipt retains its original scope.

- Source: `videos/robyn-showcase`, composition `RobynShowcase`, Remotion 4.0.539; web checkout `a5ce3572e9ae980c5bc5fd075c73d8e7c2b5e89e` plus the local editorial changes.
- Output: `videos/robyn-showcase/out/robyn-showcase.mp4` (ignored local artifact).
- Size: **16,905,335 bytes**.
- SHA-256: `e5c6c60214029e73c57b0dba3df17b2b3070fa11dae0ed340cb4239ac475a314`.
- Picture: **1920 × 1080, 30 fps, exactly 1,800 frames / 60 seconds**, H.264 CRF 16, yuv420p. PNG intermediate frames preserve the ASCII detail before encoding. Rendering used four concurrent workers.
- Sound: original score, AAC stereo at 48 kHz, 320 kbit/s target; measured stream bitrate 317,373 bit/s. Decoded sample peak **−4.1 dBFS**, mean volume **−19.1 dBFS**. These are sample-level measurements, not true-peak or LUFS certification.
- Container duration: **60.011 seconds** due to AAC packet duration.

Validation: ffprobe assertions passed for the dimensions, codecs, pixel format, frame rate, decoded frame count and stream durations. The complete video and audio decoded without errors. Eleven decoded frames (100, 350, 550, 610, 680, 860, 1100, 1320, 1540, 1740 and 1799) were compared with their approved source stills, covering all eight chapters, all three featured editors and the last frame. Per-frame RGB PSNR ranges from 35.192 to 38.691 dB after H.264 encoding. The decoded review board, dark-scene robin and final invitation were visually inspected.

The render log, verification script, ffprobe JSON, detailed comparisons and decoded images remain in ignored `videos/robyn-showcase/out/`, including `export-qa-2026-10-30/verification.json`. The pre-existing Remotion/Zod compatibility notice did not prevent the completed render or validation. Dependencies were not changed.

No credentials, backend sessions, paid provider operations, publishing, deployment, database changes, editor pins or runtime changes were involved.
