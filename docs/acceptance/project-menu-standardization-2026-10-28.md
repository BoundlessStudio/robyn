# Standard project menu — October 28, 2026

Local follow-up based on web `c090f0f`. This is local acceptance, not a deployment record. The existing [production menu record](../RELEASE-PROJECT-NAVIGATION-2026-10-28.md#menu-behavior-follow-up) remains the release checkpoint.

## Behavior

- Every project page uses one shared header and the same ordered navigation: **Dashboard, Assets, AI Employees, Research, Applications, Settings**. The dashboard, an open editor, asset lists and details, employees, Research, Applications and Settings share the same labels, icons, destinations and active-page styling. Asset details highlight Assets; an open editor remains under Dashboard.
- The Robyn dropdown renders the same project entries and current-section highlight. Projects remains the studio-level destination. Both employee links from an open file retain its exact saved asset/revision.
- Applications always opens the project Applications page. The existing in-editor application chooser is labelled **New file** and sits below the main menu with Open existing, Files and Project details. These actions keep their existing picker/dialog/panel behavior.
- Navigation uses the current tab and the existing unsaved-work guards. Dashboard clears the local open-file selection when Next retains the workspace during a same-route transition. Cancelling navigation keeps the unsaved editor; saving permits the transition.
- No authorization, provider, database, migration, runtime, editor-release or workstation-pin changes are included. Desktop entry and temporary-narrowing protection retain their existing behavior.

## Local verification

- Node 24.18.0 and Python 3.14.6. Dependency installation, all three Playwright engines, typecheck, production build and `git diff --check` pass.
- `npm test`: **128 passing tests**, comprising 124 standard tests and four React rendering tests.
- Chromium, Firefox and WebKit each pass all **28 affected browser scenarios** across project navigation, employee pages, application launches, native/source imports and the application workspace.
- The initial Firefox run exposed an allowance-fixture race. The fixture now sets its initial allowance before mounting the employee page, rather than racing its first request. All 28 Firefox scenarios pass on rerun; the corrected zero-allowance case also passes independently in Chromium and WebKit.
- At 1200 × 960 and 1440 × 960, browser assertions verify identical menu-item bounds across every project section and asset details, including a long project name, with no overlap or horizontal overflow. The header passes axe at both widths. Keyboard checks cover the dropdown, return of focus and Dashboard navigation.
- Chromium visual review covers all six sections and the editor at 1200 and 1440 pixels, plus the dashboard, library and editor at 1880 pixels. The dropdown review confirms matching entries and active-section styling. Eighteen screenshots and test logs remain ignored under `artifacts/qa/project-menu-standardization/`.
- Public layout/axe verification passes **18 page/viewport/engine cases**. Keyboard focus passes 14; the existing four Windows WebKit platform cases remain explicitly unverified.

Browser fixtures use the real host components with isolated editor and Research transport peers. The Link peer preserves a mounted component on same-path navigation so a full reload cannot hide stale editor selection. These checks do not claim an authenticated production session, a new native/editor round trip or a live provider action. No companion-runtime tests are affected by this UI-only change.
