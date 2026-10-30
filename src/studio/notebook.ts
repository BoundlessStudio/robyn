import type { StudioAppManifest } from "./manifest";

/** Saved notebook format. The historical ID keeps existing revision links valid.
 * Browsing and search belong to Robyn and never provision an employee here. */
export const notebook: StudioAppManifest = {
  kind: "research", id: "research", version: "0.1.0", order: 0,
  name: "Notes", category: "Notebook", monogram: "N",
  color: "#b8c8a5", artwork: "research", tagline: "Findings, sources and ideas saved with your work.",
  sourceUrl: "https://www.agent37.com/docs/agents-api/desktop",
  employee: { role: "Robyn", instructions: "Use browsing and search when the brief needs them. Record direct source URLs, access dates, findings and limitations. Save useful notes with studio_save_research. Continue an existing notebook from its exact saved revision and preserve the creator's edits." },
  formats: { native: [".md"], verification: "verified" },
  capabilities: ["Source-linked notes"],
  editor: { adapterVersion: "0.1.0", release: "research-notebook-0.1.0", bundleUrl: null, status: "verified" },
  workstation: { template: null, release: null, status: "pending" },
};
