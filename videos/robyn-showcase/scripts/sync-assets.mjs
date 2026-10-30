import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const project = fileURLToPath(new URL("../", import.meta.url));
const repo = path.resolve(project, "../..");
const files = [
  ...[
    "photocraft",
    "lightcraft",
    "vectorcraft",
    "designcraft",
    "figcraft",
    "filmcraft",
    "effectcraft",
    "soundcraft",
    "wordcraft",
    "pdfcraft",
    "deckcraft",
    "gridcraft",
    "cadcraft",
    "solidcraft",
  ].map((id) => [`public/brand/apps/${id}.webp`, `apps/${id}.webp`]),
  ["public/artwork/editors/photocraft.png", "editors/photocraft.png"],
  ["public/artwork/editors/filmcraft.png", "editors/filmcraft.png"],
  ["public/artwork/editors/solidcraft.png", "editors/solidcraft.png"],
  ["public/artwork/editors/research.jpg", "editors/notes.jpg"],
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
      note: "Unmodified repository assets. Screenshot crop is presentation-only. See ../../docs/HOMEPAGE-ARTWORK.md and ../../public/brand/apps/sources.json.",
      files: records,
    },
    null,
    2,
  ) + "\n",
);
console.log(`Copied and hashed ${records.length} local assets.`);
