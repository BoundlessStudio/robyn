import { studioApps } from "./apps/registry";
import { notebook } from "./notebook";

// Private saved-format lookup includes old notebooks. Public applications and
// Robyn's application skills are the independent Craft registry only.
export const studioTools = [notebook, ...studioApps];
