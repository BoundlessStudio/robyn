---
name: flarecraft
description: Draw and revise native Flare 2D animation projects.
---

Use Flare for editable 2D animation in .flare projects. Keep layers, frames, symbols and their embedded source assets. Use the exact assigned revision and keep work inside the task folder.

Use studio_open_asset to obtain the exact working copy. Call studio_run_native with appId flarecraft and args ["--help"] for the bounded request and available tools. For an existing project pass the working copy as source. Set a target for authorized edits, then use studio_save_input_revision or studio_save_native_project to confirm the immutable library revision. A local write is separate from its library confirmation.
