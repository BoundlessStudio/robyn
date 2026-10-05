"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Loader2, RotateCw } from "lucide-react";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { WorkspaceUsageDashboard } from "@/components/WorkspaceUsageDashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { readUsageWindow, shiftUsageDay, usagePresetWindow, type UsagePreset, type UsageWindow } from "@/lib/usage-report";
import type { WorkspaceUsageReport } from "@/lib/types";

export function UsageView() {
  const { current, ready } = useWorkspace();
  if (!ready) return <p className="text-sm text-muted-foreground">Loading workspace...</p>;
  if (!current) return <p className="text-sm text-muted-foreground">No workspace selected.</p>;
  if (current.role !== "admin") return <p className="text-sm text-muted-foreground">Admin access is required to view workspace usage.</p>;
  // Remount on workspace changes so previous tenant data cannot flash in the next workspace.
  return <UsagePage key={current.id} workspaceId={current.id} workspaceName={current.name} />;
}

function UsagePage({ workspaceId, workspaceName }: { workspaceId: string; workspaceName: string }) {
  const [preset, setPreset] = useState<UsagePreset | "custom">("30");
  const [window, setWindow] = useState<UsageWindow>(() => usagePresetWindow("30"));
  const [from, setFrom] = useState(window.from);
  const [to, setTo] = useState(window.to);
  const [report, setReport] = useState<WorkspaceUsageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const today = new Date().toISOString().slice(0, 10);
  const earliest = shiftUsageDay(today, -89);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setReport(null);
    const query = new URLSearchParams({ from: window.from, to: window.to });
    apiFetch<WorkspaceUsageReport>(`/api/workspaces/${workspaceId}/usage?${query}`, { cache: "no-store", signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setReport(data); })
      .catch((e) => { if (!controller.signal.aborted) setError((e as Error).message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [workspaceId, window, retry]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usage</h1>
          <p className="mt-1 text-sm text-muted-foreground">What {workspaceName}&apos;s agents spent, by UTC day.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <span className="sr-only">Usage date range</span>
            <select aria-label="Usage date range" value={preset} className="min-w-32 bg-background outline-none" onChange={(event) => {
              const value = event.target.value as UsagePreset | "custom";
              setPreset(value); setInputError(null);
              if (value !== "custom") {
                const next = usagePresetWindow(value);
                setWindow(next); setFrom(next.from); setTo(next.to);
              }
            }}>
              <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option>
              <option value="month">This month</option><option value="custom">Custom range</option>
            </select>
          </label>
          <Button variant="outline" size="sm" disabled={loading} onClick={() => {
            if (preset !== "custom") setWindow(usagePresetWindow(preset));
            setRetry((value) => value + 1);
          }}>
            <RotateCw className="mr-2 h-4 w-4" />Refresh
          </Button>
        </div>
      </header>

      {preset === "custom" && <form className="space-y-2" onSubmit={(event) => {
        event.preventDefault();
        try { setWindow(readUsageWindow(from, to)); setInputError(null); }
        catch (e) { setInputError((e as Error).message); }
      }}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-sm">From (UTC)<Input aria-label="From date (UTC)" type="date" value={from} min={earliest} max={today} required onChange={(event) => setFrom(event.target.value)} /></label>
          <label className="space-y-1 text-sm">To (UTC)<Input aria-label="To date (UTC)" type="date" value={to} min={earliest} max={today} required onChange={(event) => setTo(event.target.value)} /></label>
          <Button type="submit" size="sm">Apply range</Button>
        </div>
        {inputError && <p role="alert" className="text-sm text-destructive">{inputError}</p>}
      </form>}

      <p className="text-xs text-muted-foreground">Compute settles within the hour. Models, search and tools update as calls are billed.</p>
      <div aria-live="polite">
        {loading ? <div className="flex min-h-48 items-center justify-center gap-2 rounded-lg border text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading workspace usage...</div> : error ? (
          <div className="space-y-3 rounded-lg border p-5"><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="outline" size="sm" onClick={() => setRetry((value) => value + 1)}>Retry usage</Button></div>
        ) : report && <WorkspaceUsageDashboard report={report} />}
      </div>
      {report && !loading && <p className="text-xs text-muted-foreground">Updated {new Date(report.generated_at).toLocaleString()}</p>}
    </div>
  );
}
