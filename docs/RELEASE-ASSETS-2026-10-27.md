# Assets library release — October 27, 2026

The release adds a dedicated Assets management page, exact-version downloads and exports, and shared original-file import/placement across all thirteen Crafts. FilmCraft receives a single chosen rendition through its native media-bin API.

Both original PRs are merged: [web #27](https://github.com/BoundlessStudio/robyn/pull/27), merge `ea8cc568a0e0793d1a77ccf32329d8800cbe78b9`, and [runtime #4](https://github.com/BoundlessStudio/robyn-artcraft-runtime/pull/4), merge `737eaa0934a93ea57073d20243bceeea875c2516`. Production deployment `dpl_DrK3s72G2FcpojDVJ4XLaTMHqKnZ` was Ready and Current for `robyn.academy` on October 27 at 23:56 UTC with that exact web merge. Both main CI runs passed. The earlier production release remains historical in [RELEASE-2026-10-27.md](RELEASE-2026-10-27.md).

Authenticated production checks passed original-image import, WordCraft placement and confirmed save, exact source linkage, native WordCraft continuation, PDF export attachment and complete ZIP download. Independent byte checks confirmed that adding the export preserved the native master and included the exact PDF. These bounded checks used a labelled QA project; original creator projects were not changed. [Local acceptance](acceptance/assets-library-2026-10-27.md) remains separate from these production observations.

## Coordinated sources and artifacts

The original paired implementation commits and hosted artifact proof are recorded in [sanitized release evidence](acceptance/assets-library-20261027.json). The initial production release selected adapter 0.2.2 for all thirteen Crafts, with existing upstream native releases and workstation templates unchanged. The companion retains per-Craft `verification-v0.2.2-local.json` records.

The immutable Cloudflare catalog retains all 37 previous releases and adds 13 new ones: 50 releases, 21,431 paths and 705 unique objects totaling 977,690,643 bytes. Preparation compared every previously catalogued file's SHA-256, length and MIME descriptor and refused changes or omissions. New releases preserve native WebAssembly, workers, licensed resources and notices; only the browser adapter and its release metadata/entry point change.

Publication completed on October 27 at 23:43 UTC. Worker version `7a2c7c9f-22de-417d-a691-eb84f3225b30` served all 705 objects with verified SHA-256, size, MIME and security headers. The catalog SHA-256 is `ae757b1ff311a951acf115a00782413918bf208c985d6eb65539d777cfcc6193`. Web implementation `1c0c95d` pairs with runtime `2c496a5`; full commit identities are in the evidence file. The subsequent production deployment is recorded above.

## FilmCraft Source import

The initial all-Craft acceptance entered FilmCraft through Place from studio. The creator's follow-up exposed a separate native entry: File → Import and Browse files tried a File System Access picker that rejects cross-origin frames. FilmCraft 0.2.3 routes those controls through Robyn's shared asset picker, adds Import media to the empty Source panel and its menu, and opens successfully imported media in Source. A standard file-input fallback supports the other embedded native file dialogs without changing iframe permissions.

This browser release rebuilds FilmCraft WebAssembly and its adapter. It preserves the 0.2.2 artifacts and all native/workstation pins. [Follow-up evidence](acceptance/filmcraft-source-import-20261027.json) records actual Source/Browse/menu clicks, optional local-file upload, one imported media item, exact dependency bytes, a confirmed BFF save and independent native continuation. Native Source opens Robyn's saved project library first; uploading a local file is optional.

The correction is live in deployment `dpl_5STgGJDNM1GSStVDbWYTgErGGERZ`, Ready for `robyn.academy` on October 28 at 00:32:39 UTC (October 27 locally). Web merge `b80cf89cd5e3da5a0abd55f970eb17bab45a8ea9` ([#28](https://github.com/BoundlessStudio/robyn/pull/28)) pairs with runtime merge `30acb6e659358f5adb07626a8286826339e37b53` ([#5](https://github.com/BoundlessStudio/robyn-artcraft-runtime/pull/5)). Both PR and main CI gates passed. Live Source → library → existing Clip selection displayed the clip, committed revision 2 with one exact source link, and downloaded a package that independently reopened and continued in native FilmCraft. The creator also confirmed the workflow after refreshing.

Publication retains 51 releases, 21,446 paths and 710 verified objects. FilmCraft's executable digest is `ef46e920dcc167efe39ed0f586ba9983ee1bd29d66f9cc6f5be803b859488fbd`; catalog digest is `537fd37944ccd742cec554e07c891cfd5d194f371b000105c5b09ed3e3769798`. All other Crafts remain on 0.2.2.

## Asset thumbnails

The image-preview follow-up allows the exact private Storage host in the editor's image policy. Signed previews still come from the project BFF. Cached Worker responses receive current policy without changing their body, hash or immutable release URL. A stable `policy=20261028` query on all thirteen web pins makes browsers request the corrected document headers; the bundle versions and files stay unchanged. Runtime merge `fe1b155754c592bd73702eb106e74f093a0929de` ([#6](https://github.com/BoundlessStudio/robyn-artcraft-runtime/pull/6)) is deployed as Worker `ae61f2ea-19f1-4522-9367-f3761b860c6e`.

All 79 runtime tests pass, including real image decoding under the distribution policy, rejection of unrelated image hosts and policy refresh on cached responses. The actual published FilmCraft iframe also decoded the expected 96 × 64 PNG with isolated BFF/storage transport. All 51 hosted entry pages retain their exact HTML hashes and carry the corrected policy.

The preview correction is live in Ready production deployment `dpl_2ZBWE5jbvB4fBJQ1WxcP3uNi7orj`, assigned to `robyn.academy` at 00:48:08 UTC. Web merge `ee03b4b862d8f6aa3dbce42c15f6a9423d652fee` ([#29](https://github.com/BoundlessStudio/robyn/pull/29)) pairs with runtime `fe1b155754c592bd73702eb106e74f093a0929de`. A normal refresh loaded the new policy query; the authenticated production picker displayed Artwork with decoded dimensions 96 × 64. The previously saved film retained its clip after reopening. [Preview acceptance](acceptance/asset-preview-policy-20261027.json) records this live check separately from isolated transport tests. Native assets without a saved preview still show their type badge; no new preview generator was added.

## Database and workstation boundary

This work adds no migration. The last recorded production database checkpoint remains the 25-entry checksummed ledger through `0024_open_canvas.sql`, SHA-256 `508945e29e3ac0dbcf0d084b0d65e17a0222d6c5afe9535664cb74eb94fc46fa`. This task has not re-read or modified that live ledger. Workstation client 0.1.23, its exact bundle, all native images/templates and version-1 starters remain unchanged. No employee was activated or sent a paid turn.

## Rollout and rollback

The new assets page and import bridge are required by the 0.2.2 and 0.2.3 editor controls. A full assets-release rollback must restore the preceding web source and its preceding editor pins together; keep all published editor paths and saved revisions. FilmCraft's follow-up can independently return its pin to the immutable 0.2.2 bundle, with the known native import limitation. Existing sessions and prior pins continue to have their original bytes. Do not replace a release version with a rebuilt adapter or replay migration files.
