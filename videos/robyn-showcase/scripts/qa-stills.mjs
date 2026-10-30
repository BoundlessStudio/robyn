import { bundle } from "@remotion/bundler";
import {
  openBrowser,
  selectComposition,
  renderStill,
} from "@remotion/renderer";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const output = path.resolve("out/qa");
const chaptersOnly = process.argv.includes("--chapters-only");
await mkdir(output, { recursive: true });
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
    550,
    610,
    680,
    860,
    1100,
    1320,
    1540,
    1740,
    1799,
    225,
    450,
    750,
    975,
    1200,
    1425,
    1650,
    ...[225, 450, 750, 975, 1200, 1425, 1650].flatMap((cut) => [
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
    ["FourteenCrafts", 125, 350],
    ["RealTools", 100, 550],
    ["OneRobyn", 110, 860],
    ["BrowserAndNotes", 125, 1100],
    ["Media", 120, 1320],
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
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close({ silent: true });
}
