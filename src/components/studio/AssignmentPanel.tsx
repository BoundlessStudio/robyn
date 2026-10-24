"use client";
import { ResearchBrowserButton } from "./ResearchBrowserButton";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, RefreshCw, Square, Send } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { AssetRef } from "@/studio/assets";
import type { AssignmentSummary } from "@/studio/assignments";
import { campaignIsActive } from "@/studio/campaigns";
import { Markdown } from "@/components/Markdown";

type Employee = { id: string; role: string; appId: string | null; ready: boolean };
type PanelMode = "director" | "assignments" | "review";
const active = (job: AssignmentSummary) => ["queued", "running", "cancelling"].includes(job.state) || Boolean(job.campaign && campaignIsActive(job.campaign));
const labels = { queued: "In the queue", running: "At work", cancelling: "Stopping", cancelled: "Cancelled", awaiting_review: "For your review", completed: "Reviewed", failed: "Needs attention" };
const campaignLabels = { planning: "Planning", running: "In production", cancelling: "Stopping", cancelled: "Cancelled", awaiting_review: "For your review", completed: "Reviewed", failed: "Needs attention" };
const campaignNotes = { planning: "Final work returns here for your review.", running: "Final work returns here for your review.", cancelling: "Stopping the remaining work.", cancelled: "This plan was stopped. Delivered files remain in your project.", awaiting_review: "Final work is ready for your review.", completed: "Final work has been reviewed.", failed: "This plan needs attention. Any delivered files remain in your project." };
const stopping = (job: AssignmentSummary) => job.state === "cancelling" || job.campaign?.state === "cancelling";

export function AssignmentPanel({ projectId, mode, preferredAppId, selectedRef, onOpen }: { projectId: string; mode: PanelMode; preferredAppId?: string; selectedRef?: AssetRef; onOpen: (ref: AssetRef) => void }) {
  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [brief, setBrief] = useState("");
  const [includeOpen, setIncludeOpen] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const pendingRequest = useRef<{ signature: string; id: string } | null>(null);
  const reviewRequests = useRef(new Map<string, { signature: string; id: string }>());
  const load = useCallback(async () => {
    const data = await apiFetch<{ assignments: AssignmentSummary[]; employees: Employee[] }>(`/api/studio/assignments?projectId=${projectId}`);
    setAssignments(data.assignments); setEmployees(data.employees); setLoading(false);
  }, [projectId]);
  useEffect(() => {
    let live = true;
    const refresh = () => load().catch(error => { if (live) { setError(error.message); setLoading(false); } });
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 7000);
    return () => { live = false; window.clearInterval(timer); };
  }, [load]);
  const director = employees.find(employee => employee.appId === null);
  const chosen = mode === "director" ? director : employees.find(employee => employee.id === employeeId) ?? employees.find(employee => employee.appId === preferredAppId) ?? director;
  const visible = mode === "review" ? assignments.filter(job => job.state === "awaiting_review") : mode === "director" ? assignments.filter(job => job.appId === null) : assignments;

  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!chosen || !brief.trim()) return;
    const payload = { projectId, employeeId: chosen.id, brief: brief.trim(), inputs: selectedRef && includeOpen ? [selectedRef] : [] };
    const signature = JSON.stringify(payload);
    if (pendingRequest.current?.signature !== signature) pendingRequest.current = { signature, id: crypto.randomUUID() };
    setBusy("new"); setError(""); setNotice("");
    try {
      await apiFetch("/api/studio/assignments", { method: "POST", body: JSON.stringify({ ...payload, requestId: pendingRequest.current.id }) });
      pendingRequest.current = null; setBrief(""); setNotice("Your brief is in the studio."); await load();
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(""); }
  }
  async function action(job: AssignmentSummary, action: "cancel" | "reconnect") {
    setBusy(job.id); setError("");
    try { await apiFetch(`/api/studio/assignments/${job.id}`, { method: "POST", body: JSON.stringify({ action }) }); await load(); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(""); }
  }
  async function review(job: AssignmentSummary, decision: "approved" | "changes_requested") {
    const note = feedback[job.id]?.trim() ?? "";
    const signature = JSON.stringify({ decision, note });
    if (reviewRequests.current.get(job.id)?.signature !== signature) reviewRequests.current.set(job.id, { signature, id: crypto.randomUUID() });
    setBusy(job.id); setError("");
    try {
      await apiFetch(`/api/studio/assignments/${job.id}/review`, { method: "POST", body: JSON.stringify({ requestId: reviewRequests.current.get(job.id)!.id, decision, feedback: note }) });
      setNotice(decision === "approved" ? "Approved. A good place to land." : "Your changes are with the same employee, using these exact revisions."); await load();
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(""); }
  }
  return <div className="assignment-panel">
    <span className="studio-eyebrow">{mode === "review" ? "YOUR EYE. YOUR FINAL SAY." : mode === "director" ? "A CONVERSATION ABOUT POSSIBILITY" : "WORK IN PROGRESS"}</span>
    <h2>{mode === "review" ? <>Take a closer <em>look.</em></> : mode === "director" ? <>A little direction.<br/><em>A world of ideas.</em></> : <>From a thought<br/>to <em>a thing.</em></>}</h2>
    {mode !== "review" && <form className="studio-form assignment-composer" onSubmit={submit}>
      {mode === "assignments" && <label>Who is this for?<select value={chosen?.id ?? ""} onChange={event => setEmployeeId(event.target.value)}>{employees.map(employee => <option key={employee.id} value={employee.id} disabled={!employee.ready}>{employee.role}{employee.ready ? "" : " · being verified"}</option>)}</select></label>}
      <label>{mode === "director" ? "Tell your Director what you have in mind" : "The brief"}<textarea rows={5} maxLength={20000} value={brief} onChange={event => setBrief(event.target.value)} placeholder="What are we making, and what should it feel like?" required/></label>
      {selectedRef && <label className="assignment-input-check"><input type="checkbox" checked={includeOpen} onChange={event => setIncludeOpen(event.target.checked)}/> Include the open saved revision</label>}
      <button className="studio-button primary" disabled={Boolean(busy) || !chosen?.ready || !brief.trim()}><Send size={14}/>{busy === "new" ? "Sending…" : "Send the brief"}</button>
    </form>}
    {mode === "assignments" && chosen?.appId === "research" && <div className="research-assignment-context"><p className="studio-muted">Source-linked research and browser automation. Include the open notebook to continue from that exact saved revision.</p><ResearchBrowserButton/></div>}
    {error && <p className="studio-error" role="alert">{error}</p>}
    {notice && <p className="assignment-notice" role="status">{notice}</p>}
    <div className="assignment-list" aria-live="polite">
      {loading ? <p className="studio-muted">Opening the studio notebook…</p> : !visible.length ? <p className="studio-muted">{mode === "review" ? "Finished work will arrive here. Open each native file, then approve it or send your notes back." : "The next idea starts here. Every assignment keeps its saved inputs and its place in the queue."}</p> : visible.map(job => <article className="assignment-entry" key={job.id}>
        <div className="assignment-caption"><span>{job.role}</span><small data-state={job.campaign?.state ?? job.state}>{job.browserPaused ? "Browser with you" : job.reviewDecision === "changes_requested" ? "Changes requested" : job.reviewDecision === "approved" ? "Approved" : job.campaign ? campaignLabels[job.campaign.state] : job.purpose === "campaign_step" && job.state === "completed" ? "Handed onward" : labels[job.state]}</small></div>
        {mode === "review" || job.brief.length > 300 ? <details className="assignment-brief-details"><summary>Read the brief</summary><Markdown className="assignment-brief" content={job.brief}/></details> : <Markdown className="assignment-brief" content={job.brief}/>}
        {job.browserPaused && <p className="studio-muted">Research is paused while you use its browser. Return control to continue this assignment.</p>}
        {job.recovering && !job.browserPaused && active(job) && <p className="studio-muted">Reconnecting to the same assignment. Your place in the queue is held.</p>}
        {job.campaign && <p className="studio-muted">{job.campaign.finishedSteps} of {job.campaign.steps} specialist tasks delivered. {campaignNotes[job.campaign.state]}</p>}
        {job.result && <details open={mode === "review"}><summary>Employee’s notes</summary><Markdown className="assignment-result" content={job.result.trim()}/></details>}
        {job.deliverables.length > 0 && <ul className="assignment-deliverables">{job.deliverables.map(ref => <li key={ref.revisionId}><button onClick={() => onOpen(ref)}><span>{ref.name}{ref.state === "conflict" && <small>Preserved conflict</small>}</span><ArrowUpRight size={16}/></button></li>)}</ul>}
        {active(job) && <div className="studio-action-row"><button className="studio-button" disabled={Boolean(busy) || stopping(job)} onClick={() => action(job, "cancel")}><Square size={12}/>{stopping(job) ? "Stopping…" : job.campaign ? "Stop this plan" : "Stop assignment"}</button><button className="studio-icon-button" aria-label={`Reconnect ${job.role} assignment`} title="Reconnect assignment" disabled={Boolean(busy)} onClick={() => action(job, "reconnect")}><RefreshCw size={14}/></button></div>}
        {mode === "review" && <div className="assignment-review"><label>Notes for the next pass<textarea rows={3} maxLength={10000} value={feedback[job.id] ?? ""} onChange={event => setFeedback(current => ({ ...current, [job.id]: event.target.value }))} placeholder="Keep this. Push that a little further…"/></label><div className="studio-action-row"><button className="studio-button primary" disabled={Boolean(busy)} onClick={() => review(job, "approved")}><Check size={14}/>Approve</button><button className="studio-button" disabled={Boolean(busy) || !feedback[job.id]?.trim()} onClick={() => review(job, "changes_requested")}>Request changes</button></div></div>}
      </article>)}
    </div>
  </div>;
}
