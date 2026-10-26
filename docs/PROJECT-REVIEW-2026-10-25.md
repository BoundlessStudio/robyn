# Robyn Creative Studio Project Review

Reviewed October 25, 2026, America/Toronto.

## Completion status — October 25, 2026

**12 done and deployed, 5 partial, 1 deferred.** Every R-number has implementation or documentation work recorded; six findings still have acceptance or policy work left.

**Done and deployed** means the fix or documentation is committed, relevant recorded checks pass, and the application release is live. It does not broaden isolated regression evidence into an unperformed provider or disaster-recovery test. **Partial** means useful work is complete but a specific requirement remains. **Deferred** means the owner has explicitly postponed the outstanding work.

| Status | Count | Findings |
| --- | --- | --- |
| Done and deployed | 12 | R01, R02, R03, R04, R05, R07, R08, R10, R11, R12, R14, R16 |
| Partial — work remains | 5 | R06, R09, R13, R17, R18 |
| Deferred by owner | 1 | R15 |

**Release boundary:** the owner subsequently authorized deployment. The review fixes are live at `https://robyn.academy`, migrations through 0022 are applied, and the workstation 0.1.23 pin passed a hosted Director canary. Other employees activate it during their next serialized assignment setup. Bounded hosted rollout checks passed; a recoverable database point, full cross-service restore drill and Storage-file backups remain deferred. Support forwarding remains live.

## Status of each finding

| Finding | Status | Completed work | What is left |
| --- | --- | --- | --- |
| R01 · Migration replay | **Done and deployed** | Checksummed ledger and atomic incremental execution. Production baseline, migrations 0018–0022 and unchanged rerun passed; all 2,020 existing rows were preserved. | No further identified code fix. Recovery-point creation remains the separate R15 deferral. |
| R02 · Assignment retry identity | **Done and deployed** | Full frozen request, employee, exact inputs and review decision survive reload/remount. Real-component retries retain identity even at zero allowance. | No further identified code fix; no paid employee turn was submitted in the rollout smoke checks. |
| R03 · Cancelled payment settlement | **Done and deployed** | Financial-only settlement records a confirmed charge once without paying or publishing again. Operator tooling and database/worker regressions preserve unknown-payment holds. | No further identified code fix. Paid cancellation evidence remains isolated; the rollout did not create a new paid cancellation to test it. |
| R04 · Dependencies | **Done and deployed** | Compatible updates retain Workflow 5.2.3. Recorded full web/runtime audits report zero vulnerabilities; tests and builds pass. | No remaining advisory in the recorded audits. New advisories require normal ongoing review. |
| R05 · Budget waits and free media | **Done and deployed** | Atomic runnable slots and unpaid cancellation/dispatch fences pass race regressions. A production free import completed with three unpaid waits; all three waits were safely cancelled. | No further identified code fix. |
| R06 · Workstation capacity | **Partial** | Limits and locked space reservations are deployed. Hosted controlled competing-reservation probe rejected insufficient future space and admitted work after release. | Real concurrent workload/space-failure and already-purchased-result recovery acceptance; the probe did not fill the disk or buy media. |
| R07 · Truncated libraries/history | **Done and deployed** | Server search, stable cursor pagination, load-more and exact recovery lookup. Large-library regressions pass; production Commons next/previous pages passed. | No further identified code fix. |
| R08 · Expiring private links | **Done and deployed** | Authorized exact-file renewal and playback/editor-preservation regressions pass. Production original download after eight minutes matched its exact size and SHA-256. | No further identified code fix. Hosted playback seeking after expiry was not repeated in this rollout. |
| R09 · Legacy lifecycle bypass | **Partial** | Legacy routes reject Studio employees; tests verify no upstream mutation. Production lifecycle request returned 409 with `studio_lifecycle_required`. | Accept deliberate workstation replacement preserving files, receipts, provisioning identity and active-work fences. The deployment did not replace an employee. |
| R10 · Workflow diagnostics | **Done and deployed** | Persistent progress/retry diagnostics, safe categories, bounded backoff, Needs attention UI and runbook. Production health reports the completed free media workflows; anonymous access is rejected. | No further identified code fix. No uncertain external action was released to force progress. |
| R11 · Release source capture | **Done and deployed** | Both PRs merged. Exact web/runtime commits, production deployment, source digests, migration ledger, pins and rollback reference are recorded. | Keep the release record current for later deployments. |
| R12 · Regression/CI gates | **Done and deployed** | Both repositories have passing hosted CI; web main passed after merge. Maintained tests cover replay, retry identity, media capacity/settlement, provider contracts and budget acknowledgements. | Required-check branch protection remains a separate optional repository-policy decision. |
| R13 · Provider acceptance | **Partial** | Exact-profile gates, corrected requests/prices, durable retry identity and recovery of withdrawn options. Existing paid image/speech/video outputs passed native placement, Save and reopen. | Three preview-service acquisitions await the $0.13 approval, then cost, rights/provenance and editable-file acceptance. Additional options remain gated. |
| R14 · Retention and cleanup | **Done and deployed** | Reference-aware cleanup with shared-key and uncertain-evidence regressions. Hosted cleanup freed 6,234,003 working-copy bytes from two confirmed QA imports while preserving receipts and saved originals. | No further identified code fix. General abandoned-upload deletion batches remain operator-reviewed; none was run during rollout. |
| R15 · Cross-service restore drill | **Deferred** | Recovery runbook and isolated database snapshot-restore regression exist. | Recoverable database point and cross-service hosted drill, including measured recovery time; Storage-file backups also deferred by owner. |
| R16 · Documentation/evidence | **Done and deployed** | Current status, both READMEs, historical labels, release record and sanitized evidence index now describe the production rollout and every R-number. | Keep status and release records current as outstanding work is completed. |
| R17 · Data handling/support | **Partial** | Support/privacy pages and manual export, recovery, invitation-removal and closure procedures. support@robyn.academy forwarding is live with provider-reported delivery verified. | Review applicable terms and agree a concrete support/closed-account retention schedule before wider invitations. |
| R18 · Browser/accessibility | **Partial** | Published baseline; three-engine Media-panel keyboard/axe/reflow tests and editor retention. Photo/Sound/Film startup passes in three engines; generated-media save/reopen passes in Chromium. | Fix native text-entry/canvas accessibility gaps and verify full keyboard/screen-reader use. Physical public-site devices, additional GPUs/engines and manual zoom remain unaccepted. |

Application fixes are merged through [web PR #19](https://github.com/BoundlessStudio/robyn/pull/19) and [runtime PR #1](https://github.com/BoundlessStudio/robyn-artcraft-runtime/pull/1), at `99737202b6363fd6f584ea3a2b8045681fa27cdf` and `c15aa038fd22aa50c7d946d051b1a7e5756ed728`. Production deployment `dpl_CX1G2CV9gyAN55x9xY5D2dguoPMQ` is Ready at the canonical domain. [Web main CI](https://github.com/BoundlessStudio/robyn/actions/runs/40258313974) passes 81 tests, typecheck, audit, build and 18 public cross-engine checks. The paired runtime checkpoint reports 68 passing tests. [Sanitized production evidence](acceptance/production-rollout-20261025.json) records database preservation, the workstation canary and authenticated smoke checks separately from earlier isolated acceptance.

The initial checkpoint verification used clean Git exports with declared dependencies and public placeholder build configuration: **70 web tests and 67 runtime tests passed**, typecheck and production build passed, and both complete dependency audits reported zero vulnerabilities. The rebuilt workstation matched all 16 pinned files. The [release source record](acceptance/release-source.json) contains the exact commits, source-file hashes and verification scope. The later hosted CI results are recorded separately; application rollout and the explicitly open operating/acceptance checks remain separate.

Follow-up work adds migration **0022_abandoned_upload_retention.sql**, workstation **0.1.23**, an actual desktop-entry/editor-retention regression, public browser/axe checks, and corrections to the remaining setup instructions. The earlier release-source record remains historical evidence for its named commits. [The follow-up record](acceptance/remediation-followup.json) contains exact paired commits, file/migration digests, 74 web and 68 runtime test results, clean runtime reproduction and successful hosted CI links.

## Work left to close the partial and deferred findings

| Finding | Remaining completion check | Current disposition |
| --- | --- | --- |
| R06 | Complete real concurrent workload/space-failure acceptance and recovery of an already-purchased result after space is restored. | Controlled hosted reservation refusal/recovery passed on 0.1.23; the remaining end-to-end failure case is not yet accepted. |
| R09 | Rehearse deliberate workstation replacement with files, receipts, identity and active-work fences preserved. | Still open; creator bypass is blocked in production. Deployment did not authorize destroying a persistent workstation for rehearsal. |
| R13 | Acquire and accept Gemini image, image edit and sound effects; verify final cost, provenance/rights and the editable-file round trip. Test each additional model/option before promotion. | Prepared three-service ceiling is $0.127501; $0.13 approval still pending. Previews remain disabled. |
| R15 | Establish a recoverable database point and complete a consistent cross-service restore drill with recorded recovery time. | Explicitly deferred, including Storage-file backups. |
| R17 | Review applicable terms and finalize the support/closed-account retention schedule and manual closure policy. | Still required before wider invitations; support forwarding already works. |
| R18 | Address PhotoCraft's unnamed text input and native semantic/focus gaps in a new immutable runtime release; complete keyboard/screen-reader and additional device/engine/GPU acceptance. | Open. Retain the stated Chromium desktop baseline and current limitations until verified. |

Production rollout is complete. [The release record](RELEASE-2026-10-25.md) documents the applied baseline/migrations, runtime activation policy, hosted checks and retained rollback reference. Database recovery and Storage-file backups remain deferred.

Both main branches currently permit merges without required checks. CI is running and passing; enabling required-check protection is a separate repository policy choice. Rollout created one labelled QA project, two free saved sources and three unsubmitted cancellation fixtures, all terminal. No database reset, new paid generation, AI turn or persistent-workstation deletion was performed. Working-copy cleanup retained the saved originals and recovery receipts.

## Overall assessment (original review)

Robyn has implemented the defined desktop pilot. The thirteen Crafts, Research, Director coordination, private revision library, invitation flow and public mobile homepage have substantial recorded acceptance evidence. The newer Commons media service and Studio AI budget are also implemented and deployed. The main remaining work is reliability, operational recovery, release discipline and making the newer features easier to use.

This review reproduced three defects without changing production data:

1. Running setup again against an upgraded database fails at migration 0013 **after older migrations have replaced the newer budget-aware queue function**.
2. A lost assignment acknowledgement followed by a browser reload preserves the brief but loses its request identity. Sending the brief again uses a new ID and can create duplicate paid work.
3. Three media jobs waiting for AI allowance occupy every media slot and prevent a free Commons acquisition.

There is also a strong code-based finding that cancelling an already-submitted media job can leave its financial reservation permanently unreconciled. Dependency audits report vulnerable transitive packages. These deserve attention before expanding the invited pilot.

The earlier acceptance record remains evidence of the scenarios it exercised. Passing those scenarios does not cover every failure mode identified here.

## Scope and evidence

The governing scope is [PLAN.md](PLAN.md), especially its latest checkpoints and current device decision, together with [AGENTS.md](../AGENTS.md). The authenticated studio, thirteen Crafts and Research are desktop-only. The public homepage supports mobile presentation. Billing, compact editors and general native desktop takeover remain deferred; Research's implemented browser takeover is part of the accepted scope. Extra homepage performance investigation remains outside the current request.

The review covered the web application, companion runtime, database migrations, workflow orchestration, application manifests, tests, release evidence, current public production pages and existing acceptance records. It includes the uncommitted budget/media work present at the start of this review.

| Baseline | Observation |
| --- | --- |
| Web Git HEAD | 76a5b07, followed by existing local budget/media changes |
| Runtime Git HEAD | 06bca3e, followed by existing local media/client changes |
| Latest recorded production deployment | dpl_DHoVNKVXKsYjQ1UTQxJUE6cgTW9A at [robyn.academy](https://robyn.academy) |
| Deployed source comparison | All 407 compared regular files under application, migration, script and vendor paths, plus package/config files, match the saved deployment manifest |
| Existing pilot audit | 15 requirement groups, 31 recorded checks, 76 referenced evidence paths; all 76 paths exist locally |
| Craft release consistency | All thirteen manifest adapter versions match their companion verification records |
| Workstation client | Pinned release 0.1.21 |

The source comparison establishes consistency with the saved deployment input manifest; it is not a fresh download of the deployed server bundle. An empty directory in that manifest was excluded from the regular-file comparison. The existing authenticated QA browser session had expired, so this review used the prior authenticated acceptance evidence rather than creating a new login link or replaying paid employee jobs. It did not rerun all upstream native application test suites or certify every creative tool operation.

Original review verification results (before remediation):

| Check | Result |
| --- | --- |
| npm run typecheck | Passed |
| npm test in the web repository | 45 passed, zero failed or skipped |
| npm run build | Passed; three workflows and 24 workflow steps compiled |
| npm test in the companion runtime | 66 passed, zero failed or skipped |
| Fresh database installation in PGlite | All 18 migration files applied |
| Database setup replay | Failed at 0013; demonstrated queue-function regression |
| Assignment recovery browser fixture | Demonstrated a changed request ID after reload of the same brief |
| Media capacity database fixture | Demonstrated free acquisition blocked by three budget waits |
| Public production browser checks | Desktop 1600 × 1000 and mobile 390 × 844; screenshots reviewed, all fourteen mobile chapters navigated, no horizontal overflow or page errors in the checked states |
| Accessibility | Desktop homepage axe scan reported zero violations; keyboard skip link and empty invitation validation checked |
| Unsupported studio entry | Desktop-required notice shown, zero editor iframes mounted |
| Anonymous studio access | Bootstrap, budgets and media-job reads returned 401 |
| Known credential scan | Three configured private credential values absent from all 39 scanned client build files |
| Production dependency audit | Web: 23 high-severity package entries. Runtime: one high-severity entry. See R04 for interpretation |

New evidence is in [artifacts/qa/project-review-20261025](../artifacts/qa/project-review-20261025/). Its [verification summary](../artifacts/qa/project-review-20261025/verification-summary.json), [database probes](../artifacts/qa/project-review-20261025/database-probes.json), [assignment retry proof](../artifacts/qa/project-review-20261025/assignment-retry-proof.json), [release comparison](../artifacts/qa/project-review-20261025/release-evidence.json) and [browser summary](../artifacts/qa/project-review-20261025/browser-summary.json) are separate from historical acceptance. The probes used an isolated database or intercepted browser fixture. No paid calls, invitation emails, deployments or production data changes were made. Owned headless browsers were closed.

## What is already delivered

| Area | Current implementation and acceptance |
| --- | --- |
| Public identity and discovery | Continuous ASCII robin tour, thirteen real Craft captures, Research chapter, invitation form, mobile composition, reduced motion, metadata and canonical domain |
| Private access | Invitation-only, passwordless confirmation protected against ordinary email previews; public signup disabled in setup and previously verified hosted configuration |
| Studio ownership | Server-side owner checks, private service-role database access, private Storage and scoped assignment credentials |
| Creator workspace | Projects, library, employee/application discovery, settings, desktop editor surface, document tabs and resizable project panels |
| Native asset exchange | Native masters, linked files, previews, exports, hashes, exact revision references, direct resumable transfers, conflicts, restores and forks |
| Independent employees | Director plus fourteen specialists; lazy persistent workstations, automatic sleep, per-employee serialization and three active specialist slots |
| Director production | Persisted dependency plans, exact saved handoffs, final review, continuation, cancellation and interrupted-dispatch reconciliation; a VectorCraft to DeckCraft campaign is recorded |
| Research | Chrome and Brave Search, editable cited notebooks, hold/takeover/return control, saved progress and a Director handoff |
| Shared source media | Commons image/audio/video acquisition, immutable originals and provenance, preview/proxy generation, exact dependencies and downloadable credits |
| Generation | Recorded acquisition of an image, speech and a five-second video through three Perflo services; other advertised services remain preview candidates |
| AI allowance | Overall Studio allowance, automatic/custom allocation across fifteen employees, per-instance enforcement, partial-change recovery, spending display and budget pauses |
| Editor delivery | Thirteen immutable browser releases on Cloudflare R2/Worker, with a small legacy compatibility proxy and recorded byte verification |

The main foundations are sound: authorization is enforced on the server, unknown dispatches do not automatically trigger another agent turn, unknown payments retain reservations, source revisions stay exact, and native editability has real acceptance evidence. Preserve these properties while addressing the recovery gaps.

### Application coverage

Every Craft below has recorded creator edit/save/employee-continuation acceptance, verified manifest states and matching adapter versions. This is a release-and-evidence inventory, not a new execution of all thirteen handoffs.

| Application | Specialist | Current adapter |
| --- | --- | --- |
| PhotoCraft | Photo Artist | 0.1.4 |
| LightCraft | Photographer | 0.1.4 |
| VectorCraft | Illustrator | 0.1.4 |
| DesignCraft | Layout Designer | 0.1.2 |
| FigCraft | Interface Designer | 0.1.3 |
| FilmCraft | Film Editor | 0.1.4 |
| EffectCraft | Motion Designer | 0.1.2 |
| SoundCraft | Sound Engineer | 0.1.4 |
| WordCraft | Writer | 0.1.2 |
| PdfCraft | PDF Specialist | 0.1.4 |
| DeckCraft | Presentation Designer | 0.1.2 |
| GridCraft | Spreadsheet Specialist | 0.1.2 |
| CADCraft | CAD Designer | 0.1.2 |
| Research | Research | Notebook 0.1.0; separate specialist, outside the thirteen-Craft catalog |

Sources: [Craft matrix](../artifacts/qa/project-review-20261025/craft-matrix.json), [pilot acceptance audit](../artifacts/qa/pilot-acceptance-audit.json), [Research manifest](../src/studio/specialists/research.ts), and each companion application's verification.json. Historical per-app notes such as a pending individual Director campaign or older startup recovery observation must be interpreted with the later, scoped acceptance records. The plan requires a cross-application campaign, not a separate Director campaign through every Craft.

## Original findings with current status

Each section begins with its current status and remediation. The defect descriptions, original recommended actions and original completion checks below them preserve the October 25 review. They are not a second list of unfinished tasks. Use the status table and remaining-work list above for what is still open.

P1 means fix first because the finding can affect paid work, database correctness or recovery. P2 means address in normal hardening before broader use. P3 means polish or maintainability. A reproduced defect is distinguished from a code-based risk or a verification gap.

### R01 Setup reruns can regress the database

**Status: Done and deployed. See the production release record for hosted checks and their scope.**

**Remediation — October 25, 2026:** Fixed and deployed. A checksummed ledger, explicit legacy baseline and atomic migration suffix prevent replay regression. Fresh/rerun/upgrade, checksum, rollback, grants/data preservation and lost-response tests pass. See [operations](OPERATIONS.md) and [release evidence](RELEASE-2026-10-25.md).

**P1 · Reproduced defect.** [scripts/setup.mjs](../scripts/setup.mjs#L220) submits every migration on every run, with no applied-migration ledger. The older migrations are largely repeatable, but [0013_source_media.sql](../supabase/migrations/0013_source_media.sql#L3) unconditionally adds existing columns. A second run fails with “column asset_kind of relation studio_assets already exists.”

The failure occurs after earlier files have successfully run. The isolated probe showed that claim_studio_assignment contained the current budget_paused logic before replay and lacked it afterward: an older function definition had replaced the version from migration 0017. Setup therefore violates its advertised idempotence and can leave an upgraded database partially regressed. No production setup rerun was performed during this review.

**Original recommended action:** implement applied-migration tracking with checksums, a baseline for the existing database and safe incremental execution. Resolve the two 0007 filenames deliberately when adopting version-based tooling. Do not simply rerun the current setup script against production.

**Original completion check:** fresh install, unchanged second run and incremental upgrade all pass; the second run leaves function definitions, grants, existing budgets and data unchanged. Evidence: [database-probes.json](../artifacts/qa/project-review-20261025/database-probes.json).

### R02 Reload loses the identity of a pending assignment

**Status: Done and deployed. See the production release record for hosted checks and their scope.**

**Remediation — October 25, 2026:** Fixed and deployed. Full frozen assignment identity survives reload/remount and zero allowance. Review notes and their decision/request ID also persist. Real-component recovery tests retain the original employee and exact inputs. See [operations](OPERATIONS.md) and [release evidence](RELEASE-2026-10-25.md).

**P1 · Reproduced defect.** [AssignmentPanel.tsx](../src/components/studio/AssignmentPanel.tsx#L23) persists the brief text, while pendingRequest is only a React ref. After an accepted POST returns an uncertain acknowledgement, reloading restores the text but generates a fresh request ID on the next submission. The server's idempotency check then sees a different request.

The browser fixture used the real component, a 503 “assignment is saved” response, and a GET response listing the accepted assignment. After reload, the same brief produced two different request IDs. The SQL and editor handoff protections still work for callers that retain their IDs; the gap is this composer path. Employee selection, included inputs and review-note drafts also lack equivalent persistence.

**Original recommended action:** persist the full frozen pending request before POST, including employee, exact input revisions, brief and request ID. Restore a clear retry/reconnect state after reload or panel changes. Require an explicit new intent before replacing an uncertain request. Recovery of an existing request should remain possible when new-work allowance is exhausted.

**Original completion check:** lost response, reload, panel remount and retry produce one assignment and at most one initial paid turn, with the original employee and inputs. Evidence: [assignment-retry-proof.json](../artifacts/qa/project-review-20261025/assignment-retry-proof.json).

### R03 Cancellation can strand a paid media reservation

**Status: Done and deployed. Paid cancellation/settlement evidence is isolated; no new paid cancellation was created during rollout.**

**Remediation — October 25, 2026:** Fixed and deployed. Financial-only settlement preserves cancellation, records the final charge once, and never pays or publishes. A dry-run-first operator command handles provider-confirmed outcomes; unknowns remain held. Database/worker/operator regressions pass. See [operations](OPERATIONS.md) and [release evidence](RELEASE-2026-10-25.md).

**P1 · Code-based defect with supporting database probe.** [processMediaJob](../src/workflows/media/steps.ts#L123) cancels a job when its project or employee authorization becomes inactive. For work already submitted, it correctly avoids declaring an unknown charge to be zero. However, cancelled jobs are terminal in that processor, [launchMediaJob](../src/studio/media-launch.ts#L9) will not restart them, and claim_media_job refuses them. There is no separate application settlement path.

A paid job cancelled before its receipt is observed can therefore keep an unsettled hold indefinitely, even if a known provider task could establish the final cost. The isolated fixture confirmed that a cancelled job retained a 420,000-micro reservation and could not be claimed. This was a synthetic database case, not a new payment.

**Original recommended action:** separate permission to publish an asset from financial reconciliation. Cancelled publication must remain cancelled, while a restricted settlement process can inspect the same known task/receipt and record the actual outcome. Provide an operator path for genuinely unknown submissions with no recoverable task ID.

**Original completion check:** cancellation after submission neither publishes unauthorized output nor pays again; known outcomes settle exactly once, while genuinely unknown outcomes remain held with an actionable explanation.

### R04 Dependency advisories need a controlled update

**Status: Done and deployed, based on the recorded clean audits and passing gates.**

**Remediation — October 25, 2026:** Fixed and deployed. Workflow stays 5.2.3; compatible overrides select Zod 4.6.7, Undici 7.30.1 and runtime body-parser 2.4.0. Both full audits report zero vulnerabilities. Web/runtime tests and production build pass. See [operations](OPERATIONS.md) and [release evidence](RELEASE-2026-10-25.md).

**P1 · Confirmed dependency finding; application exploitability not established.** The production-only web audit reports 23 high-severity package entries, largely propagated through the Workflow dependency graph. These are not 23 independent demonstrated application vulnerabilities. The lockfile contains Zod 4.5.4 and Undici 7.30.0. Current advisories identify patched versions Zod 4.6.6 and Undici 7.30.1 for the relevant release lines. See the [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) and [Undici advisory](https://github.com/advisories/GHSA-xjj6-f33q-929c).

The companion production-only audit reports one high-severity body-parser finding. Its MCP client uses stdio; an installed dependency does not by itself establish an exposed HTTP parsing route. The full runtime audit additionally flags development dependencies associated with Wrangler.

**Original recommended action:** trace reachable uses, select compatible dependency updates, and retest Workflow, MCP and editor boundaries. The web audit's suggested forced fix includes downgrading Workflow to 2.0.6; do not apply that automatically to this 5.2.3 application.

**Original completion check:** reviewed lockfiles, documented disposition of any remaining advisories, passing web/runtime tests and a production build. Evidence: [web production audit](../artifacts/qa/project-review-20261025/npm-audit-production.json), [runtime production audit](../artifacts/qa/project-review-20261025/runtime-audit-production.json), [package-lock.json](../package-lock.json).

### R05 Budget waits block free media acquisition

**Status: Done and deployed. See the production release record for hosted checks and their scope.**

**Remediation — October 25, 2026:** Fixed and deployed. Budget waits no longer consume runnable media capacity. Atomic slot reacquisition and unpaid cancellation/dispatch fencing pass race regressions. See [operations](OPERATIONS.md) and [release evidence](RELEASE-2026-10-25.md).

**P2 · Reproduced defect.** [Migration 0014](../supabase/migrations/0014_employee_budgets.sql#L42) counts waiting_budget jobs against the three-job media limit. Three such jobs with zero reservations prevented a free Commons import in the isolated test. The media UI exposes reconnect, but there is no creator cancellation action in [the job route](../src/app/api/studio/media/jobs/[id]/route.ts).

An owner who reduces allowance or has several unaffordable jobs can become unable to acquire free media until paid work progresses or someone intervenes in the database. Browsing still works, but acquisition is blocked by unrelated paid waits.

**Original recommended action:** distinguish runnable capacity from budget-paused queue entries; allow safe cancellation of work that has not submitted a payment. Keep unknown-paid jobs in the reconciliation path described in R03.

**Original completion check:** three budget waits do not prevent a free import, cancelling an unpaid wait releases its place, and racing requests cannot exceed the actual processing limit. Evidence: [database probes](../artifacts/qa/project-review-20261025/database-probes.json).

### R06 Media limits exceed the default workstation capacity

**Status: Partial. Deployed limits and a controlled hosted reservation probe pass; real space-failure and purchased-result recovery acceptance remain.**

**Remediation — October 25, 2026:** Implemented and deployed. New packages allow 512 MiB/file and 1 GiB/revision; acquired originals/derivatives allow 256 MiB and ten-minute media. Locked media space reservations and runtime free-space checks pass tests. Workstation 0.1.23 activation and a controlled competing-reservation probe passed in production: insufficient future space was rejected and admission recovered after release. The disk was not filled and purchased-result recovery remains unaccepted. See [operations](OPERATIONS.md) and [release evidence](RELEASE-2026-10-25.md).

**P2 · Confirmed configuration mismatch; large-file failure not exercised live.** [DEFAULT_AGENT](../src/config/agents.ts#L16) provisions a disk value of 6 GB. The [media worker](../src/studio/media-worker.py#L26) permits a single 10 GiB original, while [package validation](../src/studio/assets.ts) permits 50 GiB across a revision. The worker also creates previews and potentially much larger WAV or MP4 derivatives. Multiple media jobs use the Director's workstation.

There is no free-space admission check or aggregate disk reservation. A valid acquisition can exhaust the Director's disk, potentially interrupting both media and creative coordination. Raising a per-file limit alone cannot make that workflow reliable.

**Original recommended action:** define supported package sizes against actual provisioned capacity, reserve working space including conversion overhead, and reject or queue work before download/payment when it cannot fit. Choose resource sizing on the server, consistent with the base-plan scope.

**Original completion check:** insufficient space produces an actionable preflight result; concurrent jobs remain bounded; purchased results can still be recovered after a space issue is resolved.

### R07 Large libraries and histories silently truncate

**Status: Done and deployed. See the production release record for hosted checks and their scope.**

**Remediation — October 25, 2026:** Fixed and deployed. Stable cursor pagination, server search, load-more controls, Commons pages and direct recovery-revision lookup replace silent truncation. Tests discover the 301st asset and recover an older exact revision without another upload. See [operations](OPERATIONS.md) and [release evidence](RELEASE-2026-10-25.md).

**P2 · Confirmed implementation limit.** Project listing stops at 100, assets at 300, revision history at 100 and media jobs at 50. The creator interfaces filter these already-limited arrays locally and do not offer a cursor or load-more control. Older content can disappear from discovery, and search can misleadingly report no match.

The revision limit also affects [savePackage](../src/studio/transfer-client.ts), which searches the returned history to recover a previously stored revision ID. A known revision falling outside the returned page can be treated as absent.

**Original recommended action:** add server-side search and cursor pagination, plus direct lookup of a known recovery revision. Preserve stable sort order and exact revision identities. Commons search already supports pages in its server API, but [MediaPanel](../src/components/studio/MediaPanel.tsx) only exposes the first page of up to twelve candidates; add navigation there too.

**Original completion check:** the 301st asset, 101st project/revision and older active media jobs remain discoverable and recoverable. Sources: [asset listing](../src/app/api/studio/assets/route.ts#L11), [history](../src/app/api/studio/assets/[id]/revisions/route.ts#L9), [projects](../src/app/api/studio/projects/route.ts#L7), [media listing](../src/studio/media-server.ts#L54).

### R08 Download and media links can expire while the workspace stays open

**Status: Done and deployed. See the production release record for hosted checks and their scope.**

**Remediation — October 25, 2026:** Fixed and deployed. Exact-file requests renew private short-lived URLs. Playback renewal retains position and the existing editor. Route authorization and real-component expiry/error regressions pass. See [operations](OPERATIONS.md) and [release evidence](RELEASE-2026-10-25.md).

**P2 · Code-based usability risk.** [readSavedPackage](../src/studio/package-store.ts#L18) issues five-minute signed URLs. [ProjectWorkspace](../src/components/studio/ProjectWorkspace.tsx) retains them in packageData and renders direct download and media links without an expiry refresh path. A later click, playback request or seek can require a fresh URL even though the asset remains valid.

**Original recommended action:** authorize and renew the exact-file URL at download time, and refresh expired media sources while retaining playback position and the native editor session. Keep the short expiry and private authorization.

**Original completion check:** download and source playback still work after the page has sat idle beyond URL expiry, without replacing an open native editor. This review traced the expiry path in code rather than waiting for a live private URL to expire.

### R09 Legacy agent controls can bypass Studio lifecycle coordination

**Status: Partial. Creator bypass is fixed; deliberate workstation replacement still needs recovery acceptance.**

**Remediation — October 25, 2026:** Creator-facing bypass is closed in production. Legacy lifecycle/resize/delete routes reject Studio employees; tests prove no upstream mutation. Deliberate persistent-workstation replacement remains an operator acceptance gap. See [operations](OPERATIONS.md) and [release evidence](RELEASE-2026-10-25.md).

**P2 · Code-based risk.** The legacy per-agent workspace and authenticated stop/restart/update/delete/resize routes remain available. Ownership checks are present, but these operations do not coordinate with Studio assignment, media-job or provisioning state. The budget route now rejects independent employee cap edits; the lifecycle routes lack a comparable Studio guard.

An owner can interrupt a running employee, resize infrastructure outside the Studio AI allowance, or delete its persistent workstation through the old surface. Deletion clears the employee's instance reference but leaves provisioning-attempt history that is designed to recover an existing creation, not necessarily create a deliberate replacement.

**Original recommended action:** explicitly retire these controls for Studio employees or route them through an operator recovery workflow that understands active work, storage and provisioning. Keep owner authorization intact.

**Original completion check:** a creator cannot accidentally delete, resize or update an active Studio employee through a legacy route; deliberate replacement has a tested recovery path. Sources: [legacy page](../src/app/dashboard/agents/[agentId]/[[...tab]]/page.tsx), [lifecycle actions](../src/app/api/agents/[id]/[action]/route.ts), [delete](../src/app/api/agents/[id]/route.ts), [resize](../src/app/api/agents/[id]/resize/route.ts), [provision recovery](../src/studio/workstation.ts#L39).

### R10 Recovery needs an operator view and clearer stopping conditions

**Status: Done and deployed. The production health endpoint reports completed free-media workflows and rejects anonymous access.**

**Remediation — October 25, 2026:** Implemented and deployed. Persistent private workflow health, progress timestamps, bounded error backoff, safe categories, Needs attention UI and recovery runbook preserve uncertain-action fences. Production health and two completed free-media workflows passed the rollout smoke checks. See [operations](OPERATIONS.md) and [release evidence](RELEASE-2026-10-25.md).

**P2 · Operational gap.** Assignment, campaign and media workflows use persistent retry loops. That protects work from transient failures, but broad catches often retain little diagnostic detail and continue polling indefinitely. A permanently missing resource, an unrecoverable dispatch or an unknown payment can look much like a temporary outage. Media errors are mostly exposed as internal codes with underscores replaced.

**Original recommended action:** persist last successful progress, retry category, next retry time and a safe diagnostic correlation ID. Add backoff and an explicit needs-attention state with an operator runbook. Distinguish budget wait, platform outage, expired authorization, missing local state and unknown payment. Never treat elapsed time as permission to repeat a payment or uncertain agent turn.

**Original completion check:** an operator can identify and recover a stalled job without guessing, changing raw database rows or releasing an uncertain employee prematurely. Sources: [assignment workflow](../src/workflows/assignment/index.ts), [campaign workflow](../src/workflows/campaign/index.ts), [media workflow](../src/workflows/media/index.ts), [MediaPanel](../src/components/studio/MediaPanel.tsx).

### R11 The deployed budget and media release is not captured by Git HEAD

**Status: Done and deployed. Paired merges, the production deployment, migration ledger and runtime pin are recorded.**

**Remediation — October 25, 2026:** Both PRs are merged and the application is deployed from web 9973720, paired with runtime c15aa03 (implementation b38019a). Hosted gates pass 81 web tests, 68 runtime tests, typecheck, audits and builds; web main passed after merge. A clean runtime export reproduces all 16 workstation 0.1.23 files exactly. Production deployment, source digests, migration ledger, editor/client pins and rollback boundaries are in [the release record](RELEASE-2026-10-25.md) and [sanitized production evidence](acceptance/production-rollout-20261025.json).

**P2 · Confirmed release-management gap.** The current release depends on modified and untracked application files, migrations 0013–0017, new tests and vendor releases. The companion runtime also has uncommitted client/media changes. Both HEAD commits describe the earlier R2 migration.

The saved deployment source manifest is valuable: all 407 compared regular files match the local implementation. Nevertheless, a clean checkout of either HEAD does not reproduce the current release, and a fresh clone would omit untracked files.

**Original recommended action:** review and commit the existing web/runtime changes, identify both commits in a release record, and retain a known compatible rollback target. Include source digests, migration state, editor pins and workstation client version. Do not indiscriminately add ignored QA artifacts or private configuration.

**Original completion check:** clean checkouts of the recorded commits build and test the release with declared dependencies; production can be traced to them. Evidence: [release-evidence.json](../artifacts/qa/project-review-20261025/release-evidence.json).

### R12 Automated gates do not cover the newly found failure paths

**Status: Done and deployed. Maintained CI runs pass; branch-protection enforcement is a separate policy choice.**

**Remediation — October 25, 2026:** Implemented and verified on hosted Linux CI in both repositories. Maintained tests cover the reproduced failures, provider contracts and lost budget synchronization acknowledgements. Web build plus all 18 public cross-engine checks and runtime tests/build pass. Both main branches currently have no required-check protection; CI execution is verified, merge enforcement is not enabled. See [operations](OPERATIONS.md) and [release evidence](RELEASE-2026-10-25.md).

**P2 · Verification gap.** The repository has useful tests, but no checked-in CI workflow was found, and the build script does not run npm test. The passing suite did not exercise setup replay or the composer’s lost-acknowledgement reload. Important media-worker recovery checks currently live in ignored QA scripts rather than the regular test command.

**Original recommended action:** add a repeatable CI gate for typecheck, web tests, runtime tests and build. Promote meaningful recovery scenarios into maintained tests: migration replay, composer identity after reload, unpaid media capacity, cancelled-payment settlement, provider-response contract changes and lost budget synchronization responses.

**Original completion check:** a clean CI run fails for the reproduced regressions and passes after their fixes. Browser fixtures must test state transitions and request identities; they should not merely assert that implementation text exists. External branch protections or CI configured outside these repositories were not inspected.

### R13 Preview generation services still need full acceptance

**Status: Partial. Preview-service acquisitions, rights/provenance and editable-file acceptance remain; the $0.13 approval is pending.**

**Remediation — October 25, 2026:** Exact-profile gating, all six provider request contracts and accurate per-size/character reservations are tested. Sound effects now send `text`; image editing pins Nano Banana instead of a changing provider default. The UI explains precise charges/ceilings and prevents submission when recovery identity cannot be persisted. Real pinned Photo/Sound/Film editors placed the existing paid outputs, saved and reopened native packages while retaining exact source exports and dependencies. Preview-service acquisitions remain pending the bounded $0.13 approval; no new generation was purchased. [Media acceptance](MEDIA-ACCEPTANCE.md) records scope, pricing sources and remaining rights/service checks.

**P2 · Known incomplete extension coverage.** The current service inventory distinguishes these states:

| Service or capability | Evidence and remaining work |
| --- | --- |
| blockrun-image-gen | One real image acquisition recorded; all offered model/size combinations are not established by that check |
| blockrun-tts | One real speech acquisition recorded; broader voice/format/speed coverage remains |
| treza-video | One five-second MiniMax H3 acquisition and receipt recovery recorded; other durations/models remain outside that proof |
| paysponge-gemini-image | Catalog discovery only; shown as preview |
| blockrun-image-edit | Catalog discovery only; shown as preview |
| blockrun-ai-api-v1-audio-sound-effects | Catalog discovery only; shown as preview |
| Generated music | Not confirmed or implemented as an accepted service |
| Reference-image video generation | Not confirmed; current request parser rejects reference inputs for this service |

The recorded three paid checks total $0.439483. Commons image/audio/video placement and native reopening provide separate evidence for the Craft media-import path. Do not broaden either claim to every provider output or every generation option.

**Original recommended action:** show service-specific readiness plainly, retain a deliberate preview policy, and verify each promoted service's request contract, output, cost reporting, rights/provenance and native/browser round trip. Improve estimate accuracy from verified pricing contracts; conservative reservations should be explained when they exceed likely actual cost.

**Original completion check:** each newly promoted option has its own bounded acquisition and editable-file acceptance record. Sources: [PLAN media scope](PLAN.md#shared-source-media-and-provider-integration-authorized-2026-10-24), [service inventory](../src/studio/media-providers.ts), [request validation and estimates](../src/studio/media.ts), [existing media evidence](../artifacts/qa/commons-media-20261024/).

### R14 Temporary data and retained copies need lifecycle management

**Status: Done and deployed. Hosted confirmed-media cleanup passed; no general Storage deletion batch was run.**

**Remediation — October 25, 2026:** Deployed for expired searches, confirmed media copies, explicit creator-upload abandonment and native transfer snapshots. Seven-day quarantine, shared-key protection, fenced deletion retries and post-signing upload checks have regressions. Native retries keep uncertain snapshots and remove duplicates after confirmation. Hosted cleanup freed 6,234,003 working-copy bytes for the two confirmed QA imports; saved originals, request/commit evidence and uncertain working files remain retained. No general abandoned-upload or Storage-object deletion batch ran. See [operations](OPERATIONS.md) and [release evidence](RELEASE-2026-10-25.md).

**P2 · Operational gap.** Media originals, derivatives, receipts and transfer state accumulate in persistent workstation job directories. Search discoveries are inserted on each search and expire logically, but no deletion path for expired media discoveries/cache entries was found. There is no general application cleanup policy for abandoned uploads or no-longer-needed local working copies.

**Original recommended action:** define retention for each data class and implement reference-aware cleanup. Preserve unresolved payment evidence, active uploads, committed originals and every dependency still reachable through a saved revision. Restores and forks can share Storage keys, so deleting by one asset's age is unsafe. Track disk/storage consumption for operators without adding the user-facing hosting/storage budgets excluded by the plan.

**Original completion check:** cleanup frees expired and unreferenced data while saved assets, restored versions, exact dependencies and uncertain-payment recovery still work. Sources: [media worker](../src/studio/media-worker.py), [media search persistence](../src/studio/media-server.ts), [media schema](../supabase/migrations/0013_source_media.sql).

### R15 Recovery documentation needs a cross-service restore drill

**Status: Deferred by owner. Runbook and isolated database regression exist; no hosted recovery drill or recovery time is established.**

**Remediation — October 25, 2026:** Runbook and isolated database snapshot restore regression added. The owner deferred the recoverable database point, full cross-service restore drill and Storage-file backups. The later deployment authorization covered bounded rollout checks, not this restore drill. No hosted restore point or measured recovery time is established. See [operations](OPERATIONS.md) for the retained future procedure.

**Scope update, 2026-10-25:** the user later authorized deployment of all completed changes, superseding the earlier rollout deferral. The recoverable database point, full cross-service restore drill and Storage-file backups remain postponed. A verified schema baseline and row fingerprints used for safe incremental migration are not a recoverable database backup. The earlier Free-plan dashboard observation is retained.

**P2 · Verification gap.** Revision restoration and native file preservation are well tested. A documented exercise restoring the application database, private Storage objects, workflow/job records, workstation recovery state and editor release mapping together was not found in the maintained runbooks. This does not establish that the hosting providers lack backups.

**Original recommended action:** document who can restore each service, retained restore points, expected recovery time and how cross-service consistency is checked. Rehearse in an isolated environment using a representative project with dependencies, a conflict, a Research notebook and a settled media job.

**Original completion check:** restored ownership remains isolated, saved bytes and references verify, editors reopen, and pending work cannot accidentally duplicate a prior external action. Keep the private recovery material separate from public release evidence.

### R16 Current documentation and evidence indexing disagree

**Status: Done and deployed. Current status, historical evidence and remaining work are explicitly separated.**

**Remediation — October 25, 2026:** Updated current-status/acceptance index, both READMEs, repository instructions and historical checkpoint labeling. Sanitized evidence summaries/hashes are maintained; private QA evidence stays ignored. See [operations](OPERATIONS.md) and [release evidence](RELEASE-2026-10-25.md).

**P2 · Confirmed documentation gap.** The [README](../README.md) still describes movable prints, pending integrations, the older deployment URL and password-based sign-in. The lower starter sections of AGENTS.md still say there is no test suite and describe public signup. The companion README lists substantial work as pending after later acceptance completed it. Some per-Craft verification fields retain older startup conclusions while newer central evidence supersedes them.

The top-level scope correctly overrides older text, but readers and automation must reconstruct the current state from a long chronological plan. The central acceptance index also predates the budget/media release. All 76 referenced pilot evidence paths exist locally, but artifacts are ignored by Git and some adjacent QA files contain private credentials.

**Original recommended action:** maintain one concise current status and acceptance matrix, archive dated checkpoints clearly, and update both READMEs and the starter leftovers. Add budget/media rows to the maintained index. Preserve sanitized evidence summaries and hashes in version control or a controlled archive; do not publish the entire QA directory.

**Original completion check:** a new maintainer can identify current scope, auth flow, production commits, verified capabilities and open findings without reconciling contradictory historical statements.

### R17 Studio data handling and support need a broader user explanation

**Status: Partial. Guidance and live support forwarding exist; terms and a concrete retention/closure policy remain before wider access.**

**Remediation — October 25, 2026:** Support/privacy pages are deployed; manual export, account recovery, invitation removal and closure procedures are documented. support@robyn.academy forwarding is live and provider-reported delivery to developer@venatiostudios.com verified. Applicable terms and a fixed closure retention schedule still need review before wider access. See [operations](OPERATIONS.md) and [release evidence](RELEASE-2026-10-25.md).

**P2 before wider invitations · Product and operations gap.** The public [privacy page](../src/app/privacy/page.tsx) describes invitation-request data. The studio now processes native files, prompts, research browsing, connected-account access and provider media, with multiple hosting services. There is no similarly complete creator-facing explanation, maintained support route, or documented account/data export and deletion process. Workspace deletion is explicitly unavailable in the pilot API.

**Original recommended action:** document the actual data flows, retention choices, account recovery, support contact, invitation removal and studio closure process. Explain how creators retrieve their files and credits. Have the applicable terms reviewed before broadening access or introducing commercial subscriptions. This is a documentation and operating-process recommendation, not a legal compliance determination.

**Original completion check:** a creator can find a clear answer to where their work is stored, which services process it, how to get help and how to request removal/export.

### R18 Browser support and accessibility coverage should be explicit

**Status: Partial. Baseline and automated checks are documented; native accessibility and broader device/engine/GPU acceptance remain.**

**Remediation — October 25, 2026:** Public checks remain maintained. New real-component Media-panel tests pass keyboard/axe/reflow, high contrast and exact retry/editor preservation in Chromium, Firefox and WebKit. Real Photo/Sound/Film packages opened in all three engines; generated-source native save/reopen passed in Chromium. Support and Document options expose browser/accessibility help without replacing the editor. A PhotoCraft native input lacks an accessible name and the canvas lacks individually named tools; full native keyboard/screen-reader support is not claimed. Physical devices, additional GPUs and broader native round trips remain open. [Browser baseline](BROWSER-SUPPORT.md) distinguishes each result and limitation.

**P2 before broader browser support · Verification gap.** Existing acceptance is strongest in Chromium on desktop and Chromium mobile emulation for the public site. Physical phones and Safari were not covered by the recorded mobile acceptance. The desktop entry gate tests viewport, hover and pointer capability; it does not establish that every admitted browser supports every editor's required graphics/media features.

The fresh homepage axe scan passed, but that is not complete accessibility coverage of the native editor controls, keyboard workflows or screen-reader experience across thirteen applications.

**Original recommended action:** publish a supported browser/device baseline and test representative desktop engines, GPU configurations, keyboard-only operation, zoom and high-contrast settings. Physical-phone checks apply to the public site; compact native editors remain outside this pilot. Treat the historical automated Chrome startup anomaly as a scoped regression case, not evidence that every current editor is broken.

**Original completion check:** stated browser support matches actual tests, and unsupported environments receive a useful explanation without destroying an already-open editor session.

## Product additions and improvements worth considering

These are proposals, not missing acceptance criteria or additional open R-findings. They need separate prioritization; they do not change the owner's database-recovery and Storage-backup deferrals.

| Improvement | Benefit and scope |
| --- | --- |
| First-project guidance | Explain the choice between importing a native file, starting with a specialist and acquiring media. New employees have zero allocation, so show the allowance step before a creator reaches a disabled brief button |
| Blank native documents and starter projects | Make manual creation easier for creators who have no existing package and want to begin without an AI job; verify each Craft's genuine new-document path |
| Complete project export | Offer one portable bundle containing native masters, linked files, exact revision manifest, previews and credits instead of requiring individual file downloads |
| Better library organization | Add app/media/project filters, sorting, tags and safe rename/archive actions after pagination. Consider explicit copying between projects while preserving provenance and project authorization |
| Source previews before acquisition | Add audio audition, video playback where permitted, duration/dimensions and clear proxy/original labels. Explain that Commons includes archival/documentary material |
| Review comparisons | Show before/after previews and changed revision metadata; keep the native file authoritative. Persist review notes across navigation |
| Clearer Director plans | Show the ordered specialist steps, dependencies, current blocker and returned outputs, rather than mainly a completed-step count |
| Completion and attention indicators | Provide in-app signals for finished work, budget pauses and recovery needs. External notifications should be separately opt-in |
| Cost explanations | Make actual versus reserved versus unallocated allowance easier to understand, especially when the Director funds generation for another specialist. Show that caps authorize spending but do not fund the underlying wallet |
| Operator invitation queue | Add a restricted workflow for reviewing requests, issuing/reissuing invitations and resolving delivery problems while keeping public signup disabled |
| Maintainability improvements | Format dense budget/media orchestration code, centralize job-state transitions and remove unused starter surfaces once their supported replacements are settled |
| Precise deployment packaging | Trace only the pinned workstation client and required assets into each deployment while retaining older releases in controlled storage for recovery |

Agent37 exposes per-instance monthly caps and persistent one-time headroom, with a shared underlying wallet. The Studio allocation layer is therefore an application policy, not a native atomic pooled-budget API. Keep that distinction visible in operator documentation and recovery tests. [Agent37 budget documentation](https://www.agent37.com/docs/agents-api/budgets).

## Original recommended sequence (historical)

This was the ordering proposed before remediation. It does not reopen completed work or override owner deferrals. The current status and outstanding R-numbers are listed at the start of this document.

| Stage | Work | Exit condition |
| --- | --- | --- |
| First fixes | R01 setup replay, R02 assignment identity, R03 financial settlement, R04 dependency triage | Reproduced regressions covered; unknown actions remain protected; reviewed dependency disposition |
| Media and library reliability | R05 capacity/cancellation, R06 disk admission, R07 pagination, R08 URL refresh | Free work remains available, large jobs fail safely, older work stays discoverable and downloads remain usable |
| Operational readiness | R09 lifecycle controls, R10 support/recovery states, R11 release commits, R12 CI, R14 retention, R15 restore drill | A clean checkout reproduces the release and an operator can recover incidents using documented procedures |
| Scope and user clarity | R13 service-specific acceptance, R16 current documentation, R17 data/support guidance, R18 browser baseline | Public and private claims match verified behavior and support capacity |
| Product refinement | First-project guidance, portable export, source audition, stronger review and organization | Improve measured creator friction without expanding the pilot's device or billing scope by accident |

Current disposition: 12 findings are done and deployed; R06, R09, R13, R17 and R18 are partial; R15 is deferred. The production release and bounded hosted checks are recorded. Database recovery-point creation, the full cross-service restore drill and Storage-file backups remain deferred.
