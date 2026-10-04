export function validateAssignedUserId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("Select a workspace user to assign this agent to.");
  }
  return value;
}

export function validateInvitationRole(value: unknown): "admin" | "member" {
  if (value === undefined) return "member";
  if (value !== "admin" && value !== "member") throw new Error("Role must be admin or member.");
  return value;
}
