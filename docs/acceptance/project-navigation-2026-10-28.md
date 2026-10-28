# Project-scoped navigation — October 28, 2026

Local implementation on `codex/project-scoped-navigation`, based on web main `a623a5d`. This is not a deployed-release record.

## Behavior

- Assets, asset details, AI Employees and Research use `/dashboard/projects/[id]/library`, `/library/[assetId]`, `/employees` and `/research`. The shared project header keeps the project name, home and tool navigation available.
- Studio-wide navigation contains Projects, Applications and Settings. Asset and employee project selectors are removed. Library searches, pagination, imports and media requests use the current project; assignment views and drafts retain that same context.
- A project is verified through its existing BFF before loading a tool. Asset details reject another project's asset before requesting its revisions. Research status, connection and control requests require a project owned by the current studio before accessing the provider.
- The studio still owns one team and one Research browser. Workstation identities, browser takeover fences, queues and budgets are unchanged. The Research page explains its shared browser and links to the current project's briefs.
- Links from an editor open separately. Exact saved-file identity and unsaved editor contents survive asset, employee and Research navigation. Old asset links resolve their owning project; old tool links with a project retain it, including employee view and saved revision. Links without a project return to Projects.

## Local verification

- Node 24.18.0, Python 3.14.6; `npm run typecheck` and `git diff --check` pass.
- `npm test`: 127 passing tests (123 standard tests and four React rendering tests).
- The new route and browser tests cover ownership rejection before provider access, project-specific list results and request identities, switching projects without mixing drafts or assignments, mismatched asset links, legacy redirects, Research takeover/return identity, and preservation of an unsaved editor.
- Existing employee, asset import/export, revision download and accessibility checks pass with the project routes. Chromium visual review covers the project home and library at 1200 × 900 and the employee page at 1440 × 960. Existing layout/accessibility tests also cover both supported widths.
- `npm run build` passes with all four new project routes.
- `npm run test:public` with Chromium, Firefox and WebKit passes 18 page/viewport/engine combinations. Keyboard focus passes 14; four existing Windows WebKit platform cases remain explicitly unverified by the gate.

Browser fixtures use isolated request boundaries, an editor transport peer and a Research browser peer. This verifies application transitions and request identities, not a new native/editor round trip or live provider session. No private creator data, production deployment, paid AI work, migration, runtime change or release-pin change is part of this local check.
