"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { WorkspaceMember } from "@/lib/types";
import { Label } from "@/components/ui/label";

export function useWorkspaceMembers(workspaceId: string, enabled = true) {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setMembers([]);
    setError(null);
    apiFetch<{ members: WorkspaceMember[] }>(`/api/workspaces/${workspaceId}/members`)
      .then((data) => { if (!cancelled) setMembers(data.members); })
      .catch((error) => { if (!cancelled) setError((error as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId, enabled]);
  return { members, loading, error };
}

export function WorkspaceUserSelect({ id, members, value, onChange, disabled }: {
  id: string;
  members: WorkspaceMember[];
  value: string;
  onChange: (userId: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Assigned user</Label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} required
        className="h-10 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-50">
        <option value="" disabled>Select a user</option>
        {members.map((member) => <option key={member.user_id} value={member.user_id}>
          {member.name ? `${member.name} (${member.email})` : member.email}
        </option>)}
      </select>
    </div>
  );
}
