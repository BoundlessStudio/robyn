# Current pilot status

Updated October 25, 2026. This is the current index; [PLAN.md](PLAN.md) retains the complete scope and dated implementation history. [The review report](PROJECT-REVIEW-2026-10-25.md) tracks remediation and remaining acceptance work.

Robyn is an invitation-only, passwordless, solo-creator studio at **https://robyn.academy**. Its Creative Director, thirteen Craft specialists and Research work with private native files and exact saved revisions. The authenticated studio is desktop-only. Public signup and commercial subscriptions are disabled. The public homepage supports small screens.

## Release boundary

The last recorded production web release is `dpl_DHoVNKVXKsYjQ1UTQxJUE6cgTW9A`: budget/media features, migrations through `0017_budget_queue_slots.sql`, workstation client **0.1.21**. The review fixes are a separate reviewed candidate with migrations **0018–0022** and workstation **0.1.23**. Vercel reports a successful Git-connected PR preview. The candidate has not been promoted to production or applied to the production database; authenticated preview recovery is not accepted yet. The support-forwarding Worker is deployed independently and is live.

The paired draft PRs now pass hosted Linux CI: 74 web tests, 68 runtime tests, typecheck, full audits, builds and 18 public layout/axe/keyboard combinations. Both main branches currently have no required-check protection.

Use [RELEASE-2026-10-25.md](RELEASE-2026-10-25.md) for source commits, digests, migration adoption, editor pins and rollback boundaries. Never replay the historical migration files to reconstruct an existing database. [SETUP.md](../SETUP.md) documents explicit baselining and checksummed incremental setup.

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
| Commons media | Recorded image/audio/video acquisition, provenance, Craft placement and native reopening. Search now has pages; source acquisition now has space admission |
| blockrun-image-gen | One real image acquisition recorded; all offered models/sizes are not accepted by that single result |
| blockrun-tts | One real speech acquisition recorded; broader voice/format/speed acceptance remains |
| treza-video | One five-second MiniMax H3 acquisition and receipt recovery recorded; other options remain outside that proof |
| Gemini image, image edit, sound effects preview services | Catalog discovery only. Local candidate disables new acquisitions and retains recovery of existing request IDs |
| Generated music / reference-image video | Not accepted; music generation is not implemented and video reference inputs are rejected |
| Browser/device coverage | Chromium desktop is the tested baseline; public mobile emulation recorded. See [BROWSER-SUPPORT.md](BROWSER-SUPPORT.md) for unverified environments |
| Recovery hardening | Local maintained tests cover setup replay, full composer retry identity, media capacity/cancellation/settlement, old revisions, URL renewal, lost budget acknowledgement and isolated database restore |
| Support | `support@robyn.academy` forwards to `developer@venatiostudios.com`; provider-reported delivery and a successful webhook verified October 25 |
| Backups | Supabase dashboard confirms the Free plan has no included project backups. Hosted database restore remains open. Separate Storage-file backups are explicitly deferred by the owner |

The three historical paid media checks total **$0.439483**. The remediation tests use isolated fixtures and do not add paid generations or employee turns. Some per-Craft verification fields describe an earlier startup checkpoint; the later hosted handoff and R2 acceptance in this index supersede those dated conclusions without rewriting their historical evidence.

## Before broader invitations

- Roll out and verify the local candidate, including incremental migration adoption and workstation 0.1.23 on an idle employee.
- Establish a database restore point and rehearse the hosted recovery procedure. No backup retention or recovery-time promise is currently established.
- Complete service/option acceptance before promoting additional generation services. Preserve the explicit preview policy.
- Exercise the owner-authorized cleanup in the hosted candidate. Local coverage now includes explicit abandoned uploads and confirmed native transfer snapshots; unsaved working folders remain retained.
- Complete browser, physical-phone public-site and native-editor accessibility checks before extending support claims.
- Review applicable terms and the manual export/closure process before broader invitations or subscriptions.

The next actions and safe stopping conditions are in [OPERATIONS.md](OPERATIONS.md). Storage-file backups, compact native editors, subscription billing and extra speculative homepage performance work remain outside the current scope.
