"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock3, History, Loader2, Pause, Pencil, Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { cronChanges, cronSkipReason, validateCronInput } from "@/lib/cron-input";
import type { AgentCron, CronInput, CronRun, MergedAgent, Role } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function dateTime(seconds: number | null, zone: string): string {
  if (seconds === null) return "Never";
  try { return new Intl.DateTimeFormat(undefined, { timeZone: zone, dateStyle: "medium", timeStyle: "short" }).format(new Date(seconds * 1000)); }
  catch { return new Date(seconds * 1000).toISOString(); }
}

export function ScheduleTab({ agentId, agent, role, onOpenSession }: {
  agentId: string; agent: MergedAgent; role: Role; onOpenSession: (sessionId: string) => void;
}) {
  const [jobs, setJobs] = useState<AgentCron[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ job: AgentCron | null } | null>(null);
  const [deleting, setDeleting] = useState<AgentCron | null>(null);
  const [history, setHistory] = useState<AgentCron | null>(null);
  const isAdmin = role === "admin";
  const base = `/api/agents/${agentId}/crons`;

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const result = await apiFetch<{ data: AgentCron[] }>(`/api/agents/${agentId}/crons`);
      setJobs(result.data);
      setError(null);
    } catch (error) { setError((error as Error).message); }
    finally { if (!quiet) setRefreshing(false); }
  }, [agentId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(true), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  async function action(job: AgentCron, runNow = false) {
    setBusy(job.id);
    try {
      if (runNow) {
        const run = await apiFetch<CronRun>(`${base}/${job.id}/run`, { method: "POST" });
        if (run.status === "skipped") toast.info(`Run skipped: ${cronSkipReason(run.reason)}`);
        else toast.success("Run requested. Open its conversation to see the result.");
        setHistory(job);
      } else {
        await apiFetch(`${base}/${job.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !job.enabled }) });
        toast.success(job.enabled ? "Schedule paused" : "Schedule resumed");
      }
      await load(true);
    } catch (error) { toast.error((error as Error).message); }
    finally { setBusy(null); }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Schedule</h2>
          <p className="text-sm text-muted-foreground">Set recurring instructions for this agent. Each run opens its own conversation.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={refreshing} onClick={() => load()} aria-label="Refresh schedules"><RefreshCw className={refreshing ? "animate-spin" : undefined} /></Button>
          <Button size="sm" disabled={!isAdmin || jobs === null || jobs.length >= 50} onClick={() => setEditor({ job: null })}><Plus /> Add schedule</Button>
        </div>
      </header>
      <p className="text-xs text-muted-foreground">Schedules can wake sleeping agents. Runs use the agent’s normal compute and model budget.</p>
      {agent.live_status === "stopped" && <p className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">This agent is stopped. Scheduled runs will be skipped until you start it.</p>}
      {error && <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
      {jobs === null ? (!error && <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading schedules" /></div>) : jobs.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Clock3 className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
          <p className="font-medium">No schedules yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Add a daily briefing, a weekly review or another recurring task.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{jobs.length} / 50 schedules · Includes schedules created by the agent</p>
          {jobs.map((job) => (
            <article key={job.id} aria-label={job.name || "Untitled schedule"} className="space-y-4 rounded-lg border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold">{job.name || "Untitled schedule"}</h3>
                <Badge variant={job.enabled ? "success" : "secondary"}>{job.enabled ? "Active" : "Paused"}</Badge>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{job.prompt}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <code className="rounded bg-muted px-2 py-1">{job.schedule}</code>
                <span className="text-muted-foreground">{job.timezone}</span>
              </div>
              <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <div><dt className="font-medium text-foreground">Next scheduled run</dt><dd>{job.next_run === null ? "Paused" : dateTime(job.next_run, job.timezone)}</dd></div>
                <div><dt className="font-medium text-foreground">Last scheduled run</dt><dd>{dateTime(job.last_run, job.timezone)}</dd></div>
              </dl>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={!isAdmin || !!busy} onClick={() => action(job, true)}><Play /> Run now</Button>
                <Button size="sm" variant="outline" disabled={!isAdmin || !!busy} onClick={() => action(job)}>{job.enabled ? <Pause /> : <Play />}{job.enabled ? "Pause" : "Resume"}</Button>
                <Button size="sm" variant="outline" disabled={!isAdmin || !!busy} onClick={() => setEditor({ job })}><Pencil /> Edit</Button>
                <Button size="sm" variant="outline" onClick={() => setHistory(job)}><History /> History</Button>
                <Button size="sm" variant="ghost" disabled={!isAdmin || !!busy} onClick={() => setDeleting(job)} aria-label={`Delete ${job.name || "schedule"}`}><Trash2 /></Button>
                {busy === job.id && <Loader2 className="h-4 w-4 self-center animate-spin text-muted-foreground" />}
              </div>
            </article>
          ))}
        </div>
      )}
      {editor && <ScheduleEditor agentId={agentId} job={editor.job} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); void load(true); }} />}
      {history && <RunHistory agentId={agentId} job={jobs?.find((job) => job.id === history.id) ?? history} onClose={() => setHistory(null)} onOpenSession={(sessionId) => { setHistory(null); onOpenSession(sessionId); }} />}
      <ConfirmDialog open={!!deleting} onOpenChange={(open) => { if (!open) setDeleting(null); }} title="Delete schedule?"
        description={`Delete ${deleting?.name || "this schedule"}? Future runs will stop. Existing conversations will remain.`} confirmText="Delete schedule" destructive
        onConfirm={async () => { if (!deleting) return; await apiFetch(`${base}/${deleting.id}`, { method: "DELETE" }); await load(true); toast.success("Schedule deleted"); }} />
    </div>
  );
}

type Frequency = "daily" | "weekdays" | "weekly" | "hourly" | "custom";
const fieldClass = "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50";

function preset(schedule: string): { frequency: Frequency; time: string; day: string } {
  const [minute, hour, date, month, day] = schedule.split(/\s+/);
  if (schedule === "0 * * * *") return { frequency: "hourly", time: "09:00", day: "1" };
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && date === "*" && month === "*") {
    const time = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
    if (day === "*") return { frequency: "daily", time, day: "1" };
    if (day === "1-5") return { frequency: "weekdays", time, day: "1" };
    if (/^[0-6]$/.test(day)) return { frequency: "weekly", time, day };
  }
  return { frequency: "custom", time: "09:00", day: "1" };
}

function ScheduleEditor({ agentId, job, onClose, onSaved }: {
  agentId: string; job: AgentCron | null; onClose: () => void; onSaved: () => void;
}) {
  const initial = preset(job?.schedule ?? "0 9 * * 1-5");
  const [name, setName] = useState(job?.name ?? "");
  const [prompt, setPrompt] = useState(job?.prompt ?? "");
  const [frequency, setFrequency] = useState<Frequency>(initial.frequency);
  const [time, setTime] = useState(initial.time);
  const [day, setDay] = useState(initial.day);
  const [custom, setCustom] = useState(job?.schedule ?? "0 9 * * 1-5");
  const [timezone, setTimezone] = useState(job?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC");
  const [enabled, setEnabled] = useState(job?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hour, minute] = time.split(":").map(Number);
  const schedule = frequency === "custom" ? custom : frequency === "hourly" ? "0 * * * *"
    : `${minute} ${hour} * * ${frequency === "weekdays" ? "1-5" : frequency === "weekly" ? day : "*"}`;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true); setError(null);
    try {
      const input = validateCronInput({ name, prompt, schedule, timezone, enabled }) as CronInput;
      const body = job ? cronChanges(job, input) : input;
      if (job && Object.keys(body).length === 0) { onClose(); return; }
      await apiFetch(`/api/agents/${agentId}/crons${job ? `/${job.id}` : ""}`, { method: job ? "PATCH" : "POST", body: JSON.stringify(body) });
      toast.success(job ? "Schedule updated" : "Schedule added"); onSaved();
    } catch (error) { setError((error as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{job ? "Edit schedule" : "Add schedule"}</DialogTitle><DialogDescription>Tell the agent what to do and when to do it.</DialogDescription></DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="schedule-name">Name (optional)</Label><Input id="schedule-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Weekday briefing" disabled={saving} /></div>
          <div className="space-y-1.5"><Label htmlFor="schedule-prompt">Instructions</Label><textarea id="schedule-prompt" className={`${fieldClass} h-auto min-h-28 py-2`} value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={8000} required placeholder="Review my calendar and summarize today’s agenda." disabled={saving} /></div>
          <div className="space-y-1.5"><Label htmlFor="schedule-frequency">Repeat</Label><select id="schedule-frequency" className={fieldClass} value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} disabled={saving}>
            <option value="weekdays">Weekdays</option><option value="daily">Every day</option><option value="weekly">Every week</option><option value="hourly">Every hour</option><option value="custom">Custom cron expression</option>
          </select></div>
          {frequency === "custom" ? <div className="space-y-1.5"><Label htmlFor="schedule-expression">Cron expression</Label><Input id="schedule-expression" value={custom} onChange={(e) => setCustom(e.target.value)} required placeholder="0 9 * * 1-5" disabled={saving} /><p className="text-xs text-muted-foreground">Five fields: minute, hour, day, month, weekday. For every 15 minutes: */15 * * * *</p></div> : frequency !== "hourly" && (
            <div className="flex gap-3">
              <div className="flex-1 space-y-1.5"><Label htmlFor="schedule-time">Time</Label><Input id="schedule-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} required disabled={saving} /></div>
              {frequency === "weekly" && <div className="flex-1 space-y-1.5"><Label htmlFor="schedule-day">Day</Label><select id="schedule-day" className={fieldClass} value={day} onChange={(e) => setDay(e.target.value)} disabled={saving}>
                {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((label, index) => <option key={label} value={index}>{label}</option>)}
              </select></div>}
            </div>
          )}
          <div className="space-y-1.5"><Label htmlFor="schedule-timezone">Timezone</Label><Input id="schedule-timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} required placeholder="America/Toronto" disabled={saving} /><p className="text-xs text-muted-foreground">Times follow this timezone, including daylight saving changes.</p></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={saving} /> Schedule enabled</label>
          {frequency !== "custom" && <p className="text-xs text-muted-foreground">Cron expression: <code>{schedule}</code></p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : job ? "Save changes" : "Add schedule"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RunHistory({ agentId, job, onClose, onOpenSession }: {
  agentId: string; job: AgentCron; onClose: () => void; onOpenSession: (sessionId: string) => void;
}) {
  const [runs, setRuns] = useState<CronRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { const result = await apiFetch<{ data: CronRun[] }>(`/api/agents/${agentId}/crons/${job.id}/runs`); setRuns(result.data); setError(null); }
    catch (error) { setError((error as Error).message); }
  }, [agentId, job.id]);
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 10_000); return () => clearInterval(timer); }, [load]);
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Run history</DialogTitle><DialogDescription>{job.name || "Untitled schedule"} · {job.timezone}. Triggered runs may still be in progress; open their conversation for the reply or errors.</DialogDescription></DialogHeader>
        <Button variant="outline" size="sm" className="justify-self-start" onClick={() => load()}><RefreshCw /> Refresh history</Button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {runs === null ? (!error && <Loader2 className="h-4 w-4 animate-spin" />) : runs.length === 0 ? <p className="py-4 text-sm text-muted-foreground">No runs yet.</p> : <div className="divide-y rounded-md border">
          {runs.map((run) => <div key={run.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="space-y-1"><p className="text-sm">{dateTime(run.ran_at, job.timezone)}</p><div className="flex flex-wrap items-center gap-2"><Badge variant={run.status === "skipped" ? "warning" : "secondary"}>{run.status === "skipped" ? "Skipped" : "Triggered"}</Badge>{run.reason && <span className="text-xs text-muted-foreground">{cronSkipReason(run.reason)}</span>}</div></div>
            {run.session_id && run.status === "triggered" && <Button variant="outline" size="sm" onClick={() => onOpenSession(run.session_id!)}>View conversation</Button>}
          </div>)}
        </div>}
      </DialogContent>
    </Dialog>
  );
}
