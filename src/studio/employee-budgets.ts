import "server-only";
import {agent37} from "@/lib/agent37";
import type {Budget} from "@/lib/types";
import type {DB} from "@/lib/auth";
import {ApiError} from "@/lib/http";
import {dbFailure,id} from "./server";
import type {StudioEmployee} from "./assignments";
import {budgetMicros,isCurrentRobyn,verifyCurrentBudget} from "./shared-budget";

export async function ownedBudgetEmployee(db:DB,workspaceId:string,employeeId:string):Promise<StudioEmployee> {
  const {data,error}=await db.from("studio_employees").select("*").eq("workspace_id",workspaceId).eq("id",id(employeeId)).eq("employee_key","robyn").is("retired_at",null).maybeSingle();dbFailure(error);
  if(!data)throw new ApiError(404,"not_found","Employee not found.");return data as StudioEmployee;
}
export async function verifyBudgetInstance(db:DB,employee:StudioEmployee) {
  if(!isCurrentRobyn(employee))throw new ApiError(404,"not_found","Robyn is unavailable.");
  if(!employee.instance_id)return null;
  const [binding,mirror]=await Promise.all([
    db.from("studio_employees").select("id,workspace_id,employee_key,retired_at,instance_id").eq("workspace_id",employee.workspace_id).eq("id",employee.id).maybeSingle(),
    db.from("agents").select("agent37_id,workspace_id").eq("agent37_id",employee.instance_id).maybeSingle(),
  ]);dbFailure(binding.error);dbFailure(mirror.error);
  if(!binding.data||!isCurrentRobyn(binding.data)||binding.data.instance_id!==employee.instance_id||mirror.data?.agent37_id!==employee.instance_id||mirror.data?.workspace_id!==employee.workspace_id)throw new ApiError(409,"employee_instance_mismatch","The workstation ownership records do not match Robyn.");
  const instance=await agent37.getAgent(employee.instance_id);
  if(instance.id!==employee.instance_id||instance.metadata?.app_workspace!==employee.workspace_id||instance.metadata?.studio_employee!==employee.id)throw new ApiError(409,"employee_instance_mismatch","This workstation does not belong to Robyn.");
  return instance;
}
export function managedHeadroom(budget:Budget) {
  const values=[budget.monthly_remaining_micros,budget.credit_remaining_micros];
  if(values.some(n=>!Number.isSafeInteger(n)||n<0)||!Number.isSafeInteger(values[0]+values[1]))throw new ApiError(503,"employee_budget_unavailable","Agent37's current budget could not be read.");
  return values[0]+values[1];
}
export async function employeeBudget(db:DB,workspaceId:string,employeeId:string) {
  const employee=await ownedBudgetEmployee(db,workspaceId,employeeId);
  const instance=await verifyBudgetInstance(db,employee);
  const [budget,usage]=instance?await Promise.all([agent37.getBudget(instance.id),agent37.getUsage(instance.id)]):[null,null];
  if(budget&&usage)verifyCurrentBudget(budget,usage);
  return {id:employee.id,name:"Robyn",role:"Robyn",appId:null,kind:employee.kind,provisioned:Boolean(instance),
    monthlyCapMicros:budget?.monthly_cap_micros??budgetMicros(employee.monthly_cap_micros??0),budget,usage,availableMicros:budget?managedHeadroom(budget):null};
}
export async function directorBudget(db:DB,workspaceId:string) {
  const {data,error}=await db.from("studio_employees").select("id").eq("workspace_id",workspaceId).eq("employee_key","robyn").is("retired_at",null).single();dbFailure(error);
  if(!data)throw new ApiError(503,"employee_budget_unavailable","Robyn is unavailable.");
  return employeeBudget(db,workspaceId,data.id);
}
