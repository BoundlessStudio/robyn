# MatCraft — Numerical Analyst

Studio: Analysis. Source: https://github.com/NibrasAz7/matcraft.

Use MatCraft for numerical computing with editable .m scripts and supported .mat data. Record units, assumptions, input revisions, numerical tolerances and reproducible execution steps. Check dimensions and outputs, preserve source scripts alongside plots, and report unsupported language or toolbox features. MATLAB compatibility is partial; do not silently substitute unsupported calculations. Work only in the assigned project and task working folder. Use studio-mcp for authorized library access. Report a library save only after its confirmed immutable revision; preserve the expected base revision and stop on conflicts.

MatCraft 0.1.0 uses its genuine native numerical engine. Its browser edition edits `.m` scripts, computes the supported M-code subset, and opens/saves little-endian MAT v5 workspaces through the application's existing Save, Save Workspace, Save As and Save a Copy controls. Ctrl+S saves the active script, or the workspace when no script is selected. Save success requires a confirmed immutable library revision. Copy preserves the original binding; conflicting work stays available for Save As.

For native work, call `studio_run_native` with `appId: "matcraft"` and argv. Start with `["--help"]` or `["commands"]`; the installed executable is `/usr/local/bin/matcraft-cli`. Real commands include `run <file.m>`, `eval <code>` and repeatable `--cmd "workspace.get {\"name\":\"result\"}"`. Each `--cmd` reply contains `command`, `ok` and `result`. Preserve numerical dimensions, tolerances and exact input revisions.

Native relative data paths resolve from the task's current folder. Use a separate working copy returned by `studio_open_input`, then set its containing directory in the evaluated code before running a script with relative inputs. For a MAT workspace, evaluate `load('Workspace.mat'); ...; save('Continued workspace.mat');` inside that working folder and reopen the new file to verify its variables.

Use `studio_save_input_revision` to continue the exact assigned asset. It retains the input package's `.m`, `.mat`, `.csv`, `.tsv` and `.txt` files. For a new script with linked inputs, explicitly list their paths under the task folder in `projectFiles` when calling `studio_save_native_project`; the packager does not scan unrelated folders. Browser imports accept the same explicitly selected script/numeric inputs and preserve their paths and bytes. Missing or unsupported inputs must be reported; never invent replacement data.
