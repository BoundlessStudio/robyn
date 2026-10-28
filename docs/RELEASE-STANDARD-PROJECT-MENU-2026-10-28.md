# Standard project menu release — October 28, 2026

Every project section and the editor now use the same main menu: **Dashboard, Assets, AI Employees, Research, Applications, Settings**. The header and Robyn dropdown share their labels, icons, order and current-section highlight. Applications always opens its page. New file, Open existing, Files and Project details occupy a separate workspace toolbar.

[PR #33](https://github.com/BoundlessStudio/robyn/pull/33) is merged at web `410cb6813bcc8dca84a51a4c6c34d5677dd80e5e`, containing implementation `a7763255d2ba7ad50e4d2289f90496a3a8018e68`. [Vercel completed the production deployment](https://vercel.com/venatio-studios/robyn-creative-studio/4sp9wDVJxLTNXnDfJnC5VemHsB1x). Authenticated checks on [the canonical studio](https://robyn.academy/dashboard) passed on October 28. Documentation-only follow-ups may rebuild the same application source.

The post-merge Linux check exposed an immediate focus assertion while the dropdown was still closing. Test-only follow-up `350f4d3cc53191fa70716029619866d6b623980e` waits for the menu to close and focus to return naturally. All four navigation scenarios pass in each local browser engine, and [the complete hosted main check passes](https://github.com/BoundlessStudio/robyn/actions/runs/40790552601). [Its production deployment completed](https://vercel.com/venatio-studios/robyn-creative-studio/FHmAyTNs3dxQWmD9yiDnewV2m49Z) with identical application source.

## Production verification

Fifteen header observations cover all six project destinations at 1440 and 1200 pixels, asset details, and the existing saved-file editor. Menu labels, destinations and positions remain identical; the current section changes its highlight. Page links and the dropdown stay in the current tab. Files and Project details toggle without changing the URL.

Opening an existing native asset preserves its exact saved revision in both employee links. The New file chooser exposes all thirteen Crafts and closes without replacing the editor frame. Dashboard then returns to the application launcher and clears the open-file selection during the actual Next navigation.

No authoring, save, employee dispatch, takeover or return action was submitted. Research used its existing view-only connection. There were no failed private API requests or page JavaScript errors. Private screenshots and browser state remain ignored; [sanitized production evidence](acceptance/production-standard-project-menu-20261028.json) records observations and screenshot hashes.

[Local acceptance](acceptance/project-menu-standardization-2026-10-28.md) records 128 passing tests, typecheck, production build, 28 affected scenarios in each of Chromium, Firefox and WebKit, header accessibility/position checks and desktop visual review. The public gate passes eighteen page/viewport/engine cases and fourteen keyboard checks, with four existing Windows WebKit platform cases explicitly unverified. Hosted PR and branch checks pass tests, typecheck, dependency audit, build and the public gate. The initial local Firefox fixture race was corrected and its complete rerun passed.

## Runtime, database and rollback

This web release pairs with the previously released runtime `fe1b155754c592bd73702eb106e74f093a0929de`, independently confirmed as runtime origin/main. Runtime source, workstation **0.1.23**, fingerprint `463adbe8641bb2b9f9c232027e4a1edcc5af9bc2c210581cce68af4bfc8ea58d`, MCP SHA-256 `6e7b4525b249cfdd81b00fccceec7ee4ca537663d4493fe1ef8ad6d0559a3b32`, native images/templates, thirteen editor pins and version-1 starters are unchanged. FilmCraft remains on adapter 0.2.3 and the other twelve Crafts on 0.2.2. No new native round trip is claimed.

No migration was added or applied. The last recorded database checkpoint remains the 25-entry ledger through `0024_open_canvas.sql`, SHA-256 `508945e29e3ac0dbcf0d084b0d65e17a0222d6c5afe9535664cb74eb94fc46fa`. This release did not re-read the live ledger. Restoring web source `c090f0f0aa6d65b2c6831961de4e4fdd5a7e2c1e` rolls back this menu change without changing saved assets, the database, runtime or published editor bytes.
