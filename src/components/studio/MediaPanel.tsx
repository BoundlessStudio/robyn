"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, readApiError } from "@/lib/api";
import type { AssetRef, AssetSummary } from "@/studio/assets";
import { generationServices, type MediaDiscovery, type publicMediaJob } from "@/studio/media";
import { mediaStatusMessage } from "@/studio/media-status";
import { generationPrice, generationReadiness } from "@/studio/media-readiness";
import { StudioDialog } from "./StudioDialog";

type Job = ReturnType<typeof publicMediaJob>;
interface SearchResult extends MediaDiscovery { id: string; license: string; licenseUrl: string; attribution: string }
interface Budget { availableMicros: number|null;reason:string|null }
const dollars = (micros: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 6 }).format(micros / 1_000_000);
const active = (job: Job) => !["completed", "failed", "cancelled", "uncertain"].includes(job.state);

export function MediaPanel({ projectId, assets, close, onSaved, onOpen }: { projectId: string; assets: AssetSummary[]; close: () => void; onSaved: () => Promise<unknown>; onOpen: (ref: AssetRef) => Promise<void> }) {
  const [tab, setTab] = useState<"stock" | "generate">("stock");
  const [kind, setKind] = useState("image"), [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]), [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [searched, setSearched] = useState(false);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [workstationAvailable, setWorkstationAvailable] = useState(false);
  const [service, setService] = useState<string>(generationServices[0].id), [name, setName] = useState(""), [prompt, setPrompt] = useState("");
  const [seconds, setSeconds] = useState("5"), [aspect, setAspect] = useState("16:9"), [model, setModel] = useState(""), [source, setSource] = useState("");
  const selectedSettings: Record<string, string | number> = service === "treza-video" ? { seconds: Number(seconds), aspectRatio: aspect, ...(model ? { model } : {}) } : service === "blockrun-image-gen" && model ? { model } : {};
  const quote = generationPrice({service,prompt,settings:selectedSettings});
  const readiness = generationReadiness({service,settings:selectedSettings});
  const estimate=quote.reservationMicros;
  const canGenerate=budget?.availableMicros!==null&&budget?.availableMicros!==undefined&&budget.availableMicros>=estimate;
  const pendingKey = `robyn-media-pending:${projectId}`;
  const [pending, setPending] = useState<Record<string, unknown> | null>(() => {
    try { const value = JSON.parse(localStorage.getItem(pendingKey) ?? "null"); return value?.projectId === projectId && typeof value.operationId === "string" ? value : null; } catch { return null; }
  });
  const seen = useRef(new Set<string>());
  const jobPages=useRef(1);const [jobCursor,setJobCursor]=useState<string|null>(null);
  const [searchPage,setSearchPage]=useState(1),[searchSignature,setSearchSignature]=useState("");
  const reload = useCallback(async () => {
    const collected:Job[]=[];let cursor:string|null=null;let data!:{jobs:Job[];budget:Budget;providers:{perflo:{configured:boolean}};nextCursor:string|null};
    for(let page=0;page<jobPages.current;page++){data=await apiFetch(`/api/studio/media/jobs?projectId=${projectId}${cursor?`&cursor=${encodeURIComponent(cursor)}`:""}`);collected.push(...data.jobs);cursor=data.nextCursor;if(!cursor)break;}
    data.jobs=[...new Map(collected.map(job=>[job.id,job])).values()];setJobCursor(cursor);
    setJobs(data.jobs); setBudget(data.budget); setWorkstationAvailable(data.providers.perflo.configured);
    let changed = false;
    for (const job of data.jobs) if (job.state === "completed" && !seen.current.has(job.id)) { seen.current.add(job.id); changed = true; }
    if (changed) await onSaved();
  }, [projectId, onSaved]);
  useEffect(() => { let live = true; void reload().catch(error => { if (live) setError(error.message); }); const timer = window.setInterval(() => { void reload().catch(() => {}); }, 5000); return () => { live = false; window.clearInterval(timer); }; }, [reload]);
  async function search(event?: React.FormEvent, page=1) {
    event?.preventDefault(); setBusy(true); setError(""); setResults([]); setSearched(false);
    try { const data = await apiFetch<{ results: SearchResult[] }>("/api/studio/media/search", { method: "POST", body: JSON.stringify({ projectId, kind, query, page }) }); setResults(data.results);setSearchPage(page);setSearchSignature(JSON.stringify({kind,query})); setSearched(true); }
    catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  async function submit(request: Record<string, unknown>) {
    setBusy(true); setError(""); setPending(request);
    try { localStorage.setItem(pendingKey, JSON.stringify(request)); }
    catch {
      // Sending without durable identity would make a lost acknowledgement
      // impossible to retry safely after a reload.
      setError("This browser could not save the request identity, so no additional request was sent. Allow site storage and retry, or reconnect an existing job below.");
      setBusy(false); return;
    }
    try {
      const response=await fetch("/api/studio/media/jobs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(request)});
      if(!response.ok){
        const message=await readApiError(response,"The media request could not be accepted.");
        if([400,401,403,404,409].includes(response.status)){setPending(null);try{localStorage.removeItem(pendingKey);}catch{}setError(message);return;}
        throw new Error(message);
      }
      setPending(null); try { localStorage.removeItem(pendingKey); } catch {} await reload();
    }
    catch (error) { setError(`${(error as Error).message} Use Retry saved request to reconnect this operation before starting another.`); }
    finally { setBusy(false); }
  }
  function importResult(result: SearchResult) {
    void submit({ projectId, operationId: crypto.randomUUID(), operation: "import", provider: "commons", discoveryId: result.id, kind: result.kind === "music" || result.kind === "sound_effect" ? "audio" : result.kind, name: result.title });
  }
  async function generate(event: React.FormEvent) {
    event.preventDefault();
    if (!readiness.available) { setError(readiness.explanation); return; }
    const settings = service === "treza-video" ? { seconds: Number(seconds), aspectRatio: aspect, ...(model ? { model } : {}) } : service === "blockrun-image-gen" && model ? { model } : {};
    const asset = assets.find(asset => asset.id === source);
    await submit({ projectId, operationId: crypto.randomUUID(), operation: "generate", name, service, prompt, settings, inputs: service === "blockrun-image-edit" && asset?.current_revision_id ? [{ assetId: asset.id, revisionId: asset.current_revision_id }] : [] });
  }
  async function reconnect(job: Job, action = "reconnect") {
    setError(""); setBusy(true);
    try { await apiFetch(`/api/studio/media/jobs/${job.id}`, { method: "POST", body: JSON.stringify({ projectId, action }) }); await reload(); }
    catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  return <StudioDialog title="Find the missing piece." eyebrow="PROJECT MEDIA" close={close}>
    <div className="media-panel">
      <div className="media-tabs" role="group" aria-label="Media sources"><button className="studio-button" aria-pressed={tab === "stock"} onClick={() => setTab("stock")}>Stock library</button><button className="studio-button" aria-pressed={tab === "generate"} onClick={() => setTab("generate")}>Generate</button></div>
      {error && <p className="studio-error" role="alert">{error}</p>}
      {budget && !workstationAvailable && <p className="studio-note">Connect the studio workstation to acquire or generate media. Commons search remains available.</p>}
      {pending && <button className="studio-button" disabled={busy} onClick={() => void submit(pending)}>Retry saved request</button>}
      {tab === "stock" ? <><p>Images, recordings, and footage from <a href="https://commons.wikimedia.org/" target="_blank" rel="noreferrer">Wikimedia Commons</a>. Results use CC0 or CC BY; source credit is saved with acquired files.</p>
        <form className="studio-form media-search" onSubmit={search}><label>Media type<select value={kind} onChange={event => setKind(event.target.value)}><option value="image">Images</option><option value="video">Video</option><option value="music">Music recordings</option><option value="sound_effect">Sounds</option></select></label><label>Search<input required maxLength={100} value={query} onChange={event => setQuery(event.target.value)} placeholder="Ocean, birds, piano…"/></label><button className="studio-button primary" disabled={busy || Boolean(pending)}>{busy ? "Searching…" : "Search Commons"}</button></form>
        <div className="media-results">{results.map(result => <article key={result.id}>{result.previewUrl && <img src={result.previewUrl} alt="" loading="lazy"/>}<h3>{result.title}</h3><p>{result.creator || "Creator on source page"} · {result.license.toUpperCase()}</p><a href={result.sourceUrl} target="_blank" rel="noreferrer">Source & license ↗</a><button className="studio-button" disabled={busy || Boolean(pending)||!workstationAvailable} onClick={() => importResult(result)}>Acquire for project</button></article>)}</div>
        {searched && !results.length && <p className="studio-note">No supported CC0 or CC BY files matched this page of results. Try another search.</p>}
      </> : <form className="studio-form" onSubmit={generate}><p>Generate through Perflo on your studio workstation. Image, speech and video each have a recorded acquisition; not every model, size, voice or duration has been accepted. Options awaiting their first acceptance are unavailable. Only completed, saved sources become available to the Crafts.</p><label>Service<select value={service} onChange={event => { setService(event.target.value); setModel(""); }}>{generationServices.map(service => <option key={service.id} value={service.id} disabled={!service.available}>{service.name}</option>)}</select></label>
        <label>Asset name<input required maxLength={160} value={name} onChange={event => setName(event.target.value)}/></label><label>Prompt or speech text<textarea required rows={4} maxLength={service === "treza-video" ? 2000 : 10000} value={prompt} onChange={event => setPrompt(event.target.value)}/></label>
        <p className="studio-note" role="status">{readiness.label}: {Object.values(readiness.profile).join(" · ")}. {readiness.explanation}</p>
        {service === "blockrun-image-gen" && <label>Model<select value={model} onChange={event => setModel(event.target.value)}><option value="">CogView-4 · 1024 × 1024</option><option value="google/nano-banana" disabled>Nano Banana · acceptance pending</option></select></label>}
        {service === "blockrun-image-edit" && <label>Saved source image<select required value={source} onChange={event => setSource(event.target.value)}><option value="">Choose an acquired image</option>{assets.filter(asset => asset.asset_kind === "image" && asset.current_revision_id).map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>}
        {service === "treza-video" && <div className="media-inline"><label>Duration<select value={seconds} onChange={event => setSeconds(event.target.value)}>{[5, 10, 15].map(value => <option key={value} value={value} disabled={value!==5}>{value} seconds{value!==5?" · acceptance pending":""}</option>)}</select></label><label>Aspect ratio<select value={aspect} onChange={event => setAspect(event.target.value)}><option>16:9</option><option value="9:16" disabled>9:16 · acceptance pending</option></select></label><label>Model<select value={model} onChange={event => setModel(event.target.value)}><option value="">MiniMax H3</option><option value="seedance-2.5" disabled>Seedance 2.5 · acceptance pending</option></select></label></div>}
        <p className="studio-note">Estimated provider charge: {dollars(quote.expectedMicros)}. Maximum reservation: {dollars(estimate)}. {quote.basis} Unused allowance is released once the final receipt is known. The Director has {budget?.availableMicros===null||!budget?"an unverified allowance":`${dollars(budget.availableMicros)} available`}. Actual charges are recorded after generation.</p>
        {!canGenerate&&<p role="status">{budget?.reason??"The Director needs more allowance for this generation. Choose a cheaper option or adjust the Studio budget."} <a href={`/dashboard/projects/${projectId}/settings#studio-budget`} target="_blank" rel="noreferrer">Manage budget ↗</a></p>}
        <button className="studio-button primary" disabled={busy || Boolean(pending) || !readiness.available || !canGenerate || !workstationAvailable}>Generate</button>
      </form>}
      <p><a href={`/dashboard/projects/${projectId}/settings#studio-budget`} target="_blank" rel="noreferrer">Manage the Studio AI budget ↗</a></p>
      {tab==="stock"&&searched&&<div className="media-inline"><button className="studio-button" disabled={busy||searchPage===1||searchSignature!==JSON.stringify({kind,query})} onClick={()=>void search(undefined,searchPage-1)}>Previous results</button><span>Page {searchPage}</span><button className="studio-button" disabled={busy||searchPage>=25||!results.length||searchSignature!==JSON.stringify({kind,query})} onClick={()=>void search(undefined,searchPage+1)}>Next results</button></div>}
      <section className="media-jobs" aria-label="Media jobs">
        <h3>Project media jobs</h3>
        {jobs.map(job => <article key={job.id}>
          <div><strong>{job.name}</strong>
            <p role={active(job) ? "status" : undefined}>{job.state.replaceAll("_", " ")} · {job.billingSettled ? dollars(job.actualMicros ?? 0) : `up to ${dollars(job.reservedMicros)} reserved; actual cost pending`}</p>
            {job.errorCode && <p>{mediaStatusMessage(job.errorCode)} <a href="/support" target="_blank" rel="noreferrer">Get help</a> · Reference {job.id}</p>}
          </div>
          {job.ref && <button className="studio-button" onClick={() => { close(); void onOpen(job.ref!); }}>Open source</button>}
          {(job.needsSettlement || !["completed", "failed", "cancelled"].includes(job.state)) &&
            <button className="studio-button" disabled={busy} onClick={() => void reconnect(job)}>{["completed", "failed", "cancelled"].includes(job.state) ? "Check existing receipt" : "Reconnect same job"}</button>}
          {job.canCancel && <button className="studio-button" disabled={busy} onClick={() => void reconnect(job, "cancel")}>Cancel unpaid job</button>}
        </article>)}
        {jobCursor&&<button className="studio-button" disabled={busy} onClick={()=>{jobPages.current++;void reload().catch(error=>setError(error.message));}}>Load older jobs</button>}
        {!jobs.length && <p className="studio-muted">Acquisitions and generations continue here after you close this panel.</p>}
      </section>
    </div>
  </StudioDialog>;
}
