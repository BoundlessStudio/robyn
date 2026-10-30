# AI Employees page acceptance — October 28, 2026

This records local acceptance on top of web commit `284beb3d6a414c578599be1572a483a934a9555c`. The feature is now deployed; [the release record](../archive/releases/RELEASE-EMPLOYEES-2026-10-28.md) and its production evidence distinguish live checks from the local fixtures below.

## Creator workflow

AI Employees now has a working page at `/dashboard/employees` in the same studio shell as Applications and Assets. Conversation, Assignments, Review and Team have separate views. A project selector keeps briefs, saved inputs and delivered work with the chosen project. The Team view retains the Creative Director, Research and all thirteen Craft specialists.

The project toolbar and application launcher's AI Employees links open the page in a new tab. They carry the project and, when a saved file is selected, its exact asset and revision IDs. The employee page checks that context through the existing authenticated project, asset and revision BFF routes before showing a composer. Its file context can be removed explicitly. Delivered files open their exact revision in a separate project tab.

Continue with Research opens Assignments with Research selected and the saved notebook attached. Unsaved notebook edits must still be saved before that handoff. Project details now contains only Brief and Activity. Archived projects can be read, while sending a new brief is disabled.

There is no active-work migration. Existing assignment and review components and their BFF authorization remain in place. Runtime sources, editor releases, workstation 0.1.23 and database migrations are unchanged.

## Verification

- Node 24.18.0, Python 3.14.6: dependency installation, typecheck, all 122 tests (118 protocol/database/browser tests plus four Markdown tests) and the production build pass.
- Seventeen affected scenarios pass in Chromium, Firefox and WebKit: six employee-page scenarios, six application-workspace scenarios and five project-entry/idea scenarios. The Research notebook scenario was added and run separately after the initial sixteen-scenario Firefox/WebKit runs.
- Browser checks exercise the actual components with an isolated BFF and editor transport peer. They cover project selection and reload, all four employee views, Director and specialist submissions, exact saved inputs, delivery opening, review approval, malformed context, archived projects, and continuing manual editing after the employee page opens.
- Axe reports zero violations in employee-page content across all four views at 1440 and 1200 pixels. Interactive visual review covers initial project selection, both composers, review with a deliverable, the team directory with real static artwork, included-file context, errors and archived projects. Text, focus, spacing and overflow were reviewed; no clipping or horizontal overflow was found.
- The public regression gate passes all 18 page/viewport/engine combinations and 14 keyboard checks. Its four existing platform keyboard exceptions remain explicitly unverified.

The release checks also exposed a timing error in the existing Assets browser scenario: a list refresh can display a new asset while its import dialog is still running. A controlled transfer/list-response check reproduced the test starting a second hidden picker operation before the first import completed. The scenario now waits for the import dialog to close before starting another import or changing filters; its assertions and timeouts are unchanged.

Screenshots remain ignored under `artifacts/qa/employees-workspace/`. The [sanitized evidence](employees-workspace-20261028.json) retains source and screenshot hashes. These local checks are separate from the authenticated production observations in the release record. They do not certify a new native integration or an upstream employee dispatch. The local checks used no production data or paid services.
