import "server-only";
import {randomUUID} from "node:crypto";
import {agent37} from "@/lib/agent37";
import type {DB} from "@/lib/auth";
import {ApiError} from "@/lib/http";
import {dbFailure,id} from "./server";
import {studioTools} from "./tools";
import {employeeBudget,ownedBudgetEmployee,verifyBudgetInstance} from "./employee-budgets";
import {planStudioBudget,type BudgetSlot,type StudioBudgetRequest} from "./budget-plan";

export async function budgetChangePending(db:DB,workspaceId:string) {
  const {data,error}=await db.from("studio_managed_budgets").select("sync_state").eq("workspace_id",workspaceId).maybeSingle();dbFailure(error);
  return Boolean(data&&data.sync_state!=="synced");
}
export async function studioBudgets(db:DB,workspaceId:string) {
  const {data:employees,error}=await db.from("studio_employees").select("id,kind,app_id,role,monthly_cap_micros").eq("workspace_id",workspaceId);dbFailure(error);
  const ordered=(employees??[]).sort((a,b)=>(a.kind==="director"?-2:a.app_id==="research"?-1:studioTools.find(t=>t.id===a.app_id)?.order??99)-(b.kind==="director"?-2:b.app_id==="research"?-1:studioTools.find(t=>t.id===b.app_id)?.order??99));
  const rows=[];
  for(let index=0;index<ordered.length;index+=4)rows.push(...await Promise.all(ordered.slice(index,index+4).map(async employee=>{
    try{return {...await employeeBudget(db,workspaceId,employee.id),error:null};}
    catch{return {id:employee.id,name:employee.kind==="director"?"Creative Director":employee.app_id==="research"?"Researcher":studioTools.find(t=>t.id===employee.app_id)?.name??employee.role,role:employee.role,appId:employee.app_id,kind:employee.kind,monthlyCapMicros:Number(employee.monthly_cap_micros),provisioned:true,budget:null,usage:null,availableMicros:null,error:"Agent37 budget unavailable"};}
  })));
  const {data:policy,error:policyError}=await db.from("studio_managed_budgets").select("monthly_limit_micros,allocation_mode,sync_state,operation_id,pending_request,updated_at,last_error").eq("workspace_id",workspaceId).maybeSingle();dbFailure(policyError);
  const {data:jobs,error:jobsError}=await db.from("studio_media_jobs").select("reserved_micros").eq("workspace_id",workspaceId).eq("billing_settled",false);dbFailure(jobsError);
  const unavailable=rows.some(row=>row.error),spent=unavailable?null:rows.reduce((n,row)=>n+Number(row.usage?.total_micros??0),0);
  const committed=unavailable?null:rows.reduce((n,row)=>n+Number(row.usage?.total_micros??0)+Number(row.availableMicros??row.monthlyCapMicros),0);
  const limit=policy?Number(policy.monthly_limit_micros):committed;
  const reserved=(jobs??[]).reduce((n,j)=>n+Number(j.reserved_micros),0);
  return {workspaceId,employees:rows,configured:Boolean(policy),policy:policy?{monthlyLimitMicros:Number(policy.monthly_limit_micros),mode:policy.allocation_mode,state:policy.sync_state,operationId:policy.operation_id,pendingRequest:policy.pending_request as StudioBudgetRequest,updatedAt:policy.updated_at,error:policy.last_error}:null,
    summary:{monthlyLimitMicros:limit,spentMicros:spent,reservedMicros:reserved,availableMicros:limit!==null&&spent!==null?Math.max(0,limit-spent-reserved):null},period:new Date().toISOString().slice(0,7)};
}
export type StudioBudgetSnapshot=Awaited<ReturnType<typeof studioBudgets>>;
export function budgetSlots(snapshot:Awaited<ReturnType<typeof studioBudgets>>):BudgetSlot[] {
  if(snapshot.employees.some(row=>row.error))throw new ApiError(503,"studio_budget_unavailable","All employee budgets must be readable before changing the Studio budget.");
  return snapshot.employees.map(row=>({id:row.id,monthlyCapMicros:row.monthlyCapMicros,monthlyConsumedMicros:Number(row.budget?.monthly_consumed_micros??0),spentMicros:Number(row.usage?.total_micros??0),creditMicros:Number(row.budget?.credit_remaining_micros??0)}));
}
function requestPlan(input:Record<string,unknown>):StudioBudgetRequest {
  if(!Number.isSafeInteger(input.monthlyLimitMicros)||Number(input.monthlyLimitMicros)<0||!["automatic","custom"].includes(String(input.mode)))throw new ApiError(400,"invalid_studio_budget","Choose an overall monthly AI budget and an allocation mode.");
  return {monthlyLimitMicros:Number(input.monthlyLimitMicros),mode:input.mode as StudioBudgetRequest["mode"],...(input.mode==="custom"?{allocations:input.allocations as Record<string,number>}: {})};
}
async function budgetRpc(db:DB,name:string,args:Record<string,unknown>) {
  const {data,error}=await db.rpc(name,args);
  if(error?.message.includes("operation key reused"))throw new ApiError(409,"budget_request_changed","Retry the saved budget change without changing its allocations.");
  if(error&&/update in progress|setup in progress/.test(error.message))throw new ApiError(409,"budget_update_in_progress","A budget update or workstation setup is still in progress. Retry shortly.");
  dbFailure(error);return data;
}
export async function updateStudioBudget(db:DB,workspaceId:string,userId:string,input:Record<string,unknown>) {
  const operation=id(input.operationId),lease=randomUUID(),request=requestPlan(input);
  let snapshot=await studioBudgets(db,workspaceId),plan;
  try{plan=planStudioBudget(request,budgetSlots(snapshot));}catch(error){if(error instanceof ApiError)throw error;throw new ApiError(400,"invalid_studio_budget",(error as Error).message);}
  const scope={p_workspace:workspaceId,p_user:userId,p_operation:operation,p_lease:lease};
  const claim=await budgetRpc(db,"claim_studio_budget_change",{...scope,p_request:request,p_current_limit:snapshot.summary.monthlyLimitMicros,p_current_allocations:Object.fromEntries(snapshot.employees.map(e=>[e.id,e.monthlyCapMicros]))});
  if(!claim.claimed)return studioBudgets(db,workspaceId);
  try{
    // Reduce first. Increasing one employee never borrows headroom that has not
    // yet been removed from another instance's enforced cap.
    for(const row of snapshot.employees)if(row.provisioned&&plan.allocations[row.id]<row.monthlyCapMicros){const e=await ownedBudgetEmployee(db,workspaceId,row.id);const instance=await verifyBudgetInstance(e);await agent37.setBudget(instance!.id,{monthly_cap_micros:plan.allocations[row.id]});}
    snapshot=await studioBudgets(db,workspaceId);plan=planStudioBudget(request,budgetSlots(snapshot));
    // Consumption can finish during the first pass; recomputing automatic
    // shares may require a second reduction before any increase is safe.
    for(const row of snapshot.employees)if(row.provisioned&&plan.allocations[row.id]<row.monthlyCapMicros){const e=await ownedBudgetEmployee(db,workspaceId,row.id);await agent37.setBudget((await verifyBudgetInstance(e))!.id,{monthly_cap_micros:plan.allocations[row.id]});}
    await budgetRpc(db,"stage_studio_budget_change",{...scope,p_limit:plan.monthlyLimitMicros,p_mode:plan.mode,p_allocations:plan.allocations});
    for(const row of snapshot.employees)if(row.provisioned&&plan.allocations[row.id]>Math.min(row.monthlyCapMicros,plan.allocations[row.id])){const e=await ownedBudgetEmployee(db,workspaceId,row.id);await agent37.setBudget((await verifyBudgetInstance(e))!.id,{monthly_cap_micros:plan.allocations[row.id]});}
    await budgetRpc(db,"finish_studio_budget_change",scope);
    return studioBudgets(db,workspaceId);
  }catch{
    await budgetRpc(db,"finish_studio_budget_change",{...scope,p_error:"Agent37 budget synchronization needs retry."});
    throw new ApiError(503,"budget_sync_incomplete","The budget change is partially applied. Resume the saved change; new paid work is paused meanwhile.");
  }
}
