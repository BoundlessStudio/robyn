"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, CircleDollarSign } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { budgetUsdToMicros, microsToBudgetUsd, validateBudgetTopUp } from "@/lib/budget-input";
import { usd } from "@/lib/format";
import type { Budget } from "@/lib/types";
import { DashboardShell } from "@/components/DashboardShell";
import { AgentCostSummary } from "@/components/AgentCostSummary";
import { AgentResourcesBudget } from "@/components/AgentResourcesBudget";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AgentBudgetPage({ agentId, workspaceId, name }: { agentId: string; workspaceId: string; name: string }) {
  const { current, setCurrentId } = useWorkspace();
  useEffect(() => { setCurrentId(workspaceId); }, [workspaceId, setCurrentId]);

  // Scope a deep link before mounting the fleet shell, which uses the selected workspace's role.
  if (current?.id !== workspaceId) return <p className="p-6 text-sm text-muted-foreground">Loading workspace…</p>;

  return (
    <DashboardShell>
      <div className="max-w-3xl space-y-6">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Agents
        </Link>
        <header className="space-y-2">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><CircleDollarSign className="h-6 w-6" /> Budget</h1>
          <p className="break-words text-sm text-muted-foreground">{name}</p>
          <p className="font-mono text-xs text-muted-foreground">{agentId}</p>
        </header>
        <BudgetEditor key={agentId} agentId={agentId} />
      </div>
    </DashboardShell>
  );
}

function BudgetEditor({ agentId }: { agentId: string }) {
  const [budget, setBudget] = useState<Budget | null>(null);
  const [monthlyCap, setMonthlyCap] = useState("");
  const [topUp, setTopUp] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"cap" | "top-up" | null>(null);
  const [reload, setReload] = useState(0);
  const [costsRevision, setCostsRevision] = useState(0);
  const resourcesChanged = useCallback(() => setCostsRevision((value) => value + 1), []);
  const inFlight = useRef(false);
  const pendingTopUp = useRef<{ amount_micros: number; idempotency_key: string } | null>(null);
  const retryStorageKey = `agent37wl_budget_top_up_${agentId}`;

  useEffect(() => {
    // Retain ambiguous top-up requests across navigation or refresh, until a successful response.
    try {
      const stored = sessionStorage.getItem(retryStorageKey);
      if (stored) {
        pendingTopUp.current = validateBudgetTopUp(JSON.parse(stored));
        setTopUp(microsToBudgetUsd(pendingTopUp.current.amount_micros));
      }
    } catch { /* In-memory retries still work when browser storage is unavailable. */ }
  }, [retryStorageKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setBudget(null);
    setLoadError(null);
    setActionError(null);
    apiFetch<Budget>(`/api/agents/${agentId}/budget`)
      .then((next) => {
        if (cancelled) return;
        setBudget(next);
        setMonthlyCap(microsToBudgetUsd(next.monthly_cap_micros));
      })
      .catch((error) => { if (!cancelled) setLoadError((error as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [agentId, reload]);

  async function save(kind: "cap" | "top-up", event: FormEvent) {
    event.preventDefault();
    if (!budget || inFlight.current) return;
    setActionError(null);
    try {
      const amountMicros = budgetUsdToMicros(kind === "cap" ? monthlyCap : topUp, kind === "top-up");
      if (kind === "cap" && amountMicros === budget.monthly_cap_micros) return;
      if (kind === "top-up" && pendingTopUp.current?.amount_micros !== amountMicros) {
        pendingTopUp.current = { amount_micros: amountMicros, idempotency_key: crypto.randomUUID() };
      }
      const body = kind === "cap"
        ? { monthly_cap_usd: monthlyCap.trim() }
        : { amount_usd: topUp.trim(), idempotency_key: pendingTopUp.current!.idempotency_key };
      if (kind === "top-up") {
        try { sessionStorage.setItem(retryStorageKey, JSON.stringify(body)); } catch { /* Retain the in-memory key. */ }
      }
      inFlight.current = true;
      setBusy(kind);
      const next = await apiFetch<Budget>(`/api/agents/${agentId}/budget${kind === "top-up" ? "/top-up" : ""}`, {
        method: kind === "cap" ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      setBudget(next);
      if (kind === "cap") setMonthlyCap(microsToBudgetUsd(next.monthly_cap_micros));
      else {
        pendingTopUp.current = null;
        try { sessionStorage.removeItem(retryStorageKey); } catch { /* The request succeeded. */ }
        setTopUp("");
      }
      toast.success(kind === "cap" ? "Monthly budget updated" : "Extra budget added");
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  const disabled = loading || !budget || busy !== null;
  const usedPercent = budget && budget.monthly_cap_micros > 0
    ? Math.min(100, Math.max(0, budget.monthly_consumed_micros / budget.monthly_cap_micros * 100)) : 0;

  return (
    <div className="space-y-6">
    <AgentResourcesBudget agentId={agentId} monthlyCap={budget?.monthly_cap_micros} onChanged={resourcesChanged} />
    <section className="space-y-6 rounded-lg border p-5 sm:p-6" aria-labelledby="managed-budget-heading">
      <div>
        <h2 id="managed-budget-heading" className="text-base font-semibold">Managed usage budget</h2>
        <p className="mt-1 text-sm text-muted-foreground">Set spending allowances for managed LLM, search and tools. All amounts are in USD.</p>
      </div>
      {loading && <p className="text-sm text-muted-foreground">Loading budget…</p>}
      {loadError && (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-destructive">{loadError}</p>
          <Button variant="outline" size="sm" onClick={() => setReload((value) => value + 1)}>Retry</Button>
        </div>
      )}
      {budget && (
        <>
          <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><p className="text-xs text-muted-foreground">Monthly limit used</p><p className="mt-1 text-3xl font-semibold tabular-nums">{usd(budget.monthly_consumed_micros)}</p></div>
              <p className="text-xs text-muted-foreground">{budget.monthly_period} · UTC</p>
            </div>
            <div role="progressbar" aria-label="Monthly limit used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(usedPercent)} className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${usedPercent}%` }} />
            </div>
            <p className="text-sm text-muted-foreground"><span className="font-medium tabular-nums text-foreground">{usd(budget.monthly_remaining_micros)}</span> remaining of the <span className="tabular-nums">{usd(budget.monthly_cap_micros)}</span> monthly limit</p>
          </div>

          <form className="space-y-3" onSubmit={(event) => save("cap", event)}>
            <Label htmlFor="monthly-cap">Monthly limit (USD)</Label>
            <div className="flex gap-2">
              <Input id="monthly-cap" inputMode="decimal" value={monthlyCap} disabled={disabled} maxLength={32} className="min-w-0"
                aria-describedby="monthly-cap-help" onChange={(event) => setMonthlyCap(event.target.value)} />
              <Button type="submit" disabled={disabled || monthlyCap === microsToBudgetUsd(budget.monthly_cap_micros)}>{busy === "cap" ? "Saving…" : "Save"}</Button>
            </div>
            <p id="monthly-cap-help" className="text-xs text-muted-foreground">Takes effect immediately and resets on the 1st of each UTC month. Set to $0 to pause managed spend once any extra budget is used.</p>
          </form>

          <form className="space-y-3 border-t pt-6" onSubmit={(event) => save("top-up", event)}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="extra-budget">Extra budget (USD)</Label>
              <p className="text-xs text-muted-foreground"><span className="tabular-nums">{usd(budget.credit_remaining_micros)}</span> available</p>
            </div>
            <div className="flex gap-2">
              <Input id="extra-budget" inputMode="decimal" value={topUp} disabled={disabled} maxLength={32} placeholder="Amount" className="min-w-0"
                aria-describedby="extra-budget-help" onChange={(event) => setTopUp(event.target.value)} />
              <Button type="submit" variant="outline" disabled={disabled || !topUp.trim()}>{busy === "top-up" ? "Adding…" : "Add"}</Button>
            </div>
            <p id="extra-budget-help" className="text-xs text-muted-foreground">Spent after the monthly limit. Unused extra budget carries over and does not reset.</p>
          </form>
          {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
          <p className="border-t pt-4 text-xs text-muted-foreground">These allowances do not add funds to the workspace wallet. Resources are included in the monthly plan and actual spending, but do not reduce this managed-services allowance.</p>
        </>
      )}
    </section>
    <AgentCostSummary agentId={agentId} refreshKey={costsRevision} />
    </div>
  );
}
