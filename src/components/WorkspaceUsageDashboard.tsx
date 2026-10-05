"use client";

import Link from "next/link";
import type { UsageMetrics, WorkspaceUsageReport } from "@/lib/types";
import { usageCount, usageDate, usageMoney } from "@/lib/usage-report";

const SERVICES = [
  { field: "llm_micros", label: "Models", color: "#2563eb" },
  { field: "brave_micros", label: "Web search", color: "#f59e0b" },
  { field: "composio_micros", label: "Composio tools", color: "#8b5cf6" },
  { field: "perflo_micros", label: "Paid tools", color: "#f97316" },
] as const;

export function WorkspaceUsageDashboard({ report }: { report: WorkspaceUsageReport }) {
  const { totals } = report;
  const share = (value: number) => `${totals.total_micros ? Math.round(value / totals.total_micros * 100) : 0}% of spend`;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <UsageStat label="Total spend" value={usageMoney(totals.total_micros)} detail={`${usageDate(report.from)} to ${usageDate(report.to)}`} />
        <UsageStat label="Compute" value={usageMoney(totals.compute_micros)} detail={share(totals.compute_micros)} />
        <UsageStat label="Models" value={usageMoney(totals.llm_micros)} detail={`${usageCount(totals.llm_calls)} calls`} />
        <UsageStat label="Web search" value={usageMoney(totals.brave_micros)} detail={share(totals.brave_micros)} />
        <UsageStat label="Composio tools" value={usageMoney(totals.composio_micros)} detail={share(totals.composio_micros)} />
        <UsageStat label="Paid tools" value={usageMoney(totals.perflo_micros)} detail={share(totals.perflo_micros)} />
        <UsageStat label="Tokens" value={usageCount(totals.input_tokens + totals.output_tokens)} detail={`${usageCount(totals.input_tokens)} in · ${usageCount(totals.output_tokens)} out`} />
      </div>

      {totals.total_micros === 0 && <p className="text-sm text-muted-foreground">No spending recorded in this date range.</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <DailyUsageChart title="Compute by day" days={report.days} services={[{ field: "compute_micros", label: "Compute", color: "#9ca3af" }]} />
        <DailyUsageChart title="Models, search and tools by day" days={report.days} services={SERVICES} />
      </div>

      <section className="overflow-hidden rounded-lg border bg-card" aria-labelledby="usage-models">
        <div className="p-5">
          <h2 id="usage-models" className="text-sm font-semibold">By model</h2>
          <p className="mt-1 text-xs text-muted-foreground">What each model cost in this window, highest first.</p>
        </div>
        {report.models === null ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">The usage API does not provide a model breakdown scoped to this workspace. Model spend, calls and tokens are included in the totals above.</p>
        ) : report.models.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">No model usage recorded in this date range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">Model usage in the selected UTC date range</caption>
              <thead className="border-b text-xs"><tr>
                <TableHeading>Model</TableHeading><TableHeading numeric>Calls</TableHeading><TableHeading numeric>Input tokens</TableHeading><TableHeading numeric>Output tokens</TableHeading><TableHeading numeric>Spend</TableHeading>
              </tr></thead>
              <tbody>{report.models.map((model) => (
                <tr key={model.model} className="border-b last:border-0">
                  <th scope="row" className="px-5 py-3 text-left font-mono text-xs font-normal">{model.model === "unknown" ? "Unknown model" : model.model}</th>
                  <TableNumber value={model.calls} /><TableNumber value={model.input_tokens} /><TableNumber value={model.output_tokens} />
                  <td className="px-5 py-3 text-right font-semibold tabular-nums">{usageMoney(model.cost_micros)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-lg border bg-card" aria-labelledby="usage-agents">
        <div className="p-5">
          <h2 id="usage-agents" className="text-sm font-semibold">By agent</h2>
          <p className="mt-1 text-xs text-muted-foreground">{report.agents.length} agents, highest spend first, including deleted agents with spending in this window.</p>
        </div>
        {report.agents.length === 0 ? <p className="px-5 pb-5 text-sm text-muted-foreground">No agents in this workspace.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <caption className="sr-only">Spending and tokens for all workspace agents in the selected UTC date range</caption>
              <thead className="border-b text-xs"><tr>
                <TableHeading>Agent</TableHeading><TableHeading numeric>Compute</TableHeading>
                {SERVICES.map((service) => <TableHeading key={service.field} numeric>{service.label}</TableHeading>)}
                <TableHeading numeric>Tokens</TableHeading><TableHeading numeric>Total</TableHeading>
              </tr></thead>
              <tbody>{report.agents.map((agent) => (
                <tr key={agent.id} className="border-b last:border-0">
                  <th scope="row" className="px-5 py-3 text-left font-normal">
                    {agent.deleted ? <span className="font-mono text-xs">{agent.id}</span> : (
                      <Link href={`/dashboard/agents/${agent.id}/settings`} className="font-medium hover:underline">{agent.name?.trim() || agent.id}</Link>
                    )}
                    <div className="mt-0.5 text-xs text-muted-foreground">{agent.deleted ? "Deleted" : agent.name?.trim() ? agent.id : "Untitled agent"}</div>
                  </th>
                  <td className="px-5 py-3 text-right tabular-nums">{usageMoney(agent.compute_micros)}</td>
                  {SERVICES.map((service) => <td key={service.field} className="px-5 py-3 text-right tabular-nums">{usageMoney(agent[service.field])}</td>)}
                  <TableNumber value={agent.input_tokens + agent.output_tokens} />
                  <td className="px-5 py-3 text-right font-semibold tabular-nums">{usageMoney(agent.total_micros)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function UsageStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="min-w-0 rounded-lg border bg-card p-5">
    <div className="text-sm text-muted-foreground">{label}</div>
    <div className="mt-1 break-words text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
    <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
  </div>;
}

function TableHeading({ children, numeric }: { children: React.ReactNode; numeric?: boolean }) {
  return <th scope="col" className={`whitespace-nowrap px-5 py-3 font-semibold ${numeric ? "text-right" : "text-left"}`}>{children}</th>;
}

function TableNumber({ value }: { value: number }) {
  return <td className="px-5 py-3 text-right tabular-nums" title={value.toLocaleString("en-US")}>{usageCount(value)}</td>;
}

type ChartService = { field: keyof UsageMetrics; label: string; color: string };
function DailyUsageChart({ title, days, services }: {
  title: string; days: WorkspaceUsageReport["days"]; services: readonly ChartService[];
}) {
  const largest = Math.max(0, ...days.map((day) => services.reduce((sum, service) => sum + day[service.field], 0)));
  const magnitude = largest > 0 ? 10 ** Math.floor(Math.log10(largest)) : 1_000_000;
  const ceiling = largest > 0 ? ([1, 2, 5, 10].find((step) => step * magnitude >= largest) ?? 10) * magnitude : magnitude;
  const left = 78, top = 16, width = 486, height = 210;
  const step = width / Math.max(days.length, 1), barWidth = Math.max(1, step * 0.7);
  const tickIndexes = [...new Set([0, Math.floor((days.length - 1) / 4), Math.floor((days.length - 1) / 2), Math.floor((days.length - 1) * 3 / 4), days.length - 1])].filter((index) => index >= 0);
  return (
    <section className="min-w-0 rounded-lg border bg-card p-5">
      <div className="flex min-h-12 flex-wrap items-start justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {services.length > 1 && <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {services.map((service) => <span key={service.field} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: service.color }} />{service.label}</span>)}
        </div>}
      </div>
      <svg viewBox="0 0 584 260" className="w-full" role="img" aria-label={`${title}, daily spending in USD, UTC`}>
        <title>{`${title}. All dates are UTC. Hover over a bar for its spending.`}</title>
        {[0, 0.5, 1].map((portion) => {
          const y = top + height * (1 - portion);
          return <g key={portion}>
            <line x1={left} x2={left + width} y1={y} y2={y} className="stroke-border" />
            <text x={left - 10} y={y + 4} textAnchor="end" fontSize="11" className="fill-muted-foreground">{usageMoney(ceiling * portion)}</text>
          </g>;
        })}
        {days.map((day, index) => {
          let base = 0;
          return <g key={day.date}>{services.map((service) => {
            const value = day[service.field], barHeight = value / ceiling * height;
            const y = top + height - (base + value) / ceiling * height;
            base += value;
            if (value === 0) return null;
            const description = `${day.date} UTC · ${service.label}: ${usageMoney(value)}`;
            return <rect key={service.field} x={left + index * step + (step - barWidth) / 2} y={y} width={barWidth} height={barHeight} fill={service.color} tabIndex={0} aria-label={description}>
              <title>{description}</title>
            </rect>;
          })}</g>;
        })}
        {tickIndexes.map((index) => <text key={index} x={left + (index + 0.5) * step} y={top + height + 22} textAnchor="middle" fontSize="11" className="fill-muted-foreground">{usageDate(days[index].date)}</text>)}
      </svg>
      <p className="text-xs text-muted-foreground">{largest === 0 ? "No spending in this category." : "Daily spending in USD · UTC"}</p>
    </section>
  );
}
