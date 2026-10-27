import { studioApps } from "./apps/registry";
import { isAppReady } from "./manifest";
import { currentBlankStarters } from "./blank-starters";
import { requireUuid } from "./assets";

export const launchableApps = studioApps.filter(app => isAppReady(app) && currentBlankStarters.some(starter => starter.appId === app.id));

export function applicationLaunchUrl(projectId: string, appId: string, creationId: string): string {
  if (!launchableApps.some(app => app.id === appId)) throw Error("This application is unavailable.");
  if (projectId !== "new") requireUuid(projectId, "project ID");
  requireUuid(creationId, "document creation ID");
  return `/dashboard/projects/${projectId}?${new URLSearchParams({ app: appId, launch: creationId })}`;
}
