import type { AgentCosts, WorkspaceUsage } from "./types";

export function monthWindow(now = new Date()) {
  const to = now.toISOString().slice(0, 10);
  const period = to.slice(0, 7);
  return { period, from: `${period}-01`, to };
}

export function agentCosts(id: string, usage: WorkspaceUsage, period: string): AgentCosts {
  const row = usage.instances.find((instance) => instance.id === id);
  // Explicit fields keep other instances, workspace totals and attribution out of the response.
  return {
    period, from: usage.from, to: usage.to,
    spend: {
      id, total_micros: row?.total_micros ?? 0, compute_micros: row?.compute_micros ?? 0,
      llm_micros: row?.llm_micros ?? 0, brave_micros: row?.brave_micros ?? 0,
      composio_micros: row?.composio_micros ?? 0, perflo_micros: row?.perflo_micros ?? 0,
    },
  };
}
