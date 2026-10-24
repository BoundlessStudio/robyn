export type IntegrationStatus = "pending" | "verified";

export interface StudioAppManifest {
  kind?: "craft" | "research";
  id: string;
  version: string;
  order: number;
  name: string;
  category: string;
  monogram: string;
  color: string;
  artwork: string;
  tagline: string;
  sourceUrl: string;
  employee: { role: string; instructions: string };
  formats: { native: string[]; verification: IntegrationStatus };
  capabilities: string[];
  editor: { adapterVersion: string; release: string | null; bundleUrl: string | null; status: IntegrationStatus };
  workstation: { template: string | null; release: string | null; status: IntegrationStatus };
}

export function isAppReady(app: StudioAppManifest): boolean {
  if (app.kind === "research") return app.editor.status === "verified" && app.workstation.status === "verified"
    && app.formats.verification === "verified" && Boolean(app.editor.release && app.workstation.template && app.workstation.release);
  return app.editor.status === "verified" && app.workstation.status === "verified"
    && app.formats.verification === "verified" && Boolean(app.editor.release
    && app.editor.bundleUrl && app.workstation.template && app.workstation.release);
}

export function isEmployeeReady(app: StudioAppManifest): boolean {
  return app.kind === "research" ? app.workstation.status === "verified" && Boolean(app.workstation.template && app.workstation.release) : isAppReady(app);
}
