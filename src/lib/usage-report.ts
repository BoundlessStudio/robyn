import type { ModelSpend, UsageAgent, UsageMetrics, WorkspaceUsage, WorkspaceUsageReport } from "./types";

const DAY_MS = 86_400_000;
const FIELDS = ["total_micros", "compute_micros", "llm_micros", "brave_micros", "composio_micros", "perflo_micros", "llm_calls", "input_tokens", "output_tokens"] as const;
const MODEL_FIELDS = ["cost_micros", "calls", "input_tokens", "output_tokens"] as const;
export type UsagePreset = "7" | "30" | "90" | "month";
export interface UsageWindow { from: string; to: string }
export interface UsageOwnership { id: string; name: string | null; deleted: boolean }

function dateValue(value: string): number {
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) {
    throw new Error("Choose valid dates in YYYY-MM-DD format.");
  }
  return time;
}

export function shiftUsageDay(day: string, offset: number): string {
  return new Date(dateValue(day) + offset * DAY_MS).toISOString().slice(0, 10);
}

export function usagePresetWindow(preset: UsagePreset, now = new Date()): UsageWindow {
  const to = now.toISOString().slice(0, 10);
  return { from: preset === "month" ? `${to.slice(0, 7)}-01` : shiftUsageDay(to, 1 - Number(preset)), to };
}

export function readUsageWindow(from: string | null, to: string | null, now = new Date()): UsageWindow {
  const today = now.toISOString().slice(0, 10);
  const end = to ?? today;
  const start = from ?? shiftUsageDay(end, -29);
  const first = dateValue(start), last = dateValue(end), latest = dateValue(today);
  if (first > last) throw new Error("The start date must be on or before the end date.");
  if (last > latest || first < latest - 89 * DAY_MS) throw new Error("Choose dates within the last 90 UTC days, including today.");
  return { from: start, to: end };
}

export function usageWindowDays({ from, to }: UsageWindow): string[] {
  const days: string[] = [];
  for (let day = dateValue(from); day <= dateValue(to); day += DAY_MS) days.push(new Date(day).toISOString().slice(0, 10));
  return days;
}

function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Invalid usage amount.");
  return value;
}

export function emptyUsageMetrics(): UsageMetrics {
  return { total_micros: 0, compute_micros: 0, llm_micros: 0, brave_micros: 0, composio_micros: 0, perflo_micros: 0, llm_calls: 0, input_tokens: 0, output_tokens: 0 };
}

function readMetrics(row: InstanceSpendRow): UsageMetrics {
  const result = emptyUsageMetrics();
  for (const field of FIELDS) result[field] = integer(row[field]);
  const components = result.compute_micros + result.llm_micros + result.brave_micros + result.composio_micros + result.perflo_micros;
  if (integer(components) !== result.total_micros) throw new Error("Usage amounts do not reconcile.");
  return result;
}

type InstanceSpendRow = WorkspaceUsage["instances"][number];

function addMetrics(target: UsageMetrics, source: UsageMetrics) {
  for (const field of FIELDS) target[field] = integer(target[field] + source[field]);
}

// Never copy the shared-key totals, daily rollups or model rollups into a tenant response.
// Rebuild daily and overall metrics solely from persisted workspace ownership.
export function buildUsageReport(
  window: UsageWindow,
  ownership: UsageOwnership[],
  sources: { date: string; usage: WorkspaceUsage }[],
  generatedAt = new Date(),
): WorkspaceUsageReport {
  const agents = new Map<string, UsageAgent>(ownership.map((agent) => [agent.id, { ...agent, ...emptyUsageMetrics() }]));
  const byDate = new Map(sources.map((source) => [source.date, source.usage]));
  const totals = emptyUsageMetrics();
  const models = new Map<string, ModelSpend>();
  let modelsAvailable = true;
  const days = usageWindowDays(window).map((date) => {
    const source = byDate.get(date);
    if (!source || source.from !== date || source.to !== date || !Array.isArray(source.instances)) throw new Error("Incomplete usage response.");
    const metrics = emptyUsageMetrics();
    const seen = new Set<string>();
    let allOwned = true;
    for (const row of source.instances) {
      if (!row || typeof row.id !== "string" || seen.has(row.id)) throw new Error("Invalid usage instance.");
      seen.add(row.id);
      const agent = agents.get(row.id);
      if (!agent) { allOwned = false; continue; }
      const values = readMetrics(row);
      addMetrics(metrics, values);
      addMetrics(agent, values);
    }
    addMetrics(totals, metrics);

    // There is no documented per-instance model filter. A shared model rollup is
    // usable only when every spender is owned here and its model totals reconcile.
    if (metrics.llm_micros || metrics.llm_calls || metrics.input_tokens || metrics.output_tokens) {
      if (!allOwned || !Array.isArray(source.by_model)) modelsAvailable = false;
      else {
        try {
          if (integer(source.total_micros) !== metrics.total_micros) throw new Error("Incomplete instance attribution.");
          const dailyModels = new Map<string, ModelSpend>();
          for (const row of source.by_model) {
            if (!row || typeof row.model !== "string" || !row.model || dailyModels.has(row.model)) throw new Error("Invalid model usage.");
            const model: ModelSpend = { model: row.model, cost_micros: integer(row.cost_micros), calls: integer(row.calls), input_tokens: integer(row.input_tokens), output_tokens: integer(row.output_tokens) };
            dailyModels.set(model.model, model);
          }
          for (const [field, expected] of [["cost_micros", metrics.llm_micros], ["calls", metrics.llm_calls], ["input_tokens", metrics.input_tokens], ["output_tokens", metrics.output_tokens]] as const) {
            if (integer([...dailyModels.values()].reduce((sum, row) => sum + row[field], 0)) !== expected) throw new Error("Model totals do not reconcile.");
          }
          for (const row of dailyModels.values()) {
            const model = models.get(row.model) ?? { model: row.model, cost_micros: 0, calls: 0, input_tokens: 0, output_tokens: 0 };
            for (const field of MODEL_FIELDS) model[field] = integer(model[field] + row[field]);
            models.set(row.model, model);
          }
        } catch { modelsAvailable = false; }
      }
    }
    return { date, ...metrics };
  });

  return {
    ...window, generated_at: generatedAt.toISOString(), totals, days,
    agents: [...agents.values()].filter((agent) => !agent.deleted || agent.total_micros || agent.llm_calls || agent.input_tokens || agent.output_tokens)
      .sort((a, b) => b.total_micros - a.total_micros || a.id.localeCompare(b.id)),
    models: modelsAvailable ? [...models.values()].sort((a, b) => b.cost_micros - a.cost_micros || a.model.localeCompare(b.model)) : null,
  };
}

export function usageMoney(micros: number): string {
  if (micros === 0) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: micros < 10_000 ? 6 : 2 }).format(micros / 1_000_000);
}

export function usageCount(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function usageDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}
