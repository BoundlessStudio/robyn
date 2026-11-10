import { studioApps } from "./apps/registry";
import { STUDIO_GROUPS } from "./manifest";

export const studioGroupList = new Intl.ListFormat("en").format(STUDIO_GROUPS);

export const studioAppGroups = STUDIO_GROUPS.map(name => ({
  name,
  apps: studioApps.filter(app => app.studio === name),
}));
