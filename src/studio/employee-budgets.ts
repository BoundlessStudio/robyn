import "server-only";
import {agent37} from "@/lib/agent37";
import type {Budget} from "@/lib/types";
import type {DB} from "@/lib/auth";
import {ApiError} from "@/lib/http";
import {studioTools} from "./tools";
import {dbFailure,id} from "./server";
import type {StudioEmployee} from "./assignments";

export async function ownedBudgetEmployee(db:DB,workspaceId:string,employeeId:string):Promise<StudioEmployee> {
  const {data,error}=await db.from("studio_employees").select("*").eq("workspace_id",workspaceId).eq("id",id(employeeId)).maybeSingle();dbFailure(error);
  if(!data)throw new ApiError(404,"not_found","Employee not found.");return data as StudioEmployee;
}
export async function verifyBudgetInstance(employee:StudioEmployee) {
  if(!employee.instance_id)return null;
  const instance=await agent37.getAgent(employee.instance_id);
  if(instance.metadata?.app_workspace!==employee.workspace_id||instance.metadata?.studio_employee!==employee.id)throw new ApiError(409,"employee_instance_mismatch","This workstation does not belong to this employee.");
  return instance;
}
export function managedHeadroom(budget:Budget) {
  const values=[budget.monthly_remaining_micros,budget.credit_remaining_micros];
  if(values.some(n=>!Number.isSafeInteger(n)||n<0)||!Number.isSafeInteger(values[0]+values[1]))throw new ApiError(503,"employee_budget_unavailable","Agent37's current budget could not be read.");
  return values[0]+values[1];
}
export async function employeeBudget(db:DB,workspaceId:string,employeeId:string) {
  const employee=await ownedBudgetEmployee(db,workspaceId,employeeId);
  const instance=await verifyBudgetInstance(employee);
  const [budget,usage]=instance?await Promise.all([agent37.getBudget(instance.id),agent37.getUsage(instance.id)]):[null,null];
  if(budget&&usage&&(budget.monthly_period!==usage.period||usage.period!==new Date().toISOString().slice(0,7)||!Number.isSafeInteger(usage.total_micros)||usage.total_micros<0))throw new ApiError(503,"employee_budget_unavailable","The current spending period could not be verified. Refresh before changing allocations.");
  const name=employee.kind==="director"?"Creative Director":employee.app_id==="research"?"Researcher":studioTools.find(app=>app.id===employee.app_id)?.name??employee.role;
  return {id:employee.id,name,role:employee.role,appId:employee.app_id,kind:employee.kind,provisioned:Boolean(instance),
    monthlyCapMicros:budget?.monthly_cap_micros??Number(employee.monthly_cap_micros??0),budget,usage,availableMicros:budget?managedHeadroom(budget):null};
}
export async function directorBudget(db:DB,workspaceId:string) {
  const {data,error}=await db.from("studio_employees").select("id").eq("workspace_id",workspaceId).eq("kind","director").single();dbFailure(error);
  if(!data)throw new ApiError(503,"employee_budget_unavailable","The Creative Director is unavailable.");
  return employeeBudget(db,workspaceId,data.id);
}
