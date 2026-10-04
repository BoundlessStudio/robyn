"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { MAX_BUDGET_REQUEST_NOTE, validateBudgetRequest } from "@/lib/budget-request-input";
import { usd } from "@/lib/format";
import type { BudgetRequest } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function AgentBudgetRequests({ agentId, mode }: { agentId: string; mode: "member" | "admin" }) {
  const [requests, setRequests] = useState<BudgetRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const pending = useRef<{ amount: string; note: string; key: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setLoadError(null);
    apiFetch<{ requests: BudgetRequest[] }>(`/api/agents/${agentId}/budget/requests`)
      .then((result) => { if (!cancelled) setRequests(result.requests); })
      .catch((error) => { if (!cancelled) setLoadError((error as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [agentId, reload]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    setSaveError(null);
    try {
      const trimmedAmount = amount.trim(), trimmedNote = note.trim();
      if (!pending.current || pending.current.amount !== trimmedAmount || pending.current.note !== trimmedNote) {
        pending.current = { amount: trimmedAmount, note: trimmedNote, key: crypto.randomUUID() };
      }
      const body = { amount_usd: trimmedAmount, note: trimmedNote, idempotency_key: pending.current.key };
      validateBudgetRequest(body);
      inFlight.current = true; setBusy(true);
      const result = await apiFetch<BudgetRequest>(`/api/agents/${agentId}/budget/requests`, {
        method: "POST", body: JSON.stringify(body),
      });
      setRequests((current) => [result, ...current.filter((request) => request.id !== result.id)].slice(0, 50));
      setLoadError(null);
      pending.current = null; setAmount(""); setNote(""); setOpen(false);
      toast.success("Extra budget request sent");
    } catch (error) { setSaveError((error as Error).message); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return (
    <div className="space-y-3 border-t pt-5">
      {mode === "admin" ? (
        <div>
          <h3 className="text-sm font-semibold">Extra budget requests</h3>
          <p className="mt-1 text-xs text-muted-foreground">Review recent member requests, then add extra budget above.</p>
        </div>
      ) : (
        <Dialog open={open} onOpenChange={(next) => { if (!inFlight.current) { setOpen(next); setSaveError(null); } }}>
          <DialogTrigger asChild><Button variant="outline" size="sm" disabled={loading}>Request Extra budget</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request Extra budget</DialogTitle>
              <DialogDescription>Ask a workspace admin for an extra managed-services allowance for this agent.</DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={submit}>
              <div className="space-y-2">
                <Label htmlFor="request-budget-amount">Amount (USD)</Label>
                <Input id="request-budget-amount" inputMode="decimal" maxLength={32} value={amount} disabled={busy}
                  placeholder="Amount" onChange={(event) => setAmount(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="request-budget-note">Note (optional)</Label>
                <textarea id="request-budget-note" value={note} disabled={busy} maxLength={MAX_BUDGET_REQUEST_NOTE} rows={3}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="What do you need the extra budget for?" onChange={(event) => setNote(event.target.value)} />
              </div>
              {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
                <Button type="submit" disabled={busy || !amount.trim()}>{busy ? "Sending…" : "Send request"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
      {loading ? <p role="status" className="text-xs text-muted-foreground">Loading requests…</p> : loadError ? (
        <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{loadError}</p>
          <Button variant="outline" size="sm" onClick={() => setReload((value) => value + 1)}>Retry requests</Button></div>
      ) : mode === "member" ? (
        requests[0] && <p className="text-xs text-muted-foreground">Last request: {usd(requests[0].amount_micros)} · {requestDate(requests[0].created_at)}</p>
      ) : requests.length ? (
        <ul className="max-h-96 space-y-3 overflow-y-auto" aria-label="Extra budget requests">
          {requests.map((request) => (
            <li key={request.id} className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <span className="min-w-0 break-words font-medium">{request.requester_name}</span>
                <span className="font-semibold tabular-nums">{usd(request.amount_micros)}</span>
              </div>
              <p className="text-xs text-muted-foreground"><time dateTime={request.created_at}>{requestDate(request.created_at)}</time></p>
              {request.note && <p className="whitespace-pre-wrap break-words text-sm">{request.note}</p>}
            </li>
          ))}
        </ul>
      ) : <p className="text-xs text-muted-foreground">No extra budget requests yet.</p>}
    </div>
  );
}

function requestDate(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
