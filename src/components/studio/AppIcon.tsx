import iconSources from "../../../public/brand/apps/sources.json";
import type { StudioAppManifest } from "@/studio/manifest";

const applicationIds = new Set(iconSources.icons.map(icon => icon.id));
const illustratedBackgrounds: Record<string, string> = {
  research: "#7472e8", wordcraft: "#3c59dd", deckcraft: "#ff731b", gridcraft: "#209d59",
  cadcraft: "#16a8c2", solidcraft: "#3487e8",
};

/** Shared application artwork; adjacent text supplies the accessible name. */
export function AppIcon({ app, className = "", fallback = "" }: {
  app?: Pick<StudioAppManifest, "id" | "monogram" | "color">;
  className?: string;
  fallback?: string;
}) {
  const source = app && applicationIds.has(app.id) ? `/brand/apps/${app.id}.webp` : undefined;
  const illustrated = app && illustratedBackgrounds[app.id];
  return <span className={`studio-app-icon ${illustrated ? "illustrated " : ""}${className}`} aria-hidden="true" style={{ background: illustrated ?? (source ? undefined : app?.color ?? "#ded4bf") }}>
    {source ? <img src={source} width={256} height={256} alt="" draggable={false}/> : app?.monogram ?? fallback}
  </span>;
}
