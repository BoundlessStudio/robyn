import "server-only";
import {randomUUID} from "node:crypto";
import {agent37} from "@/lib/agent37";
import type {Budget} from "@/lib/types";
import type {DB} from "@/lib/auth";
import {ApiError} from "@/lib/http";
import type {StudioEmployee} from "./assignments";
import {managedHeadroom,ownedBudgetEmployee,verifyBudgetInstance} from "./employee-budgets";
import {planSharedStudioBudget} from "./budget-plan";
import {budgetMicros,budgetPeriod,isCurrentRobyn,retiredStudioSpend,unsettledMediaHolds,verifyCurrentBudget} from "./shared-budget";
import {dbFailure} from "./server";

const stopped=(reason:string,code="studio_budget_sync_required")=>({availableMicros:0,reason,code});
const aiHelperDisabled=()=>stopped("The AI helper is off because the Studio budget is $0. Set a budget above $0 in Settings to enable it.","ai_helper_disabled");
type CapIntent={employeeId:string;instanceId:string;period:string;monthlyLimitMicros:number;observedCapMicros:number;targetCapMicros:number;leaseId?:string};
type Policy={monthly_limit_micros:number;sync_state:string;allocations:Record<string,number>;cap_sync?:CapIntent|null};
async function policyFor(db:DB,workspaceId:string):Promise<Policy|null> {
  const {data,error}=await db.from("studio_managed_budgets").select("sync_state,monthly_limit_micros,allocations,cap_sync").eq("workspace_id",workspaceId).maybeSingle();dbFailure(error);
  return data;
}
/** Provisioning grants only this period's remaining owner allowance. Historical
 * instances are represented by immutable checkpoints, never provider reads. */
export async function initialWorkstationCap(db:DB,employee:StudioEmployee) {
  if(!isCurrentRobyn(employee)||employee.instance_id)throw new ApiError(409,"employee_instance_mismatch","A new Robyn workstation could not be identified.");
  const policy=await policyFor(db,employee.workspace_id);
  if(policy&&(policy.sync_state!=="synced"||policy.cap_sync))throw new ApiError(409,"budget_update_in_progress","Finish the saved Studio allowance update before starting the workstation.");
  const limit=budgetMicros(policy?.monthly_limit_micros??employee.monthly_cap_micros??0);
  return Math.max(0,limit-await retiredStudioSpend(db,employee.workspace_id));
}
/** Recover a create/bind acknowledgement without granting any new headroom or
 * adopting an externally reduced cap as our own managed ceiling. */
export async function confirmInitialWorkstationCap(db:DB,employee:StudioEmployee) {
  const current=await ownedBudgetEmployee(db,employee.workspace_id,employee.id);
  if(!current.instance_id||current.instance_id!==employee.instance_id||current.budget_cap_period!=null||current.budget_cap_micros!=null)return false;
  const policy=await policyFor(db,current.workspace_id);
  if(policy&&(policy.sync_state!=="synced"||policy.cap_sync))return false;
  const instance=await verifyBudgetInstance(db,current);
  const [budget,usage]=await Promise.all([agent37.getBudget(instance!.id),agent37.getUsage(instance!.id)]);
  verifyCurrentBudget(budget,usage);
  const limit=budgetMicros(policy?.monthly_limit_micros??current.monthly_cap_micros??0),retired=await retiredStudioSpend(db,current.workspace_id,budget.monthly_period,instance!.id);
  if(budget.monthly_cap_micros!==Math.max(0,limit-retired)||budget.credit_remaining_micros!==0)return false;
  const {data,error}=await db.from("studio_employees").update({budget_cap_period:budget.monthly_period,budget_cap_micros:budget.monthly_cap_micros}).eq("workspace_id",current.workspace_id).eq("id",current.id).eq("instance_id",instance!.id).eq("employee_key","robyn").is("retired_at",null).is("budget_cap_period",null).is("budget_cap_micros",null).select("id").maybeSingle();dbFailure(error);
  return Boolean(data);
}
function capScope(employee:StudioEmployee,intent:CapIntent,lease:string) {
  return {p_workspace:employee.workspace_id,p_employee:employee.id,p_instance:intent.instanceId,p_period:intent.period,p_limit:intent.monthlyLimitMicros,p_observed_cap:intent.observedCapMicros,p_target_cap:intent.targetCapMicros,p_lease:lease};
}
async function synchronizeCap(db:DB,employee:StudioEmployee,policy:Policy,budget:Budget,target:number) {
  const saved=policy.cap_sync;
  const intent:CapIntent=saved??{employeeId:employee.id,instanceId:employee.instance_id!,period:budget.monthly_period,monthlyLimitMicros:budgetMicros(policy.monthly_limit_micros),observedCapMicros:budget.monthly_cap_micros,targetCapMicros:target};
  if(intent.employeeId!==employee.id||intent.instanceId!==employee.instance_id||!saved&&intent.period!==budgetPeriod()||intent.monthlyLimitMicros!==Number(policy.monthly_limit_micros))throw new Error("Unresolved cap synchronization belongs to another workstation period");
  for(const value of [intent.observedCapMicros,intent.targetCapMicros,intent.monthlyLimitMicros])budgetMicros(value);
  if(intent.targetCapMicros>intent.monthlyLimitMicros)throw new Error("Unresolved cap exceeds the recurring allowance");
  if(saved&&budget.monthly_cap_micros!==intent.observedCapMicros&&budget.monthly_cap_micros!==intent.targetCapMicros)throw new Error("Unresolved cap synchronization requires reconciliation");
  const requestedScope=capScope(employee,intent,randomUUID());
  const {data:claim,error}=await db.rpc("claim_studio_budget_cap_sync",requestedScope);dbFailure(error);
  if(!claim||!claim.claimed&&!claim.intent?.leaseId)throw new Error("Allowance synchronization is already in progress");
  const scope=claim.claimed?requestedScope:capScope(employee,intent,claim.intent.leaseId);
  try{
    // Recheck ownership and observed cap after claiming the shared policy lease.
    const instance=await verifyBudgetInstance(db,employee);
    const current=await agent37.getBudget(instance!.id);
    if(claim.claimed&&(current.monthly_period!==intent.period||budgetPeriod()!==intent.period))throw new Error("Budget period changed");
    if(current.monthly_cap_micros!==intent.targetCapMicros){
      // A lost write acknowledgement authorizes observation only. Elapsed time
      // never permits another PATCH or a different cap intent.
      if(!claim.claimed)throw new Error("The prior allowance write has an unknown outcome");
      if(current.monthly_cap_micros!==intent.observedCapMicros)throw new Error("External allowance change must be respected");
      await agent37.setBudget(instance!.id,{monthly_cap_micros:intent.targetCapMicros});
    }
    const [confirmed,usage]=await Promise.all([agent37.getBudget(instance!.id),agent37.getUsage(instance!.id)]);
    verifyCurrentBudget(confirmed,usage);
    if(confirmed.monthly_cap_micros!==intent.targetCapMicros)throw new Error("Allowance synchronization was not confirmed");
    const {error:finishError}=await db.rpc("finish_studio_budget_cap_sync",scope);dbFailure(finishError);
    return {budget:confirmed,usage};
  }catch(error){
    await db.rpc("finish_studio_budget_cap_sync",{...scope,p_error:"Agent37 allowance synchronization needs reconciliation."});
    throw error;
  }
}

/** Paid jobs share one provider cap and retain every unsettled media hold,
 * including historical jobs and holds from previous billing periods. */
export async function paidCapacity(db:DB,employee:StudioEmployee,excludeMediaJob?:string) {
  if(!isCurrentRobyn(employee))return stopped("Historical workstations cannot start paid work.");
  const policy=await policyFor(db,employee.workspace_id);
  if(policy&&policy.sync_state!=="synced")return stopped("The Studio allowance update needs to finish.");
  const authorized=budgetMicros(policy?.monthly_limit_micros??employee.monthly_cap_micros??0);
  if(policy&&(Object.keys(policy.allocations??{}).length!==1||Number(policy.allocations[employee.id])!==authorized))return stopped("The shared Robyn allowance needs to be reconciled.");
  // A prior provider-write receipt may still need observation; zero must not
  // strand that recovery or authorize another write. No AI work is admitted.
  if(authorized===0&&!policy?.cap_sync)return aiHelperDisabled();
  const retired=await retiredStudioSpend(db,employee.workspace_id,budgetPeriod(),employee.instance_id),holds=await unsettledMediaHolds(db,employee.workspace_id,excludeMediaJob);
  if(!employee.instance_id){
    const available=Math.max(0,authorized-retired-holds);
    if(available&&(await agent37.getBilling()).balance_usd<=0)return stopped("The Studio AI service needs funding. Contact your Studio operator; your work is preserved.","studio_funding_required");
    return {availableMicros:available,reason:available?null:"Set an AI allowance before starting Robyn.",code:available?null:"employee_budget_required"};
  }
  const instance=await verifyBudgetInstance(db,employee);
  let [budget,usage]=await Promise.all([agent37.getBudget(instance!.id),agent37.getUsage(instance!.id)]);
  verifyCurrentBudget(budget,usage);
  let plan;
  try{plan=planSharedStudioBudget({monthlyLimitMicros:authorized,mode:"automatic"},{id:employee.id,monthlyCapMicros:budget.monthly_cap_micros,monthlyConsumedMicros:budget.monthly_consumed_micros,spentMicros:usage.total_micros,creditMicros:budget.credit_remaining_micros},retired);}
  catch{return stopped("Existing one-time headroom needs to be reconciled with the Studio allowance.");}
  const restore=Boolean(employee.budget_cap_period&&employee.budget_cap_period<budget.monthly_period&&employee.budget_cap_micros===budget.monthly_cap_micros);
  if(policy&&(policy.cap_sync||budget.monthly_cap_micros>plan.providerCapMicros||restore&&budget.monthly_cap_micros<plan.providerCapMicros)){
    try{({budget,usage}=await synchronizeCap(db,employee,policy,budget,plan.providerCapMicros));}
    catch{return stopped("The saved workstation allowance synchronization needs to finish.");}
  }
  try{
    const current=planSharedStudioBudget({monthlyLimitMicros:authorized,mode:"automatic"},{id:employee.id,monthlyCapMicros:budget.monthly_cap_micros,monthlyConsumedMicros:budget.monthly_consumed_micros,spentMicros:usage.total_micros,creditMicros:budget.credit_remaining_micros},retired);
    if(policy&&budget.monthly_cap_micros>current.providerCapMicros)return stopped("The updated workstation allowance needs to be synchronized.");
  }catch{return stopped("Existing one-time headroom needs to be reconciled with the Studio allowance.");}
  const available=Math.max(0,Math.min(managedHeadroom(budget),Math.max(0,authorized-retired-usage.total_micros))-holds);
  if(authorized===0)return aiHelperDisabled();
  if(available&&(await agent37.getBilling()).balance_usd<=0)return stopped("The Studio AI service needs funding. Contact your Studio operator; your work is preserved.","studio_funding_required");
  return {availableMicros:available,reason:available?null:"Robyn has no uncommitted AI allowance. Manage the Studio allowance to continue.",code:available?null:"employee_budget_required"};
}
