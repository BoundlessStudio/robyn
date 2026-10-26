"use client";
import {useCallback,useEffect,useState} from "react";
import {apiFetch} from "@/lib/api";
import {planStudioBudget,type StudioBudgetRequest} from "@/studio/budget-plan";
import type {StudioBudgetSnapshot} from "@/studio/studio-budgets";

const usd=(n:number|null)=>n===null?"Unavailable":new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:4}).format(n/1_000_000);
const micros=(value:string)=>value.trim()?Math.round(Number(value)*1_000_000):NaN;
type Pending=StudioBudgetRequest&{operationId:string};

export function StudioBudget(){
  const [data,setData]=useState<StudioBudgetSnapshot|null>(null),[limit,setLimit]=useState("");
  const [mode,setMode]=useState<StudioBudgetRequest["mode"]>("automatic"),[allocations,setAllocations]=useState<Record<string,string>>({});
  const [pending,setPending]=useState<Pending|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const load=useCallback(async()=>{
    const value=await apiFetch<StudioBudgetSnapshot>("/api/studio/budgets");setData(value);return value;
  },[]);
  useEffect(()=>{let live=true;void apiFetch<StudioBudgetSnapshot>("/api/studio/budgets").then(value=>{
    if(!live)return;
    setData(value);
    setLimit(String((value.summary.monthlyLimitMicros??0)/1_000_000));setMode(value.policy?.mode??"automatic");
    setAllocations(Object.fromEntries(value.employees.map(e=>[e.id,String(e.monthlyCapMicros/1_000_000)])));
    let saved:Pending|null=null;
    try{saved=JSON.parse(localStorage.getItem(`robyn-budget-pending:${value.workspaceId}`)??"null");}catch{}
    if(value.policy&&value.policy.state!=="synced")saved={...value.policy.pendingRequest,operationId:value.policy.operationId};
    if(saved?.operationId===value.policy?.operationId&&value.policy?.state==="synced"){try{localStorage.removeItem(`robyn-budget-pending:${value.workspaceId}`);}catch{}saved=null;}
    setPending(saved);
  }).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[load]);
  let preview:ReturnType<typeof planStudioBudget>|null=null,validation="";
  if(data)try{
    if(data.employees.some(e=>e.error))throw Error("All employee budgets must be available before saving.");
    preview=planStudioBudget({monthlyLimitMicros:micros(limit),mode,allocations:Object.fromEntries(Object.entries(allocations).map(([id,value])=>[id,micros(value)]))},data.employees.map(e=>({id:e.id,monthlyCapMicros:e.monthlyCapMicros,monthlyConsumedMicros:Number(e.budget?.monthly_consumed_micros??0),spentMicros:Number(e.usage?.total_micros??0),creditMicros:Number(e.budget?.credit_remaining_micros??0)})));
  }catch(e){validation=(e as Error).message;}
  async function save(request:Pending){
    if(!data)return;setBusy(true);setError("");setNotice("");setPending(request);
    try{localStorage.setItem(`robyn-budget-pending:${data.workspaceId}`,JSON.stringify(request));}catch{}
    try{
      const value=await apiFetch<StudioBudgetSnapshot>("/api/studio/budgets",{method:"PATCH",body:JSON.stringify(request)});setData(value);setPending(null);
      try{localStorage.removeItem(`robyn-budget-pending:${data.workspaceId}`);}catch{}
      setNotice("Studio budget saved. Paused work checks the new allowance automatically.");
    }catch(e){setError(`${(e as Error).message} Resume this saved change before making another.`);await load().catch(()=>{});}finally{setBusy(false);}
  }
  return <section className="studio-setting-section studio-budget" id="studio-budget"><h2>One budget. Your whole team.</h2>
    <p>Set a monthly AI allowance for your Creative Director, Researcher, and all 13 Crafts. Reasoning, paid search, integrations, and Perflo generation use this allowance. Hosting and storage are included in your base subscription.</p>
    {error&&<p role="alert" className="studio-error">{error}</p>}{notice&&<p role="status" className="studio-success">{notice}</p>}
    {!data?<p role="status">Reading your team’s budgets…</p>:<>
      <div className="studio-budget-totals">{[["Monthly limit",data.summary.monthlyLimitMicros],["Spent",data.summary.spentMicros],["Media reserved",data.summary.reservedMicros],["Available",data.summary.availableMicros]].map(([label,value])=><div key={String(label)}><span>{label}</span><strong>{usd(value as number|null)}</strong></div>)}</div>
      <p className="studio-muted">USD · {data.period} · resets on the first of each month, UTC. Reservations are estimates; actual charges appear in spent.</p>
      {!data.configured&&<p className="studio-note">Your existing employee caps remain in place until you save a Studio budget.</p>}
      {pending?<div className="studio-note"><p>A saved budget change needs to finish. New paid work pauses until the employee caps agree.</p><button className="studio-button primary" disabled={busy} onClick={()=>void save(pending)}>{busy?"Applying…":"Resume budget change"}</button>{data.policy?.state!=="applying"&&<button type="button" className="studio-button" disabled={busy} onClick={()=>{setPending(null);try{localStorage.removeItem(`robyn-budget-pending:${data.workspaceId}`);}catch{}}}>Revise allocations</button>}</div>:<form className="studio-form" onSubmit={event=>{event.preventDefault();if(preview)void save({monthlyLimitMicros:preview.monthlyLimitMicros,mode,...(mode==="custom"?{allocations:preview.allocations}:{}),operationId:crypto.randomUUID()});}}>
        <label>Overall monthly AI budget (USD)<input type="number" required min="0" step="0.01" value={limit} onChange={e=>setLimit(e.target.value)}/></label>
        <label>How should the team share it?<select value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="automatic">Split remaining allowance automatically</option><option value="custom">Choose employee allocations</option></select></label>
        <p className="studio-muted">Automatic splits the remaining allowance evenly. Custom lets you move unused allowance between employees or keep some unallocated. Generation is charged to the Director. Employees stay within their allocation until you rebalance it.</p>
        {validation&&<p className="studio-error" role="status">{validation}</p>}
        {preview&&<p>Unallocated this month: <strong>{usd(preview.unallocatedMicros)}</strong></p>}
        <button className="studio-button primary" disabled={busy||!preview}>{busy?"Applying…":"Save Studio budget"}</button>
        <details open={mode==="custom"}><summary>{mode==="custom"?"Edit all 15 employee allocations":"Review the proposed employee allocations"}</summary><p className="studio-muted">Proposed caps apply after saving and recur monthly. Spent and available show the current allowances.</p>
          <div className="studio-budget-table-wrap"><table className="studio-budget-table"><thead><tr><th>Employee</th><th>Proposed cap (USD)</th><th>Spent</th><th>Available now</th></tr></thead><tbody>{data.employees.map(employee=><tr key={employee.id}><th scope="row">{employee.name}<small>{employee.role}</small></th><td>{mode==="custom"?<input aria-label={`${employee.name} monthly cap`} type="number" min="0" step="0.000001" required value={allocations[employee.id]??"0"} onChange={e=>setAllocations(current=>({...current,[employee.id]:e.target.value}))}/>:usd(preview?.allocations[employee.id]??employee.monthlyCapMicros)}</td><td>{usd(employee.error?null:Number(employee.usage?.total_micros??0))}</td><td>{usd(employee.availableMicros??(employee.provisioned?null:employee.monthlyCapMicros))}{employee.error&&<small>Unable to verify</small>}</td></tr>)}</tbody></table></div>
        </details>
      </form>}
      <details><summary>Where the allowance goes</summary><p className="studio-muted">Monthly caps renew automatically. One-time headroom remains spendable until used, including with a zero monthly cap. Allocation changes do not add funds to the Agent37 wallet.</p><div className="studio-budget-table-wrap"><table className="studio-budget-table"><thead><tr><th>Employee</th><th>Reasoning</th><th>Search</th><th>Integrations</th><th>Perflo</th><th>One-time headroom</th></tr></thead><tbody>{data.employees.map(e=><tr key={e.id}><th scope="row">{e.name}</th>{(["llm","brave","composio","perflo"] as const).map(key=><td key={key}>{usd(e.error?null:Number(e.usage?.by_integration?.[key]?.cost_micros??0))}</td>)}<td>{usd(e.error?null:Number(e.budget?.credit_remaining_micros??0))}</td></tr>)}</tbody></table></div></details>
      <p className="studio-note">When AI allowance runs out, new paid work pauses and your progress stays saved. Manual editing, saving, exports, existing assets, and direct free Commons browsing remain available. Media already purchased continues collecting and saving.</p>
      <button className="studio-button" disabled={busy} onClick={()=>void load().catch(e=>setError(e.message))}>Refresh spending</button>
    </>}
  </section>;
}
