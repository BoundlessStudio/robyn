# PlanCraft

Use PlanCraft for editable project schedules, dependencies, milestones, calendars, resource assignments, workload and critical-path analysis. Its original Rust engine owns the calculations. Work only inside the current task folder and preserve exact linked `.plancraft` files; never replace missing inputs with guessed data.

Start with `studio_context`. Open an assigned revision using `studio_open_input`, or a chosen exact revision using `studio_open_asset`. Run `studio_run_native` with `appId: "plancraft"` and `args: ["--help"]` for the native session format.

The original MCP engine runs through a bounded tool script:

```json
{"files":["Plan.plancraft"],"steps":[{"tool":"update_project","args":{"name":"Launch plan","start":"2026-11-02"}},{"tool":"create_task","args":{"name":"Agree the brief","duration":"2d"}},{"tool":"save_project","args":{}}]}
```

Pass this object as a JSON string after `--request`. Declare all document paths in `files` before the session; a missing declared path starts a new unsaved project there. Use `set_active_document` and each tool's `document` argument when several documents are open. Native `--no-file-access` disables ambient opens, new paths and external-file linking. Existing exact linked packages still recalculate. The browser's original Links Between Projects dialog can add selected inputs.

Durations use working minutes and the project's calendars (normally 8-hour days and 40-hour weeks). Preserve baselines, task IDs, dependencies, resource assumptions and date constraints. Use original tools such as `list_tasks`, `get_task`, `create_task`, `create_tasks`, `update_task`, `create_resource`, `assign_resource`, `get_project` and `save_project`; unsupported names or arguments are errors, not permission to substitute calculations.

`save_project` writes a native working file. Publish it through `studio_save_input_revision` for an exact assigned input, or `studio_save_native_project` for new work. Only report a library save after its immutable revision is confirmed. On an interrupted native reply, inspect the existing file and saved receipts before another action. Never repeat an uncertain library save with a different operation ID. Preserve conflicts and use a separate asset only when the creator requests it.
