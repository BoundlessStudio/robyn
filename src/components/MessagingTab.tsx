"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Mail, MessageCircle, Phone, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import type { InkboxIdentityView } from "@/lib/inkbox-types";
import type { MergedAgent, Role } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function MessagingTab({ agentId, agent, role }: {
  agentId: string; agent: MergedAgent; role: Role;
}) {
  const reachable = agent.live_status === "running" || agent.live_status === "sleeping";
  const [view, setView] = useState<InkboxIdentityView | null>(null);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await apiFetch<InkboxIdentityView>(`/api/agents/${agentId}/identity`);
      setView(next);
      setError(null);
    } catch (error) { setError((error as Error).message); }
  }, [agentId]);

  useEffect(() => { setView(null); setError(null); setPhone(""); void load(); }, [load]);
  useEffect(() => { setPhone(view?.identity?.allowedPhone ?? ""); }, [view?.identity?.allowedPhone]);
  const identity = view?.identity;
  const provisioning = identity?.status === "provisioning" && !identity.retryable;
  useEffect(() => {
    if (!provisioning) return;
    const timer = setInterval(() => void load(), 5_000);
    return () => clearInterval(timer);
  }, [provisioning, load]);

  async function enable(updatePhone = false) {
    setBusy(true);
    try {
      await apiFetch(`/api/agents/${agentId}/identity`, {
        method: "POST", body: JSON.stringify(updatePhone ? { phone } : {}),
      });
      toast.success(updatePhone ? "Updating Inkbox phone access" : "Setting up Inkbox identity");
      await load();
    } catch (error) { toast.error((error as Error).message); }
    finally { setBusy(false); }
  }

  const disabled = role !== "admin" || !reachable || busy || !!provisioning || !view?.configured;
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">Messaging</h2>
        <p className="text-sm text-muted-foreground">Manage this agent’s email, iMessage and calls.</p>
      </header>
      <section className="space-y-4 rounded-lg border bg-card p-5" aria-label="Inkbox identity">
        <div className="flex items-center justify-between gap-3">
          <div><h3 className="font-semibold">Email, iMessage &amp; calls</h3><p className="text-xs text-muted-foreground">Powered by Inkbox</p></div>
          {identity && <Badge variant={identity.status === "ready" ? "success" : identity.status === "error" ? "warning" : "muted"}>
            {identity.status === "ready" ? "Enabled" : identity.status === "error" ? "Needs attention" : provisioning ? "Setting up" : "Setup paused"}
          </Badge>}
        </div>
        <p className="text-sm text-muted-foreground">An email inbox, iMessage conversations and calls. Hermes handles messages and receives call transcripts.</p>
        {error && <div className="flex items-center justify-between gap-3">
          <p role="alert" className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={() => load()} aria-label="Refresh Inkbox identity"><RefreshCw className="h-4 w-4" /></Button>
        </div>}
        {!view && !error && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading Inkbox identity" />}
        {view && !view.supported && <p className="text-sm text-muted-foreground">Inkbox connections require a Hermes agent.</p>}
        {view?.supported && <>
          {!view.configured && <p className="text-sm text-muted-foreground">Ask your workspace operator to configure Inkbox before enabling it.</p>}
          {!identity && <>
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="flex items-center gap-2"><Mail className="h-4 w-4" /> Email</span>
              <span className="flex items-center gap-2"><MessageCircle className="h-4 w-4" /> iMessage</span>
              <span className="flex items-center gap-2"><Phone className="h-4 w-4" /> Calls</span>
            </div>
            <p className="text-xs text-muted-foreground">Optional. Uses one identity from your Inkbox plan. The agent restarts once to activate it.</p>
            <Button disabled={disabled} onClick={() => enable()}>{busy ? "Enabling…" : "Enable Inkbox"}</Button>
          </>}
          {!reachable && <p className="text-xs text-muted-foreground">Start this agent to enable or update Inkbox.</p>}
          {identity && <>
            <div className="space-y-1">
              <p className="text-sm font-medium">@{identity.handle}</p>
              {identity.email && <p className="flex items-center gap-2 break-all text-sm"><Mail className="h-4 w-4 shrink-0 text-muted-foreground" /> {identity.email}</p>}
              <p className="text-xs text-muted-foreground">Inbox accepts email from {identity.ownerEmail}.</p>
            </div>
            {provisioning && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {identity.step}</p>}
            {identity.error && <p role="alert" className="text-sm text-destructive">{identity.error}</p>}
            {identity.status !== "ready" && !provisioning && <Button variant="outline" disabled={disabled} onClick={() => enable()}>Retry Inkbox setup</Button>}
            {identity.status === "ready" && <>
              <div className="space-y-2">
                <Label htmlFor={`inkbox-phone-${agentId}`}>Allowed phone number</Label>
                <div className="flex flex-wrap gap-2">
                  <Input id={`inkbox-phone-${agentId}`} type="tel" autoComplete="tel" placeholder="+14165550123" value={phone}
                    disabled={disabled} onChange={(event) => setPhone(event.target.value)} className="max-w-xs" />
                  <Button variant="outline" disabled={disabled || phone === (identity.allowedPhone ?? "")} onClick={() => enable(true)}>Save phone access</Button>
                </div>
                <p className="text-xs text-muted-foreground">Only this number can message or call the agent. Leave blank to close phone access.</p>
              </div>
              {view.connect ? <div className="space-y-3 rounded-md border bg-muted/20 p-3">
                <p className="text-sm font-medium">Connect iMessage and calls</p>
                <p className="text-sm text-muted-foreground">From your allowed phone, send <code className="break-all text-foreground">{view.connect.connect_command}</code> to {view.connect.number}, then open the contact card Inkbox sends you.</p>
                <div className="flex flex-wrap items-center gap-4">
                  <img src={view.connect.connect_qr_png_data_url} alt="Scan to compose your Inkbox connection message" width={144} height={144} className="rounded-md bg-white p-2" />
                  <a href={view.connect.sms_link} className="text-sm font-medium underline underline-offset-4">Open connection message</a>
                </div>
                <p className="text-xs text-muted-foreground">Inkbox uses a shared line and a separate conversation for each identity. Its voice agent answers calls and sends transcripts to Hermes.</p>
              </div> : <p className="text-sm text-muted-foreground">Add your phone number above to connect iMessage and calls.</p>}
            </>}
          </>}
        </>}
      </section>
    </div>
  );
}
