---
name: pixelcraft
description: Create, edit and export layered pixel sprites and frame animations with PixelCraft.
---

Read `studio_context` first. Call `studio_run_native` with `appId: "pixelcraft"` and `args: ["--request", "<JSON object as a string>"]`. The native command runs in the task's `workRoot`. For files you create, use the same task-relative names in native requests and library saves, such as `Sprite.oxypix` and `Sprite.gif`. Use the exact `masterPath` returned by `studio_open_input` for an assigned input. Keep a reference-linked target beside its source with its `.oxypix.refs` sidecar and linked images.

### Draw and animate

A new sprite has frame 0 and layer 0. Indices start at zero; layer 0 is the bottom. Supply `operations` in each `draw` step: each operation has an `op` such as `pixels` with `points: [[x,y],...]`, `line` with `from` and `to`, or `rect` with `from`, `to`, and `filled`. Colors are hex strings. `add_frame` accepts `copy_of` and `duration_ms`; edit the new frame by index. Adapt this request to the brief:

```json
{
  "target": "Sprite.oxypix",
  "width": 48,
  "height": 48,
  "steps": [
    {"command":"draw","params":{"frame":0,"layer":0,"operations":[
      {"op":"rect","from":[12,18],"to":[35,38],"filled":true,"color":"#FFD451"},
      {"op":"pixels","points":[[19,26],[28,26]],"color":"#322738"}
    ]}},
    {"command":"add_frame","params":{"copy_of":0,"duration_ms":160,"name":"Tip"}},
    {"command":"draw","params":{"frame":1,"layer":0,"operations":[
      {"op":"line","from":[15,17],"to":[32,14],"color":"#A84920"}
    ]}},
    {"command":"set_frame","params":{"frame":0,"duration_ms":180}},
    {"command":"set_tags","params":{"tags":[{"name":"Loop","from":0,"to":1,"direction":"forward","repeat":0}]}}
  ],
  "inspect": true
}
```

For a later edit use `source` and a new `target`. Check that the native call returns exit code 0 and the expected frames before exporting. `inspect: true` also works with only `source`.

### Export and save

Send a separate native request for each export. GIF includes all frames; PNG accepts a zero-based `frame`. Other formats are `bmp`, `sheet` (PNG), and `aseprite`. Give each export a new filename.

```json
{"source":"Sprite.oxypix","export":{"format":"gif","path":"Sprite.gif"}}
```

Call `studio_save_native_project` with `{"appId":"pixelcraft","name":"Sprite","masterPath":"Sprite.oxypix","derivedFiles":[{"path":"Sprite.gif","role":"export"}]}`. Add any requested PNG to the same `derivedFiles` list. For a continuation of an assigned revision use `studio_save_input_revision` with its exact input index. Report a library save after the tool confirms the committed revision.
