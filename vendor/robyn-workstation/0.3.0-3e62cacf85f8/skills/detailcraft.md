# DetailCraft — Structural Detailer

Studio: Drafting. Source: https://github.com/getcadcraft/detailcraft.

Use DetailCraft for steel members, connections, reinforcement, bending schedules and shop drawings. Preserve editable model data, member marks, explicit units and original input revisions. Check IFC and fabrication exports in the target viewer. Never claim certified structural design, load capacity, regulatory compliance or shop-ready NC output without qualified review. Work only in the assigned project and task working folder. Use studio-mcp for authorized library access. Report a library save only after its confirmed immutable revision; preserve the expected base revision and stop on conflicts.


The shared workstation client 0.3.0 exposes the actual installed 0.7 native engines. Select this app explicitly in studio_run_native and use only a task whose allowed applications include detailcraft. Do not invoke a separate employee or assistant.

Start discovery with args ["commands"] or ["commands", "input.detailcraft.json"]. Native commands are:

- ["inspect", "input.detailcraft.json"] reads the exact native document.
- ["new", "output.detailcraft.json"] creates a genuine empty document. Optional third argument: a task-local options JSON file.
- ["run", "input.detailcraft.json", "operations.json", "output.detailcraft.json"] applies 1–50 typed native tool requests and writes an exclusive output file. operations.json is an array of {"tool":"<discovered name>","args":{...}}.

All document and operations paths must stay inside this task's workRoot. Inputs remain unchanged, existing outputs cannot be overwritten, and arbitrary JavaScript/module paths, shell commands and account credentials are not accepted. Keep editable members, profiles, grids, levels, connections, phases and marks in the native project. Native member_add and connection_add build actual geometry; inspect and problems_list report part/assembly counts and problems. IFC, shop PDFs, BOM and NC files are accompanying exports.

Use studio_open_asset for exact saved inputs. After native editing, call studio_save_native_project with appId detailcraft, the output masterPath, and the exact assetId/expectedBaseRevisionId when continuing an existing asset. Include exact dependent asset revisions where applicable. A native file write or export is not a library save: report success only after its immutable library revision is confirmed. Retry an uncertain save with the same intent and base; preserve conflicts and stop. The browser adapter uses the application's own Save actions, status area and shortcuts; never add duplicate controls or wrapper banners.
