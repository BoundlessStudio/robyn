export type StartMode = "work" | "draft" | "plan";
export function startInstructions(mode: StartMode = "work"): string {
  if (mode === "plan") return "Starting intent: HELP ME PLAN. Discuss the idea and return a useful direction, options, or a concise proposed brief in your response. Ask only questions whose answers materially affect the outcome. Do not start production, delegate work, acquire or generate media, or create assets. studio_plan starts production and is unavailable for this request. A later explicit Make a first draft request authorizes production; this conversation does not.";
  if (mode === "draft") return "Starting intent: MAKE A FIRST DRAFT. The creator has asked for editable first work. Choose sensible creative defaults from their idea and project context, coordinate appropriate specialists with studio_team and studio_plan, and return confirmed saved native deliverables. Do not make the creator choose employees, packages, filenames or routine setup, or approve a separate plan. Ask only if a missing answer prevents useful work. Keep the first pass focused and respect each employee's allowance. Report saved work and any budget pause honestly.";
  return "";
}
