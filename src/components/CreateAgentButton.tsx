"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { AGENT_TYPES } from "@/config/agents";
import { Button } from "@/components/ui/button";
import { useWorkspaceMembers, WorkspaceUserSelect } from "@/components/WorkspaceUserSelect";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const DEFAULT_TEMPLATE =
  AGENT_TYPES.find((a) => a.recommended)?.template ?? AGENT_TYPES[0].template;

export function CreateAgentButton({
  workspaceId,
  onCreated,
}: {
  workspaceId: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [assignedUserId, setAssignedUserId] = useState("");
  const { members, loading, error } = useWorkspaceMembers(workspaceId, open);

  async function create() {
    if (!members.some((member) => member.user_id === assignedUserId)) return;
    setBusy(true);
    try {
      await apiFetch("/api/agents", {
        method: "POST",
        body: JSON.stringify({ workspace_id: workspaceId, template: DEFAULT_TEMPLATE, assigned_user_id: assignedUserId }),
      });
      toast.success("Agent is provisioning");
      setOpen(false);
      setAssignedUserId("");
      onCreated();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Create agent
      </Button>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create agent</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
            <div>
              <p className="font-medium">Hermes</p>
              <p className="mt-1 text-sm text-muted-foreground">Your agent can chat, browse, write code and work with files.</p>
            </div>
            <p className="text-xs text-muted-foreground">You can optionally enable email, iMessage and calls in this agent’s Messaging tab.</p>
          </div>

          <WorkspaceUserSelect id="create-agent-assignee" members={members} value={assignedUserId} onChange={setAssignedUserId} disabled={busy || loading} />
          {loading && <p className="text-sm text-muted-foreground">Loading users…</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={create} disabled={busy || loading || !members.some((member) => member.user_id === assignedUserId)}>
              {busy ? "Creating..." : "Create agent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
