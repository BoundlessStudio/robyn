export interface AgentCapacity {
  agent_limit: number;
  agent_count: number;
  pending_count: number;
  balance_micros: number | null;
}

export function creationDisabledReason(capacity: AgentCapacity | null): string | null {
  if (!capacity || capacity.balance_micros === null) return "Agent capacity or wallet data is unavailable. Refresh to retry.";
  if (capacity.agent_count + capacity.pending_count >= capacity.agent_limit) return "This workspace has reached its agent limit.";
  if (capacity.balance_micros <= 0) return "Add funds in Billing to create an agent.";
  return null;
}

export function hostAgentLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 1000) {
    throw new Error("Enter an agent limit from 0 to 1,000.");
  }
  return value;
}
