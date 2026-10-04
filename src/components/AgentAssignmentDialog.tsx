"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import type { MergedAgent } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useWorkspaceMembers, WorkspaceUserSelect } from "@/components/WorkspaceUserSelect";

// Mounted only while the admin opens Assignment, so fleet rows do not fetch the roster.
export function AgentAssignmentDialog({ agent, onClose, onChanged, onReturnFocus }: {
  agent: MergedAgent; onClose: () => void; onChanged: () => void; onReturnFocus: () => void;
}) {
  const selectId = useId();
  const { members, loading, error, reload } = useWorkspaceMembers(agent.workspace_id);
  const [assignedUserId, setAssignedUserId] = useState(agent.assigned_user_id ?? "");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const valid = members.some((member) => member.user_id === assignedUserId);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || loading || error || !valid || assignedUserId === agent.assigned_user_id) return;
    inFlight.current = true; setBusy(true); setSaveError(null);
    try {
      await apiFetch(`/api/agents/${agent.agent37_id}/assignment`, {
        method: "PATCH", body: JSON.stringify({ assigned_user_id: assignedUserId }),
      });
      toast.success("Assignment updated");
      onChanged(); onClose();
    } catch (cause) {
      setSaveError((cause as Error).message);
    } finally { inFlight.current = false; setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !inFlight.current) onClose(); }}>
      <DialogContent onCloseAutoFocus={(event) => { event.preventDefault(); onReturnFocus(); }}>
        <DialogHeader>
          <DialogTitle>Assignment</DialogTitle>
          <DialogDescription>The assigned user has full access to {agent.name?.trim() || "this agent"}. Workspace admins can always access it.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={save}>
          <WorkspaceUserSelect id={selectId} members={members} value={assignedUserId}
            onChange={(value) => { setAssignedUserId(value); setSaveError(null); }} disabled={busy || loading || !!error} />
          {loading && <p role="status" className="text-sm text-muted-foreground">Loading users…</p>}
          {error && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{error}</p><Button type="button" variant="outline" size="sm" onClick={reload}>Retry users</Button></div>}
          {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy || loading || !!error || !valid || assignedUserId === agent.assigned_user_id}>{busy ? "Saving…" : "Save assignment"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
