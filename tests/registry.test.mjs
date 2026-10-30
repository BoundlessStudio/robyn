import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readManifests, generateRegistry, validateManifest } from "../scripts/generate-registry.mjs";

test("an independent application registers without editing an existing specialist", () => {
  const source = path.resolve("src/studio/apps");
  const original = readManifests(source);
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "robyn-registry-"));
  try {
    for (const { file } of original) fs.copyFileSync(path.join(source, file), path.join(sandbox, file));
    const snapshots = original.map(({ file }) => fs.readFileSync(path.join(sandbox, file), "utf8"));
    const extra = structuredClone(original[0].app);
    extra.id = "test-craft"; extra.name = "TestCraft"; extra.order = 99; extra.employee.role = "Test Specialist";
    fs.writeFileSync(path.join(sandbox, "test-craft.json"), JSON.stringify(extra));
    const count = generateRegistry(sandbox, path.join(sandbox, "registry.ts"));
    assert.equal(count, original.length + 1);
    assert.match(fs.readFileSync(path.join(sandbox, "registry.ts"), "utf8"), /test-craft.json/);
    for (let i = 0; i < original.length; i++) assert.equal(fs.readFileSync(path.join(sandbox, original[i].file), "utf8"), snapshots[i]);
  } finally {
    const target = path.resolve(sandbox);
    const parent = path.resolve(os.tmpdir());
    if (path.dirname(target) !== parent || !path.basename(target).startsWith("robyn-registry-")) throw new Error("Unsafe test cleanup path");
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test("readiness cannot be asserted without pinned artifacts", () => {
  const app = structuredClone(readManifests(path.resolve("src/studio/apps"))[0].app);
  app.editor.status = "verified";
  app.editor.release = null;
  app.editor.bundleUrl = null;
  assert.throws(() => validateManifest(app), /pin a release/);
  app.editor.release = "test-only";
  assert.throws(() => validateManifest(app), /missing editor bundle/);
});

test("workstation upgrades accept only unique immutable template revisions and image digests", () => {
  const app = structuredClone(readManifests(path.resolve("src/studio/apps")).find(({ app }) => app.workstation.status === "verified").app);
  delete app.workstation.previousReleases;
  app.workstation.previousReleases = [{ template: "robyn-example-previous@1", release: `sha256:${"a".repeat(64)}` }];
  assert.equal(validateManifest(app), app);
  for (const previousReleases of [null, {}, "previous", [null], ["robyn-example@1"],
    [{ template: "robyn-example", release: `sha256:${"a".repeat(64)}` }],
    [{ template: "robyn-example@latest", release: `sha256:${"a".repeat(64)}` }],
    [{ template: "robyn-example@0", release: `sha256:${"a".repeat(64)}` }],
    [{ template: "robyn-example@1", release: "0.1.0" }],
  ]) assert.throws(() => validateManifest({ ...app, workstation: { ...app.workstation, previousReleases } }), /invalid previous workstation release/);
  for (const previousReleases of [
    [{ template: app.workstation.template, release: app.workstation.release }],
    [{ template: "robyn-example@1", release: `sha256:${"a".repeat(64)}` }, { template: "robyn-example@1", release: `sha256:${"b".repeat(64)}` }],
  ]) assert.throws(() => validateManifest({ ...app, workstation: { ...app.workstation, previousReleases } }), /duplicate workstation template revision/);
  for (const overrides of [{ template: "robyn-example" }, { template: "robyn-example@latest" }, { release: "latest" }]) {
    assert.throws(() => validateManifest({ ...app, workstation: { ...app.workstation, ...overrides } }), /pin a template revision and image digest/);
  }
});
