"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { SHAPE_PRESETS } from "@/config/agents";
import { apiFetch } from "@/lib/api";
import { usd } from "@/lib/format";
import { readResourceChange, resourceBaseline, validateResourceResize, type ResourceChange } from "@/lib/resource-input";
import type { AgentResourceProfile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AgentResourcesBudget({ agentId, monthlyCap, onChanged }: {
  agentId: string; monthlyCap: number | undefined; onChanged: () => void;
}) {
  const [profile, setProfile] = useState<AgentResourceProfile | null>(null);
  const [shapeKey, setShapeKey] = useState("");
  const [disk, setDisk] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [proposed, setProposed] = useState<ResourceChange | null>(null);
  const [retry, setRetry] = useState(0);

  const applyProfile = useCallback((next: AgentResourceProfile) => {
    setProfile(next); setShapeKey(`${next.resources.cpu}:${next.resources.memory}`); setDisk(String(next.resources.disk));
  }, []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    apiFetch<AgentResourceProfile>(`/api/agents/${agentId}/resources`)
      .then((next) => { if (!cancelled) applyProfile(next); })
      .catch((cause) => { if (!cancelled) setError((cause as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [agentId, applyProfile, retry]);
  useEffect(() => {
    if (profile?.status !== "updating") return;
    let cancelled = false;
    const timer = setInterval(() => {
      apiFetch<AgentResourceProfile>(`/api/agents/${agentId}/resources`)
        .then((next) => { if (!cancelled) { applyProfile(next); setActionError(null); if (next.status !== "updating") onChanged(); } })
        .catch((cause) => { if (!cancelled) setActionError((cause as Error).message); });
    }, 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [agentId, profile?.status, applyProfile, onChanged]);

  const shape = SHAPE_PRESETS.find((item) => `${item.cpu}:${item.memory}` === shapeKey);
  const selection = profile ? { cpu: shape?.cpu ?? profile.resources.cpu, memory: shape?.memory ?? profile.resources.memory, disk: Number(disk) } : null;
  const validSelection = selection && disk.trim() && Number.isSafeInteger(selection.disk) && selection.disk > 0;
  const baseline = profile && validSelection ? resourceBaseline(selection, profile.type) : null;
  const currentBaseline = profile ? resourceBaseline(profile.resources, profile.type) : null;
  const dirty = profile && selection && (selection.cpu !== profile.resources.cpu || selection.memory !== profile.resources.memory || selection.disk !== profile.resources.disk);
  let validationError: string | null = null;
  let patch: ResourceChange | null = null;
  if (profile && dirty) {
    try { patch = validateResourceResize(readResourceChange(selection), profile.resources); }
    catch (cause) { validationError = (cause as Error).message; }
  }
  const disabled = loading || busy || profile?.status !== "running";

  async function resize() {
    if (!profile || !proposed || busy) return;
    setBusy(true); setActionError(null);
    try {
      const next = await apiFetch<AgentResourceProfile>(`/api/agents/${agentId}/resize`, { method: "POST", body: JSON.stringify(proposed) });
      applyProfile(next); onChanged();
      toast.success(next.status === "updating" ? "Resource resize started" : "Resources updated");
    } catch (cause) {
      setActionError((cause as Error).message);
      throw cause;
    } finally { setBusy(false); }
  }

  return (
    <>
    <section className="space-y-6 rounded-lg border p-5 sm:p-6" aria-labelledby="monthly-summary-heading">
      <div><h2 id="monthly-summary-heading" className="font-semibold">Monthly summary</h2><p className="mt-1 text-sm text-muted-foreground">The always-on resource baseline plus the managed-services allowance.</p></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <PlanStat label={dirty ? "Proposed resource baseline" : "Resource baseline"} value={!loading && !error && baseline ? usd(baseline.total_micros) : "—"} />
        <PlanStat label="Managed monthly allowance" value={monthlyCap !== undefined ? usd(monthlyCap) : "—"} />
        <PlanStat label={dirty ? "Proposed monthly total" : "Planned monthly total"} value={!loading && !error && baseline && monthlyCap !== undefined ? usd(baseline.total_micros + monthlyCap) : "—"} />
      </div>
      <p className="text-xs text-muted-foreground">Estimate assumes 730 running hours at current rates. Extra budget is separate. Actual charges depend on running time.{profile?.type === "performance" ? " Performance CPU and RAM rates apply." : ""}{profile?.auto_sleep ? " This agent has auto-sleep enabled, so actual resource costs may be lower." : ""}</p>
    </section>
    <section className="space-y-6 rounded-lg border p-5 sm:p-6" aria-labelledby="resource-budget-heading">
      <div><h2 id="resource-budget-heading" className="font-semibold">Resources</h2><p className="mt-1 text-sm text-muted-foreground">Select a larger allocation and preview its cost in the summary above.</p></div>
      {loading ? <p className="text-sm text-muted-foreground">Loading resources…</p> : error ? (
        <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="outline" size="sm" onClick={() => setRetry((value) => value + 1)}>Retry resources</Button></div>
      ) : profile && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="resource-shape">CPU &amp; RAM</Label>
              <select id="resource-shape" className="h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm" value={shapeKey} disabled={disabled} onChange={(event) => { setShapeKey(event.target.value); setActionError(null); }}>
                {!SHAPE_PRESETS.some((item) => `${item.cpu}:${item.memory}` === `${profile.resources.cpu}:${profile.resources.memory}`) && <option value={`${profile.resources.cpu}:${profile.resources.memory}`}>Current · {profile.resources.cpu} vCPU / {profile.resources.memory} GB</option>}
                {SHAPE_PRESETS.map((item) => <option key={item.cpu} value={`${item.cpu}:${item.memory}`} disabled={item.cpu < profile.resources.cpu || item.memory < profile.resources.memory || item.diskMax < profile.resources.disk}>{item.label}</option>)}
              </select>
            </div>
            <div className="space-y-2"><Label htmlFor="resource-disk">Disk (GB)</Label><Input id="resource-disk" type="number" min={Math.max(profile.resources.disk, shape?.diskMin ?? 2)} max={shape?.diskMax ?? profile.resources.disk} step={1} value={disk} disabled={disabled} onChange={(event) => { setDisk(event.target.value); setActionError(null); }} /></div>
          </div>
          {baseline && <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>CPU {usd(baseline.cpu_micros)}</span><span>RAM {usd(baseline.memory_micros)}</span><span>Disk {usd(baseline.disk_micros)}</span><span>per month</span></div>}
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Resources can only increase. Applying a change restarts the agent and may move it to another host.</p>
            {profile.status === "updating" ? <p role="status" className="text-sm">Resizing resources… The agent may be offline while its data is moved.</p> : profile.status !== "running" && <p className="text-sm text-muted-foreground">Start the agent from <Link href={`/dashboard/agents/${agentId}/settings`} className="underline">Settings</Link> before changing resources.</p>}
            {validationError && <p role="alert" className="text-sm text-destructive">{validationError}</p>}
            {actionError && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{actionError}</p><Button variant="outline" size="sm" disabled={busy} onClick={() => setRetry((value) => value + 1)}>Reload resources</Button></div>}
            <Button disabled={disabled || !patch} onClick={() => setProposed(patch)}>Apply Upgrade</Button>
          </div>
          <ConfirmDialog open={proposed !== null} onOpenChange={(open) => { if (!open) setProposed(null); }} title="Increase agent resources?"
            description={`Change from ${profile.resources.cpu} vCPU / ${profile.resources.memory} GB RAM / ${profile.resources.disk} GB disk to ${selection?.cpu} vCPU / ${selection?.memory} GB RAM / ${selection?.disk} GB disk. The always-on baseline changes from ${usd(currentBaseline!.total_micros)} to ${usd(baseline?.total_micros ?? 0)} per month. This restarts the agent, clears in-memory state, and may take a few minutes if it moves hosts. Disk, files and URLs are kept. Resources cannot be reduced afterward.`}
            confirmText="Apply Upgrade" onConfirm={resize} />
        </>
      )}
    </section>
    </>
  );
}

function PlanStat({ label, value }: { label: string; value: string }) {
  return <div className="flex flex-col rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-auto pt-2 text-lg font-semibold tabular-nums">{value}</p></div>;
}
