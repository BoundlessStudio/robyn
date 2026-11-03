# MarkupCraft — Drawing Reviewer

Studio: Drafting. Source: https://github.com/getcadcraft/markupcraft.

Review drawing sets with MarkupCraft. Keep the original plan revision, sheet/page references, annotation ownership and all saved markup data. Preserve editable annotations and punch-list context; a flattened PDF is not the only master. Do not mistake review comments for certified engineering approval. PDF routing must let the creator choose the intended application. Work only in the assigned project and task working folder. Use studio-mcp for authorized library access. Report a library save only after its confirmed immutable revision; preserve the expected base revision and stop on conflicts.


The shared workstation client 0.3.0 exposes the actual installed 0.7 native engines. Select this app explicitly in studio_run_native and use only a task whose allowed applications include markupcraft. Do not invoke a separate employee or assistant.

Start discovery with args ["commands"] or ["commands", "input.pdf"]. Native commands are:

- ["inspect", "input.pdf"] reads the exact native document.
- ["new", "output.pdf"] creates a genuine empty document. Optional third argument: a task-local options JSON file.
- ["run", "input.pdf", "operations.json", "output.pdf"] applies 1–50 typed native tool requests and writes an exclusive output file. operations.json is an array of {"tool":"<discovered name>","args":{...}}.

All document and operations paths must stay inside this task's workRoot. Inputs remain unchanged, existing outputs cannot be overwritten, and arbitrary JavaScript/module paths, shell commands and account credentials are not accepted. The PDF remains editable: use inspect to count pages and annotations; markup_add accepts original PDF points, annotation type, page, author and text. Existing annotations and source-page bytes remain in the document. Use MarkupCraft only when the creator intends plan review, rather than choosing it automatically for every PDF.

Use studio_open_asset for exact saved inputs. After native editing, call studio_save_native_project with appId markupcraft, the output masterPath, and the exact assetId/expectedBaseRevisionId when continuing an existing asset. Include exact dependent asset revisions where applicable. A native file write or export is not a library save: report success only after its immutable library revision is confirmed. Retry an uncertain save with the same intent and base; preserve conflicts and stop. The browser adapter uses the application's own Save actions, status area and shortcuts; never add duplicate controls or wrapper banners.
