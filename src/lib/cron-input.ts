import type { AgentCron, CronInput } from "@/lib/types";

export function validCronId(value: string): boolean {
  return /^[a-f0-9]{12}$/i.test(value);
}

export function validateCronInput(input: unknown, partial = false): Partial<CronInput> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Schedule fields must be an object.");
  const body = input as Record<string, unknown>;
  const output: Partial<CronInput> = {};
  if ("name" in body) {
    if (typeof body.name !== "string" || body.name.trim().length > 80) throw new Error("Name must be 80 characters or fewer.");
    output.name = body.name.trim();
  }
  if ("prompt" in body || !partial) {
    if (typeof body.prompt !== "string" || !body.prompt.trim() || body.prompt.trim().length > 8000) throw new Error("Instructions are required and must be 8,000 characters or fewer.");
    output.prompt = body.prompt.trim();
  }
  if ("schedule" in body || !partial) {
    if (typeof body.schedule !== "string" || body.schedule.trim().split(/\s+/).length !== 5) throw new Error("Use a five-field cron expression: minute, hour, day, month, weekday.");
    // Agent37 validates the expression grammar, including names, ranges, lists and steps.
    output.schedule = body.schedule.trim().replace(/\s+/g, " ");
  }
  if ("timezone" in body) {
    if (typeof body.timezone !== "string" || !body.timezone.trim() || body.timezone.includes(":")) throw new Error("Use an IANA timezone, such as America/Toronto or UTC.");
    try { new Intl.DateTimeFormat("en", { timeZone: body.timezone.trim() }); }
    catch { throw new Error("Use an IANA timezone, such as America/Toronto or UTC."); }
    output.timezone = body.timezone.trim();
  }
  if ("enabled" in body) {
    if (typeof body.enabled !== "boolean") throw new Error("Enabled must be true or false.");
    output.enabled = body.enabled;
  }
  if (partial && Object.keys(output).length === 0) throw new Error("No schedule changes were supplied.");
  return output;
}

// Sending an unchanged schedule/timezone/enabled resets next_run. Only send edits the user made.
export function cronChanges(original: AgentCron, edited: CronInput): Partial<CronInput> {
  const changes: Partial<CronInput> = {};
  if ((edited.name ?? "") !== (original.name ?? "")) changes.name = edited.name ?? "";
  if (edited.prompt !== original.prompt) changes.prompt = edited.prompt;
  if (edited.schedule !== original.schedule) changes.schedule = edited.schedule;
  if (edited.timezone !== original.timezone) changes.timezone = edited.timezone;
  if (edited.enabled !== original.enabled) changes.enabled = edited.enabled;
  return changes;
}

export function cronSkipReason(reason: string | null): string {
  const labels: Record<string, string> = {
    instance_stopped: "Agent is stopped", past_due: "Payment is overdue",
    free_hours_exhausted: "Free compute hours used", wake_failed: "Agent could not start the turn",
  };
  return reason ? labels[reason] ?? reason : "No reason reported";
}
