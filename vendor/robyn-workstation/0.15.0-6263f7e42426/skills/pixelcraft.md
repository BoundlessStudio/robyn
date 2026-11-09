---
name: pixelcraft
description: Create, edit and export layered pixel sprites and frame animations with PixelCraft.
---

Use the pinned OxyPixel engine for editable `.oxypix` files. Open exact assigned library inputs with `studio_open_asset`. Keep the master, its optional `.oxypix.refs` sidecar and linked PNG or JPEG images together under the task directory.

Use `run_pixelcraft` with `--request` and a JSON object. Use `source` for an exact working copy and a new `target` for edits. Create a blank sprite with `target`, `width` and `height`. Use `inspect: true` to inspect layers, frames, timing and tags. Editing steps are objects with a `command` and `params`. Supported commands are `draw`, `add_layer`, `set_layer`, `add_frame`, `set_frame`, `set_tags` and `set_palette`.

For an export, submit a separate request with `source` and `export` containing `format` and `path`. Formats are `png`, `bmp`, `gif`, `sheet` and `aseprite`. Keep a reference-linked edited target beside its source so relative references stay valid. Confirm the private-library revision through the Studio save tool before reporting a library save.
