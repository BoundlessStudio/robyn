export const AGENT_ICONS = [
  { id: "bot", label: "Robot" }, { id: "brain", label: "Brain" },
  { id: "sparkles", label: "Sparkles" }, { id: "book", label: "Book" },
  { id: "code", label: "Code" }, { id: "flask", label: "Science" },
  { id: "leaf", label: "Leaf" }, { id: "compass", label: "Compass" },
  { id: "heart", label: "Heart" }, { id: "shield", label: "Shield" },
  { id: "rocket", label: "Rocket" }, { id: "music", label: "Music" },
] as const;

export type AgentIconId = (typeof AGENT_ICONS)[number]["id"];
export function isAgentIcon(value: unknown): value is AgentIconId {
  return AGENT_ICONS.some((icon) => icon.id === value);
}

export interface AgentProfilePatch { name?: string; icon?: AgentIconId | null }

export function validateAgentProfile(input: unknown): AgentProfilePatch {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Profile fields must be an object.");
  const body = input as Record<string, unknown>;
  const patch: AgentProfilePatch = {};
  if ("name" in body) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 60) throw new Error("Name is required and must be 60 characters or fewer.");
    patch.name = body.name.trim();
  }
  if ("icon" in body) {
    if (body.icon !== null && !isAgentIcon(body.icon)) throw new Error("Choose one of the available agent icons.");
    patch.icon = body.icon;
  }
  if (!Object.keys(patch).length) throw new Error("No profile changes were supplied.");
  return patch;
}
