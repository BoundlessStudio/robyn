import { studioApps } from "./apps/registry";
import { research } from "./specialists/research";

// Craft modules stay independent; non-Craft workspaces join the same scoped
// assignments and asset service without changing the ArtCraft catalogue.
export const studioTools = [research, ...studioApps];
