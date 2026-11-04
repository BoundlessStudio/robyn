# GeoCraft (RustGIS)

Use GeoCraft for editable maps, cartography and spatial analysis. RustGIS's original Rust engine owns coordinates, attributes, projections and calculations. Work only in the assigned task folder. Preserve the `.rgis` project, exact linked data, coordinate reference systems, units, source revisions and analytical assumptions. Check and state active selections before geoprocessing: RustGIS can process the selected features. Never invent missing data or quietly accept a lossy conversion.

Start with `studio_context`. Open an assigned input with `studio_open_input`, or a chosen exact revision with `studio_open_asset`. Use `studio_run_native` with `appId: "geocraft"` and `args: ["--help"]` for the bounded native session format. Pass one JSON object as a string after `--request`:

```json
{"file":"Study.rgis","data":["inputs/Points.geojson"],"steps":[{"tool":"run_command","args":{"command":"map.rename","params":{"name":"Study area"}}},{"tool":"list_layers","args":{}}],"save":true}
```

`file` names one task-relative native project; a missing file starts a new blank project there. `data` optionally declares up to twenty exact local data inputs. Omit it when reopening a project that already contains its data. Every invocation starts a new original engine session. Include `save:true` with mutations before continuing in another invocation; unsaved memory does not carry across calls.

The original MCP tools run with ambient file/network commands disabled. Use `search_commands`, `run_command`, `list_layers`, `read_features`, `search_tools`, `describe_tool`, `run_tool`, `run` and `view_map` only as the installed engine advertises them; its help and errors determine supported arguments. Scripts, plugin management, system credentials and arbitrary opens/saves are not enabled. Declare inputs before the session and use the explicit `save` flag for the working project. A refused tool is not permission to substitute another engine or calculation.

The browser uses the original ribbon, map canvas, layer controls, attribute table, dialogs and native project writer. Original Save, Save As and keyboard shortcuts wait for the private library's immutable receipt. Exact linked vector/raster inputs use the original embedded-source readers while their source files remain in the package. Browser preferences and private work stay in memory; confirmed revisions survive reloads. Database servers, GDAL/DuckDB providers, local tile archives and folder-backed Zarr stores remain native. Never put connection credentials in saved packages.

The official Basemaps 0.1.2 plugin is included by default in the native application and browser. Use its existing Basemaps ribbon for OpenStreetMap, Esri, NASA and other public presets, preserving provider credits. Tiles and styles load on demand. This adds no map datasets or extra runtime dependency. The native task MCP permission floor still reserves plugin execution and management to the user's application.

`save:true` writes a working `.rgis` file. It is not a private-library save. Use `studio_save_input_revision` for an assigned input, or `studio_save_native_project` for new work, and report success only after the immutable revision is confirmed. On interruption, inspect the existing file and exact receipt before another action. Preserve uncertain operation IDs, base revisions and conflicts. Native exports and browser downloads remain separate from library saves.
