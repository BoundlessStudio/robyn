import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readManifests } from "../../../scripts/generate-registry.mjs";
import { isAppReady, STUDIO_GROUPS } from "../../../src/studio/manifest.ts";

const project = fileURLToPath(new URL("../", import.meta.url));
const repo = path.resolve(project, "../..");
const manifests = readManifests(path.join(repo, "src/studio/apps"));
const iconSources = JSON.parse(
  await readFile(path.join(repo, "public/brand/apps/sources.json"), "utf8"),
);
const iconIds = new Set(iconSources.icons.map(({ id }) => id));
const catalog = {
  studios: STUDIO_GROUPS.map((name) => ({
    name,
    apps: manifests
      .filter(({ app }) => app.studio === name)
      .map(({ app }) => ({
        id: app.id,
        name: app.name,
        monogram: app.monogram,
        color: app.color,
        ready: isAppReady(app),
        hasIcon: iconIds.has(app.id),
      })),
  })),
};
const catalogBytes = Buffer.from(JSON.stringify(catalog, null, 2) + "\n");
await writeFile(path.join(project, "public/catalog.json"), catalogBytes);
const catalogSources = [];
for (const { file } of manifests) {
  const source = `src/studio/apps/${file}`;
  const bytes = Buffer.from(
    (await readFile(path.join(repo, source), "utf8")).replaceAll("\r\n", "\n"),
  );
  catalogSources.push({
    source,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
const files = [
  ...manifests
    .filter(({ app }) => iconIds.has(app.id))
    .map(({ app }) => [
      `public/brand/apps/${app.id}.webp`,
      `apps/${app.id}.webp`,
    ]),
  ["public/artwork/editors/photocraft.png", "editors/photocraft.png"],
  ["public/artwork/editors/filmcraft.png", "editors/filmcraft.png"],
  ["public/artwork/editors/solidcraft.png", "editors/solidcraft.png"],
  ["public/artwork/editors/dashcraft-showcase.png", "editors/dashcraft.png"],
  ["public/artwork/editors/datacraft.png", "editors/datacraft.png"],
  ["public/brand/apps/SolidCraft-LICENSE.txt", "apps/SolidCraft-LICENSE.txt"],
  ["public/artwork/offscript-bloom.png", "artwork/bloom.png"],
  [
    "node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2",
    "fonts/space-grotesk.woff2",
  ],
  [
    "node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2",
    "fonts/instrument-serif.woff2",
  ],
  [
    "node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2",
    "fonts/instrument-serif-italic.woff2",
  ],
  [
    "node_modules/@fontsource-variable/space-grotesk/LICENSE",
    "fonts/Space-Grotesk-LICENSE.txt",
  ],
  [
    "node_modules/@fontsource/instrument-serif/LICENSE",
    "fonts/Instrument-Serif-LICENSE.txt",
  ],
];
const records = [];
for (const [source, destination] of files) {
  const output = path.join(project, "public", destination);
  await mkdir(path.dirname(output), { recursive: true });
  await copyFile(path.join(repo, source), output);
  if (destination.endsWith(".txt")) {
    await writeFile(
      output,
      (await readFile(output, "utf8")).replaceAll("\r\n", "\n"),
    );
  }
  const bytes = await readFile(output);
  records.push({
    source,
    destination,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
await writeFile(
  path.join(project, "public", "asset-sources.json"),
  JSON.stringify(
    {
      note: "Unmodified image/font assets; text license line endings normalized to LF. Screenshot crop is presentation-only. See ../../docs/HOMEPAGE-ARTWORK.md and ../../public/brand/apps/sources.json.",
      files: records,
      catalog: {
        destination: "catalog.json",
        bytes: catalogBytes.length,
        sha256: createHash("sha256").update(catalogBytes).digest("hex"),
        sourceEncoding: "UTF-8 with LF line endings",
        manifests: catalogSources,
      },
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Copied and hashed ${records.length} local assets and ${manifests.length} catalog entries.`,
);
