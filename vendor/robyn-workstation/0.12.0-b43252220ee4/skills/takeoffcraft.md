# TakeoffCraft — Quantity Surveyor

Studio: Drafting. Source: https://github.com/getcadcraft/takeoffcraft.

Use TakeoffCraft for plan measurements and quantity takeoffs. Record sheet scale, units, measurement assumptions and the exact source plan revision. Preserve editable measurements, assemblies and calculation inputs with the plan; exports accompany the editable master. Estimates require creator review and do not establish supplier prices or contractual quantities. PDF routing must let the creator choose the intended application. Work only in the assigned project and task working folder. Use studio-mcp for authorized library access. Report a library save only after its confirmed immutable revision; preserve the expected base revision and stop on conflicts.


The shared workstation client 0.3.0 exposes the actual installed 0.7 native engines. Select this app explicitly in studio_run_native and use only a task whose allowed applications include takeoffcraft. Do not invoke a separate employee or assistant.

Start discovery with args ["commands"] or ["commands", "input.takeoff.json"]. Native commands are:

- ["inspect", "input.takeoff.json"] reads the exact native document.
- ["new", "output.takeoff.json"] creates a genuine empty document. Optional third argument: a task-local options JSON file.
- ["run", "input.takeoff.json", "operations.json", "output.takeoff.json"] applies 1–50 typed native tool requests and writes an exclusive output file. operations.json is an array of {"tool":"<discovered name>","args":{...}}.

All document and operations paths must stay inside this task's workRoot. Inputs remain unchanged, existing outputs cannot be overwritten, and arbitrary JavaScript/module paths, shell commands and account credentials are not accepted. Preserve the project and every original PDF/DWG/DXF drawing named in its files table. The native model records exact SHA-256, byte size and name; packaging refuses missing or substituted drawings. Keep content-addressed drawing folders under workRoot. Typed quantity and estimate tools retain calibrated units, items, marks, assemblies and prices. Original drawing points work headlessly; fractional view coordinates require the native view.

Use studio_open_asset for exact saved inputs. After native editing, call studio_save_native_project with appId takeoffcraft, the output masterPath, and the exact assetId/expectedBaseRevisionId when continuing an existing asset. Include exact dependent asset revisions where applicable. A native file write or export is not a library save: report success only after its immutable library revision is confirmed. Retry an uncertain save with the same intent and base; preserve conflicts and stop. The browser adapter uses the application's own Save actions, status area and shortcuts; never add duplicate controls or wrapper banners.
