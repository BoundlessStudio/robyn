import "server-only";
import {randomUUID} from "node:crypto";
import {agent37} from "@/lib/agent37";
import type {DB} from "@/lib/auth";
import {ApiError} from "@/lib/http";
import {dbFailure,id} from "./server";
import {employeeBudget,ownedBudgetEmployee,verifyBudgetInstance} from "./employee-budgets";
import {planSharedStudioBudget,type BudgetSlot,type StudioBudgetRequest} from "./budget-plan";
import {budgetMicros,budgetPeriod,retiredStudioSpend,sumBudgetMicros,unsettledMediaHolds,verifyCurrentBudget} from "./shared-budget";
import type {StudioEmployee} from "./assignments";

export async function budgetChangePending(db:DB,workspaceId:string) {
  const {data,error}=await db.from("studio_managed_budgets").select("sync_state,cap_sync").eq("workspace_id",workspaceId).maybeSingle();dbFailure(error);
  return Boolean(data&&(data.sync_state!=="synced"||data.cap_sync));
}
export async function studioBudgets(db:DB,workspaceId:string) {
  const {data:employees,error}=await db.from("studio_employees").select("id,kind,app_id,role,instance_id,monthly_cap_micros").eq("workspace_id",workspaceId).eq("employee_key","robyn").is("retired_at",null);dbFailure(error);
  if(employees?.length!==1)throw new ApiError(503,"studio_budget_unavailable","Robyn's allowance could not be identified.");
  const employee=employees[0];
  const rows=[];
  try{rows.push({...await employeeBudget(db,workspaceId,employee.id),error:null});}
  catch{rows.push({id:employee.id,name:"Robyn",role:"Robyn",appId:null,kind:employee.kind,monthlyCapMicros:budgetMicros(employee.monthly_cap_micros??0),provisioned:Boolean(employee.instance_id),budget:null,usage:null,availableMicros:null,error:"Agent37 budget unavailable"});}
  const {data:policy,error:policyError}=await db.from("studio_managed_budgets").select("monthly_limit_micros,allocation_mode,sync_state,operation_id,pending_request,updated_at,last_error,cap_sync").eq("workspace_id",workspaceId).maybeSingle();dbFailure(policyError);
  const period=budgetPeriod(),retiredSpent=await retiredStudioSpend(db,workspaceId,period,employee.instance_id),reserved=await unsettledMediaHolds(db,workspaceId);
  const spent=rows[0].error?null:sumBudgetMicros([retiredSpent,rows[0].usage?.total_micros??0]);
  const limit=budgetMicros(policy?.monthly_limit_micros??employee.monthly_cap_micros??0);
  const gross=rows[0].error?null:policy&&(policy.sync_state!=="synced"||policy.cap_sync)?0:Math.min(Math.max(0,limit-(spent??0)),rows[0].availableMicros??Math.max(0,limit-retiredSpent));
  return {workspaceId,employees:rows,configured:Boolean(policy),policy:policy?{monthlyLimitMicros:limit,mode:policy.allocation_mode,state:policy.sync_state,operationId:policy.operation_id,pendingRequest:policy.pending_request as StudioBudgetRequest,updatedAt:policy.updated_at,error:policy.last_error,capSyncPending:Boolean(policy.cap_sync)}:null,
    summary:{monthlyLimitMicros:limit,spentMicros:spent,retiredSpentMicros:retiredSpent,reservedMicros:reserved,availableMicros:gross===null?null:Math.max(0,gross-reserved)},period};
}
export type StudioBudgetSnapshot=Awaited<ReturnType<typeof studioBudgets>>;
export function budgetSlots(snapshot:StudioBudgetSnapshot):BudgetSlot[] {
  if(snapshot.employees.length!==1||snapshot.employees.some(row=>row.error))throw new ApiError(503,"studio_budget_unavailable","Robyn's allowance must be readable before changing the Studio budget.");
  return snapshot.employees.map(row=>({id:row.id,monthlyCapMicros:row.monthlyCapMicros,monthlyConsumedMicros:budgetMicros(row.budget?.monthly_consumed_micros??0),spentMicros:budgetMicros(row.usage?.total_micros??0),creditMicros:budgetMicros(row.budget?.credit_remaining_micros??0)}));
}
function requestPlan(input:Record<string,unknown>):StudioBudgetRequest {
  if(!Number.isSafeInteger(input.monthlyLimitMicros)||Number(input.monthlyLimitMicros)<0||input.mode!=="automatic"||input.allocations!==undefined)throw new ApiError(400,"invalid_studio_budget","Set one overall monthly AI allowance for Robyn.");
  return {monthlyLimitMicros:Number(input.monthlyLimitMicros),mode:"automatic",...(input.expectedPolicyOperationId!==undefined?{expectedPolicyOperationId:input.expectedPolicyOperationId as string|null}:{})};
}
const requestIdentity=(input:Record<string,unknown>)=>JSON.stringify({monthlyLimitMicros:input.monthlyLimitMicros,mode:input.mode,...(input.expectedPolicyOperationId!==undefined?{expectedPolicyOperationId:input.expectedPolicyOperationId}:{}),...(input.allocations!==undefined?{allocations:input.allocations&&typeof input.allocations==="object"&&!Array.isArray(input.allocations)?Object.fromEntries(Object.entries(input.allocations).sort(([a],[b])=>a.localeCompare(b))):input.allocations}:{})});
async function budgetRpc(db:DB,name:string,args:Record<string,unknown>) {
  const {data,error}=await db.rpc(name,args);
  if(error?.message.includes("budget request stale"))throw new ApiError(409,"budget_request_stale","The Studio allowance changed. Refresh its current value before submitting a new change; your saved draft is preserved.");
  if(error?.message.includes("operation key reused"))throw new ApiError(409,"budget_request_changed","Retry the saved budget change without changing its allowance.");
  if(error&&/update in progress|setup in progress|sync in progress|unresolved/.test(error.message))throw new ApiError(409,"budget_update_in_progress","A saved budget change or workstation setup still needs to finish.");
  dbFailure(error);return data;
}
async function currentPlan(db:DB,workspaceId:string,employeeId:string,request:StudioBudgetRequest) {
  const snapshot=await studioBudgets(db,workspaceId);
  if(snapshot.employees[0]?.id!==employeeId)throw new ApiError(409,"employee_instance_mismatch","Robyn's workstation changed during this allowance update.");
  const plan=planSharedStudioBudget(request,budgetSlots(snapshot)[0],snapshot.summary.retiredSpentMicros);
  return {snapshot,plan};
}
type OwnerWrite={ownerOperationId:string;employeeId:string;instanceId:string;period:string;monthlyLimitMicros:number;observedCapMicros:number;targetCapMicros:number;leaseId?:string;confirmed?:boolean};
async function confirmOwnerProviderWrite(db:DB,employee:StudioEmployee,scope:{p_workspace:string;p_user:string;p_operation:string;p_lease:string},write:OwnerWrite,limit:number) {
  if(write.ownerOperationId!==scope.p_operation||write.employeeId!==employee.id||write.instanceId!==employee.instance_id||write.monthlyLimitMicros!==limit||budgetMicros(write.targetCapMicros)>limit)throw new Error("Saved provider write identity changed");
  budgetMicros(write.observedCapMicros);
  const args={...scope,p_employee:employee.id,p_instance:write.instanceId,p_period:write.period,p_observed_cap:write.observedCapMicros,p_target_cap:write.targetCapMicros};
  const claim=await budgetRpc(db,"claim_studio_budget_provider_write",args);
  const saved=claim?.intent as OwnerWrite|undefined;
  if(!saved||saved.ownerOperationId!==write.ownerOperationId||saved.employeeId!==write.employeeId||saved.instanceId!==write.instanceId||saved.period!==write.period||saved.monthlyLimitMicros!==limit||saved.observedCapMicros!==write.observedCapMicros||saved.targetCapMicros!==write.targetCapMicros||!saved.leaseId)throw new Error("Provider write receipt was not confirmed");
  const finish={...args,p_write_lease:saved.leaseId};
  try{
    const instance=await verifyBudgetInstance(db,employee),current=await agent37.getBudget(instance!.id);
    if(claim.claimed&&(current.monthly_period!==write.period||budgetPeriod()!==write.period))throw new Error("Budget period changed before dispatch");
    if(current.monthly_cap_micros!==write.targetCapMicros){
      // A saved intent can only observe its first dispatch. It must never send
      // another PATCH after a timeout, lease change, or process restart.
      if(!claim.claimed)throw new Error("The saved provider write has an unknown outcome");
      if(current.monthly_cap_micros!==write.observedCapMicros)throw new Error("External allowance change must be respected");
      await agent37.setBudget(instance!.id,{monthly_cap_micros:write.targetCapMicros});
    }
    const [budget,usage]=await Promise.all([agent37.getBudget(instance!.id),agent37.getUsage(instance!.id)]);
    verifyCurrentBudget(budget,usage);
    if(budget.monthly_cap_micros!==write.targetCapMicros)throw new Error("Provider allowance target was not observed");
    await budgetRpc(db,"finish_studio_budget_provider_write",finish);
  }catch(error){
    await budgetRpc(db,"finish_studio_budget_provider_write",{...finish,p_error:"The saved provider allowance write needs reconciliation."}).catch(()=>{});
    throw error;
  }
}
export async function updateStudioBudget(db:DB,workspaceId:string,userId:string,input:Record<string,unknown>) {
  const operation=id(input.operationId),lease=randomUUID();
  const {data:policy,error}=await db.from("studio_managed_budgets").select("sync_state,operation_id,pending_request,cap_sync").eq("workspace_id",workspaceId).maybeSingle();dbFailure(error);
  if(policy?.operation_id===operation){
    if(requestIdentity(input)!==requestIdentity(policy.pending_request))throw new ApiError(409,"budget_request_changed","Retry the original saved allowance change.");
    if(policy.sync_state==="synced")return studioBudgets(db,workspaceId);
  }else if(policy&&policy.sync_state!=="synced")throw new ApiError(409,"budget_update_in_progress","Resume the original saved allowance change before making another.");
  if(policy?.operation_id!==operation){
    const expected=input.expectedPolicyOperationId;
    if(!Object.hasOwn(input,"expectedPolicyOperationId")||expected!==null&&(typeof expected!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(expected))||expected!==(policy?.operation_id??null))throw new ApiError(409,"budget_request_stale","The Studio allowance changed. Refresh its current value before submitting a new change; your saved draft is preserved.");
  }
  if(policy?.cap_sync&&!(policy.operation_id===operation&&policy.cap_sync.ownerOperationId===operation))throw new ApiError(409,"budget_update_in_progress","The saved workstation allowance synchronization needs to finish.");
  const request=requestPlan(input);
  let snapshot=await studioBudgets(db,workspaceId),plan;
  try{plan=planSharedStudioBudget(request,budgetSlots(snapshot)[0],snapshot.summary.retiredSpentMicros);}catch(error){if(error instanceof ApiError)throw error;throw new ApiError(400,"invalid_studio_budget",(error as Error).message);}
  const employeeId=snapshot.employees[0].id,scope={p_workspace:workspaceId,p_user:userId,p_operation:operation,p_lease:lease};
  const claim=await budgetRpc(db,"claim_studio_budget_change",{...scope,p_request:request,p_current_limit:snapshot.summary.monthlyLimitMicros,p_current_allocations:{[employeeId]:snapshot.summary.monthlyLimitMicros},p_expected_operation:request.expectedPolicyOperationId??null});
  if(!claim.claimed)return studioBudgets(db,workspaceId);
  try{
    const {data:active,error:activeError}=await db.from("studio_managed_budgets").select("cap_sync").eq("workspace_id",workspaceId).maybeSingle();dbFailure(activeError);
    let write=active?.cap_sync as OwnerWrite|null;
    if(!write){
      ({snapshot,plan}=await currentPlan(db,workspaceId,employeeId,request));
      if(snapshot.employees[0].provisioned)write={ownerOperationId:operation,employeeId,instanceId:(await ownedBudgetEmployee(db,workspaceId,employeeId)).instance_id!,period:snapshot.period,monthlyLimitMicros:request.monthlyLimitMicros,observedCapMicros:snapshot.employees[0].monthlyCapMicros,targetCapMicros:plan.providerCapMicros};
    }
    if(write)await confirmOwnerProviderWrite(db,await ownedBudgetEmployee(db,workspaceId,employeeId),scope,write,request.monthlyLimitMicros);
    await budgetRpc(db,"stage_studio_budget_change",{...scope,p_limit:request.monthlyLimitMicros,p_mode:"automatic",p_allocations:{[employeeId]:request.monthlyLimitMicros}});
    await budgetRpc(db,"finish_studio_budget_change",scope);
    return studioBudgets(db,workspaceId);
  }catch{
    await budgetRpc(db,"finish_studio_budget_change",{...scope,p_error:"Agent37 allowance synchronization needs retry."}).catch(()=>{});
    throw new ApiError(503,"budget_sync_incomplete","The allowance change is partially applied. Resume the saved change; new paid work is paused meanwhile.");
  }
}
