# Robyn showcase — local MP4 export

Rendered October 27, 2026 at the owner's request. This is a local creative artifact, not a deployed application or runtime release.

- Source: `videos/robyn-showcase`, composition `RobynShowcase`, Remotion 4.0.539.
- Output: `videos/robyn-showcase/out/robyn-showcase.mp4` (ignored local artifact).
- Size: 16,538,173 bytes.
- SHA-256: `87730e3268e0c5e2e00969110824d94dbb7e9bd14c9e7f151e6bd94f5f09629f`.
- Picture: 1920 × 1080, 30 fps, exactly 1,800 frames / 60 seconds, H.264 CRF 16, yuv420p. The render used PNG intermediate frames to preserve the ASCII detail before encoding.
- Sound: original score, AAC stereo at 48 kHz; 320 kbit/s target. Decoded sample peak -4.1 dBFS, mean volume -19.1 dBFS. These are sample-level measurements, not true-peak or LUFS certification.
- Container duration: 60.011 seconds due to AAC packet duration.

Validation: ffprobe metadata assertions passed; the entire video and audio decoded with no errors. Nine decoded chapter/end frames were compared with their source stills, and the dark-scene robin and final invitation were visually inspected. The earlier mascot audit preserves all 38,460 original geometry points, seven colors and ASCII ramp; the eight standalone chapter samples match their master frames. Local render logs and detailed checks remain in ignored `out/`.

No credentials, live backend sessions, publishing, deployment, database changes, editor pins or runtime changes were involved.
