"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { AGENT_ICONS, validateAgentProfile } from "@/lib/agent-profile-input";
import { SOUL_MAX_BYTES, validateSoulWrite, type SoulDocument } from "@/lib/soul-input";
import type { MergedAgent, Role } from "@/lib/types";
import { AgentIcon } from "@/components/AgentIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { cn } from "@/lib/utils";

export function IdentityTab({ agentId, agent, role, onChanged }: {
  agentId: string; agent: MergedAgent; role: Role; onChanged: () => void;
}) {
  const canManage = role === "admin" || role === "member";
  const [name, setName] = useState(agent.name ?? "");
  const [icon, setIcon] = useState<string | null>(agent.icon);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [document, setDocument] = useState<SoulDocument | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingSoul, setSavingSoul] = useState(false);
  const [soulError, setSoulError] = useState<string | null>(null);
  const [confirmReload, setConfirmReload] = useState(false);
  const hermes = agent.template?.startsWith("agent37-hermes") ?? false;
  const available = ["running", "sleeping"].includes(agent.live_status ?? "");
  const dirty = document !== null && draft !== document.content;
  const bytes = new TextEncoder().encode(draft).length;

  const loadSoul = useCallback(async () => {
    setLoading(true); setSoulError(null);
    try {
      const result = await apiFetch<SoulDocument>(`/api/agents/${agentId}/soul`);
      setDocument(result); setDraft(result.content);
    } catch (error) { setSoulError((error as Error).message); }
    finally { setLoading(false); }
  }, [agentId]);

  useEffect(() => { if (hermes && available) void loadSoul(); }, [hermes, available, loadSoul]);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault(); setSavingProfile(true); setProfileError(null);
    try {
      const changes: Record<string, unknown> = {};
      if (name.trim() !== (agent.name ?? "")) changes.name = name;
      if (icon !== agent.icon) changes.icon = icon;
      const patch = validateAgentProfile(changes);
      await apiFetch(`/api/agents/${agentId}`, { method: "PATCH", body: JSON.stringify(patch) });
      setName(name.trim()); toast.success("Agent identity saved"); onChanged();
    } catch (error) { setProfileError((error as Error).message); }
    finally { setSavingProfile(false); }
  }

  async function saveSoul(event: React.FormEvent) {
    event.preventDefault(); if (!document) return;
    setSavingSoul(true); setSoulError(null);
    try {
      const body = validateSoulWrite({ content: draft, revision: document.revision });
      const result = await apiFetch<SoulDocument>(`/api/agents/${agentId}/soul`, { method: "PUT", body: JSON.stringify(body) });
      setDocument(result); setDraft(result.content); toast.success("SOUL.md saved");
    } catch (error) { setSoulError((error as Error).message); }
    finally { setSavingSoul(false); }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1"><h1 className="text-lg font-semibold">Identity</h1><p className="text-sm text-muted-foreground">Give your agent a name, a look and a voice.</p></header>
      <section className="space-y-4 rounded-lg border bg-card p-5">
        <div className="flex items-center gap-3"><AgentIcon icon={icon} className="h-12 w-12" /><div><h2 className="font-semibold">Name &amp; icon</h2><p className="text-sm text-muted-foreground">How this agent appears across Robyn.</p></div></div>
        <form onSubmit={saveProfile} className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="identity-name">Agent name</Label><Input id="identity-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="Untitled agent" disabled={!canManage || savingProfile} /></div>
          <fieldset disabled={!canManage || savingProfile} className="space-y-2">
            <legend className="text-sm font-medium">Icon</legend>
            <div className="flex flex-wrap gap-2">
              {AGENT_ICONS.map((option) => <button key={option.id} type="button" aria-label={`${option.label} icon`} title={option.label} aria-pressed={(icon ?? "bot") === option.id}
                onClick={() => setIcon(option.id)} className={cn("rounded-md border p-1.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50", (icon ?? "bot") === option.id && "border-foreground ring-1 ring-foreground")}>
                <AgentIcon icon={option.id} className="h-8 w-8 bg-transparent" />
              </button>)}
            </div>
          </fieldset>
          {profileError && <p role="alert" className="text-sm text-destructive">{profileError}</p>}
          <Button type="submit" size="sm" disabled={!canManage || savingProfile || (name.trim() === (agent.name ?? "") && icon === agent.icon)}><Save />{savingProfile ? "Saving…" : "Save name & icon"}</Button>
        </form>
      </section>
      <section className="space-y-4 rounded-lg border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1"><h2 className="font-semibold">Personality · SOUL.md</h2><p className="text-sm text-muted-foreground">Your agent’s lasting voice, values and way of working.</p></div>
          {hermes && <Button variant="outline" size="sm" aria-label="Reload SOUL.md" disabled={!available || loading || savingSoul} onClick={() => dirty ? setConfirmReload(true) : void loadSoul()}><RefreshCw className={loading ? "animate-spin" : undefined} /></Button>}
        </div>
        {!hermes ? <p className="text-sm text-muted-foreground">SOUL.md is available on Hermes agents.</p> : !available ? <p className="text-sm text-muted-foreground">Start this agent in Settings to read or edit its SOUL.md. You can still change its name and icon.</p> : (
          <>
            {loading && !document && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading SOUL.md…</div>}
            {document && <form onSubmit={saveSoul} className="space-y-3">
              <div className="space-y-1.5"><Label htmlFor="identity-soul">SOUL.md</Label><textarea id="identity-soul" value={draft} onChange={(event) => setDraft(event.target.value)} disabled={!canManage || savingSoul || loading}
                spellCheck={false} className="min-h-80 w-full resize-y rounded-md border border-input bg-background p-3 font-mono text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                placeholder={"# Identity\nDescribe who this agent is, its tone, values and communication style."} /></div>
              <div className="flex flex-wrap items-start justify-between gap-2 text-xs text-muted-foreground"><p className="max-w-lg">Write in Markdown. Changes shape future conversations; start a new chat to hear the new voice. An empty SOUL uses Hermes’ default personality.</p><span className={cn("shrink-0", bytes > SOUL_MAX_BYTES && "text-destructive")}>{Math.ceil(bytes / 1024)} / 64 KB</span></div>
              <Button type="submit" size="sm" disabled={!canManage || !dirty || savingSoul || loading || bytes > SOUL_MAX_BYTES}><Save />{savingSoul ? "Saving…" : "Save SOUL.md"}</Button>
            </form>}
            {soulError && <p role="alert" className="whitespace-pre-wrap text-sm text-destructive">{soulError}</p>}
          </>
        )}
      </section>
      <ConfirmDialog open={confirmReload} onOpenChange={setConfirmReload} title="Reload SOUL.md?" description="Discard your unsaved draft and load the agent’s current SOUL.md?" confirmText="Reload SOUL.md" onConfirm={loadSoul} />
    </div>
  );
}
