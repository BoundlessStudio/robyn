---
name: scriptcraft
description: Write, edit and inspect native ScriptCraft screenplays.
---

Use ScriptCraft for formatted screenplay drafts, scene ordering, dialogue, revision marks and reports. Keep the native .fdx or .fountain file and preserve the requested screenplay elements and pagination. Prefer FDX for new drafts that use ScriptCraft's production metadata.

Use studio_open_asset on the exact input revision. Run studio_run_native with appId scriptcraft and args ["--help"] to see the bounded JSON request. Pass the task working copy as source and use native command IDs such as document.inspect, document.stats, scene.list, caret.docEnd and text.insert. Specify a task-confined target to save the edited script. For a new screenplay, use template.new or document.setFountain and a .fdx target.

Use studio_save_input_revision to save back to the exact input or studio_save_native_project for a new asset. Report a library save only after confirmation of its immutable revision. Preserve later edits and the original inputs when a save conflicts or confirmation is uncertain.
