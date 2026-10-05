"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { hostAgentLimit } from "@/lib/agent-capacity-input";
import { billingUsdToCents } from "@/lib/billing-input";
import type { HostCredit, HostTenantSummary } from "@/lib/host-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function HostWorkspaceControls({ tenant, onChanged }: {
  tenant: HostTenantSummary;
  onChanged: () => void;
}) {
  const [limit, setLimit] = useState(String(tenant.agent_limit));
  const [amount, setAmount] = useState("25.00");
  const [savingLimit, setSavingLimit] = useState(false);
  const [crediting, setCrediting] = useState(false);
  const retry = useRef<{ amount: number; key: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endpoint = `/api/host/tenants/${tenant.id}`;

  async function saveLimit(event: React.FormEvent) {
    event.preventDefault(); setError(null);
    try {
      const value = hostAgentLimit(/^\d+$/.test(limit) ? Number(limit) : NaN);
      setSavingLimit(true);
      await apiFetch(`${endpoint}/agent-limit`, { method: "PATCH", body: JSON.stringify({ agent_limit: value }) });
      toast.success("Workspace agent limit updated"); onChanged();
    } catch (failure) { setError((failure as Error).message); }
    finally { setSavingLimit(false); }
  }

  async function addCredit(event: React.FormEvent) {
    event.preventDefault(); setError(null); setCrediting(true);
    try {
      const cents = billingUsdToCents(amount, 1);
      if (retry.current?.amount !== cents) retry.current = { amount: cents, key: crypto.randomUUID() };
      await apiFetch<HostCredit>(`${endpoint}/credits`, { method: "POST", body: JSON.stringify({ amount_usd: amount, idempotency_key: retry.current.key }) });
      retry.current = null;
      toast.success("Credit added to workspace balance"); onChanged();
    } catch (failure) { setError((failure as Error).message); }
    finally { setCrediting(false); }
  }

  return <section className="space-y-4 rounded-lg border bg-card p-4">
    <h2 className="font-medium">Workspace controls</h2>
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <form onSubmit={saveLimit} className="space-y-3">
        <Label htmlFor="host-agent-limit">Agent limit</Label>
        <div className="flex gap-2">
          <Input id="host-agent-limit" type="number" min="0" max="1000" step="1" required value={limit} onChange={(event) => setLimit(event.target.value)} disabled={savingLimit || crediting} />
          <Button type="submit" variant="outline" disabled={savingLimit || crediting || limit === String(tenant.agent_limit)}>{savingLimit ? "Saving…" : "Save limit"}</Button>
        </div>
        <p className="text-sm text-muted-foreground">{tenant.agent_count} agents · Limit {tenant.agent_limit}{tenant.pending_agent_count > 0 ? ` · ${tenant.pending_agent_count} reserved creations` : ""}</p>
        <p className="text-xs text-muted-foreground">New workspaces start with a limit of 1. Lowering the limit keeps existing agents and creations already in progress; it blocks further creation until capacity is available.</p>
        {tenant.pending_agent_count > 0 && <p className="text-xs text-muted-foreground">An unconfirmed creation keeps its slot reserved until an operator reviews it.</p>}
      </form>
      <form onSubmit={addCredit} className="space-y-3">
        <Label htmlFor="host-credit-amount">Add credit · USD</Label>
        <div className="flex gap-2">
          <Input id="host-credit-amount" inputMode="decimal" maxLength={8} required value={amount} onChange={(event) => setAmount(event.target.value)} disabled={crediting || savingLimit || tenant.balance_micros === null} />
          <Button type="submit" variant="outline" disabled={crediting || savingLimit || !amount.trim() || tenant.balance_micros === null}>{crediting ? "Adding…" : "Add credit"}</Button>
        </div>
        <p className="text-xs text-muted-foreground">$0.01–$10,000. Added immediately to this workspace’s balance.</p>
      </form>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
