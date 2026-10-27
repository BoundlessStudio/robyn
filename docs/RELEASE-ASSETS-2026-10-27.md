# Assets library release — October 27, 2026

The feature branch adds a dedicated Assets management page, exact-version downloads and exports, and shared original-file import/placement across all thirteen Crafts. FilmCraft receives a single chosen rendition through its native media-bin API.

Web deployment is pending. The existing production web release remains recorded in [RELEASE-2026-10-27.md](RELEASE-2026-10-27.md). Local acceptance and the precise scope of native/editor verification are in [the asset library acceptance record](acceptance/assets-library-2026-10-27.md).

## Coordinated sources and artifacts

The paired implementation commits and hosted artifact proof are recorded in [sanitized release evidence](acceptance/assets-library-20261027.json). Every independent Craft manifest selects adapter 0.2.2, with its existing upstream native release and workstation template unchanged. The companion retains per-Craft `verification-v0.2.2-local.json` records.

The immutable Cloudflare catalog retains all 37 previous releases and adds 13 new ones: 50 releases, 21,431 paths and 705 unique objects totaling 977,690,643 bytes. Preparation compared every previously catalogued file's SHA-256, length and MIME descriptor and refused changes or omissions. New releases preserve native WebAssembly, workers, licensed resources and notices; only the browser adapter and its release metadata/entry point change.

Publication completed on October 27 at 23:43 UTC. Worker version `7a2c7c9f-22de-417d-a691-eb84f3225b30` served all 705 objects with verified SHA-256, size, MIME and security headers. The catalog SHA-256 is `ae757b1ff311a951acf115a00782413918bf208c985d6eb65539d777cfcc6193`. Web implementation `1c0c95d` pairs with runtime `2c496a5`; full commit identities are in the evidence file. Artifact publication does not deploy the Studio web application or change its current production pins.

## Database and workstation boundary

This work adds no migration. The last recorded production database checkpoint remains the 25-entry checksummed ledger through `0024_open_canvas.sql`, SHA-256 `508945e29e3ac0dbcf0d084b0d65e17a0222d6c5afe9535664cb74eb94fc46fa`. This task has not re-read or modified that live ledger. Workstation client 0.1.23, its exact bundle, all native images/templates and version-1 starters remain unchanged. No employee was activated or sent a paid turn.

## Rollout and rollback

Deploy the paired web implementation after the editor publication proof is complete. The new assets page and import bridge are required by the 0.2.2 editor controls. A web rollback must restore the preceding web source and its preceding editor pins together; keep all published editor paths and saved revisions. Existing sessions and prior pins continue to have their original immutable bytes. Do not replace a release version with a rebuilt adapter or replay migration files.
