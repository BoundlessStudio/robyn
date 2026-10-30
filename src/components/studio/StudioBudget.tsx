"use client";
import {useCallback,useEffect,useState} from "react";
import {apiFetch} from "@/lib/api";
import {DEFAULT_STUDIO_BUDGET_MICROS,MAX_STUDIO_BUDGET_MICROS,planSharedStudioBudget,studioBudgetLimit,type StudioBudgetRequest} from "@/studio/budget-plan";
import type {StudioBudgetSnapshot} from "@/studio/studio-budgets";

const usd=(n:number|null)=>n===null?"Unavailable":new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:4}).format(n/1_000_000);
const micros=(value:string)=>value.trim()?Math.round(Number(value)*1_000_000):NaN;
type Pending=StudioBudgetRequest&{operationId:string};

export function StudioBudget(){
  const [data,setData]=useState<StudioBudgetSnapshot|null>(null),[limit,setLimit]=useState("");
  const [pending,setPending]=useState<Pending|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const load=useCallback(async()=>{
    const value=await apiFetch<StudioBudgetSnapshot>("/api/studio/budgets");setData(value);return value;
  },[]);
  useEffect(()=>{let live=true;void apiFetch<StudioBudgetSnapshot>("/api/studio/budgets").then(value=>{
    if(!live)return;
    setData(value);
    setLimit(String((value.configured?value.summary.monthlyLimitMicros:value.summary.monthlyLimitMicros||DEFAULT_STUDIO_BUDGET_MICROS)/1_000_000));
    let saved:Pending|null=null;
    try{saved=JSON.parse(localStorage.getItem(`robyn-budget-pending:${value.workspaceId}`)??"null");}catch{}
    if(value.policy&&value.policy.state!=="synced")saved={...value.policy.pendingRequest,operationId:value.policy.operationId};
    if(saved?.operationId===value.policy?.operationId&&value.policy?.state==="synced"){try{localStorage.removeItem(`robyn-budget-pending:${value.workspaceId}`);}catch{}saved=null;}
    setPending(saved);
  }).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[load]);
  let preview:ReturnType<typeof planSharedStudioBudget>|null=null,validation="";
  if(data)try{
    if(data.employees.length!==1||data.employees.some(e=>e.error))throw Error("Robyn’s allowance must be available before saving.");
    const e=data.employees[0];
    preview=planSharedStudioBudget({monthlyLimitMicros:studioBudgetLimit(micros(limit)),mode:"automatic"},{id:e.id,monthlyCapMicros:e.monthlyCapMicros,monthlyConsumedMicros:Number(e.budget?.monthly_consumed_micros??0),spentMicros:Number(e.usage?.total_micros??0),creditMicros:Number(e.budget?.credit_remaining_micros??0)},data.summary.retiredSpentMicros??0);
  }catch(e){validation=(e as Error).message;}
  async function save(request:Pending){
    if(!data)return;setBusy(true);setError("");setNotice("");setPending(request);
    try{
      localStorage.setItem(`robyn-budget-pending:${data.workspaceId}`,JSON.stringify(request));
      const value=await apiFetch<StudioBudgetSnapshot>("/api/studio/budgets",{method:"PATCH",body:JSON.stringify(request)});setData(value);setPending(null);
      try{localStorage.removeItem(`robyn-budget-pending:${data.workspaceId}`);}catch{}
      setNotice(request.monthlyLimitMicros===0?"Studio budget saved. The AI helper is off; manual editing stays available.":"Studio budget saved. Paused work checks the new allowance automatically.");
    }catch(e){setError(`${(e as Error).message} Resume this saved change before making another.`);await load().catch(()=>{});}finally{setBusy(false);}
  }
  return <section className="studio-setting-section studio-budget" id="studio-budget"><h2>One allowance for Robyn.</h2>
    <p>Set a monthly AI allowance for planning, research and work across every Craft. Reasoning, paid search, integrations and Perflo generation share this allowance.</p>
    {error&&<p role="alert" className="studio-error">{error}</p>}{notice&&<p role="status" className="studio-success">{notice}</p>}
    {!data?<p role="status">Reading Robyn’s allowance…</p>:<>
      <div className="studio-budget-totals">{[["Monthly limit",data.summary.monthlyLimitMicros],["Spent",data.summary.spentMicros],["Media reserved",data.summary.reservedMicros],["Available",data.summary.availableMicros]].map(([label,value])=><div key={String(label)}><span>{label}</span><strong>{usd(value as number|null)}</strong></div>)}</div>
      <p className="studio-muted">USD · {data.period} · resets on the first of each month, UTC. Reservations are estimates; actual charges appear in spent.</p>
      {!data.configured&&<p className="studio-note">The current allowance stays in place until you save a Studio budget.</p>}
      {pending?<div className="studio-note"><p>A saved allowance change needs to finish. New paid work pauses until it is confirmed.</p><button className="studio-button primary" disabled={busy} onClick={()=>void save(pending)}>{busy?"Applying…":"Resume budget change"}</button></div>:<form className="studio-form" onSubmit={event=>{event.preventDefault();if(preview)void save({monthlyLimitMicros:preview.monthlyLimitMicros,mode:"automatic",operationId:crypto.randomUUID(),expectedPolicyOperationId:data.policy?.operationId??null});}}>
        <label>Monthly AI allowance (USD)<input type="number" required min="0" max={MAX_STUDIO_BUDGET_MICROS/1_000_000} step="0.01" aria-describedby="studio-budget-help" value={limit} onChange={e=>setLimit(e.target.value)}/></label>
        <p className="studio-muted" id="studio-budget-help">Choose $0–$100 per month. Set $0 to turn off the AI helper.</p>
        {validation&&<p className="studio-error" role="status">{validation}</p>}
        <button className="studio-button primary" disabled={busy||!preview}>{busy?"Applying…":"Save Studio budget"}</button>
      </form>}
      {data.summary.monthlyLimitMicros===0&&<p className="studio-note" role="status">The AI helper is off. Set a budget above $0 to enable it. Manual editing, saving and exports remain available.</p>}
      <details><summary>Where the allowance goes</summary><p className="studio-muted">The monthly allowance renews automatically. One-time headroom is available while AI is enabled; a $0 budget turns the helper off even when headroom remains. Changing the allowance does not add funds to the Agent37 wallet.</p><div className="studio-budget-table-wrap"><table className="studio-budget-table"><thead><tr><th>Reasoning</th><th>Search</th><th>Integrations</th><th>Perflo</th><th>One-time headroom</th></tr></thead><tbody>{data.employees.slice(0,1).map(e=><tr key={e.id}>{(["llm","brave","composio","perflo"] as const).map(key=><td key={key}>{usd(e.error?null:Number(e.usage?.by_integration?.[key]?.cost_micros??0))}</td>)}<td>{usd(e.error?null:Number(e.budget?.credit_remaining_micros??0))}</td></tr>)}</tbody></table></div></details>
      <p className="studio-note">When AI allowance runs out, new paid work pauses and your progress stays saved. Manual editing, saving, exports, existing assets, and direct free Commons browsing remain available. Media already purchased continues collecting and saving.</p>
      <button className="studio-button" disabled={busy} onClick={()=>void load().catch(e=>setError(e.message))}>Refresh spending</button>
    </>}
  </section>;
}
