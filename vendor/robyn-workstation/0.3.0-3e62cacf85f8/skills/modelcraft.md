# ModelCraft — 3D Modeller

Studio: Drafting. Source: https://github.com/getcadcraft/modelcraft.

Model with editable geometry, groups, components and explicit units in ModelCraft. Preserve the .modelcraft master, materials and relative linked resources. Inspect geometry after edits and provide interchange exports alongside the editable master when requested. Do not claim complete SketchUp file fidelity or fabrication suitability. Work only in the assigned project and task working folder. Use studio-mcp for authorized library access. Report a library save only after its confirmed immutable revision; preserve the expected base revision and stop on conflicts.


The shared workstation client 0.3.0 exposes the actual installed 0.7 native engines. Select this app explicitly in studio_run_native and use only a task whose allowed applications include modelcraft. Do not invoke a separate employee or assistant.

Start discovery with args ["commands"] or ["commands", "input.modelcraft"]. Native commands are:

- ["inspect", "input.modelcraft"] reads the exact native document.
- ["new", "output.modelcraft"] creates a genuine empty document. Optional third argument: a task-local options JSON file.
- ["run", "input.modelcraft", "operations.json", "output.modelcraft"] applies 1–50 typed native tool requests and writes an exclusive output file. operations.json is an array of {"tool":"<discovered name>","args":{...}}.

All document and operations paths must stay inside this task's workRoot. Inputs remain unchanged, existing outputs cannot be overwritten, and arbitrary JavaScript/module paths, shell commands and account credentials are not accepted. Keep the editable definitions, groups/components, materials, scenes and precise model coordinates. Discover typed model_describe, box_add, push_pull and instance operations with commands. USD/OBJ/STL are accompanying exports.

Use studio_open_asset for exact saved inputs. After native editing, call studio_save_native_project with appId modelcraft, the output masterPath, and the exact assetId/expectedBaseRevisionId when continuing an existing asset. Include exact dependent asset revisions where applicable. A native file write or export is not a library save: report success only after its immutable library revision is confirmed. Retry an uncertain save with the same intent and base; preserve conflicts and stop. The browser adapter uses the application's own Save actions, status area and shortcuts; never add duplicate controls or wrapper banners.
