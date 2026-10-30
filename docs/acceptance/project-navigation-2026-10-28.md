# Project-scoped navigation — October 28, 2026

Local implementation on `codex/project-scoped-navigation`, based on web main `a623a5d`. This document records local acceptance. The subsequent [deployed-release record](../archive/releases/RELEASE-PROJECT-NAVIGATION-2026-10-28.md) and [sanitized production evidence](production-project-navigation-20261028.json) separately record the live checks.

The later [menu behavior follow-up](project-menu-order-2026-10-28.md) supersedes the separate-tab navigation described in this initial checkpoint.

## Behavior

- Assets, asset details, AI Employees, Research, Applications and Settings use `/dashboard/projects/[id]/library`, `/library/[assetId]`, `/employees`, `/research`, `/applications` and `/settings`. The shared project header keeps the project name, home and tool navigation available.
- Studio-wide navigation contains only Projects. All five project tools appear in project navigation and its menu. Asset and employee project selectors are removed. The application catalogue launches directly in the current project with a stable launch identity; the extra project-selection dialog is removed. Budget links lead to that project’s Settings page. Library searches, pagination, imports and media requests use the current project; assignment views and drafts retain that same context.
- A project is verified through its existing BFF before loading a tool. Asset details reject another project's asset before requesting its revisions. Research status, connection and control requests require a project owned by the current studio before accessing the provider.
- The studio still owns one team and one Research browser. Account settings, studio name and AI allowances keep their existing studio-wide scope and explain this on the project Settings page. Workstation identities, browser takeover fences, queues and budgets are unchanged. The Research page explains its shared browser and links to the current project's briefs.
- Links from an editor open separately. Exact saved-file identity and unsaved editor contents survive asset, employee and Research navigation. Old asset links resolve their owning project; old tool links with a project retain it, including employee view and saved revision. Links without a project return to Projects.

## Local verification

- Node 24.18.0, Python 3.14.6; `npm run typecheck` and `git diff --check` pass.
- `npm test`: 127 passing tests (123 standard tests and four React rendering tests).
- The new route and browser tests cover ownership rejection before provider access, project-specific list results and request identities, switching projects without mixing drafts or assignments, mismatched asset links, legacy redirects, Research takeover/return identity, and preservation of an unsaved editor.
- Existing employee, asset import/export, revision download and accessibility checks pass with the project routes. Chromium visual review covers the project home, library, catalogue and Settings at 1200 × 900 and the employee page at 1440 × 960. Existing layout/accessibility tests also cover both supported widths.
- `npm run build` passes with all six new project routes.
- `npm run test:public` with Chromium, Firefox and WebKit passes 18 page/viewport/engine combinations. Keyboard focus passes 14; four existing Windows WebKit platform cases remain explicitly unverified by the gate.

Browser fixtures use isolated request boundaries, an editor transport peer and a Research browser peer. This verifies application transitions and request identities, not a new native/editor round trip or live provider session. No private creator data, production deployment, paid AI work, migration, runtime change or release-pin change is part of this local check.
