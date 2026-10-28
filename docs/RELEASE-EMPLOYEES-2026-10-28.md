# AI Employees page release — October 28, 2026

AI Employees now has a dedicated page with Conversation, Assignments, Review and Team views, plus project selection. Project and Research handoffs open it in a separate tab with the exact saved revision. Project details retains Brief and Activity.

[Web PR #30](https://github.com/BoundlessStudio/robyn/pull/30) is merged at `2e19cf2e7861634a47a54e66eb609d4bcb7b2e8a`, containing implementation `23074287d4265fa282bec70557f2bc03ffd3e683` and browser-test timing correction `07fd6792c842622c583cf47ae8dacacb729a8e31`. Both hosted head checks passed. [Vercel reported the production deployment complete](https://vercel.com/venatio-studios/robyn-creative-studio/GqU6Fn5gM3pUCDU9euGowX4VUYKe) at 10:59 EDT; authenticated checks on `https://robyn.academy` passed at 11:00 EDT. Documentation-only follow-ups may rebuild the same application bytes.

## Production observations

The signed-in canonical page displays all four views, loads the selected project through the Studio BFF and retains its selection. Opening AI Employees from a saved WordCraft file opens a new tab with the same project, asset and revision IDs. The original native editor iframe remains connected with the same source. The new page confirms its included saved revision. The verification sent no mutating Studio API request, received no failed private API response, and dispatched no employee turn or paid service.

The [sanitized production evidence](acceptance/production-employees-workspace-20261028.json) records the exact sources, deployment status, checks and pin set. Private browser state and screenshots remain ignored under `artifacts/qa/employees-workspace/`.

## Verification and release boundary

[Local acceptance](acceptance/employees-workspace-2026-10-28.md) covers 122 tests, typecheck, production build, seventeen affected employee/application scenarios in Chromium, Firefox and WebKit, and desktop visual/axe checks at 1440 and 1200 pixels. The three existing Assets management scenarios also pass in each engine. The public gate passes eighteen page/viewport/engine cases and fourteen keyboard checks, with four existing platform cases explicitly unverified. The hosted checks additionally pass dependency audit.

The first push run and its retry exposed an existing Assets test race: the next hidden picker operation could start while the previous import dialog was still running. Controlled list/transfer timing reproduced it. The corrected scenario waits for import completion; its assertions and timeouts are unchanged. Both checks passed for the corrected head before merge.

This release changes only web navigation and browser checks. It pairs with the previously released runtime commit `fe1b155754c592bd73702eb106e74f093a0929de`. Workstation client **0.1.23**, MCP SHA-256 `6e7b4525b249cfdd81b00fccceec7ee4ca537663d4493fe1ef8ad6d0559a3b32`, all native images/templates, thirteen editor pins and version-1 starters are unchanged. FilmCraft remains on adapter 0.2.3; the other twelve Crafts remain on 0.2.2, with their existing policy query.

No database migration was added or applied. The last recorded checkpoint remains the 25-entry ledger through `0024_open_canvas.sql`, SHA-256 `508945e29e3ac0dbcf0d084b0d65e17a0222d6c5afe9535664cb74eb94fc46fa`; this release did not re-read the live ledger. There is no active-work migration. A rollback can restore the preceding web source `284beb3d6a414c578599be1572a483a934a9555c` without changing saved assets, the database, runtime or published editor bytes.
