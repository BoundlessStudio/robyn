import "server-only";
import {agent37} from "@/lib/agent37";
import type {DB} from "@/lib/auth";
import type {StudioEmployee} from "./assignments";
import {managedHeadroom,verifyBudgetInstance} from "./employee-budgets";
import {dbFailure} from "./server";

/** Owner allocations are mirrored into Agent37 caps. Models and paid tools
 * share those enforced caps; base-plan editing/storage never calls this gate. */
export async function paidCapacity(db:DB,employee:StudioEmployee,excludeMediaJob?:string) {
  const {data:policy,error}=await db.from("studio_managed_budgets").select("sync_state,monthly_limit_micros,allocations").eq("workspace_id",employee.workspace_id).maybeSingle();dbFailure(error);
  if(policy&&policy.sync_state!=="synced")return {availableMicros:0,reason:"The Studio budget update needs to finish.",code:"studio_budget_sync_required"};
  if((await agent37.getBilling()).balance_usd<=0)return {availableMicros:0,reason:"The Studio AI service needs funding. Contact your Studio operator; your work is preserved.",code:"studio_funding_required"};
  const authorized=policy?Number(policy.allocations[employee.id]??0):Number(employee.monthly_cap_micros??0);
  if(!employee.instance_id)return {availableMicros:authorized,reason:authorized?null:"Allocate an AI budget before starting this employee.",code:authorized?null:"employee_budget_required"};
  const instance=await verifyBudgetInstance(employee);let budget=await agent37.getBudget(instance!.id);
  // A legacy dashboard or external cap increase must not bypass the Studio
  // allocation. Respect external reductions; only owners can increase quotas.
  if(policy&&budget.monthly_cap_micros>authorized)budget=await agent37.setBudget(instance!.id,{monthly_cap_micros:authorized});
  let query=db.from("studio_media_jobs").select("reserved_micros").eq("workspace_id",employee.workspace_id).eq("instance_id",instance!.id).eq("billing_settled",false);
  if(excludeMediaJob)query=query.neq("id",excludeMediaJob);
  const {data:holds,error:holdsError}=await query;dbFailure(holdsError);
  const available=Math.max(0,managedHeadroom(budget)-(holds??[]).reduce((n,j)=>n+Number(j.reserved_micros),0));
  return {availableMicros:available,reason:available?null:"This employee has no uncommitted AI allowance. Manage the Studio budget to continue.",code:available?null:"employee_budget_required"};
}
