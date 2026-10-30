# Asset library acceptance — October 27, 2026

This records the feature branch's local acceptance. The [release record](../archive/releases/RELEASE-ASSETS-2026-10-27.md) distinguishes published editor artifacts from deployment of the web application.

The original feature is now deployed. [Production evidence](production-assets-library-20261027.json) records the paired merges, Vercel deployment and authenticated WordCraft import/save/export checks. The subsequent FilmCraft 0.2.3 correction covers its native Source/Browse entry points; the 0.2.2 tests below entered through Place from studio and did not prove those native controls.

## Creator workflow

Assets has a full management page with project, type and Craft filters, search, grid/list views, file/folder import and the existing media acquisition dialog. Each asset has its own page for naming, previewing, exact versions, native and linked files, original sources, exports and complete ZIP downloads. The project toolbar opens Assets in a separate tab so a native editor can remain open with unsaved work. Version links survive a reload and open that exact revision in the Craft.

All thirteen Craft adapters offer Import a file inside Place from studio. A compatible original is saved through the project BFF before placement; imports do not replace the open document or clear its dirty state. A package with several compatible renditions asks which file to place, while identical original/export bytes collapse to one choice. Only the chosen file is downloaded and checked. Native saves retain its exact source revision. FilmCraft imports that single selection through its native media API into the selected bin and checks the import result before recording the dependency.

Exports & downloads opens the saved asset page from every Craft. Add exports keeps the existing native master and dependencies byte-for-byte and creates a new revision containing the selected exported files. Exports remain attached to the version that produced them; a subsequent native edit does not silently inherit stale renditions. Creators use the Craft's existing export command, then explicitly add those files. Automatic capture of native export dialogs and new file-format converters are outside this implementation.

Incomplete native imports, mismatched Crafts, invalid paths, empty files and oversized packages fail before creating a revision; new advanced imports validate before creating an asset. Once a transfer begins, its file selection, note and base revision are frozen for recovery. All private reads and writes continue through the authenticated BFF.

## Verification

- Web: 116 tests, typecheck, production build and dependency audit pass on Node 24.18.0. The final three management/import/export browser scenarios pass in Chromium, Firefox and WebKit. Earlier focused native/source intake and recovery checks also passed in each engine.
- Runtime: 76 tests, dependency audit and workstation bundle build pass. The rebuilt workstation MCP digest remains `6e7b4525b249cfdd81b00fccceec7ee4ca537663d4493fe1ef8ad6d0559a3b32`, matching the unchanged 0.1.23 web pin.
- All thirteen adapter 0.2.2 bundles pass fresh native CLI save → actual browser file import and placement → BFF/TUS-confirmed native save → browser reload → independent native open/resave/inspection. These checks use genuine native executables and browser engines with an isolated BFF transport, not simulated editors or production creator data.
- Every actual editor successfully opens its exact saved asset page in a separate tab before the native save; the original editor and placed content survive. FilmCraft's saved native project contains exactly one imported media item, with the clip's bytes and source revision retained.
- Published WordCraft and FilmCraft bundles also pass the full round trip using the final web host with isolated BFF/TUS transport. The hosted fixture intercepts the CSP-allowed storage origin; its initial synthetic file hostname was correctly blocked by the unchanged release CSP. These checks do not claim a production Studio deployment.
- Management scenarios cover original-byte preservation, immutable exports, complete ZIP downloads, historic version links/reload, rename, filters, pre-write rejection and recovery after a lost commit response. ZIP contents are independently checked with Python's standard ZIP reader, including Unicode paths and binary bytes.
- Axe reports no violations in the new management content. Screenshots were reviewed at 1200 pixels, and actual editors at 1440 pixels. The public regression suite passes 18 page/viewport/engine cases and 14 keyboard checks; four pre-existing platform cases remain explicitly unverified.

The [sanitized evidence](assets-library-20261027.json) records exact bundle, saved-file and native-continuation hashes. Raw scripts, screenshots and transport receipts remain ignored under `artifacts/qa/assets-library/`. Native canvas accessibility and wider native browser support retain their existing limits in [BROWSER-SUPPORT.md](../BROWSER-SUPPORT.md). No employee assignment, paid generation, native image/template update or database migration was performed.
