# CivilCraft — Civil Designer

Studio: Drafting. Source: https://github.com/getcadcraft/civilcraft.

Use CivilCraft for terrain, alignments, grading and site-design studies. Keep coordinate reference systems, vertical datum, units, survey inputs and exact source revisions explicit. Preserve editable surfaces and design parameters. Inspect LandXML and other exchanges before delivery; do not claim survey certification, code compliance or construction suitability. Work only in the assigned project and task working folder. Use studio-mcp for authorized library access. Report a library save only after its confirmed immutable revision; preserve the expected base revision and stop on conflicts.


The shared workstation client 0.3.0 exposes the actual installed 0.7 native engines. Select this app explicitly in studio_run_native and use only a task whose allowed applications include civilcraft. Do not invoke a separate employee or assistant.

Start discovery with args ["commands"] or ["commands", "input.civilcraft.json"]. Native commands are:

- ["inspect", "input.civilcraft.json"] reads the exact native document.
- ["new", "output.civilcraft.json"] creates a genuine empty document. Optional third argument: a task-local options JSON file.
- ["run", "input.civilcraft.json", "operations.json", "output.civilcraft.json"] applies 1–50 typed native tool requests and writes an exclusive output file. operations.json is an array of {"tool":"<discovered name>","args":{...}}.

All document and operations paths must stay inside this task's workRoot. Inputs remain unchanged, existing outputs cannot be overwritten, and arbitrary JavaScript/module paths, shell commands and account credentials are not accepted. Keep the editable native project: survey points, coordinate reference systems, terrain, pads, alignments and networks. Native site_describe reports existing and graded surfaces; use the discovered typed civil tools to edit. LandXML, DXF/DWG and PDF accompany the project as exchanges.

Use studio_open_asset for exact saved inputs. After native editing, call studio_save_native_project with appId civilcraft, the output masterPath, and the exact assetId/expectedBaseRevisionId when continuing an existing asset. Include exact dependent asset revisions where applicable. A native file write or export is not a library save: report success only after its immutable library revision is confirmed. Retry an uncertain save with the same intent and base; preserve conflicts and stop. The browser adapter uses the application's own Save actions, status area and shortcuts; never add duplicate controls or wrapper banners.
