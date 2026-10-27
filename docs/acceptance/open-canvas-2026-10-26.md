# Open canvas acceptance — October 26, 2026

Status: implemented and locally verified. This is not a deployed-release record. Migration `0024_open_canvas.sql` must be applied through the checked ledger before deploying the new application. The live import release remains on 0023.

## Delivered behavior

An empty studio opens an untitled project directly in its workspace. New project takes the same path; the URL keeps the creation identity through reloads and uncertain replies. The project name can be edited in the header.

The canvas offers Describe an idea, Bring existing files, and Start creating. An idea can request an editable first draft or a planning conversation, with the Director's available allowance and specialist spending explanation visible before sending. The saved choice survives reconnects. Planning cannot start production, acquire or generate media, or save native output, including after review feedback. A returned plan can populate a new first-draft brief. Delivered work appears in the project rail and opens its exact saved revision.

Manual starts offer all thirteen Crafts. Each starter is a native, self-contained blank file, verified against an immutable checksum before saving. The first revision is committed before its editor opens. Lost replies resume one asset and initial revision. Creating and editing manually requires no AI allowance. New work returns to the three choices and protects unsaved editor edits. File and folder intake retains the existing native-project and reusable-source behavior.

## Verification

- Typecheck and optimized production build passed with Node 24.18.0.
- Full web suite passed 101 tests, including actual component transitions, all-migrations database checks, immutable request identities, tenant ownership, private RPC grants, review inheritance, and planning restrictions. The runtime suite passed 72 tests.
- Five Open canvas browser checks passed in Chromium, Firefox and WebKit. The seven existing import checks also passed in all three engines. First-entry tests covered an empty studio, archived-only work, StrictMode and a lost creation acknowledgement.
- All thirteen version-1 native starters were opened in the actual published browser editors, edited using mouse/keyboard controls, saved through real HTTP/TUS bytes to an isolated BFF fixture, and reloaded. Each saved native package was independently opened, resaved and reopened by its pinned native CLI. LightCraft, FilmCraft and PDFCraft also received an additional native edit. This is local transport acceptance, not a production database save or paid employee run.
- Visual inspection covered 1440×960 and 1200×850: initial choices, all thirteen Craft buttons, idea/allowance controls, returned plan, inline rename, recovery, and real editor states. No horizontal overflow or clipped starting controls was found. Keyboard/back/cancel, lost replies, corrupt bytes, zero/unverifiable allowance and unsaved-work cancellation were exercised. No page errors occurred in the inspected canvas and native fixtures.

[Sanitized evidence](open-canvas-20261026.json) records immutable starter hashes, exact public editor pins, native source commits, saved browser/native file hashes, and screenshot hashes. The private QA folder is ignored. No editor or workstation pin changed; workstation remains 0.1.23. No paid AI turn or generation was submitted, so a real first-draft production run using the new mode remains a post-deployment operational check.

## Release boundary

The web and companion runtime changes are on `codex/open-canvas-start`. The companion owns native generation recipes and canonical starter bytes; the web repository vendors the checked files and catalog for a self-contained deployment. Future starter changes must use a new version and retain old IDs for interrupted starts. Apply 0024 incrementally, deploy the matching web checkpoint, then verify first entry and an owned blank start against the deployed BFF. Never replay earlier migrations.

Matching application checkpoints: web `c0d9eae28764faa02e260c286f467f799848deef` and runtime `7a8c83e4e9578e8c83147cfe355d6484a5935d6a`. All 26 Git copies of native starter files match the accepted manifest hashes. A subsequent web documentation-only commit records this acceptance.

## QA inventory

- First entry opens an untitled workspace; New project skips setup. Check an empty studio, an existing studio with archived work, retry after a lost creation reply, and reload with the same request identity.
- The first viewport shows Describe an idea, Bring existing files, and Start creating. Review at 1440×960 and the supported minimum desktop width of 1200 pixels. Check keyboard focus, names, fit, and readability.
- Project name can be changed and cancelled without leaving the canvas. New work returns to starting options and protects unsaved editor work.
- Describe an idea shows the Director's allowance before submission. Make a first draft delegates editable production; Help me plan stays advisory. Check missing/zero allowance, preserved text, lost acknowledgements, reload/reconnect, and using a returned plan for a draft.
- Production is denied for planning assignments in the BFF/tool layer and database, including after review feedback. Verify tenant ownership and immutable request modes.
- Start creating lists all thirteen Crafts, explains that manual work uses no AI allowance, and saves a genuine blank native document before opening its editor. Exercise every starter through the real published editor and verify saved native continuation.
- Blank starts validate downloaded bytes before writing. Check corrupted downloads, lost creation/commit replies, reload recovery, one document/revision identity, and reopening from the library.
- Existing file/folder import and common-source handling remain usable from the canvas. Run the existing import transition suite in Chromium, Firefox, and WebKit.
- Asset navigation, starting-option back buttons, and automatic library population work after creating or receiving work. Review initial, manual chooser, idea, recovery, saved-editor, and returned-work visual states.

No paid employee turns are needed for isolated orchestration checks. Native editor checks use real public editor bundles with isolated private-file transport.
