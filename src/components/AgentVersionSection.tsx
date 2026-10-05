"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, Loader2, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { isTransitional } from "@/lib/format";
import type { AgentVersionStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export function AgentVersionSection({
  agentId, liveStatus, updateAvailable, canManage, busy, onBusyChange, onChanged,
}: {
  agentId: string;
  liveStatus: string | null;
  updateAvailable: boolean;
  canManage: boolean;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onChanged?: () => void;
}) {
  const [info, setInfo] = useState<AgentVersionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [confirmUpgrade, setConfirmUpgrade] = useState(false);
  const [waitingForReady, setWaitingForReady] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null);
  const deadline = useRef(0);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; onBusyChange(false); };
  }, [onBusyChange]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    function finish(message: string, ready = false) {
      setWaitingForReady(false);
      setUpgradeMessage(message);
      onBusyChange(false);
      onChanged?.();
      if (ready) toast.success(message);
    }

    async function check() {
      try {
        const next = await apiFetch<AgentVersionStatus>(`/api/agents/${agentId}/version`, {
          cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
        });
        if (cancelled) return;
        setInfo(next);
        setError(null);
        if (waitingForReady) {
          // A running container (or gateway ok:true) is not proof that the agent is ready.
          if (next.status === "running" && next.healthy === true && next.gateway) {
            finish("Agent upgraded and ready", true);
            return;
          }
          if (["stopped", "failed", "deleted"].includes(next.status)) {
            finish(`Upgrade requested. Agent is ${next.status}; check its status before continuing.`);
            return;
          }
        }
      } catch (e) {
        if (cancelled) return;
        setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
      if (waitingForReady && !cancelled) {
        if (Date.now() >= deadline.current) {
          finish("Upgrade requested, but agent readiness could not be confirmed yet. Check again shortly.");
        } else {
          timer = setTimeout(check, 5000);
        }
      }
    }

    void check();
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
  }, [agentId, liveStatus, retry, waitingForReady, onBusyChange, onChanged]);

  async function upgrade() {
    onBusyChange(true);
    setUpgradeMessage(null);
    try {
      const result = await apiFetch<{ status: string }>(`/api/agents/${agentId}/update`, { method: "POST" });
      if (!mounted.current) return;
      setInfo(null);
      setRetry((value) => value + 1);
      if (result.status === "stopped") {
        setUpgradeMessage("Upgrade installed. The agent will use it the next time it starts.");
        toast.success("Upgrade installed; agent remains stopped");
        onBusyChange(false);
      } else {
        deadline.current = Date.now() + 120_000;
        setWaitingForReady(true);
      }
      onChanged?.();
    } catch (e) {
      if (mounted.current) onBusyChange(false);
      throw e;
    }
  }

  const status = info?.status ?? liveStatus;
  const transitioning = [liveStatus, status].some((value) =>
    isTransitional(value) || ["waking", "stopping"].includes(value ?? "")
  );

  return (
    <section className="rounded-lg border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Agent version</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">The gateway version installed on this agent.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={loading || busy} onClick={() => {
            setUpgradeMessage(null);
            setRetry((value) => value + 1);
            onChanged?.();
          }}>
            <RotateCw className="mr-2 h-4 w-4" />Check version
          </Button>
          {canManage && (updateAvailable || waitingForReady) && (
            <Button size="sm" disabled={busy || transitioning} onClick={() => setConfirmUpgrade(true)}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowDownToLine className="mr-2 h-4 w-4" />}
              {waitingForReady ? "Waiting for agent..." : "Upgrade agent"}
            </Button>
          )}
        </div>
      </div>
      <div className="mt-4 space-y-2" aria-live="polite">
        {waitingForReady && <p className="text-sm text-muted-foreground">Upgrade in progress. Waiting for the agent to be ready...</p>}
        {upgradeMessage && <p className="text-sm">{upgradeMessage}</p>}
        {loading && !info && <p className="text-sm text-muted-foreground">Checking version...</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {info?.gateway && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm">{info.gateway.version}</span>
            {info.healthy !== null && <Badge variant={info.healthy ? "success" : "warning"}>{info.healthy ? "Ready" : "Not ready"}</Badge>}
          </div>
        )}
        {info?.version_error && <p role="alert" className="text-sm text-destructive">{info.version_error}</p>}
        {info?.health_error && <p role="alert" className="text-sm text-destructive">{info.health_error}</p>}
        {info && info.status !== "running" && (
          <p className="text-sm text-muted-foreground">Version can be checked when the agent is running. Current status: {info.status}.</p>
        )}
        {updateAvailable && !waitingForReady && <p className="text-sm text-muted-foreground">A newer agent image is available.</p>}
      </div>
      <ConfirmDialog
        open={confirmUpgrade}
        onOpenChange={setConfirmUpgrade}
        title="Upgrade agent?"
        description="This installs the latest image for the agent's configured template. A running or sleeping agent will restart, interrupting active work. Files in /home/node and /home/linuxbrew are kept; operating system changes outside those folders are reset. A stopped agent stays stopped."
        confirmText="Upgrade agent"
        onConfirm={upgrade}
      />
    </section>
  );
}
