"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, CreditCard, Gift, Loader2, RefreshCw, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { apiFetch } from "@/lib/api";
import { autoTopUpInput, billingUsdToCents, type BillingSummary } from "@/lib/billing-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const usd = (micros: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(micros / 1_000_000);

export function BillingView() {
  const { current, workspaces, setCurrentId, ready } = useWorkspace();
  const [returnReady, setReturnReady] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const target = new URLSearchParams(window.location.search).get("workspace");
    if (target && workspaces.some((workspace) => workspace.id === target && workspace.role === "admin")) setCurrentId(target);
    setReturnReady(true);
  }, [ready, workspaces, setCurrentId]);
  if (!returnReady) return <p className="text-sm text-muted-foreground">Loading billing…</p>;
  if (!current) return <p className="text-sm text-muted-foreground">No workspace selected.</p>;
  if (current.role !== "admin") return <p className="text-sm text-muted-foreground">Workspace billing is available to admins.</p>;
  return <WorkspaceBilling key={current.id} workspaceId={current.id} workspaceName={current.name} />;
}

export function WorkspaceBilling({ workspaceId, workspaceName }: { workspaceId: string; workspaceName: string }) {
  const endpoint = `/api/workspaces/${workspaceId}/billing`;
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<"funds" | "auto" | null>(null);
  const [amount, setAmount] = useState("25");
  const [refill, setRefill] = useState("25");
  const [threshold, setThreshold] = useState("12.50");
  const [coupon, setCoupon] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const active = useRef(true);
  const retry = useRef<{ input: string; key: string } | null>(null);
  const returnedSession = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<BillingSummary>(endpoint);
      if (active.current) { setBilling(data); setError(null); }
    } catch (error) { if (active.current) setError((error as Error).message); }
  }, [endpoint]);

  useEffect(() => {
    active.current = true;
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 30_000);
    return () => { active.current = false; window.clearInterval(timer); };
  }, [refresh]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const session = params.get("session_id");
    if (!session || params.get("workspace") !== workspaceId || returnedSession.current === session) return;
    returnedSession.current = session;
    setConfirming(true);
    void apiFetch<{ complete: boolean }>(endpoint, { method: "POST", body: JSON.stringify({ action: "confirm", session_id: session }) })
      .then(async ({ complete }) => {
        if (!active.current) return;
        toast.success(complete ? "Billing updated" : "Your payment is processing. Your balance will update when it completes.");
        window.history.replaceState(null, "", "/dashboard/billing");
        await refresh();
      })
      .catch((error: Error) => { if (active.current) { returnedSession.current = null; setError(error.message); } })
      .finally(() => { if (active.current) setConfirming(false); });
  }, [endpoint, refresh, workspaceId]);

  function openDialog(next: "funds" | "auto") {
    setFormError(null);
    if (next === "auto" && billing) {
      setRefill(String(billing.automatic_top_up.amount_micros / 1_000_000));
      setThreshold(String(billing.automatic_top_up.threshold_micros / 1_000_000));
    }
    setDialog(next);
  }

  async function checkout(setup = false) {
    setFormError(null);
    setBusy(true);
    try {
      if (!setup) billingUsdToCents(amount);
      const input = `${setup ? "setup" : "funds"}:${amount}`;
      if (retry.current?.input !== input) retry.current = { input, key: crypto.randomUUID() };
      const { url } = await apiFetch<{ url: string }>(endpoint, { method: "POST", body: JSON.stringify({ action: setup ? "payment_method" : "checkout", amount_usd: amount, idempotency_key: retry.current.key }) });
      if (active.current) window.location.assign(url);
    } catch (error) { if (active.current) { setFormError((error as Error).message); if (setup) toast.error((error as Error).message); } }
    finally { if (active.current) setBusy(false); }
  }

  async function saveAuto(enabled: boolean) {
    setFormError(null);
    setBusy(true);
    try {
      const body = { enabled, amount_usd: refill, threshold_usd: threshold };
      autoTopUpInput(body);
      const updated = await apiFetch<BillingSummary>(endpoint, { method: "PATCH", body: JSON.stringify(body) });
      if (active.current) { setBilling(updated); setDialog(null); toast.success(enabled ? "Automatic top-up enabled" : "Automatic top-up turned off"); }
    } catch (error) { if (active.current) { setFormError((error as Error).message); if (!enabled) toast.error((error as Error).message); } }
    finally { if (active.current) setBusy(false); }
  }

  async function redeem() {
    setBusy(true);
    try {
      const updated = await apiFetch<BillingSummary>(endpoint, { method: "POST", body: JSON.stringify({ action: "coupon", code: coupon.trim() }) });
      if (active.current) { setBilling(updated); setCoupon(""); toast.success("Coupon credit added to your balance"); }
    } catch (error) { if (active.current) toast.error((error as Error).message); }
    finally { if (active.current) setBusy(false); }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">Prepaid balance for {workspaceName}</p>
      </div>
      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 p-4 text-sm"><span>{error}</span><Button variant="outline" size="sm" onClick={refresh}>Try again</Button></div>}
      {confirming && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Confirming your payment…</p>}
      {!billing ? !error && <p className="text-sm text-muted-foreground">Loading billing…</p> : <>
        {!billing.payments_available && <p role="status" className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">Card payments are not available yet. You can still redeem a coupon to add credit.</p>}
        <section aria-label="Workspace billing" className="overflow-hidden rounded-xl border bg-card">
          <div className="flex flex-col justify-between gap-6 p-6 sm:flex-row sm:items-center">
            <div>
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><Wallet className="h-4 w-4" />Balance</p>
              <p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums" aria-live="polite">{usd(billing.balance_micros)}</p>
              <p className="mt-3 text-sm text-muted-foreground">Pay as you go. Your agents spend from this balance.</p>
              {billing.balance_micros <= 0 && <p className="mt-2 text-sm text-muted-foreground">Add funds or redeem a coupon to run your agents.</p>}
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <Button onClick={() => openDialog("funds")} disabled={busy || confirming || !billing.payments_available}><Wallet className="mr-2 h-4 w-4" />Add funds</Button>
              <span className="text-xs text-muted-foreground">One-time payment · USD</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t px-6 py-5">
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              <div><h2 className="text-sm font-medium">Payment method</h2><p className="mt-1 text-sm text-muted-foreground">{billing.payment_method ? `${billing.payment_method.brand.toUpperCase()} •••• ${billing.payment_method.last4} · Expires ${String(billing.payment_method.exp_month).padStart(2, "0")}/${billing.payment_method.exp_year}` : "No payment method added"}</p></div>
            </div>
            <Button variant="outline" size="sm" onClick={() => checkout(true)} disabled={busy || confirming || !billing.payments_available}>{billing.payment_method ? "Update card" : "Add payment method"}<ArrowUpRight className="ml-2 h-3.5 w-3.5" /></Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t px-6 py-5">
            <div className="flex items-start gap-3">
              <RefreshCw className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <div>
                <div className="flex items-center gap-2"><h2 id="auto-top-up-label" className="text-sm font-medium">Automatic top-up</h2><span className={`rounded-full px-2 py-0.5 text-xs ${billing.automatic_top_up.enabled ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-secondary text-muted-foreground"}`}>{billing.automatic_top_up.enabled ? "On" : "Off"}</span></div>
                <p className="mt-1 max-w-xl text-sm text-muted-foreground">{billing.automatic_top_up.enabled ? `Add ${usd(billing.automatic_top_up.amount_micros)} when your balance falls below ${usd(billing.automatic_top_up.threshold_micros)}.` : "Keep your agents running by automatically adding funds when your balance runs low."}</p>
                {billing.automatic_top_up.error && <p role="alert" className="mt-2 max-w-xl text-sm text-destructive">{billing.automatic_top_up.error}</p>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {billing.automatic_top_up.enabled && <Button variant="ghost" size="sm" onClick={() => openDialog("auto")} disabled={busy}>Edit</Button>}
              <button type="button" role="switch" aria-checked={billing.automatic_top_up.enabled} aria-labelledby="auto-top-up-label" disabled={busy || confirming || (!billing.automatic_top_up.enabled && (!billing.payments_available || !billing.payment_method))} onClick={() => billing.automatic_top_up.enabled ? saveAuto(false) : openDialog("auto")} className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${billing.automatic_top_up.enabled ? "bg-primary" : "bg-input"}`}><span className={`mt-0.5 h-5 w-5 rounded-full bg-background shadow-sm transition-transform ${billing.automatic_top_up.enabled ? "translate-x-5" : "translate-x-0.5"}`} /></button>
            </div>
          </div>
        </section>
        <section aria-labelledby="coupon-title" className="rounded-xl border bg-card p-6">
          <div className="flex items-center gap-2"><Gift className="h-4 w-4 text-muted-foreground" /><h2 id="coupon-title" className="text-sm font-medium">Redeem a coupon</h2></div>
          <p className="mt-2 text-sm text-muted-foreground">Have a credit code? Add it directly to your workspace balance.</p>
          <form className="mt-4 flex max-w-md flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void redeem(); }}>
            <Label htmlFor="billing-coupon" className="sr-only">Coupon code</Label>
            <Input id="billing-coupon" placeholder="Enter coupon code" autoComplete="off" maxLength={64} value={coupon} onChange={(event) => setCoupon(event.target.value)} disabled={busy} />
            <Button type="submit" variant="outline" disabled={busy || !coupon.trim()}>Redeem code</Button>
          </form>
        </section>
      </>}
      <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open && !busy) setDialog(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dialog === "auto" ? "Automatic top-up" : "Add funds"}</DialogTitle><DialogDescription>{dialog === "auto" ? "Choose when to refill your balance and how much to add." : "Buy prepaid credit for your workspace. Your card will be saved for future payments."}</DialogDescription></DialogHeader>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void (dialog === "auto" ? saveAuto(true) : checkout()); }}>
            {dialog === "auto" ? <>
              <div className="space-y-2"><Label htmlFor="billing-threshold">When the balance falls below (USD)</Label><Input id="billing-threshold" inputMode="decimal" value={threshold} onChange={(event) => setThreshold(event.target.value)} disabled={busy} /></div>
              <div className="space-y-2"><Label htmlFor="billing-refill">Add this amount (USD)</Label><Input id="billing-refill" inputMode="decimal" value={refill} onChange={(event) => setRefill(event.target.value)} disabled={busy} /></div>
              <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">By enabling automatic top-up, you authorize us to charge your saved card for this amount each time your balance falls below the threshold. You can turn it off at any time.</p>
            </> : <>
              <div className="space-y-2"><Label htmlFor="billing-amount">Amount (USD)</Label><Input id="billing-amount" autoFocus inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={busy} /><p className="text-xs text-muted-foreground">Minimum $5 · Maximum $10,000</p></div>
              <div className="flex gap-2">{[10, 25, 50, 100].map((value) => <Button key={value} type="button" variant={amount === String(value) ? "secondary" : "outline"} size="sm" onClick={() => setAmount(String(value))} disabled={busy}>${value}</Button>)}</div>
              <p className="text-sm text-muted-foreground">Credit is added after payment is confirmed. Automatic top-up is managed separately in Billing.</p>
            </>}
            {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
            <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{dialog === "auto" ? "Enable automatic top-up" : "Continue to payment"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
