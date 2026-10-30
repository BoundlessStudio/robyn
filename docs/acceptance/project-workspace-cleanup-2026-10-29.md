# Project workspace cleanup — local acceptance

October 29, 2026. Local changes based on web commit `7cb569c`; not a deployed release.

The subsequent production rollout and its independent checks are recorded in [the release record](../archive/releases/RELEASE-WORKSPACE-CLEANUP-2026-10-29.md) and [sanitized production evidence](production-workspace-cleanup-20261029.json).

## Accepted behavior

- Header and dropdown share five destinations: Dashboard, Assets, AI Employees, Research and Settings. Legacy project and studio Applications URLs redirect to the project dashboard when its identity is known.
- Dashboard retains all thirteen Craft starters and Research, plus existing-file and folder import. The Files rail, Project details panel and secondary workspace toolbar are removed. A fresh dashboard has no empty document row. An open editor keeps New file beside its document controls.
- Settings includes project name, brief, archive/reactivation and recent activity before the existing studio/account settings. Saves use the existing owned-project BFF. Renaming updates the header, saved fields survive reload, failed archive requests preserve drafts, and status changes do not save an unsaved brief. Another project's fields remain unchanged.
- Assets retains pagination, search, filters, imports, media, exact-revision management, exports and package downloads. The grid uses 96-pixel preview areas with 48 × 48 application icons, matching list-view icons. Six columns fit the reviewed 1440-pixel viewport; five fit 1200 pixels. Text and source-media placeholders are also smaller.
- Existing unsaved-editor protection, launch/import recovery identities, original native paths, saved revisions and temporary-window-narrowing behavior remain covered. Import dialogs return keyboard focus to the surviving dashboard or document control.

## Verification

- Node `24.18.0`; Python `3.14.6`; dependencies installed with `npm ci`; all three Playwright engines available.
- `npm run typecheck`: passed.
- `npm test`: 129 passed (125 core/browser/database tests and 4 Markdown tests).
- Affected application, navigation, Settings, library-management, native-import and open-canvas browser fixtures: 26 passed per engine. Firefox passed all 26. WebKit initially exposed an assertion that checked a launcher before project loading finished; the Settings test now waits for the actual enabled control, and its rerun passed. The other 25 WebKit checks passed in the original run.
- `npm run build`: passed with the final application source.
- `PUBLIC_TEST_BROWSERS=chromium,firefox,webkit npm run test:public`: all 18 public page/viewport/engine layout and axe checks passed; 14 keyboard-focus checks passed, with the existing 4 explicitly unverified Windows WebKit platform cases.
- Project-header and Settings accessibility scans passed. Existing library-management checks include its accessibility and overflow checks. Reviewed Dashboard, grid/list and Settings screenshots at 1440 × 960 and 1200 × 960. No fixture page errors were recorded.

These checks use the actual React components with isolated BFF fixtures and an editor transport peer. They do not certify a new native-editor round trip or a production deployment. No runtime source, app manifest, migration, editor release or workstation pin changed. No employee work, paid acquisition, provider action or database migration was submitted.

## Sanitized screenshot hashes

Screenshots contain synthetic project data and remain in ignored local `artifacts/qa/workspace-cleanup-20261029/`. SHA-256:

| File | SHA-256 |
| --- | --- |
| assets-grid-1200.png | `2dc0a2379578023a8c0869e6297d732a36b18b519552186eef2a9cbeeb6043f0` |
| assets-grid-1440.png | `d555426ddc6ed00041c3e8cdc74d75d7f56405b057aeac856698d9a9327134e1` |
| assets-list-1200.png | `8aadcf5a1c96ae9b4bb394d9c11689949eb3e325bfed9651b5e4033b3fa89d2f` |
| assets-list-1440.png | `ad1077332b1cba2ab24dae52a9df80300108ffadf3841208f667851f437e64a4` |
| dashboard-1200.png | `c71f2bc6d40d56b915e2eef415fce5a07a8ecb1c7156ecb09d3758c4411d2438` |
| dashboard-1440.png | `38f265a4ce135606c50323d10ff8b90b90cd4553e0b680b258e92fe5c898afe0` |
| settings-1200.png | `95ed5935dc2e0d65675bcd0a1d553b50a6553a90dc925e70ef606fb3a14fda5c` |
| settings-1440.png | `4b94c1be2cdcbebe100909a67216527b9a1b462aa0a3451aba21045900d7381e` |
