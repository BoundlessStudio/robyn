# Project workspace cleanup release — October 29, 2026

> Historical record. Requirements, pause/resume directions, pending actions and release state below describe the recorded pass. Use the [documentation index](../../README.md) for current scope and acceptance.

Dashboard is the single application launcher. The project header and dropdown now contain **Dashboard, Assets, AI Employees, Research and Settings**. Existing Applications links redirect to Dashboard. Project name, brief, archive/reactivation and recent activity live in Settings. The Files rail, Project details panel and secondary workspace toolbar are removed; New file remains beside the editor's document controls. Asset grid cards use short previews and the same 48-pixel application icons as list view.

[PR #34](https://github.com/BoundlessStudio/robyn/pull/34) is merged at web `8134e07d0aa0b74a491a2e7365c29584f26af3bd`, containing implementation `d2c9730be0f39bcd9d1a2be093f3b782fd28c6a0`. [Vercel completed the production deployment](https://vercel.com/venatio-studios/robyn-creative-studio/6UZak49sGafj6jMQUh3xGFhyLFvs). Authenticated checks on [the canonical studio](https://robyn.academy/dashboard) passed on October 29. Documentation-only follow-ups may rebuild identical application source.

## Production verification

Thirteen header observations cover all five project sections at 1440 and 1200 pixels, asset details and the existing saved-file editor. Header/dropdown labels, destinations and positions match across sections, page links stay in the current tab, and no horizontal overflow was found. A fresh Dashboard starts directly below the main header and exposes all thirteen Craft starters plus Research.

Settings shows the existing project's saved name and brief, its activity and archive controls, and the shared studio/account settings. The asset grid has six columns at 1440 pixels and five at 1200, with 96-pixel preview areas. Application icons measure 48 × 48 pixels in both views. Three legacy Applications routes resolve to Dashboard or the project collection as appropriate.

An existing saved WordCraft document opens at its exact revision, with the editor frame starting at y=88. AI Employees retains the same asset/revision reference. The New file chooser exposes all thirteen Crafts and closes with keyboard focus restored while retaining the same editor frame. Dashboard then clears the selection during the actual Next navigation.

No authoring, save, archive, employee dispatch, takeover or return action was submitted. Research used its existing view-only connection. There were no failed private API requests or page JavaScript errors. Private browser state, request diagnostics and screenshots remain ignored; [sanitized production evidence](../../acceptance/production-workspace-cleanup-20261029.json) records observations and screenshot hashes.

## Verification and release boundary

[Local acceptance](../../acceptance/project-workspace-cleanup-2026-10-29.md) records 129 passing tests, typecheck, production build and 26 affected browser scenarios in each engine, including exact import/launch retry identity and unsaved-editor protection. Desktop visual review covers 1200 and 1440 pixels. Public layout/axe checks pass eighteen page/viewport/engine cases; fourteen keyboard checks pass, with four existing Windows WebKit platform cases explicitly unverified. Hosted PR, branch and main checks passed tests, typecheck, dependency audit, build and the public gate.

The documentation-only release-record run subsequently exposed an existing Firefox media-test race: it asserted the retry count immediately after clicking, before the second request reached the fixture. The test-only follow-up waits for the successful retry response and an enabled dialog close control before checking the same two requests and their exact identities. It changes no application source or published release pins.

This release pairs with runtime `fe1b155754c592bd73702eb106e74f093a0929de`, independently fetched and confirmed as runtime origin/main. Runtime source, native images/templates, thirteen editor pins and version-1 starters are unchanged. FilmCraft remains on adapter 0.2.3 and the other twelve Crafts on 0.2.2. Workstation client **0.1.23**, fingerprint `463adbe8641bb2b9f9c232027e4a1edcc5af9bc2c210581cce68af4bfc8ea58d` and MCP SHA-256 `6e7b4525b249cfdd81b00fccceec7ee4ca537663d4493fe1ef8ad6d0559a3b32` remain unchanged. No new native round trip is claimed.

No migration was added or applied. The last recorded database checkpoint remains the 25-entry ledger through `0024_open_canvas.sql`, SHA-256 `508945e29e3ac0dbcf0d084b0d65e17a0222d6c5afe9535664cb74eb94fc46fa`. This release did not re-read the live ledger. Restoring web source `7cb569c77310f0d31fd970940841b065b9344173` rolls back this interface change without altering saved assets, the database, runtime or published editor bytes.
