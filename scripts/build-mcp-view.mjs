import { mkdir, writeFile } from "node:fs/promises";
import { build } from "esbuild";

const result = await build({
  entryPoints: ["src/studio/mcp/photocraft-view.ts"],
  bundle: true, write: false, platform: "browser", format: "iife", target: "es2022", minify: true,
  define: { "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": "undefined" },
});
const output = new URL("../build/mcp/", import.meta.url);
await mkdir(output, { recursive: true });
await writeFile(new URL("photocraft-v1.js", output), result.outputFiles[0].contents);
await writeFile(new URL("photocraft.html", output), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>PhotoCraft</title><style>
  html,body { margin:0; width:100%; height:100%; color:CanvasText; background:Canvas; font:14px system-ui; color-scheme:light dark; }
  iframe { position:absolute; inset:0; width:100%; height:100%; border:0; }
  p { margin:0; padding:1rem; }
  button { font:inherit; }
</style></head><body><p id="notice" role="status">Opening PhotoCraft…</p>
<script>globalThis.__ROBYN_PHOTOCRAFT_CONFIG__ = __ROBYN_PHOTOCRAFT_CONFIG_JSON__;</script>
<script defer src="__ROBYN_PHOTOCRAFT_VIEW_URL__"></script></body></html>\n`);
