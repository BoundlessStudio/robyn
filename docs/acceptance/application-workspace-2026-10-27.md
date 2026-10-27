# Application-led workspace acceptance — October 27, 2026

Fresh local acceptance. Production deployment, migration and matching source commits are recorded separately in the release record. The earlier [Open canvas acceptance](open-canvas-2026-10-26.md) remains historical evidence for the foundation.

Projects open to thirteen Crafts in registry order plus the existing Research browser entry. Clicking a Craft saves an untitled native starter and its initial revision before mounting the editor. `/dashboard` remains the project collection for empty and populated studios. Existing `?asset=` links open the saved file.

Applications, New and Open existing stay visible while editing. New repeats the current Craft; its dropdown offers Document, Spreadsheet, Presentation, Image, PDF, Audio and Video plus all applications. Files, AI Employees and Project details start collapsed. Opening a chooser or supporting panel preserves the editor. Replacing it, including recovery of an interrupted launch, checks unsaved changes. Inline naming changes only asset metadata. Native paths, dependencies, import, history, source placement and employee handoff remain intact.

One launch controller serves every entry point. It persists project, pinned starter and creation identity before private writes, validates starter bytes, coordinates tabs and resumes uncertain replies. Pending work cannot silently change Craft or document identity. The catalogue retains application selection through existing or new project selection. Owner checks, trusted catalogues and archived-project restrictions remain behind the BFF. Manual work uses no AI allowance.

## Verification

- Typecheck, optimized build and dependency audit pass with Node 24.18.0. The complete web suite passes 109 tests; the unchanged companion runtime passes 72.
- Twenty-one workspace, import, recovery, employee-panel and first-entry transitions pass in Chromium, Firefox and WebKit. Coverage includes all thirteen launch tiles, all seven common types, New, direct links, rename, catalogue/new-project identity, duplicate clicks, refresh, corrupt starter downloads, lost replies, preserved uploads, foreign access and archived projects.
- All thirteen version-1 starters pass actual browser edit → confirmed save → library reopen → native open/resave/reopen. Actual editors run in Chromium with isolated private BFF/HTTP/TUS transport. The native checks inspect the saved content; PdfCraft text is committed with its text-box checkmark before saving.
- Desktop layouts were inspected at 1200, 1440 and 1920 pixels, including the chooser, saved editors and employee panel. The minimum-height review was 850 pixels. Launcher and chooser axe checks have no violations. Keyboard focus stays in the chooser and returns to Applications. Supporting panels and temporarily narrowing the window preserve the editor.
- The public regression suite passes 18 page/viewport/engine combinations and 14 keyboard-focus checks; four existing platform cases remain explicitly unverified.

The Firefox recovery test uses real keyboard entry after closing the chooser and waits for the bridge's dirty acknowledgement. This avoids treating an asynchronous test `fill` operation as confirmed editor input. A parallel local run exposed an existing media-test request-observation race; the complete suite passed when rerun without competing browser suites. No unrelated application behavior was changed.

[Sanitized evidence](application-workspace-20261027.json) records fresh saved-file hashes, native continuation, source hashes, screenshots and validation logs. Migration 0024, all thirteen editor/native pins, starter versions and workstation 0.1.23 remain unchanged. No paid AI turn or generation was sent.
