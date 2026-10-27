# Current pilot status

Updated October 26, 2026. This is the current index; [PLAN.md](PLAN.md) retains the complete scope and dated implementation history. [The review report](PROJECT-REVIEW-2026-10-25.md) tracks remediation and remaining acceptance work.

Robyn is an invitation-only, passwordless, solo-creator studio at **https://robyn.academy**. Its Creative Director, thirteen Craft specialists and Research work with private native files and exact saved revisions. The authenticated studio is desktop-only. Public signup and commercial subscriptions are disabled. The public homepage supports small screens.

## Release boundary

Native and source-file imports are live at **https://robyn.academy**, alongside the October 25 review fixes. The first production deployment of the import application bytes, `dpl_9M8hpmkwFcKk4mSPgAG7qdruzAcr`, uses web merge commit `f4eb99b16e0e4f010e4fd051176761cce77e27dc`, paired with runtime merge commit `f3db024429407272d4d1151447ccd9189afb96e3`. The database is migrated through **0023**, with 24 checksummed ledger entries. This release added one source-import function; all 2,037 existing rows across 26 tables were unchanged, and an unchanged rerun preserved schema, grants, data and ledger. Later documentation-only commits may rebuild the same application bytes.

Both import PRs are merged. Hosted Linux gates pass 91 web tests, 70 runtime tests, typecheck, full audits, builds and the public layout/axe/keyboard suite. The web main-branch run also passed after merge. [Import release evidence](acceptance/production-import-20261026.json) records commits, deployment, migration and bounded live checks.

The web application pins workstation **0.1.23**. Its exact bundle and controlled activation passed on the existing Director canary, which was cancelled before dispatch. Other employees activate the pin during their next serialized assignment setup; they were not all restarted. Hosted checks passed two free Commons imports, same-ID retry, free acquisition with three unpaid waits, cancellation, URL renewal after eight minutes, working-copy cleanup, a controlled space-reservation refusal and the legacy lifecycle guard. [Production evidence](acceptance/production-rollout-20261025.json) states each check's limits. No new paid generation or AI turn was sent. Public editor pins and the live support forwarder are unchanged.

The owner authorized this rollout after the earlier deferral. Database recovery-point creation, the full cross-service restore drill and Storage-file backups remain deferred. [Media acceptance](MEDIA-ACCEPTANCE.md) and [browser support](BROWSER-SUPPORT.md) retain the open preview-service and native accessibility limits.

Use [RELEASE-2026-10-26.md](RELEASE-2026-10-26.md) for the current source commits, migration, editor pins and rollback boundary; [the October 25 record](RELEASE-2026-10-25.md) retains the earlier remediation evidence. Never replay the historical migration files to reconstruct an existing database. [SETUP.md](../SETUP.md) documents explicit baselining and checksummed incremental setup.

## Native and source-file imports

**Open canvas — implemented locally, not deployed.** First entry and New project open an untitled workspace with Describe an idea, Bring existing files, and Start creating. Ideas offer Make a first draft or Help me plan with visible AI allowances; planning is prevented from starting production. All thirteen Crafts have genuine saved blank starters, inline project naming, and interrupted-start recovery. Actual native → browser edit → confirmed local revision → native reopen/resave passed for every starter. [Acceptance and limits](acceptance/open-canvas-2026-10-26.md) distinguish these checks from the live release. This addition requires migration **0024**; production remains on **0023**.

**Native and source-file import — October 26.** Recognised native projects now select their Craft and name automatically across all thirteen Crafts. Robyn checks the additional Crafts' native dependencies before creating an asset, asks for missing files or a containing folder when needed, and saves only the selected project and the files it uses. Multiple native masters require one project choice. Common images, audio and video instead become reusable source assets with no owning Craft, open in a preview, and appear in the library. Creators use the existing **Place from studio** controls when a source is needed inside a Craft. This does not automatically convert common media into native documents.

Local acceptance covers 91 web tests, 70 runtime tests, typecheck, production build and seven intake/recovery checks on each of Chromium, Firefox and WebKit. Genuine native projects opened in all ten additional published editors; CADCraft also passed source placement, confirmed save, library reopening and independent native continuation. The earlier WordCraft round trip remains recorded. Targeted desktop visual/accessibility checks and real audio/video playback passed. [Local acceptance](acceptance/craft-import-20261026.json) separates these checks from [the initial three-format slice](acceptance/native-import-20261026.json).

The authorized production rollout applied **0023_local_source_import.sql** through the verified ledger and deployed both merged source checkpoints. Hosted checks passed automatic DOCX import/opening and library reopening, SVG/WAV/MP4 source import and playback, exact original-file verification, same-request replay, changed-request rejection and pre-write rejection of missing native media or invalid source contents. A labelled QA project retains four saved fixtures; no employee work or paid generation was submitted. The full Open canvas addition described above is not part of that deployed import release.

## Review completion

The [review report](PROJECT-REVIEW-2026-10-25.md#completion-status--october-25-2026) now assigns one explicit status to every R-number:

| Status | Findings |
| --- | --- |
| Done and deployed (12) | R01, R02, R03, R04, R05, R07, R08, R10, R11, R12, R14, R16 |
| Partial (5) | R06 capacity acceptance; R09 deliberate replacement; R13 preview-provider acceptance; R17 terms/retention policy; R18 native accessibility and broader device acceptance |
| Deferred by owner (1) | R15 cross-service recovery |

The implementation is deployed; the five partial findings still have specific acceptance or policy work left. R06 passed a controlled hosted reservation check but not recovery of a purchased result after a real space failure. R09's deliberate replacement rehearsal is still open. R13's three preview acquisitions still await the requested $0.13 approval. The report separates current work from the original defect descriptions and recommended sequence.

## Acceptance matrix

“Recorded” means a specific earlier live exercise passed. It does not imply every tool, model or browser combination is accepted. The version-controlled [evidence index](acceptance/evidence-index.json) contains sanitized summaries and hashes, not raw private QA records.

| Capability | Evidence and current limit |
| --- | --- |
| Invitation, passwordless confirmation, new creator | Recorded production preview-safe confirmation, one owned studio, 15 profiles and persisted first project; no public signup |
| Thirteen Crafts | Recorded native → browser edit → confirmed revision → employee continuation, plus production handoff/opening for each; exact release pins in the release record |
| Research | Recorded real Chrome/Brave research, cited editable notebook, active-turn takeover, hold across reload, return control and Director handoff |
| Revision library | Recorded direct resumable upload, exact byte checks, conflicts, restore/fork and immutable dependency identity |
| Director campaigns | Recorded persisted specialist dependencies and final review; uncertain dispatch stays fenced |
| Studio AI allowance | Recorded hosted automatic/custom allocation and retry. Local tests now cover a lost provider synchronization response |
| Commons media | Recorded image/audio/video acquisition, provenance, Craft placement and native reopening. New production checks passed two free image imports, next/previous search pages, unpaid-wait capacity/cancellation and exact saved download after eight minutes |
| blockrun-image-gen | CogView-4 1024 × 1024 acquisition plus exact-image placement/save/reopen in PhotoCraft; other models/sizes are gated |
| blockrun-tts | Flash/Sarah/MP3/speed 1 acquisition plus WAV import/save/reopen in SoundCraft; other options are gated |
| treza-video | Five-second MiniMax H3, 16:9 acquisition/receipt plus editing-copy import/save/reopen in FilmCraft; other options are gated |
| Gemini image, image edit, sound effects preview services | Catalog discovery only. Deployed gates disable new acquisitions and retain recovery of existing request IDs |
| Generated music / reference-image video | Not accepted; music generation is not implemented and video reference inputs are rejected |
| Browser/device coverage | Chromium remains the native baseline. Media-panel keyboard/axe/reflow passes in three engines; Photo/Sound/Film startup also passes in Firefox/WebKit. Physical devices and full canvas accessibility remain unaccepted. See [BROWSER-SUPPORT.md](BROWSER-SUPPORT.md) |
| Recovery hardening | Maintained tests cover setup replay, full composer retry identity, media capacity/cancellation/settlement, old revisions, URL renewal, lost budget acknowledgement and isolated database restore. Production checks add migration rerun/data preservation, media retry/cancellation, cleanup and bounded space admission |
| Support | `support@robyn.academy` forwards to `developer@venatiostudios.com`; provider-reported delivery and a successful webhook verified October 25 |
| Backups | Dashboard observation: Free plan, no included project backups. A recoverable database point, full cross-service restore drill and Storage-file backups remain owner-deferred |

The three historical paid media checks total **$0.439483**. The follow-up reused those files in actual native editors through an isolated bridge, preserving exact bytes and source revisions. It added no paid generations, employee turns or production revisions. A three-service preview acceptance batch awaits the requested $0.13 approval. Some per-Craft verification fields describe an earlier startup checkpoint; later central evidence supersedes those dated conclusions without rewriting their history.

## Before broader invitations

- Finish R06 purchased-result recovery after a real space failure and R09 deliberate workstation-replacement acceptance.
- Future, owner-deferred: establish database recovery and rehearse a full cross-service restore. No retention or recovery-time promise is established.
- Complete service/option acceptance before promoting additional generation services. Preserve the explicit preview policy.
- Retain operator review for any abandoned-upload deletion batch. Hosted media cleanup freed 6,234,003 bytes from the two confirmed QA imports while keeping receipts and saved originals; no general Storage-object deletion batch ran.
- Complete browser, physical-phone public-site and native-editor accessibility checks before extending support claims.
- Review applicable terms and the manual export/closure process before broader invitations or subscriptions.

The operator procedures are retained in [OPERATIONS.md](OPERATIONS.md). Database recovery and Storage-file backups remain deferred; compact native editors, subscription billing and extra speculative homepage performance work remain outside the current scope.
