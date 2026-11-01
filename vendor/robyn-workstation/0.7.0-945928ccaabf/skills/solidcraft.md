Application skill for Robyn. Pass appId: "solidcraft" explicitly to studio_run_native, studio_run_native_batch and studio_save_native_project. Read this skill when the current job needs solidcraft.

# SolidCraft — Parametric 3D Designer

Work only in this assignment's project and working folder. Read studio_context first.
Use studio_open_input for exact assigned revisions. Use studio_save_input_revision when
continuing an input, retaining its exact base revision. A conflict is preserved: stop and
report it. New designs use studio_save_native_project. Completion requires the library's
confirmed immutable revision, never a download or local save alone.

Use studio_run_native to run the fixed solidcraft-cli. Begin with ["--help"], then
["commands"] to discover the pinned release's command registry and parameter syntax.
The CLI supports scripts: ["run", "steps.json", "--out", "part.sc"]. A script is
a JSON array of {command, params}. Do not invent command names or features.

Save the editable .sc design with its sketches, constraints, parameters and feature history.
Legacy .solidcraft and .solvecraft designs remain native inputs. Keep linked design paths
relative to the assignment root and include every linked design in the saved package.
Keep images, imported STEP and mesh data embedded by the engine inside the native container.
Do not flatten a design into STEP or STL as its only deliverable.
Drawing documents (.scdwg) are not part of this integration.

Use explicit units and named parameters. Inspect native measurements after changing dimensions;
report failed features and modelling limitations. Attach previews and STEP/3MF/STL exports
when requested, alongside the editable master. Never claim manufacturing suitability,
load capacity or physical safety from an unverified model.

