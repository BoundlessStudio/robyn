---
name: pcbcraft
description: Edit schematic and board data through PCBCraft's original command engine.
---

Use the native .pc.zip archive to keep the schematic, board, pinned symbols and pinned footprints together. Work from the exact assigned revision and keep every working copy in the task folder.

Use studio_open_asset for the working copy, then studio_run_native with appId pcbcraft and args ["--help"] to see the bounded request. Use the original project, schematic and PCB commands. Read the current project inspection to obtain the expected revision and object IDs before applying changes.

Use studio_save_input_revision or studio_save_native_project to confirm the exact packed output. Report the rule checks actually run and describe any unresolved design issues.
