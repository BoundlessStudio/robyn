// Regenerate the committed, static brand assets. See docs/BRANDING.md for fonts.
// This uses the original canvas sculpture, not a second hand-drawn ASCII bird.
import fs from "node:fs/promises";
import vm from "node:vm";
import { createRequire } from "node:module";
import sharp from "sharp";
import ts from "typescript";
import React from "react";

const require = createRequire(import.meta.url);
const { ImageResponse } = require("next/og");
const mark = JSON.parse(await fs.readFile("src/config/robin-mark.json", "utf8"));
const craftManifests = await Promise.all((await fs.readdir("src/studio/apps")).filter(name => name.endsWith(".json")).map(async name => JSON.parse(await fs.readFile(`src/studio/apps/${name}`, "utf8"))));
const craftCount = craftManifests.filter(app => app.formats.verification === "verified" && app.editor.status === "verified" && app.workstation.status === "verified" && app.editor.bundleUrl && app.editor.release && app.workstation.template && app.workstation.release).length;
await fs.mkdir("public/brand", { recursive: true });
const shape = `<g fill="none"><path d="${mark.feet}" stroke="${mark.ink}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/><path d="${mark.body}" fill="${mark.ink}"/><path d="${mark.breast}" fill="${mark.rust}"/><path d="${mark.feather}" fill="${mark.wing}"/><circle cx="21" cy="18" r="2.4" fill="${mark.paper}"/><circle cx="21.5" cy="18" r="1.1" fill="${mark.ink}"/></g>`;
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${mark.paper}"/><g transform="translate(60 4) scale(-.875 .875)">${shape}</g></svg>`;
await fs.writeFile("src/app/icon.svg", icon + "\n");
await fs.writeFile("public/brand/robin-icon.svg", icon + "\n");
await sharp(Buffer.from(icon)).resize(180, 180).png().toFile("src/app/apple-icon.png");
await sharp(Buffer.from(icon)).resize(512, 512).png().toFile("public/brand/robin-icon-512.png");
const sizes = [16, 32, 48];
const bitmaps = await Promise.all(sizes.map(size => sharp(Buffer.from(icon)).resize(size, size).png().toBuffer()));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (const [index, bitmap] of bitmaps.entries()) {
  const position = 6 + index * 16;
  header[position] = sizes[index]; header[position + 1] = sizes[index];
  header.writeUInt16LE(1, position + 4); header.writeUInt16LE(32, position + 6);
  header.writeUInt32LE(bitmap.length, position + 8); header.writeUInt32LE(offset, position + 12);
  offset += bitmap.length;
}
await fs.writeFile("src/app/favicon.ico", Buffer.concat([header, ...bitmaps]));

// Record a deterministic, motion-free frame from the actual homepage renderer.
let effect, nextFrame;
const ctx = { ops: [], stack: [], globalAlpha: 1, fillStyle: "", font: "",
  setTransform() {}, clearRect() { this.ops = []; },
  fillText(char, x, y) { this.ops.push({ char, x, y, fill: this.fillStyle, opacity: this.globalAlpha, font: this.font }); },
  save() { this.stack.push([this.fillStyle, this.globalAlpha]); },
  restore() { [this.fillStyle, this.globalAlpha] = this.stack.pop(); },
};
const canvas = { clientWidth: 600, clientHeight: 540, dataset: {}, getContext: () => ctx };
const sandbox = { exports: {}, Math, Float32Array, Uint8Array,
  require(name) {
    if (name === "react") return { useRef: () => ({ current: canvas }), useEffect: callback => { effect = callback; } };
    if (name === "react/jsx-runtime") return { jsx: () => null };
    throw new Error(`Unexpected renderer import: ${name}`);
  },
  window: { devicePixelRatio: 1 }, document: { hidden: false },
  ResizeObserver: class { observe() {} disconnect() {} }, IntersectionObserver: class { observe() {} disconnect() {} },
  requestAnimationFrame(callback) { nextFrame = callback; return 1; }, cancelAnimationFrame() {},
};
const source = await fs.readFile("src/components/home/AsciiRobin.tsx", "utf8");
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, sandbox);
sandbox.exports.AsciiRobin({ flight: { current: { scene: 0, progress: 0, pointer: 0, paused: true, reduced: true, craft: "intro" } } });
const cleanup = effect(); nextFrame(42); cleanup();
const xml = text => text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]);
// A heavier glyph makes the sculpture readable in small link previews.
const ascii = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="540" viewBox="0 0 600 540"><g font-family="Courier New,monospace" font-weight="700" text-anchor="middle" dominant-baseline="central">${ctx.ops.map(op => `<text x="${op.x.toFixed(2)}" y="${op.y.toFixed(2)}" font-size="${(parseFloat(op.font) * 1.04).toFixed(2)}" fill="${op.fill}" opacity="${(op.opacity > .5 ? 1 : op.opacity).toFixed(3)}">${xml(op.char)}</text>`).join("")}</g></svg>`;
await fs.writeFile("public/brand/robin-ascii.svg", ascii);
const robinPng = await sharp(Buffer.from(ascii)).png().toBuffer();
const data = (type, bytes) => `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
const h = React.createElement;
const fontPath = process.argv[2] || "artifacts/qa/branding/SpaceGrotesk-500.ttf";
const font = await fs.readFile(fontPath);
const italic = await fs.readFile("node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff");
const card = h("div", { style: { width: "100%", height: "100%", display: "flex", background: mark.paper, color: mark.ink, fontFamily: "Space Grotesk", position: "relative" } },
  h("div", { style: { position: "absolute", top: 38, left: 54, display: "flex", alignItems: "center", gap: 9 } },
    h("span", { style: { fontSize: 52, letterSpacing: "-4px" } }, "robyn")),
  h("div", { style: { position: "absolute", top: 59, right: 60, fontSize: 12, letterSpacing: "2px" } }, `ONE ROBYN. ${craftCount} CRAFTS. ONE IMAGINATION.`),
  h("div", { style: { position: "absolute", top: 163, left: 60, display: "flex", flexDirection: "column" } },
    h("div", { style: { fontSize: 88, lineHeight: 1.05, letterSpacing: "-6px" } }, "Ideas have"),
    h("div", { style: { fontFamily: "Instrument Serif", fontStyle: "italic", fontSize: 150, lineHeight: 1.02, color: mark.rust, letterSpacing: "-5px" } }, "wings.")),
  h("div", { style: { position: "absolute", top: 435, left: 64, fontSize: 22, lineHeight: 1.5, display: "flex", flexDirection: "column" } },
    h("div", {}, "Your AI creative collaborator."), h("div", {}, "Real tools. A world of your making.")),
  h("div", { style: { position: "absolute", width: 460, height: 460, borderRadius: "50%", border: "1px solid #d2d4c3", left: 671, top: 123 } }),
  h("img", { src: data("image/png", robinPng), width: 590, height: 531, style: { position: "absolute", top: 87, left: 590 } }),
  h("div", { style: { position: "absolute", bottom: 38, left: 64, fontSize: 13, letterSpacing: "1px" } }, "ROBYN.ACADEMY"),
  h("div", { style: { position: "absolute", bottom: 38, right: 60, fontSize: 11, letterSpacing: "1.2px" } }, "A LITTLE WILD. ENTIRELY YOURS."),
);
const response = new ImageResponse(card, { width: 1200, height: 630, fonts: [{ name: "Space Grotesk", data: font, weight: 500 }, { name: "Instrument Serif", data: italic, weight: 400, style: "italic" }] });
await fs.writeFile("public/brand/robyn-social.png", Buffer.from(await response.arrayBuffer()));
console.log("Generated shared robin icons, the original ASCII still and 1200×630 social card.");
