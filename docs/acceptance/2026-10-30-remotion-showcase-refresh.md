# Robyn showcase — local editorial refresh

Checked October 30, 2026 against web checkout `a5ce3572e9ae980c5bc5fd075c73d8e7c2b5e89e` plus the local `videos/robyn-showcase` changes. This accepts the editable creative artifact and preview, not a production deployment, a fresh native-editor round trip or a replacement MP4 export.

The 60-second story now shows fourteen Crafts including SolidCraft and its current armadillo icon, one Robyn using every Craft on the shared workspace, Dashboard/Assets/Robyn/Settings navigation, Conversation/Jobs/Review/Skills, one monthly AI allowance, browser tools and saved Notes, current media capabilities and exact private revisions. It retains the original ASCII robin, score, eight chapters, invitation-only close and desktop requirement.

## Source boundary

- Project: `videos/robyn-showcase`, composition `RobynShowcase`, Remotion 4.0.539; 1920 × 1080, 30 fps, exactly 1,800 frames.
- Product scope: `docs/ARCHITECTURE.md`, `docs/CURRENT-STATUS.md`, `docs/MEDIA-ACCEPTANCE.md` and the fourteen registered Craft manifests.
- All 25 copied local assets match the sizes and SHA-256 hashes in `videos/robyn-showcase/public/asset-sources.json`. Its fourteen Craft icon IDs match the manifest registry exactly.
- SolidCraft's unchanged editor capture records the accepted 0.27.0 exercise described in `docs/HOMEPAGE-ARTWORK.md`; it does not claim to show the later 0.27.1 release. The armadillo is the current public brand icon.
- The unchanged historical notebook source stays `public/artwork/editors/research.jpg`, locally copied as `public/editors/notes.jpg`. The video crops only the notebook body at x184, y130, width1256, height870, excluding the retired Research toolbar. Notes is presented as a document format.
- Project navigation, brief/Robyn/output flow and revision stack are explanatory graphics. The editor pixels are recorded captures; no new authenticated session or AI output is claimed.

## Verification

Remotion lint/TypeScript, the standalone video bundle, mascot fidelity and final still checks pass. QA covers 39 master samples, including all three featured editors, the last frame and four phases around every transition, plus all eight chapter compositions. Renderer errors are empty. Each standalone chapter matches its master sample exactly after excluding the five-pixel master progress bar. Review boards cover all eight chapters and seven transitions; the bird clears the complete icon grid and Notes caption.

The original 38,460 mascot points, seven colors and character ramp remain exact. Geometry SHA-256: `c88cf59c4c08e4cc109f360798474d8b8c25dcf665d6baef6d2a53e2e3ef1255`. The poster renders at 1920 × 1080. Studio loads the revised master and its player advances with music enabled; the browser error/warning log is empty.

Web typecheck, all **233 tests** (229 main tests plus four Markdown tests) and production build pass. Chromium, Firefox and WebKit are installed. Web and video installation audits each report zero vulnerabilities. The pre-existing Remotion/Zod compatibility notice is retained with the security override; dependencies were not changed.

An earlier still run encountered a local Chromium `ERR_NO_BUFFER_SPACE` font fetch failure. A complete rerun passed. After adjusting the Notes perch, another full pass completed without errors.

| Ignored local artifact under `videos/robyn-showcase/` | SHA-256 |
| --- | --- |
| `out/robyn-poster.png` | `6592ea49892ae4f6191039c2c23ba7186106f637a9331c218560589e2f88bc89` |
| `out/qa/frame-0350.png` — fourteen Crafts | `28ec0d758ec900bf98b185bbca95890d96d49f57efb910865d5af65158a62267` |
| `out/qa/frame-0860.png` — one Robyn | `510b93f4842ca6f812c69ee1aa65a0cc1e997f38ea93c1aca2a1277e2a7fa5f3` |
| `out/qa/frame-1100.png` — browser and Notes | `73be7af7b090b9defa8249c40a868d3504af93f8d4aa3be1560b17f405fd429b` |

Detailed checks remain in ignored `out/qa/check.json`, `chapter-comparison.json`, `refresh-verification.json` and the chapter/transition review boards. The October 27 MP4 receipt is unchanged and applies only to the earlier cut. The subsequently requested final MP4 has its own [October 30 export receipt](2026-10-30-remotion-showcase-export.md). No credentials, backend sessions, paid provider operations, database changes, editor pins, runtime changes or publication were involved.
