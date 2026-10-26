"use client";
import { ResearchBrowserButton } from "./ResearchBrowserButton";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, RefreshCw, Square, Send } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { AssetRef } from "@/studio/assets";
import type { AssignmentSummary } from "@/studio/assignments";
import { campaignIsActive } from "@/studio/campaigns";
import { Markdown } from "@/components/Markdown";
import { acknowledgeAssignmentDraft, emptyAssignmentDraft, readAssignmentDraft, saveAssignmentDraft, type AssignmentDraft } from "@/studio/assignment-draft";
import { readReviewDrafts, saveReviewDrafts, type ReviewDrafts, type ReviewDecision } from "@/studio/review-draft";
import type { StartMode } from "@/studio/start-mode";

type Employee = { id: string; role: string; appId: string | null; ready: boolean };
type PanelMode = "director" | "assignments" | "review";
const active = (job: AssignmentSummary) => ["queued", "running", "cancelling"].includes(job.state) || Boolean(job.campaign && campaignIsActive(job.campaign));
const labels = { queued: "In the queue", running: "At work", cancelling: "Stopping", cancelled: "Cancelled", awaiting_review: "For your review", completed: "Reviewed", failed: "Needs attention" };
const campaignLabels = { planning: "Planning", running: "In production", cancelling: "Stopping", cancelled: "Cancelled", awaiting_review: "For your review", completed: "Reviewed", failed: "Needs attention" };
const campaignNotes = { planning: "Final work returns here for your review.", running: "Final work returns here for your review.", cancelling: "Stopping the remaining work.", cancelled: "This plan was stopped. Delivered files remain in your project.", awaiting_review: "Final work is ready for your review.", completed: "Final work has been reviewed.", failed: "This plan needs attention. Any delivered files remain in your project." };
const stopping = (job: AssignmentSummary) => job.state === "cancelling" || job.campaign?.state === "cancelling";

type PanelProps = { projectId: string; mode: PanelMode; canvas?: boolean; preferredAppId?: string; selectedRef?: AssetRef; onOpen: (ref: AssetRef) => void };
export function AssignmentPanel(props: PanelProps) {
  return <AssignmentComposer key={`${props.projectId}:${props.mode}`} {...props}/>;
}

function AssignmentComposer({ projectId, mode, canvas=false, preferredAppId, selectedRef, onOpen }: PanelProps) {
  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [draft, setDraft] = useState<AssignmentDraft>(emptyAssignmentDraft);
  const [draftReady, setDraftReady] = useState(false);
  const { brief, employeeId, includeOpen, pending } = draft;
  const [capacity,setCapacity]=useState<{availableMicros:number;reason:string|null}|null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<ReviewDrafts>({});
  const [reviewsReady, setReviewsReady] = useState(false);
  const submitting = useRef(false);
  const reviewing = useRef(false);
  const ideaInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    try { setDraft(readAssignmentDraft(localStorage, projectId, mode)); setDraftReady(true); }
    catch { setError("Your saved brief could not be read. Restore access to this browser’s storage and reload before sending work."); }
  }, [projectId, mode]);
  useEffect(() => {
    if (mode !== "review") return;
    try { setReviews(readReviewDrafts(localStorage, projectId)); setReviewsReady(true); }
    catch { setError("Your saved review could not be read. Restore browser storage and reload before submitting a review."); }
  }, [projectId, mode]);
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
  const chosen = pending ? employees.find(employee => employee.id === pending.employeeId) : mode === "director" ? director : employees.find(employee => employee.id === employeeId) ?? employees.find(employee => employee.appId === preferredAppId) ?? director;
  const chosenId=chosen?.id;
  useEffect(()=>{
    if(!chosenId)return;let live=true;setCapacity(null);
    const refresh=()=>apiFetch<{availableMicros:number;reason:string|null}>(`/api/studio/budgets/${chosenId}`).then(value=>{if(live)setCapacity(value);}).catch(()=>{if(live)setCapacity({availableMicros:0,reason:"The employee’s allowance could not be checked."});});
    void refresh();const timer=window.setInterval(()=>void refresh(),15000);return()=>{live=false;window.clearInterval(timer);};
  },[chosenId]);
  const visible = mode === "review" ? assignments.filter(job => job.state === "awaiting_review") : mode === "director" ? assignments.filter(job => job.appId === null) : assignments;

  function updateDraft(next: AssignmentDraft) {
    setDraft(next);
    try { saveAssignmentDraft(localStorage, projectId, mode, next); }
    catch { setError("Your draft could not be saved in this browser. Sending will wait until it can be saved for recovery."); }
  }
  function newBrief() {
    const next = { ...draft, brief: "", pending: null };
    try { saveAssignmentDraft(localStorage, projectId, mode, next); setDraft(next); setError(""); setNotice(""); }
    catch { setError("The previous request is still saved. Restore browser storage before starting a different brief."); }
  }
  async function submit(event: React.FormEvent, startMode:StartMode=canvas?"draft":"work") {
    event.preventDefault(); if (submitting.current || !draftReady) return;
    submitting.current = true;
    setBusy("new"); setError(""); setNotice("");
    try {
      // Read again in case another mounted panel already saved this request.
      const saved = readAssignmentDraft(localStorage, projectId, mode);
      if (!saved.pending && !pending && (!chosen?.ready || !brief.trim() || !capacity?.availableMicros)) return;
      const request = saved.pending ?? pending ?? { projectId, employeeId: chosen!.id, brief: brief.trim(), inputs: selectedRef && includeOpen ? [{ ...selectedRef }] : [], requestId: crypto.randomUUID(), startMode };
      const frozen = { ...draft, brief: request.brief, employeeId: request.employeeId, pending: request };
      // A storage failure stops BEFORE POST: no request can lose its identity.
      saveAssignmentDraft(localStorage, projectId, mode, frozen);
      setDraft(frozen);
      const result = await apiFetch<{ assignmentId: string }>("/api/studio/assignments", { method: "POST", body: JSON.stringify(request) });
      if (!result.assignmentId) throw new Error("The acknowledgement was incomplete. Reconnect this same brief.");
      const cleared = acknowledgeAssignmentDraft(localStorage, projectId, mode, request.requestId);
      setDraft(cleared); setNotice(request.startMode==="plan"?"Your Director is exploring the idea. Production is paused until you ask for a first draft.":request.startMode==="draft"?"Your Director is taking it from here. Saved work will appear below and in your library.":"Your brief is in the studio."); await load();
    } catch (error) { setError((error as Error).message); }
    finally { submitting.current = false; setBusy(""); }
  }
  async function action(job: AssignmentSummary, action: "cancel" | "reconnect") {
    setBusy(job.id); setError("");
    try { await apiFetch(`/api/studio/assignments/${job.id}`, { method: "POST", body: JSON.stringify({ action }) }); await load(); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(""); }
  }
  function editReview(jobId: string, feedback: string) {
    try {
      const saved = readReviewDrafts(localStorage, projectId);
      if (saved[jobId]?.pending) { setReviews(saved); return; }
      const next = { ...saved, [jobId]: { feedback, pending: null } };
      setReviews(next); saveReviewDrafts(localStorage, projectId, next);
    }
    catch { setError("Your notes could not be saved. Restore browser storage before sending this review."); }
  }
  async function review(job: AssignmentSummary, decision: ReviewDecision) {
    if (reviewing.current || !reviewsReady) return;
    reviewing.current = true;
    setBusy(job.id); setError("");
    try {
      const saved = readReviewDrafts(localStorage, projectId);
      const request = saved[job.id]?.pending ?? { requestId: crypto.randomUUID(), decision, feedback: reviews[job.id]?.feedback.trim() ?? "" };
      if (request.decision !== decision) throw Error("Reconnect the saved review before making a different decision.");
      const frozen = { ...saved, [job.id]: { feedback: request.feedback, pending: request } };
      saveReviewDrafts(localStorage, projectId, frozen); setReviews(frozen);
      await apiFetch(`/api/studio/assignments/${job.id}/review`, { method: "POST", body: JSON.stringify(request) });
      const current = readReviewDrafts(localStorage, projectId);
      if (current[job.id]?.pending?.requestId === request.requestId) { delete current[job.id]; saveReviewDrafts(localStorage, projectId, current); setReviews(current); }
      setNotice(decision === "approved" ? "Approved. A good place to land." : "Your changes are with the same employee, using these exact revisions."); await load();
    } catch (error) { setError((error as Error).message); }
    finally { reviewing.current = false; setBusy(""); }
  }
  return <div className="assignment-panel">
    <span className="studio-eyebrow">{canvas?"DESCRIBE AN IDEA":mode === "review" ? "YOUR EYE. YOUR FINAL SAY." : mode === "director" ? "A CONVERSATION ABOUT POSSIBILITY" : "WORK IN PROGRESS"}</span>
    <h2>{canvas?<>What would you like<br/>to <em>make?</em></>:mode === "review" ? <>Take a closer <em>look.</em></> : mode === "director" ? <>A little direction.<br/><em>A world of ideas.</em></> : <>From a thought<br/>to <em>a thing.</em></>}</h2>
    {canvas&&<p className="studio-muted">Describe the result you want. Your Director chooses the Crafts, coordinates the work and brings back an editable first draft.</p>}
    {mode !== "review" && <form className="studio-form assignment-composer" onSubmit={event=>void submit(event)}>
      {mode === "assignments" && <label>Who is this for?<select value={chosen?.id ?? ""} disabled={!draftReady || Boolean(pending) || Boolean(busy)} onChange={event => updateDraft({ ...draft, employeeId: event.target.value })}>{employees.map(employee => <option key={employee.id} value={employee.id} disabled={!employee.ready}>{employee.role}{employee.ready ? "" : " · being verified"}</option>)}</select></label>}
      <label>{canvas?"Your idea":mode === "director" ? "Tell your Director what you have in mind" : "The brief"}<textarea ref={ideaInput} aria-label={canvas?"Your idea":mode==="director"?"Tell your Director what you have in mind":"The brief"} rows={5} maxLength={20000} value={brief} disabled={!draftReady} readOnly={Boolean(pending) || Boolean(busy)} onChange={event => updateDraft({ ...draft, brief: event.target.value })} placeholder={canvas?"A welcoming one-page guide for people visiting our community garden…":"What are we making, and what should it feel like?"} required/></label>
      {pending ? pending.inputs.map(ref => <button key={ref.revisionId} type="button" className="studio-button" onClick={() => onOpen(ref)}>Open included revision <ArrowUpRight size={14}/></button>) : selectedRef && <label className="assignment-input-check"><input type="checkbox" checked={includeOpen} disabled={!draftReady || Boolean(busy)} onChange={event => updateDraft({ ...draft, includeOpen: event.target.checked })}/> Include the open saved revision</label>}
      {pending && <p role="status" className="studio-muted">This brief may already be underway. Reconnect to the same request with its original employee and saved inputs.</p>}
      {capacity&&!capacity.availableMicros&&<p role="status" className="studio-note">{capacity.reason} <a href="/dashboard/settings#studio-budget" target="_blank" rel="noreferrer">Manage budget ↗</a></p>}
      {canvas&&<div className="canvas-allowance" role="status"><strong>{capacity?.availableMicros?`${new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}).format(capacity.availableMicros/1_000_000)} available to your Director`:capacity?"AI allowance needed":"Checking AI allowance…"}</strong><p>Planning uses the Director’s allowance. A first draft also uses the chosen specialists’ allowances. Work pauses when an allowance runs out.</p><a href="/dashboard/settings#studio-budget" target="_blank" rel="noreferrer">View and manage AI allowances ↗</a></div>}
      <div className="studio-action-row"><button className="studio-button primary" disabled={Boolean(busy) || !draftReady || (!pending && (!chosen?.ready || !brief.trim() || !capacity?.availableMicros))}><Send size={14}/>{busy === "new" ? "Sending…" : pending ? "Reconnect this brief" : canvas?"Make a first draft":"Send the brief"}</button>
      {canvas&&!pending&&<button type="button" className="studio-button" disabled={Boolean(busy)||!draftReady||!chosen?.ready||!brief.trim()||!capacity?.availableMicros} onClick={event=>void submit(event,"plan")}>Help me plan</button>}</div>
      {canvas&&pending&&<p className="studio-muted">Saved choice: {pending.startMode==="plan"?"Help me plan":pending.startMode==="draft"?"Make a first draft":"Send the brief"}.</p>}
      {pending && <div className="studio-muted"><p>Starting a different brief creates separate work. It does not stop the previous request.</p><button type="button" className="studio-button" disabled={Boolean(busy)} onClick={newBrief}>Start a different brief</button></div>}
    </form>}
    {mode === "assignments" && chosen?.appId === "research" && <div className="research-assignment-context"><p className="studio-muted">Source-linked research and browser automation. Include the open notebook to continue from that exact saved revision.</p><ResearchBrowserButton/></div>}
    {error && <p className="studio-error" role="alert">{error}</p>}
    {notice && <p className="assignment-notice" role="status">{notice}</p>}
    <div className="assignment-list" aria-live="polite">
      {loading ? <p className="studio-muted">Opening the studio notebook…</p> : !visible.length ? <p className="studio-muted">{mode === "review" ? "Finished work will arrive here. Open each native file, then approve it or send your notes back." : "The next idea starts here. Every assignment keeps its saved inputs and its place in the queue."}</p> : visible.map(job => <article className="assignment-entry" key={job.id}>
        <div className="assignment-caption"><span>{job.role}</span><small data-state={job.campaign?.state ?? job.state}>{job.browserPaused ? "Browser with you" : job.reviewDecision === "changes_requested" ? "Changes requested" : job.reviewDecision === "approved" ? "Approved" : job.campaign ? campaignLabels[job.campaign.state] : job.purpose === "campaign_step" && job.state === "completed" ? "Handed onward" : labels[job.state]}</small></div>
        {mode === "review" || job.brief.length > 300 ? <details className="assignment-brief-details"><summary>Read the brief</summary><Markdown className="assignment-brief" content={job.brief}/></details> : <Markdown className="assignment-brief" content={job.brief}/>}
        {job.browserPaused && <p className="studio-muted">Research is paused while you use its browser. Return control to continue this assignment.</p>}
        {job.errorCode==="employee_budget_required"&&<p role="status" className="studio-note">Waiting for AI allowance. Your brief, saved work, and progress are preserved. <a href="/dashboard/settings#studio-budget" target="_blank" rel="noreferrer">Manage budget ↗</a></p>}
        {job.recovering && !job.browserPaused && active(job) && <p className="studio-muted">Reconnecting to the same assignment. Your place in the queue is held.</p>}
        {job.campaign && <p className="studio-muted">{job.campaign.finishedSteps} of {job.campaign.steps} specialist tasks delivered. {campaignNotes[job.campaign.state]}</p>}
        {job.result && <details open={canvas||mode === "review"}><summary>{job.startMode==="plan"?"Your Director’s plan":"Employee’s notes"}</summary><Markdown className="assignment-result" content={job.result.trim()}/></details>}
        {canvas&&job.startMode==="plan"&&job.result&&!active(job)&&<button className="studio-button" disabled={Boolean(pending)||Boolean(busy)||!draftReady} onClick={()=>{updateDraft({...draft,brief:`Make a first draft from this direction.\n\nOriginal idea: ${job.brief}\n\nDirector’s proposed direction:\n${job.result}`.slice(0,20000)});ideaInput.current?.focus();}}>Use this plan for a first draft</button>}
        {job.deliverables.length > 0 && <ul className="assignment-deliverables">{job.deliverables.map(ref => <li key={ref.revisionId}><button onClick={() => onOpen(ref)}><span>{ref.name}{ref.state === "conflict" && <small>Preserved conflict</small>}</span><ArrowUpRight size={16}/></button></li>)}</ul>}
        {active(job) && <div className="studio-action-row"><button className="studio-button" disabled={Boolean(busy) || stopping(job)} onClick={() => action(job, "cancel")}><Square size={12}/>{stopping(job) ? "Stopping…" : job.campaign ? "Stop this plan" : "Stop assignment"}</button><button className="studio-icon-button" aria-label={`Reconnect ${job.role} assignment`} title="Reconnect assignment" disabled={Boolean(busy)} onClick={() => action(job, "reconnect")}><RefreshCw size={14}/></button></div>}
        {mode === "review" && <div className="assignment-review"><label>Notes for the next pass<textarea rows={3} maxLength={10000} disabled={!reviewsReady} readOnly={Boolean(busy) || Boolean(reviews[job.id]?.pending)} value={reviews[job.id]?.feedback ?? ""} onChange={event => editReview(job.id,event.target.value)} placeholder="Keep this. Push that a little further…"/></label><div className="studio-action-row">{reviews[job.id]?.pending ? <><p className="studio-muted">This review may already be saved. Reconnect the same decision and notes.</p><button className="studio-button" disabled={Boolean(busy) || !reviewsReady} onClick={() => review(job,reviews[job.id].pending!.decision)}>Reconnect review</button></> : <><button className="studio-button primary" disabled={Boolean(busy) || !reviewsReady} onClick={() => review(job, "approved")}><Check size={14}/>Approve</button><button className="studio-button" disabled={Boolean(busy) || !reviewsReady || !reviews[job.id]?.feedback.trim()} onClick={() => review(job, "changes_requested")}>Request changes</button></>}</div></div>}
      </article>)}
    </div>
  </div>;
}
