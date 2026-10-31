import iconSources from "../../../public/brand/apps/sources.json";
import type { StudioAppManifest } from "@/studio/manifest";

const applicationIcons = new Map(iconSources.icons.map(icon => [icon.id, icon.sha256.slice(0, 12)]));
const illustratedBackgrounds: Record<string, string> = {
  research: "#7472e8", wordcraft: "#3c59dd", deckcraft: "#ff731b", gridcraft: "#209d59",
  cadcraft: "#16a8c2", solidcraft: "#3487e8",
  bimcraft: "#c6a34f", modelcraft: "#cf617a", markupcraft: "#e85f54", takeoffcraft: "#d6ae35",
  civilcraft: "#7d9d45", detailcraft: "#36a6c9", partcraft: "#4686c8", subcraft: "#7a65d7",
  materialcraft: "#c47739", dashcraft: "#aa6ccc", matcraft: "#39a59d", datacraft: "#586ed9",
};

/** Shared application artwork; adjacent text supplies the accessible name. */
export function AppIcon({ app, className = "", fallback = "" }: {
  app?: Pick<StudioAppManifest, "id" | "monogram" | "color">;
  className?: string;
  fallback?: string;
}) {
  const version = app && applicationIcons.get(app.id);
  const source = app && version ? `/brand/apps/${app.id}.webp?v=${version}` : undefined;
  const illustrated = app && illustratedBackgrounds[app.id];
  return <span className={`studio-app-icon ${illustrated ? "illustrated " : ""}${className}`} aria-hidden="true" style={{ background: illustrated ?? (source ? undefined : app?.color ?? "#ded4bf") }}>
    {source ? <img src={source} width={256} height={256} alt="" draggable={false}/> : app?.monogram ?? fallback}
  </span>;
}
