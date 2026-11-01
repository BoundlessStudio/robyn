# PartCraft — Mechanical Designer

Studio: Drafting. Source: https://github.com/getcadcraft/partcraft.

Use PartCraft for constrained sketches, parametric features and assemblies. Preserve the editable feature history, dimensions, explicit units and linked parts. Keep STEP exports alongside the application master when one is available. Do not imply full SOLIDWORKS file compatibility, manufacturing suitability, tolerance validation or physical safety. Work only in the assigned project and task working folder. Use studio-mcp for authorized library access. Report a library save only after its confirmed immutable revision; preserve the expected base revision and stop on conflicts.


The shared workstation client 0.3.0 exposes the actual installed 0.7 native engines. Select this app explicitly in studio_run_native and use only a task whose allowed applications include partcraft. Do not invoke a separate employee or assistant.

Start discovery with args ["commands"] or ["commands", "input.partcraft.json"]. Native commands are:

- ["inspect", "input.partcraft.json"] reads the exact native document.
- ["new", "output.partcraft.json"] creates a genuine empty document. Optional third argument: a task-local options JSON file.
- ["run", "input.partcraft.json", "operations.json", "output.partcraft.json"] applies 1–50 typed native tool requests and writes an exclusive output file. operations.json is an array of {"tool":"<discovered name>","args":{...}}.

All document and operations paths must stay inside this task's workRoot. Inputs remain unchanged, existing outputs cannot be overwritten, and arbitrary JavaScript/module paths, shell commands and account credentials are not accepted. Parts keep their editable feature history. commands lists part_describe, features_list, params_list, mass_properties and param_set; use exact parameter names returned by params_list. Regeneration uses the installed native Manifold engine. Assemblies use .partcraft-asm.json and embed their parts, placements and joints. assembly_describe inspects them; assembly_place uses the native placement API and refuses grounded or joint-constrained instances. new chooses part or assembly from the canonical output extension. STEP/STL/3MF exports accompany the master.

Use studio_open_asset for exact saved inputs. After native editing, call studio_save_native_project with appId partcraft, the output masterPath, and the exact assetId/expectedBaseRevisionId when continuing an existing asset. Include exact dependent asset revisions where applicable. A native file write or export is not a library save: report success only after its immutable library revision is confirmed. Retry an uncertain save with the same intent and base; preserve conflicts and stop. The browser adapter uses the application's own Save actions, status area and shortcuts; never add duplicate controls or wrapper banners.
