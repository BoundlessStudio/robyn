# Pilot support and recovery

Owner: the Robyn pilot operator, reached at **support@robyn.academy**. Mail forwards to **developer@venatiostudios.com**. Access to Supabase, Vercel, Agent37, Cloudflare and Resend remains with their existing account owners; the web application does not grant creators provider-admin access. No guaranteed response or recovery time is offered during the pilot.

## Identify a stalled job

Open **Settings → Studio health** in the owning studio. It reports the safe job reference, state, last successful observation, last meaningful progress, retry category and next scheduled error retry. Media also shows an actionable status in its project panel. Health is owner-scoped and contains no prompts, signed links, credentials or provider response bodies. It currently lists the latest 200 observations and says when that view is truncated; use the exact project/job reference for older work.

Failures back off from 15 seconds to 15 minutes. Five consecutive failures, an uncertain outcome, or 30 minutes without progress produces a **Needs attention** indicator. Intentional budget/capacity waits and completed/review states are treated separately. This indicator does not release an employee, reset a dispatch fence or authorize another payment. A database outage can prevent the health row itself from updating; compare it with Vercel Workflow status using the saved workflow ID.

| Observation | Recovery action and stopping condition |
| --- | --- |
| Budget wait | Check the Studio allowance and the Director's remaining headroom. Resume the saved change after a partial budget update; do not create a different operation while it is pending |
| Capacity wait | Let active work finish or cancel an unpaid queued/preparing job. Three unpaid budget waits no longer consume the runnable media slots |
| Platform unavailable | Check the relevant provider's status and the existing workflow. Reconnect the original job; bounded retries retain the original dispatch/payment identity |
| Authorization changed | Verify the project is active and the assignment still owns its capability. Revoked publication stays cancelled. Financial reconciliation can continue without publishing the output |
| Resource missing | Confirm workspace, employee and instance identities against the saved provisioning attempt. Do not provision a replacement merely because a request returned 404 |
| Workstation/local state missing | Preserve the existing instance and recovery directory. Restore access to that same state if possible. If a paid submission cannot be identified, escalate to provider reconciliation |
| Payment outcome unknown | Keep the reservation and original request ID. Inspect only the existing task/receipt. No timeout is permission to call the payment endpoint again |

Review/cancellation operations must target the current workflow/run fence. If a workflow is still active, do not clear its employee lock or edit a raw database row to make the UI look idle. The legacy stop/update/resize/delete controls reject Studio employees. Deliberate persistent-workstation replacement is not a supported self-service recovery action; it remains an operator acceptance gap until local recovery state, active jobs and the provisioning attempt can be migrated and tested together.

## Reconcile a cancelled or uncertain payment

For a known provider task, use **Check existing receipt** in Media. The restricted settlement branch can read the saved receipt or poll that same task. It cannot submit a payment, fetch a new input package, upload an asset or change cancelled publication to completed. The database records the final charge once; repeated matching settlement is idempotent, and a different charge is rejected.

For a submission with no recoverable task ID, retain the hold and contact the provider using the private workstation receipt/submission evidence. Do not infer a zero charge from elapsed time, a missing response or a cancelled project. Once the provider establishes the final outcome, keep its evidence privately and prepare this minimal record:

```json
{
  "chargeIsFinal": true,
  "charged": { "currency": "USD", "amount": "0.420000" },
  "caseReference": "provider-case-reference",
  "runId": "known-run-if-available"
}
```

Run from the reviewed web checkout with the existing server credentials supplied through the private environment. The default is a dry run:

```sh
node scripts/settle-media.mjs WORKSPACE_UUID OWNER_UUID JOB_UUID PRIVATE_RECEIPT_PATH
node scripts/settle-media.mjs WORKSPACE_UUID OWNER_UUID JOB_UUID PRIVATE_RECEIPT_PATH --apply
```

The command permits only cancelled, failed, completed or uncertain jobs, verifies ownership and the current workflow fence, and records financial settlement only. A zero amount requires the same explicit final provider evidence. Stop if the actual job or receipt differs from the reviewed record. Never include signed URLs or tokens in the receipt. The script allowlists receipt fields; retain any full provider evidence in the private incident record.

## Workstation and package space

The base workstation remains server-selected. New native uploads allow **512 MiB per file / 1 GiB per revision**; acquired originals and individual derivatives are limited to **256 MiB**, with audio/video limited to ten minutes. Existing saved files are not rewritten to meet these new limits.

Each active media process reserves up to 1 GiB of working space under a workstation-wide lock, plus 512 MiB free-space headroom. Admission accounts for other jobs' remaining reservations and actual free space before payment/download. The runtime checks destination free space before native package materialization. Low space yields an actionable wait/failure; purchased receipts and the original request remain recoverable after space is available. These bounds do not claim that every valid 1 GiB package is practical for every native editor's memory requirements.

For an incident, inspect filesystem free space and the media job's `state.json`/`space.json` in the existing Director workstation through the authorized Agent37 operator tools. `cleanedBytes` records successful media cleanup. Do not change creator hosting/storage budgets; none are part of the pilot. Do not remove a directory just because its workflow is old.

## Retention policy and current implementation

| Data class | Current retention / cleanup rule |
| --- | --- |
| Saved native/source revisions, conflicts, restores, forks and exact dependencies | Retain while the studio is active. No general saved-asset deletion job is enabled |
| Search cache/discoveries | Expire after their recorded lifetime; owner-scoped search prunes at most 500 expired rows per class. A discovery referenced by any media job is retained |
| Completed media local originals, previews and transfer offsets | Delete only allowlisted local working files after a committed revision and final billing settlement are proven. Never remove provider receipts or submission/request identity. The worker is not woken solely for housekeeping |
| Unresolved payments, active uploads and uncertain dispatches | Retain until their external outcome and recovery needs are resolved; no age-based cleanup |
| Explicitly abandoned creator uploads | Operator-only, exact revision; permanent closure and seven-day quarantine. Shared object keys and any recovery reference prevent deletion. Age alone never abandons an upload |
| Native transfer snapshots | Preserve an uncertain upload snapshot; remove a freshly recreated duplicate on retry, and remove the original only after persisting the confirmed save. Verify every path/hash; retain receipts |
| Native working folders and opened inputs | Retain unsaved working data. No age-based or blanket deletion is enabled |
| Support messages | Kept in the restricted Resend inbox and receiving mailbox while needed for the case. A formal closure/retention schedule still needs operator review |

Restores and forks can share Storage keys. The implemented upload cleanup checks **all** manifest references, exact dependencies, assignment inputs/deliverables, employee operations and media jobs, then rechecks references when claiming deletion. A database tombstone blocks new references to retired keys. Track unique Storage keys separately from logical per-revision bytes. The dry-run inventory reports unique manifest bytes separately from per-revision totals; it is not a measurement of billable provider storage. Isolated tests preserve restores/forks and uncertain payments. No Storage-file backup is being added in this remediation; the owner explicitly deferred it.

### Explicit upload cleanup

Use the owner-scoped operator command. Default mode is read-only. Abandon only an exact creator upload the owner explicitly no longer wants; saved/conflicting revisions, employee output and recovery references are refused.

```sh
node scripts/storage-retention.mjs WORKSPACE_UUID OWNER_UUID inventory
node scripts/storage-retention.mjs WORKSPACE_UUID OWNER_UUID abandon REVISION_UUID
node scripts/storage-retention.mjs WORKSPACE_UUID OWNER_UUID abandon REVISION_UUID --apply
node scripts/storage-retention.mjs WORKSPACE_UUID OWNER_UUID prune
node scripts/storage-retention.mjs WORKSPACE_UUID OWNER_UUID prune --apply
```

Abandonment permanently closes that upload. Only unshared keys become eligible after seven days. Supabase documents [two-hour signed upload tokens](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl) and [resumable upload URLs lasting up to 24 hours](https://supabase.com/docs/guides/storage/uploads/resumable-uploads); the quarantine outlasts both. The application checks upload state again after signing, so a delayed response cannot return fresh credentials after abandonment.

Prune handles at most 50 claimed keys, deletes through the Storage API, then acknowledges each exact claim. On a lost deletion response, preserve the tombstone and retry after the 15-minute lease. Never remove Storage metadata directly, shorten the quarantine, clear a tombstone, or replace a key to bypass a retained reference. All original manifest rows and operation IDs remain. This is temporary-data cleanup, not a backup or saved-asset deletion policy.

## Database and cross-service restore

**Verified October 25:** the Supabase dashboard for `robyn-creative-studio` shows the **Free** organization plan and says project backups are not included. The configured Management API token returned 403 for the backup inventory; the dashboard resolves the earlier uncertainty. No retained hosted restore point, PITR policy, or measured recovery time is established. A later read-only Management SQL check confirmed PostgreSQL 17.11 and available database credentials; pooler discovery returned 403. The attempted local Docker rehearsal could not start because its secrets-engine socket was inaccessible. No database export/restore or Docker reset was performed. Do not assume that using Supabase supplies a usable backup on this plan. [Supabase's backup documentation](https://supabase.com/docs/guides/platform/backups) describes plan coverage and recommends logical exports for Free projects. Database backup metadata does not include Storage object bytes; those backups remain deferred here.

The isolated maintained test `tests/database-restore.test.mjs` restores a PGlite snapshot with a Research notebook, native fixture, exact dependency, conflicting revision, settled media job and uncertain external actions. It verifies rows, byte-hash metadata, owner isolation, private grants, migration history and dispatch fences. It does **not** establish hosted Supabase restore compatibility, a native-editor reopen, workstation recovery or a backup of creator files.

Before a production restore, the service owners must record a recoverable database export or retained provider restore point in a private recovery register. Use the [official Supabase CLI restore procedure](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), retaining role/schema/data artifacts and the migration ledger privately. Store encrypted copies outside this checkout. Record creation time, PostgreSQL/Supabase versions, digest, retention and who can decrypt/restore; verify an isolated restore before claiming coverage. Creating a paid backup plan or storing private exports in a new external location requires a separate concrete decision.

| Service | Recovery owner and source | Current recovery guarantee |
| --- | --- | --- |
| Supabase Auth/Postgres | Supabase organization owner; verified logical export or enabled provider restore point | No hosted restore point verified; RPO/RTO unmeasured |
| Private Storage | Supabase owner; existing objects and revision manifest | Separate object backup deferred; DB restore cannot recreate missing bytes |
| Vercel application/Workflow | Vercel project owner; release commits/deployment and Workflow run records | Application source reproducible; a database snapshot alone cannot rewind external Workflow execution |
| Agent37 persistent state | Agent37 workspace owner; existing instance and assignment/media recovery directories | Preserve instance IDs, sessions, responses and receipts; no independent workstation disaster restore proven |
| Editor mapping | Runtime repository owner; immutable manifest pins, R2 manifests and Git release record | Historical 661-object hosted byte verification recorded; do not overwrite a published path |
| Support forwarding | Resend/Cloudflare account owners; Worker source/config and encrypted secrets | Live delivery verified; key rotation procedure in deploy/support-forwarder/README.md |

Rehearse the following in an isolated environment before restoring production:

1. Stop new submissions and prevent Workflow dispatch while taking the recovery inventory. Keep uncertain job/receipt evidence newer than the proposed database point in a separate private incident record.
2. Restore the database to a separate project, including ownership, grants, exact references and `robyn_setup.migrations`. Keep outbound employee/payment capabilities absent while validating it. Restore only from a known source; do not baseline an unknown database to skip errors.
3. Reconcile external outcomes **after** the database point: a payment or agent turn may have happened after the snapshot. Retain their IDs/fences; never re-enable dispatch based only on the older database's queued/idle state.
4. Check package object existence, sizes and hashes against every representative revision and dependency. With Storage backup deferred, report missing objects as missing; do not replace them silently with newer files.
5. Reattach each preserved workstation to its matching owner/employee and reconcile sessions, response IDs, task receipts and pending upload state. Unknowns remain held. Do not reset provisioning history to force a new machine.
6. Reapply only new migrations through the ledger. Deploy the matching web/runtime/editor pins into the isolated environment. Reopen the representative Research notebook and native files; preserve conflict identities and credits.
7. Verify a second creator cannot read the restored project or file. Test reconnect and ensure no second payment or initial agent turn. Record timings and outcomes privately, then define measured RPO/RTO. Production cutover is a separate reviewed action.

Until that drill and a retained database export exist, R15 remains partially open. Storage-file backups remain intentionally deferred.

## Creator export, removal and access recovery

Verify requests through a fresh sign-in to the existing invited address or a documented ownership review. An email sender header alone is not proof of ownership. If the mailbox is lost, stop automated transfer; the operator must establish ownership without asking for passwords, sign-in URLs or connected-account tokens.

For an export, scope every read to the verified workspace. Provide project metadata, notebook/native revisions, dependency paths/hashes, provenance/credits and allowance/job records. Never include service credentials, employee capability hashes, unrelated workspaces, private provider headers or support cases belonging to others. The creator can download individual exact files immediately through the Files panel. A portable bulk-export interface is still a product improvement; manual exports must be checked and delivered privately.

For invitation removal, identify the exact request and pending invitation, revoke unused access, remove only the requested records, and confirm the result. For studio closure, first agree the export and removal scope with the owner. Cancel only unpaid work, settle or retain unresolved external actions, disconnect authorized accounts, revoke assignment capabilities and sign-in access, and preserve the minimum private charge/recovery evidence needed for unresolved cases. Persistent workstation deletion is consequential and needs a reviewed replacement/recovery decision; do not invoke a legacy route as a shortcut. Reference-aware file removal and a fixed closure retention schedule are not yet enabled, so explain that limitation before promising completion.

AI allowance is a cap, not deposited creator cash. Reconcile provider credit/refund requests with the provider's actual charge record; never release an unknown hold or promise a refund on the basis of the UI alone. Applicable terms and this operating process need review before broader invitations or commercial subscriptions.
