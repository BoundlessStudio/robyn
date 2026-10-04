"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { agentTabPath } from "@/lib/dashboard-tabs";
import type { MergedAgent } from "@/lib/types";
import { AgentIcon } from "@/components/AgentIcon";
import { Badge } from "@/components/ui/badge";
import { statusVariant } from "@/lib/format";

export function MemberAgentSelection({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [agents, setAgents] = useState<MergedAgent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await apiFetch<{ agents: MergedAgent[] }>(`/api/agents?workspace=${workspaceId}`);
        if (cancelled) return;
        setError(null);
        setAgents(data.agents);
        if (data.agents.length === 1) router.replace(agentTabPath(data.agents[0].agent37_id, "chat"));
      } catch (error) {
        if (!cancelled) setError((error as Error).message);
      }
    }
    load();
    const timer = setInterval(load, 15_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [workspaceId, router]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Your agents</h1>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : !agents || agents.length === 1 ? (
        <p className="text-sm text-muted-foreground">Opening your agent…</p>
      ) : agents.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No agents are assigned to you yet. Your workspace admin can assign one to you.
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Select an agent to get started.</p>
          {agents.map((agent) => (
            <Link key={agent.agent37_id} href={agentTabPath(agent.agent37_id, "chat")}
              className="flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent">
              <AgentIcon icon={agent.icon} />
              <span className="min-w-0 flex-1 truncate font-medium">{agent.name?.trim() || agent.agent37_id}</span>
              <Badge variant={statusVariant(agent.live_status)}>{agent.live_status ?? "unknown"}</Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
