import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("media worker financial recovery never submits a payment or downloads/publishes files", () => {
  const output = execFileSync(process.env.PYTHON ?? "python", [fileURLToPath(new URL("./helpers/media-worker.py", import.meta.url))], { encoding: "utf8" });
  assert.match(output, /retention regressions passed/);
});
