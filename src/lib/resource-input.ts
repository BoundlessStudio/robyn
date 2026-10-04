import { SHAPE_PRESETS } from "@/config/agents";
import type { Agent, AgentResourceProfile } from "./types";

export type ResourceChange = Partial<Agent["resources"]>;

export function readResourceChange(value: unknown): ResourceChange {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a resources object.");
  const body = value as Record<string, unknown>;
  const change: ResourceChange = {};
  for (const field of ["cpu", "memory", "disk"] as const) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== "number" || !Number.isSafeInteger(body[field]) || body[field] <= 0) {
      throw new Error(`${field} must be a positive whole number.`);
    }
    change[field] = body[field];
  }
  if (!Object.keys(change).length) throw new Error("Select resources to change.");
  return change;
}

export function validateResourceResize(change: ResourceChange, current: Agent["resources"]): ResourceChange {
  const next = { ...current, ...change };
  const shape = SHAPE_PRESETS.find((item) => item.cpu === next.cpu && item.memory === next.memory);
  if (!shape) throw new Error("Select a supported CPU and RAM combination.");
  if (next.disk < shape.diskMin || next.disk > shape.diskMax) throw new Error(`Disk must be between ${shape.diskMin} and ${shape.diskMax} GB for this shape.`);
  const patch: ResourceChange = {};
  for (const field of ["cpu", "memory", "disk"] as const) {
    if (next[field] < current[field]) throw new Error("Existing agent resources can only increase. A smaller size requires a new agent.");
    if (next[field] !== current[field]) patch[field] = next[field];
  }
  if (!Object.keys(patch).length) throw new Error("The selected resources are already applied.");
  return patch;
}

// Rates from Agent37's billing documentation, in USD micros per 730-hour month.
// https://www.agent37.com/docs/agents-api/billing
// Performance multiplies CPU and RAM by four; disk keeps the default rate.
export function resourceBaseline(resources: Agent["resources"], type: AgentResourceProfile["type"] = "default") {
  const multiplier = type === "performance" ? 4 : 1;
  const cpu_micros = resources.cpu * 800_000 * multiplier;
  const memory_micros = resources.memory * 700_000 * multiplier;
  const disk_micros = resources.disk * 90_000;
  return { cpu_micros, memory_micros, disk_micros, total_micros: cpu_micros + memory_micros + disk_micros };
}

export function resourceProfile(agent: Pick<Agent, "id" | "status" | "resources" | "type" | "auto_sleep">): AgentResourceProfile {
  return {
    id: agent.id, status: agent.status,
    resources: { cpu: agent.resources.cpu, memory: agent.resources.memory, disk: agent.resources.disk },
    type: agent.type ?? "default", auto_sleep: agent.auto_sleep ?? false,
  };
}
