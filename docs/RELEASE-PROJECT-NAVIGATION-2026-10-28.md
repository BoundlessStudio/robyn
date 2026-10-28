# Project navigation release — October 28, 2026

The menu outside projects now contains only **Projects**. Asset Library, AI Employees, Research, Applications and Settings are available inside a project and retain its context. The application catalogue opens a Craft directly in that project; asset and employee pages no longer ask for a project again. The earlier project-home toolbar cleanup remains in place.

[Web PR #31](https://github.com/BoundlessStudio/robyn/pull/31) is merged at `445ee1a5fea1935b59e6dc3603dc190b4e5b153f`, containing implementation commits `ffeccc36a16a156ca32b8e56db55a6874364e14b` and `5fdefeb7f2a7611fae8d1d2c7faaf963e042f4b6`. Hosted PR, branch and main checks passed. [Vercel reported the production deployment complete](https://vercel.com/venatio-studios/robyn-creative-studio/93FWoj9ZGinDCSjA97WbMnwgkmNK) at 16:19 EDT; authenticated navigation checks on `https://robyn.academy` passed at 16:21 EDT. Documentation-only follow-ups may rebuild the same application source.

## Production observations

The signed-in project collection shows only Projects in its navigation. Project home exposes all five tools through its menu, and their pages share the project header. Asset Library loads only the selected project's assets. AI Employees opens all four views without a project selector. Applications and Settings retain the project, including links to its Settings budget section. Existing asset and employee links resolve the project and preserve the saved revision; a legacy global Settings link returns to Projects.

Research's view-only connection succeeded with the project ID, and Project briefs leads back to that project's assignments. The check sent no authoring, employee dispatch, takeover or return request. Its only non-GET Studio request was the existing view-only Research connection. No private API request failed and no page JavaScript error occurred. Local tests separately verify preservation of an unsaved editor and rejection of another project's asset before revision access.

The studio continues to own one team and one Research browser. Account settings, studio name and AI allowance remain studio-wide; the Settings and Research pages explain this. Files, briefs, assignment views and drafts retain their project scope. Moving the navigation does not provision separate workstations or budgets.

The [sanitized production evidence](acceptance/production-project-navigation-20261028.json) records deployment, checks, source commits and unchanged pins. Private browser state, request diagnostics and screenshots remain outside version control.

## Verification and release boundary

[Local acceptance](acceptance/project-navigation-2026-10-28.md) records 127 passing tests, typecheck, production build, project ownership and request-identity checks, legacy redirects, direct application launching and desktop visual/accessibility checks. The public gate passes eighteen page/viewport/engine cases and fourteen keyboard checks; four existing Windows WebKit platform cases remain explicitly unverified. Hosted checks also pass dependency audit.

This web release pairs with the previously released runtime commit `fe1b155754c592bd73702eb106e74f093a0929de`, which remains runtime main. Workstation client **0.1.23**, fingerprint `463adbe8641bb2b9f9c232027e4a1edcc5af9bc2c210581cce68af4bfc8ea58d`, MCP SHA-256 `6e7b4525b249cfdd81b00fccceec7ee4ca537663d4493fe1ef8ad6d0559a3b32`, all native images/templates, thirteen editor pins and version-1 starters are unchanged. FilmCraft remains on adapter 0.2.3; the other twelve Crafts remain on 0.2.2 with the existing policy query. No new native round trip is claimed.

No database migration was added or applied. The last recorded checkpoint remains the 25-entry ledger through `0024_open_canvas.sql`, SHA-256 `508945e29e3ac0dbcf0d084b0d65e17a0222d6c5afe9535664cb74eb94fc46fa`; this release did not re-read the live ledger. There is no active-work migration. A rollback can restore the preceding web source `a623a5dff9449cc53a7104a75fd4c7d1d2ea561f` without changing saved assets, the database, runtime or published editor bytes.
