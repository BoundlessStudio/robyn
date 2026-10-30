import "server-only";
import type {DB} from "@/lib/auth";
import type {Budget,Usage} from "@/lib/types";
import {ApiError} from "@/lib/http";
import {dbFailure} from "./server";
import {retiredBudgetSpend,type RetiredBudgetUsage} from "./budget-plan";

export const budgetPeriod=()=>new Date().toISOString().slice(0,7);
export function budgetMicros(value:unknown) {
  const amount=Number(value);
  if(value===null||value===undefined||!Number.isSafeInteger(amount)||amount<0)throw new ApiError(503,"studio_budget_unavailable","The Studio allowance could not be verified.");
  return amount;
}
export function sumBudgetMicros(values:unknown[]) {
  return budgetMicros(values.reduce<number>((total,value)=>budgetMicros(total+budgetMicros(value)),0));
}
export function verifyCurrentBudget(budget:Budget,usage:Usage,period=budgetPeriod()) {
  if(budget.monthly_period!==period||usage.period!==period)throw new ApiError(503,"employee_budget_unavailable","The current spending period could not be verified. Refresh before changing the allowance.");
  for(const amount of [budget.monthly_cap_micros,budget.monthly_consumed_micros,budget.monthly_remaining_micros,budget.credit_remaining_micros,usage.total_micros])budgetMicros(amount);
  if(budget.monthly_remaining_micros!==Math.max(0,budget.monthly_cap_micros-budget.monthly_consumed_micros))throw new ApiError(503,"employee_budget_unavailable","Agent37's current allowance could not be verified.");
}
export async function retiredStudioSpend(db:DB,workspaceId:string,period=budgetPeriod(),currentInstanceId?:string|null) {
  const {data,error}=await db.from("studio_retired_workstations").select("instance_id,period,usage").eq("workspace_id",workspaceId).eq("period",period);dbFailure(error);
  try{return retiredBudgetSpend((data??[]) as RetiredBudgetUsage[],period,currentInstanceId);}
  catch{throw new ApiError(503,"studio_budget_unavailable","Retired workstation spending could not be verified.");}
}
export async function unsettledMediaHolds(db:DB,workspaceId:string,excludeMediaJob?:string) {
  let query=db.from("studio_media_jobs").select("reserved_micros").eq("workspace_id",workspaceId).eq("billing_settled",false);
  if(excludeMediaJob)query=query.neq("id",excludeMediaJob);
  const {data,error}=await query;dbFailure(error);
  return sumBudgetMicros((data??[]).map(row=>row.reserved_micros));
}
export function isCurrentRobyn(employee:{employee_key?:string;retired_at?:string|null}) {
  return employee.employee_key==="robyn"&&!employee.retired_at;
}
