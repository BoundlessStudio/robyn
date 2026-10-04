"use client";

import Link from "next/link";
import type { MergedAgent } from "@/lib/types";
import { AgentIcon } from "@/components/AgentIcon";

export function AgentNameCell({ agent, href }: { agent: MergedAgent; href: string }) {
  const name = agent.name?.trim() || "Untitled agent";
  return (
    <div className="w-64">
      <div className="flex items-center gap-1.5">
        <AgentIcon icon={agent.icon} />
        <Link href={href} title={name} className={`min-w-0 truncate hover:underline ${
          agent.name?.trim() ? "font-medium" : "italic text-muted-foreground"
        }`}>
          {name}
        </Link>
      </div>
      <div className="truncate font-mono text-xs text-muted-foreground" title={agent.agent37_id}>
        {agent.agent37_id}
      </div>
    </div>
  );
}
