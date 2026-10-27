import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

// Compare evaluated geometry, rather than formatted source: the production
// mascot is the reference and every position, material and feather must match.
const originalPath = "../../src/components/home/AsciiRobin.tsx";
const original = await readFile(originalPath, "utf8");
const video = await readFile("src/bird-model.ts", "utf8");
const geometry = original.slice(
  original.indexOf("function makeRobin()"),
  original.indexOf("const DAY"),
);
const evaluate = (source, expression) => {
  const js = ts.transpileModule(source.replace(/^export /gm, ""), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  return vm.runInNewContext(`${js}\nJSON.stringify(${expression})`, {
    exports: {},
  });
};
const originalPoints = evaluate(
  `const TAU = Math.PI * 2;\n${geometry}`,
  "makeRobin()",
);
const videoPoints = evaluate(video, "makeRobin()");
assert.equal(
  videoPoints,
  originalPoints,
  "Mascot geometry or materials drifted from the original",
);
const sourcePalette = JSON.parse(original.match(/const DAY = (\[[^;]+\]);/)[1]);
const videoPalette = JSON.parse(evaluate(video, "ROBIN_PALETTE"));
assert.deepEqual(
  videoPalette,
  sourcePalette,
  "Mascot colors differ from the original",
);
const sourceRamp = original.match(/const ramp = "([^"]+)"/)[1];
assert.equal(JSON.parse(evaluate(video, "ROBIN_RAMP")), sourceRamp);
const record = {
  reference: originalPath,
  points: JSON.parse(videoPoints).length,
  geometrySha256: createHash("sha256").update(videoPoints).digest("hex"),
  exactGeometryMatch: true,
  exactPaletteMatch: true,
  exactCharacterRampMatch: true,
};
await mkdir("out/qa", { recursive: true });
await writeFile("out/qa/mascot-fidelity.json", JSON.stringify(record, null, 2));
console.log(JSON.stringify(record, null, 2));
