# Current pilot status

Updated October 25, 2026. This is the current index; [PLAN.md](PLAN.md) retains the complete scope and dated implementation history. [The review report](PROJECT-REVIEW-2026-10-25.md) tracks remediation and remaining acceptance work.

Robyn is an invitation-only, passwordless, solo-creator studio at **https://robyn.academy**. Its Creative Director, thirteen Craft specialists and Research work with private native files and exact saved revisions. The authenticated studio is desktop-only. Public signup and commercial subscriptions are disabled. The public homepage supports small screens.

## Release boundary

The review fixes are live at **https://robyn.academy**. Production application deployment `dpl_CX1G2CV9gyAN55x9xY5D2dguoPMQ` uses web merge commit `99737202b6363fd6f584ea3a2b8045681fa27cdf`, paired with runtime merge commit `c15aa038fd22aa50c7d946d051b1a7e5756ed728`. The database is migrated through **0022**, with 23 checksummed ledger entries. All 2,020 existing rows across 26 tables were unchanged by migration, and an unchanged rerun preserved schema, grants and data. The previous deployment remains the rollback reference.

Both PRs are merged. Recorded hosted Linux gates pass 81 web tests, 68 runtime tests, typecheck, full audits, builds and 18 public layout/axe/keyboard combinations. The web main-branch run also passed after merge. Both main branches currently have no required-check protection.

The web application pins workstation **0.1.23**. Its exact bundle and controlled activation passed on the existing Director canary, which was cancelled before dispatch. Other employees activate the pin during their next serialized assignment setup; they were not all restarted. Hosted checks passed two free Commons imports, same-ID retry, free acquisition with three unpaid waits, cancellation, URL renewal after eight minutes, working-copy cleanup, a controlled space-reservation refusal and the legacy lifecycle guard. [Production evidence](acceptance/production-rollout-20261025.json) states each check's limits. No new paid generation or AI turn was sent. Public editor pins and the live support forwarder are unchanged.

The owner authorized this rollout after the earlier deferral. Database recovery-point creation, the full cross-service restore drill and Storage-file backups remain deferred. [Media acceptance](MEDIA-ACCEPTANCE.md) and [browser support](BROWSER-SUPPORT.md) retain the open preview-service and native accessibility limits.

Use [RELEASE-2026-10-25.md](RELEASE-2026-10-25.md) for source commits, digests, migration adoption, editor pins and rollback boundaries. Never replay the historical migration files to reconstruct an existing database. [SETUP.md](../SETUP.md) documents explicit baselining and checksummed incremental setup.

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
