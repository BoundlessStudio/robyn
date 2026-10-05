"use client";

import { useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { hostAgentLimit } from "@/lib/agent-capacity-input";
import type { HostCoupon, HostTenantSummary } from "@/lib/host-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function HostWorkspaceControls({ tenant, coupon, onCoupon, onChanged }: {
  tenant: HostTenantSummary;
  coupon: HostCoupon | null;
  onCoupon: (coupon: HostCoupon) => void;
  onChanged: () => void;
}) {
  const [limit, setLimit] = useState(String(tenant.agent_limit));
  const [amount, setAmount] = useState("25.00");
  const [savingLimit, setSavingLimit] = useState(false);
  const [issuing, setIssuing] = useState(false);
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

  async function issueCoupon(event: React.FormEvent) {
    event.preventDefault(); setError(null); setIssuing(true);
    try {
      onCoupon(await apiFetch<HostCoupon>(`${endpoint}/coupons`, { method: "POST", body: JSON.stringify({ amount_usd: amount }) }));
      toast.success("Workspace coupon created");
    } catch (failure) { setError((failure as Error).message); }
    finally { setIssuing(false); }
  }

  return <section className="space-y-4 rounded-lg border bg-card p-4">
    <h2 className="font-medium">Workspace controls</h2>
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <form onSubmit={saveLimit} className="space-y-3">
        <Label htmlFor="host-agent-limit">Agent limit</Label>
        <div className="flex gap-2">
          <Input id="host-agent-limit" type="number" min="0" max="1000" step="1" required value={limit} onChange={(event) => setLimit(event.target.value)} disabled={savingLimit} />
          <Button type="submit" variant="outline" disabled={savingLimit || limit === String(tenant.agent_limit)}>{savingLimit ? "Saving…" : "Save limit"}</Button>
        </div>
        <p className="text-sm text-muted-foreground">{tenant.agent_count} agents · Limit {tenant.agent_limit}{tenant.pending_agent_count > 0 ? ` · ${tenant.pending_agent_count} reserved creations` : ""}</p>
        <p className="text-xs text-muted-foreground">New workspaces start with a limit of 1. Lowering the limit keeps existing agents and creations already in progress; it blocks further creation until capacity is available.</p>
        {tenant.pending_agent_count > 0 && <p className="text-xs text-muted-foreground">An unconfirmed creation keeps its slot reserved until an operator reviews it.</p>}
      </form>
      <div className="space-y-4">
        <form onSubmit={issueCoupon} className="space-y-3">
          <Label htmlFor="host-coupon-amount">Coupon credit · USD</Label>
          <div className="flex gap-2">
            <Input id="host-coupon-amount" inputMode="decimal" maxLength={8} required value={amount} onChange={(event) => setAmount(event.target.value)} disabled={issuing} />
            <Button type="submit" variant="outline" disabled={issuing || !amount.trim()}>{issuing ? "Creating…" : "Create coupon"}</Button>
          </div>
          <p className="text-xs text-muted-foreground">$0.01–$10,000. Redeemable once by an admin of this workspace, within 30 days. Credit is added when redeemed.</p>
        </form>
        {coupon?.workspace_id === tenant.id && <div className="space-y-2 rounded-md border bg-muted/30 p-3" role="status">
          <p className="text-sm font-medium">Coupon created</p>
          <p className="break-all font-mono text-sm" data-testid="host-coupon-code">{coupon.code}</p>
          <p className="text-xs text-muted-foreground">${(coupon.amount_micros / 1_000_000).toFixed(2)} credit · Expires {new Date(coupon.expires_at).toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Copy this code before leaving, then share it with the workspace admin to redeem in Billing.</p>
          <Button variant="outline" size="sm" onClick={async () => {
            try { await navigator.clipboard.writeText(coupon.code); toast.success("Coupon copied"); }
            catch { toast.error("Select and copy the code above."); }
          }}>Copy code</Button>
        </div>}
      </div>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
