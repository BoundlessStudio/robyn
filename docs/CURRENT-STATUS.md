# Current pilot status

Updated October 28, 2026. This is the current index; [PLAN.md](PLAN.md) retains the complete scope and dated implementation history. [The review report](PROJECT-REVIEW-2026-10-25.md) tracks remediation and remaining acceptance work.

Robyn is an invitation-only, passwordless, solo-creator studio at **https://robyn.academy**. Its Creative Director, thirteen Craft specialists and Research work with private native files and exact saved revisions. The authenticated studio is desktop-only. Public signup and commercial subscriptions are disabled. The public homepage supports small screens.

## Release boundary

The dedicated **AI Employees page** is live in web merge `2e19cf2e7861634a47a54e66eb609d4bcb7b2e8a` ([PR #30](https://github.com/BoundlessStudio/robyn/pull/30)). Vercel reported the deployment complete on October 28, and authenticated production checks passed all four views, project selection and exact saved-revision navigation while retaining the native editor. [The AI Employees release record](RELEASE-EMPLOYEES-2026-10-28.md) records this web release and its unchanged runtime, migration and editor/workstation pins.

The application-led project workspace is live at **https://robyn.academy**, including the earlier native/source-file imports and review fixes. The first production deployment, `dpl_2NcD6iGAbMEkDvr1vqZ8oZsRirGx`, uses web merge commit `3fc894c72071857233974e522399efdde8b44f50`, paired with runtime merge commit `a1c8396ebcae7d4ee666329da2c6e48f058449d9`. The database is migrated through **0024**, with 25 checksummed ledger entries. The unchanged foundation migration preserved all 2,097 existing rows across 28 tables; schema and grants matched the migration-derived definitions, and an unchanged rerun preserved schema, data and ledger. Later documentation-only commits may rebuild the same application bytes.

Both application-workspace PRs are merged. Hosted PR and main Linux gates pass 109 web tests, 72 runtime tests, typecheck, audits, builds and the public layout/axe/keyboard suite. Twenty-one local project transitions pass in each browser engine. All thirteen Crafts passed fresh local browser/native round trips; hosted WordCraft editing/native continuation, GridCraft creation, interrupted launches and ownership/archive boundaries also passed. [Application-workspace release evidence](acceptance/production-application-workspace-20261027.json) records the exact scope. [Import release evidence](acceptance/production-import-20261026.json) remains historical.

The subsequent application icon refresh, including the CADCraft follow-up, is live: web merge `c6044bdf9d666b0afb6f2cc19ed1d3acc9e63847`, deployment `dpl_FtdwK6BfssVnEPGpknLpdfLQXUTx`. Nine ArtCraft originals and five matching animal illustrations identify the applications across launchers, catalogues and file badges. WordCraft, DeckCraft, GridCraft, CADCraft and Research use an elephant, peacock, beaver, spider and raven. [Fresh icon acceptance](acceptance/application-icons-2026-10-27.md) records both icon release checkpoints, browser review and exact production image hashes; runtime, migration ledger and editor/workstation pins remain unchanged.

Toolbar cleanup is live: the redundant New split button is removed, and Applications appears only while a file is open. The project home uses its existing application grid. That release used web merge `f807c0149a1716e0596e30a4b5cffdfbfdae6aa4` ([PR #25](https://github.com/BoundlessStudio/robyn/pull/25)), Ready deployment `dpl_4EYHf14RkevN5QxZNex9Uhp7fohj`. Hosted PR checks and authenticated home/editor/home review passed. [Toolbar release details](RELEASE-2026-10-27.md#toolbar-cleanup) record both changes, the unchanged runtime and pins, and the prior database checkpoint.

The web application pins workstation **0.1.23**. Its exact bundle and controlled activation passed on the existing Director canary, which was cancelled before dispatch. Other employees activate the pin during their next serialized assignment setup; they were not all restarted. Hosted checks passed two free Commons imports, same-ID retry, free acquisition with three unpaid waits, cancellation, URL renewal after eight minutes, working-copy cleanup, a controlled space-reservation refusal and the legacy lifecycle guard. [Production evidence](acceptance/production-rollout-20261025.json) states each check's limits. No new paid generation or AI turn was sent. Public editor pins and the live support forwarder are unchanged.

The owner authorized this rollout after the earlier deferral. Database recovery-point creation, the full cross-service restore drill and Storage-file backups remain deferred. [Media acceptance](MEDIA-ACCEPTANCE.md) and [browser support](BROWSER-SUPPORT.md) retain the open preview-service and native accessibility limits.

Use [the AI Employees release record](RELEASE-EMPLOYEES-2026-10-28.md) for the current web release and [the Assets release record](RELEASE-ASSETS-2026-10-27.md) for the unchanged runtime/editor publication and its rollback boundaries; [the earlier October 27 record](RELEASE-2026-10-27.md), [October 26 import record](RELEASE-2026-10-26.md) and [October 25 record](RELEASE-2026-10-25.md) retain historical evidence. Never replay the historical migration files to reconstruct an existing database. [SETUP.md](../SETUP.md) documents explicit baselining and checksummed incremental setup.

## Application workspace and imports

**AI Employees page — live October 28.** Conversation, Assignments, Review and the team directory now share `/dashboard/employees`, with a project selector. Project and Research handoffs open this page in a separate tab with the exact saved revision, preserving the open editor. Project details retains Brief and Activity. All private operations reuse the existing Studio BFF. [Local acceptance](acceptance/employees-workspace-2026-10-28.md) records 122 passing tests, three-engine browser coverage and desktop visual/accessibility checks; [production evidence](acceptance/production-employees-workspace-20261028.json) records the authenticated live navigation checks. The dated October 27 workspace description below retains the earlier side-panel checkpoint.

**Asset management and all-Craft import/export — live October 27.** Assets has a full management page, file/folder import, filters, exact-version previews, export attachment, native-package ZIP downloads and version history. All thirteen Craft adapters can save a compatible original before placement, select one rendition and retain its exact source revision. FilmCraft 0.2.3 additionally connects its native Import and Source controls to Robyn's saved project library and opens the selected clip in Source; the other twelve Crafts remain on 0.2.2. The original thirteen round trips, authenticated WordCraft save/export checks and subsequent live FilmCraft library-selection/save/native-continuation checks are recorded separately. Web checks pass 116 tests; the runtime's thumbnail-policy follow-up passes 79. [Acceptance](acceptance/assets-library-2026-10-27.md) and [the release record](RELEASE-ASSETS-2026-10-27.md) retain exact deployment, bundle and verification scope.

**Application-led workspace — live October 27.** The studio landing page remains the project collection. Inside each project, all thirteen Crafts and Research lead; clicking a Craft saves an untitled native file and opens its editor. Applications, Open existing and inline document naming remain available while editing. Files, AI Employees and Project details start collapsed. Pending launches retain one identity, and replacing the editor protects unsaved work. The catalogue retains the selected Craft through project selection. The foundation's explicit first-draft and planning choices remain in the employee panel; AI work requires an explicit request. [Fresh acceptance](acceptance/application-workspace-2026-10-27.md) is separate from the [historical Open canvas checkpoint](acceptance/open-canvas-2026-10-26.md).

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
