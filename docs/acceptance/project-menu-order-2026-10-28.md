# Project menu order and same-tab navigation — October 28, 2026

Local follow-up to the project navigation release at web `5271af1`. This records local verification. The subsequent [release record](../archive/releases/RELEASE-PROJECT-NAVIGATION-2026-10-28.md#menu-behavior-follow-up) and [production evidence](production-project-menu-order-20261028.json) separately record deployment and live checks.

## Behavior

- The project header starts with Assets, AI Employees, Research and Settings. These page links open in the current tab and retain the project. The AI Employees link also retains the current exact saved revision.
- A divider separates the page links from Applications (while a file is open), Open existing, Files and Project details. These controls retain their existing dialog, file-picker and panel behavior.
- The project dropdown, launcher Research/employee shortcuts and document Exports & downloads link also use the current tab. The existing editor and notebook navigation guards protect unsaved work. Cancelling navigation leaves the editor and its text in place; saving allows the page transition with the saved revision.
- There are no changes to provider requests, project ownership checks, runtime integrations, editor pins, workstation versions or migrations.

## Local verification

- Node 24.18.0 and Python 3.14.6; typecheck, production build and `git diff --check` pass.
- `npm test` passes 127 tests: 123 standard tests and four React rendering tests.
- The public gate passes 18 page/viewport/engine cases and 14 keyboard checks; four existing Windows WebKit platform cases remain explicitly unverified.
- Fifteen affected navigation, employee and application scenarios pass in each of Chromium, Firefox and WebKit. These cover same-tab page transitions and dropdown navigation, menu ordering, cancellation with unsaved work, exact saved-revision handoff, panel/editor preservation and project-specific requests.
- Visual review at 1440 × 960 and 1200 × 960 covers project home and editor headers. Controls fit without overlap or horizontal overflow; the header passes axe in both views at both widths.

The browser fixture uses the real host components with isolated editor and Research transport peers. These checks do not claim a new native integration round trip or a live provider action. Local screenshots and logs remain ignored.
