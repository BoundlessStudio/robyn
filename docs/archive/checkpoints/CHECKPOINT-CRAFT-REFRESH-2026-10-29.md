# Craft refresh checkpoint — paused October 29, 2026

> Historical record. Requirements, pause/resume directions, pending actions and release state below describe the recorded pass. Use the [documentation index](../../README.md) for current scope and acceptance.

The owner requested a checkpoint and pause. **The refresh is unfinished; do not deploy this checkpoint as a completed release.** Resume the existing goal to refresh the thirteen ArtCraft applications and add SolidCraft as an application and Parametric 3D Designer employee.

## Saved repositories

- Web: `D:/.codex/worktrees/fa60/robyn`, branch `codex/refresh-crafts-solidcraft`, based on production web `8379f08dc77f892db7c52a3ad1c7d02d4162d7c3`.
- Runtime: `D:/Development/BoundlessAi/robyn-artcraft-runtime`, same branch. Prepared integration commit `8d1fa45`; merge `5a5df009bef931314e9edfa3eca33abcb2d9bec8` incorporates production runtime `fe1b155754c592bd73702eb106e74f093a0929de`.
- Both checkpoints are local commits. No refresh PR, push, merge to main or production web deployment has occurred.
- Keep `E:/Development/robyn-refresh-20261029` and both checkouts. It contains source clones, final historical bundles, native CLIs, immutable publication stage, build receipts and private QA evidence. Private helpers remain in web `artifacts/qa/refresh-20261029`; do not commit that folder wholesale.

## Completed and external state

- Latest release locks as checked October 29: Photo0.17, Vector0.18, Light0.15, Film0.14, Effect0.18, Sound0.14, Design0.14, PDF0.15, Word0.12, Deck0.12, Grid0.13, Fig0.12.1, CAD0.14 and Solid0.26.1. Exact commits/archive hashes are in `docs/acceptance/craft-refresh-upstream-20261029.json` and runtime locks.
- All fourteen immutable Agent37 native images built successfully and checked CLI versions. Pins are in `docs/acceptance/craft-refresh-native-images-20261029.json`. **No existing employee instance was upgraded; no employee AI turn was submitted.**
- Migration **0027 is already applied**, with28 matching ledger entries and unchanged earlier27. Its immutable normalized SHA-256 is `cfe4a41fe46c1c1cbfb7737fd98306946705a6d616109a53fc130bf592576103`. RLS, private grants and idempotent rerun passed. See migration and workstation guard acceptance JSON. Do not edit/replay0027; use a new migration if needed.
- The expired setup PAT was refreshed through the user-authorized Supabase UI. It is stored only in the original web `.env.local`, scoped to Robyn database read-write, expires November5. Never print or commit credentials.
- CDN catalog retains51 original releases plus14 unpromoted candidates: thirteen adapter0.3.0 and Solid0.1.0. All868 unique objects were byte-verified. Preserve all65 published paths and bytes. Worker `f007a4fb-9b0e-4ee4-9c28-05023b0d154c` restores production-main thumbnail/cache policy. Representative old HTML/WASM bytes and policy checks passed. See distribution checkpoint JSON.
- All14 historical candidates passed actual native→browser edit→BFF/private Storage confirmed save→hash-checked native continuation. Original13 rich legacy packages and all14 blank starters passed compatibility. Solid additionally passed five-save lost-acknowledgement/Save As/Copy recovery and a linked-design loop. Hosted Solid0.1.0 and CAD/Word/Grid0.3.0 loops passed; a hosted Deck attempt is partial and unaccepted.
- Web160 tests, typecheck, build and audit passed. Public UI passed18 page/viewport/engine combinations; four Windows WebKit native-link keyboard cases remain explicitly unverified. Desktop/mobile Solid chapter and authenticated ready launcher were reviewed. Full employee Team/dropdown review is unfinished. Runtime85 tests and audit passed **before merging newer runtime main**; four Worker tests passed after merge. PDF3 prepared-save tests,1 annotation regression and official attribution generation passed; Solid13 scoped native UI tests passed.
- Workstation client pin is0.1.24, fingerprint `99ff7446770a3cce2a7b71cd33afbf2f456bef949b3472a00d53b4e8ede2b47e`, MCP SHA-256 `a9e098b630c414704a3d0b6c6f074279fcf2afa4f48fb23c6423f7405b82852b`.

## Resume here

The runtime checkout originally started8 commits behind production. The merge above brings in the current shared asset picker, import/export-rendition selection, preview policy and adapters. **The published0.3.0/0.1.0 candidates predate that merge and must not be the final rollout.** Working web manifests currently select those historical candidates; replace them only after new acceptance.

1. Preserve merged `lib/editor-client.mjs` import/asset URL APIs and the refresh's frozen request-ID retry fix. Port Solid's adapter to the new picker interface and add an appropriate Solid placement policy without bypassing the BFF or advertising unsupported imports.
2. Port production Film Source hooks onto the new0.14 source patch. No port or0.3.1 build has started. Targets: `apps/filmcraft-web/src/robyn.rs` (`MEDIA`, `choose_media`, `assetPicker`), `import.rs` iframe picker guard/install hooks, `hooks.rs` `HostHooks.pick_library_media`, `app/files.rs` import route, and `panels/monitor.rs` Source import buttons. New main adapter requires this hook.
3. Issue fresh adapter versions: thirteen0.3.1, Solid0.1.1. Keep published candidates immutable. `scripts/rebuild-adapter.mjs` can copy verified native/font bytes from `E:/Development/robyn-refresh-20261029/publish-stage` into a fresh output root; its lock must still identify the old adapter while copying. Only Film needs a new WASM build for the missing hooks. Native template/client pins need no rebuild unless their inputs change.
4. Run current merged runtime tests/audit, updated actual local+hosted round trips, and Film Source import/native continuation. The ignored BFF harness currently asserts0.3.0 and needs explicit new-version/output handling. Earlier proofs remain historical, not proof of new bytes.
5. Prepare/publish an additive79-release catalog retaining all65 current paths. `ROBYN_WEB_ROOT=D:/.codex/worktrees/fa60/robyn` selects this web checkout for artifact preparation. Promote new web pins after acceptance; retain the13 exact `previousReleases` native allowlists. Recheck final web gates and affected visuals.
6. Actual same-instance/home-preserving workstation upgrade canary is **not implemented or executed**. Helpers `build-server.mjs`, `server-entry.ts`, `workstation-inventory.mjs` exist in ignored web QA. Inventory at `E:/Development/robyn-refresh-20261029/workstation-canary/inventory.private.json` identifies13 idle owned QA specialists; CAD was selected. Recheck ownership/mirror/idle fences at operation time. Use actual `ensureEmployeeInstance` and a serialized QA assignment, verify exact target digest, persistent files/resources/client, then cancel before AI dispatch. Preserve unknown outcomes; never repeat an uncertain external update.
7. Finish paired source commits/PRs, required CI, authorized web rollout and production verification. Attach every created PR. Record exact web/runtime commits,28-entry migration ledger, editor/native pins and client0.1.24. Do not claim paid AI acceptance or a completed deployment without evidence.

All agents stopped. Root's local dev server was stopped; port3000 was no longer listening. No ongoing build, publication or workstation operation is intentionally left running.
