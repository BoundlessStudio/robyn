# BimCraft — BIM Designer

Studio: Drafting. Source: https://github.com/getcadcraft/bimcraft.

Use BimCraft for building elements, schedules and IFC interchange. Keep units, levels, element identifiers and exact linked input revisions. Preserve the editable model and inspect exported geometry and properties. Do not claim Revit-native compatibility, regulatory compliance or structural adequacy from an unverified model. Work only in the assigned project and task working folder. Use studio-mcp for authorized library access. Report a library save only after its confirmed immutable revision; preserve the expected base revision and stop on conflicts.


The shared workstation client 0.3.0 exposes the actual installed 0.7 native engines. Select this app explicitly in studio_run_native and use only a task whose allowed applications include bimcraft. Do not invoke a separate employee or assistant.

Start discovery with args ["commands"] or ["commands", "input.ifc"]. Native commands are:

- ["inspect", "input.ifc"] reads the exact native document.
- ["new", "output.ifc"] creates a genuine empty document. Optional third argument: a task-local options JSON file.
- ["run", "input.ifc", "operations.json", "output.ifc"] applies 1–50 typed native tool requests and writes an exclusive output file. operations.json is an array of {"tool":"<discovered name>","args":{...}}.

All document and operations paths must stay inside this task's workRoot. Inputs remain unchanged, existing outputs cannot be overwritten, and arbitrary JavaScript/module paths, shell commands and account credentials are not accepted. The native IFC parser/editor preserves building elements, levels, GUIDs and explicit units. Start with model_describe; modelTools expose typed operations such as walls_add. RVT/RFA are input readers in the GUI, not editable library masters.

Use studio_open_asset for exact saved inputs. After native editing, call studio_save_native_project with appId bimcraft, the output masterPath, and the exact assetId/expectedBaseRevisionId when continuing an existing asset. Include exact dependent asset revisions where applicable. A native file write or export is not a library save: report success only after its immutable library revision is confirmed. Retry an uncertain save with the same intent and base; preserve conflicts and stop. The browser adapter uses the application's own Save actions, status area and shortcuts; never add duplicate controls or wrapper banners.
