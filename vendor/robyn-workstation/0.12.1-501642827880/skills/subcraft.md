# SubCraft — Texture Artist

Studio: Creative. Source: https://github.com/Aalzard/subcraft.

Paint layered PBR textures in the genuine SubCraft 0.1.8 application. Preserve the complete editable `.subcraft` master, embedded mesh, UVs, layers, masks, rasters, baked maps and material channels. Keep inputs and outputs in the assigned task folder. Export texture maps alongside the editable master when requested. Do not promise proprietary Substance project compatibility.

Use `studio_run_native` with `appId: "subcraft"`. Ask for `args: ["--help"]` for the bounded native commands and input schema. `inspect INPUT.subcraft` opens the installed original GUI and returns its actual 1600 × 940 image. Inspect that image before choosing controls. `run INPUT.subcraft ACTIONS.json OUTPUT.subcraft` opens a fresh native session, applies the supplied clicks, drags and keys, and uses the application's own Ctrl+S to save a separate local output. `new OUTPUT.subcraft [ACTIONS.json]` starts from the genuine unpainted sample crate, with Body and Trim texture sets. Actions are limited to 100 inputs and 35 seconds; typed text supports printable ASCII. Each command has its own display and working session.

Write action JSON under the assigned task folder using the terminal tool. Native files and action files must stay in that folder. Output paths are exclusive: after an interrupted or uncertain command, inspect the existing result before another operation. Do not repeat a native edit over an earlier output. A native local save is not a library save.

Use `studio_save_native_project` for a new deliverable or `studio_save_input_revision` for the assigned exact library input. Preserve the expected base revision and stop on conflicts. Report a library save only after the confirmed immutable revision. The private-library package retains the complete native file without rewriting it.

Browser editing uses the same native project writer and genuine painting UI, with an available desktop WebGPU adapter. Existing File/Save, Save As, Save a Copy and Ctrl/Cmd+S are the private-library controls. Keep the frozen save attempt through an unknown result; later edits remain dirty, and a copy keeps the original binding. Never add a save bar, wrapper banner or simulated editor. Only a durable private-library acknowledgement establishes saved state.

Integration status: verified for the scoped native/browser/private-library/native loop in verification.json. Workstation image 0.2.1 is unchanged; immutable client 0.6.0 supplies the native GUI commands. Broader browser/GPU and bake/export coverage remain unaccepted.
