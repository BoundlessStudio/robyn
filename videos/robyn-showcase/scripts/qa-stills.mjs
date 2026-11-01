import { bundle } from "@remotion/bundler";
import {
  openBrowser,
  selectComposition,
  renderStill,
} from "@remotion/renderer";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import path from "node:path";

const output = path.resolve(
  process.argv.find((arg) => arg.startsWith("--out-dir="))?.slice(10) ||
    "out/qa",
);
const chaptersOnly = process.argv.includes("--chapters-only");
await mkdir(output, { recursive: true });
const catalogBytes = await readFile("public/catalog.json");
const catalog = JSON.parse(catalogBytes);
const sources = JSON.parse(await readFile("public/asset-sources.json", "utf8"));
const apps = catalog.studios.flatMap((studio) => studio.apps);
assert.deepEqual(
  catalog.studios.map(({ name, apps }) => [name, apps.length]),
  [
    ["Creative", 10],
    ["Drafting", 9],
    ["Analysis", 7],
  ],
);
assert.equal(new Set(apps.map(({ id }) => id)).size, 26);
assert.equal(apps.filter(({ ready }) => ready).length, 26);
assert.equal(apps.filter(({ hasIcon }) => hasIcon).length, 26);
assert.equal(catalogBytes.length, sources.catalog.bytes);
assert.equal(
  createHash("sha256").update(catalogBytes).digest("hex"),
  sources.catalog.sha256,
);
for (const file of sources.files) {
  const bytes = await readFile(path.join("public", file.destination));
  assert.equal(bytes.length, file.bytes, file.destination);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    file.sha256,
    file.destination,
  );
}
const serveUrl = await bundle({
  entryPoint: path.resolve("src/index.ts"),
  rspack: true,
});
const browser = await openBrowser("chrome");
const messages = [];
const onBrowserLog = (log) => {
  if (log.type === "error") messages.push(log.text);
};
try {
  const composition = await selectComposition({
    serveUrl,
    id: "RobynShowcase",
    puppeteerInstance: browser,
  });
  if (
    composition.durationInFrames !== 1800 ||
    composition.fps !== 30 ||
    composition.width !== 1920 ||
    composition.height !== 1080
  )
    throw new Error("Unexpected master metadata");
  const frames = [
    100,
    350,
    500,
    550,
    610,
    670,
    680,
    730,
    860,
    1100,
    1185,
    1207,
    1230,
    1320,
    1400,
    1540,
    1740,
    1799,
    225,
    450,
    750,
    975,
    1425,
    1650,
    ...[225, 450, 750, 975, 1425, 1650].flatMap((cut) => [
      cut - 15,
      cut + 7,
      cut + 21,
    ]),
  ];
  for (const frame of chaptersOnly ? [] : frames) {
    await renderStill({
      serveUrl,
      composition,
      frame,
      output: path.join(output, `frame-${String(frame).padStart(4, "0")}.png`),
      imageFormat: "png",
      puppeteerInstance: browser,
      onBrowserLog,
    });
    console.log(`Checked frame ${frame} / 1799`);
  }
  const chapters = [
    ["IdeasHaveWings", 100, 100],
    ["ThreeStudios", 125, 350],
    ["RealTools", 100, 550],
    ["OneRobyn", 110, 860],
    ["Media", 345, 1320],
    ["SavedRevisions", 115, 1540],
    ["Invitation", 90, 1740],
  ];
  for (const [id, frame] of chapters) {
    const chapter = await selectComposition({
      serveUrl,
      id,
      puppeteerInstance: browser,
    });
    await renderStill({
      serveUrl,
      composition: chapter,
      frame,
      output: path.join(output, `chapter-${id}.png`),
      imageFormat: "png",
      puppeteerInstance: browser,
      onBrowserLog,
    });
    console.log(`Checked standalone chapter ${id}`);
  }
  if (messages.length) throw new Error(JSON.stringify(messages));
  await writeFile(
    path.join(output, chaptersOnly ? "chapters-check.json" : "check.json"),
    JSON.stringify(
      {
        composition: composition.id,
        width: composition.width,
        height: composition.height,
        fps: composition.fps,
        durationInFrames: composition.durationInFrames,
        frames: chaptersOnly ? [] : frames,
        chapters: chapters.map(([id, frame, masterFrame]) => ({
          id,
          frame,
          masterFrame,
        })),
        errors: messages,
        catalog: {
          studios: catalog.studios.map(({ name, apps }) => ({
            name,
            applications: apps.length,
          })),
          applications: apps.length,
          ready: apps.filter(({ ready }) => ready).length,
          connecting: apps.filter(({ ready }) => !ready).length,
          copiedAssets: sources.files.length,
          sha256: sources.catalog.sha256,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close({ silent: true });
}
