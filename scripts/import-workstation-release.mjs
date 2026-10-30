// Import only the companion runtime's built, immutable workstation client and
// employee instructions. Native images and editor sources stay in that repo.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
const source = path.resolve(process.argv[2] ?? "../robyn-artcraft-runtime");
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const release = JSON.parse(await fs.readFile(path.join(source, "build/workstation/release.json"), "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(release.version)) throw Error("Invalid runtime release");
const files = new Map([
  ["studio-mcp.cjs", await fs.readFile(path.join(source, "build/workstation/studio-mcp.cjs"))],
  ["configure-hermes.py", await fs.readFile(path.join(source, "lib/configure-hermes.py"))],
]);
if (digest(files.get("studio-mcp.cjs")) !== release.sha256) throw Error("Runtime bytes do not match the release");
const configuration = files.get("configure-hermes.py").toString();
if (!configuration.includes(`studio-mcp-v${release.version}.cjs`) && !configuration.includes(`VERSION = "${release.version}"`)) throw Error("Runtime configuration version mismatch");
for (const entry of (await fs.readdir("src/studio/apps")).filter(name => name.endsWith(".json")).sort()) {
  const app = JSON.parse(await fs.readFile(`src/studio/apps/${entry}`, "utf8"));
  files.set(`skills/${app.id}.md`, await fs.readFile(path.join(source, `apps/${app.id}/SKILL.md`)));
}
files.set("skills/research.md", await fs.readFile(path.join(source, "apps/research/SKILL.md")));
const hashes = Object.fromEntries([...files].map(([name, bytes]) => [name, { bytes: bytes.length, sha256: digest(bytes) }]));
const fingerprint = digest(JSON.stringify(hashes));
const directory = `vendor/robyn-workstation/${release.version}-${fingerprint.slice(0, 12)}`;
for (const [name, bytes] of files) {
  const destination = path.join(directory, name);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  try { const old = await fs.readFile(destination); if (!old.equals(bytes)) throw Error("Immutable runtime release differs"); }
  catch (error) { if (error.code !== "ENOENT") throw error; await fs.writeFile(destination, bytes, { flag: "wx" }); }
}
await fs.writeFile("src/studio/workstation-release.json", JSON.stringify({ version: release.version, directory, fingerprint, files: hashes }, null, 2) + "\n");
console.log({ version: release.version, directory, files: files.size, fingerprint });
