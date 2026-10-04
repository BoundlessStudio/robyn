"use client";

import { useEffect, useId, useState } from "react";
import { Coins, Search, Server, Sparkles, Wrench } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { usd } from "@/lib/format";
import type { AgentCosts, Usage } from "@/lib/types";
import { Button } from "@/components/ui/button";

export function AgentCostSummary({ agentId, refreshKey = 0, embedded = false, usage }: {
  agentId: string; refreshKey?: number; embedded?: boolean; usage?: Usage | null;
}) {
  const headingId = useId();
  const [costs, setCosts] = useState<AgentCosts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    apiFetch<AgentCosts>(`/api/agents/${agentId}/costs`)
      .then((next) => { if (!cancelled) setCosts(next); })
      .catch((cause) => { if (!cancelled) setError((cause as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [agentId, refreshKey, retry]);

  return (
    <section className={embedded ? "space-y-3" : "space-y-4 rounded-lg border p-5 sm:p-6"} aria-labelledby={headingId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="text-sm font-semibold">Actual spending this month</h2>
        {costs && <span className="text-xs text-muted-foreground">{costs.period} · UTC</span>}
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Loading costs…</p> : error ? (
        <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="outline" size="sm" onClick={() => setRetry((value) => value + 1)}>Retry costs</Button></div>
      ) : costs && (
        <div className="overflow-hidden rounded-md border">
          {[
            { label: "Resources (CPU, RAM & disk)", Icon: Server, cost: costs.spend.compute_micros },
            { label: "Models", Icon: Sparkles, cost: costs.spend.llm_micros, calls: usage?.by_integration.llm.calls },
            { label: "Search", Icon: Search, cost: costs.spend.brave_micros, calls: usage?.by_integration.brave.calls },
            { label: "Tools (Composio)", Icon: Wrench, cost: costs.spend.composio_micros, calls: usage?.by_integration.composio.calls },
            { label: "Paid tools", Icon: Coins, cost: costs.spend.perflo_micros, calls: usage?.by_integration.perflo?.calls },
          ].map(({ label, Icon, cost, calls }) => (
            <div key={label} className="flex items-center justify-between gap-3 border-b px-3 py-3 text-sm">
              <span className="flex min-w-0 items-center gap-2"><Icon className="h-4 w-4 shrink-0 text-muted-foreground" />{label}</span>
              <span className="shrink-0 text-right tabular-nums">{calls !== undefined && <span className="text-xs text-muted-foreground">{calls} {calls === 1 ? "call" : "calls"} · </span>}{usd(cost)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 bg-muted/30 px-3 py-3 text-sm font-semibold"><span>Total spent</span><span className="tabular-nums">{usd(costs.spend.total_micros)}</span></div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Actual resource charges are included in total spending. Compute settles hourly and may take up to an hour to appear. Resources do not reduce the managed-services allowance.</p>
    </section>
  );
}
