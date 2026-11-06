import { ApiError } from "@/lib/http";
import type { DB } from "@/lib/auth";
import { dbFailure, id, ownedProject, textField } from "@/studio/server";
import { studioApps } from "@/studio/apps/registry";
import { isEmployeeReady } from "./manifest";
import { assignmentRpc } from "@/studio/assignment-server";
import { launchAssignment } from "@/studio/assignment-launch";
import { paidCapacity } from "@/studio/paid-capacity";
import type { Assignment, StudioEmployee } from "./assignments";

export async function submitRobynAssignment(
  { db, userId, workspaceId, grantId }: { db: DB; userId: string; workspaceId: string; grantId?: string },
  input: Record<string, unknown>,
) {
  const projectId = id(input.projectId, "project ID");
  const project = await ownedProject(db, workspaceId, projectId);
  if (project.status !== "active") throw new ApiError(409, "project_archived", "Reactivate this project before assigning new work.");
  const startMode=input.startMode??"work";
  if(typeof startMode!=="string"||!["work","draft","plan"].includes(startMode))throw new ApiError(400,"invalid_start_mode","Choose how you want to begin.");
  const brief = textField(input.brief, 20000, "Assignment brief");
  const requestId = id(input.requestId, "request ID");
  const {data:prior,error:existingError}=await db.from("studio_assignments").select("*").eq("workspace_id",workspaceId).eq("request_key",requestId).maybeSingle();dbFailure(existingError);
  const existing=prior as Assignment|null;
  if (!Array.isArray(input.inputs) || input.inputs.length > 100) throw new ApiError(400, "invalid_inputs", "Supply up to 100 exact saved revisions.");
  const inputs = input.inputs.map(ref => {
    if (!ref || typeof ref !== "object" || Array.isArray(ref)) throw new ApiError(400, "invalid_inputs", "Choose an exact saved revision.");
    return { assetId: id(ref.assetId, "asset ID"), revisionId: id(ref.revisionId, "revision ID") };
  });
  if (new Set(inputs.map(ref => ref.revisionId)).size !== inputs.length) throw new ApiError(400, "invalid_inputs", "Each saved revision may appear once.");
  const requestedEmployee=input.employeeId===undefined?null:id(input.employeeId,"employee ID");
  if(existing&&existing.execution_model!=="robyn"){
    const {data:refs,error:refsError}=await db.from("studio_assignment_inputs").select("asset_id,revision_id").eq("workspace_id",workspaceId).eq("assignment_id",existing.id);dbFailure(refsError);
    const exact=(rows:Array<{assetId:string;revisionId:string}>)=>JSON.stringify([...rows].sort((a,b)=>a.revisionId.localeCompare(b.revisionId)));
    if(existing.project_id!==projectId||existing.employee_id!==requestedEmployee||existing.brief!==brief||(existing.start_mode??"work")!==startMode||input.appId!==undefined||exact(inputs)!==exact((refs??[]).map(r=>({assetId:r.asset_id,revisionId:r.revision_id}))))throw new ApiError(409,"operation_key_reused","Retry the saved request without changing it.");
    // A lost acknowledgement of a historical request is still its original
    // operation. Never retarget it to the new agent or issue a second job.
    return {assignmentId:existing.id,state:existing.state};
  }
  const {data,error}=await db.from("studio_employees").select("*").eq("workspace_id",workspaceId).eq("employee_key","robyn").is("retired_at",null).maybeSingle();dbFailure(error);
  if(!data)throw new ApiError(503,"robyn_unavailable","Robyn is being prepared. Your draft is preserved.");
  const employee=data as StudioEmployee;
  if(requestedEmployee&&requestedEmployee!==employee.id)throw new ApiError(409,"employee_retired","This saved request targets a previous employee. Your brief is preserved; start a new request with Robyn.");
  const appId=input.appId??null;
  const app=studioApps.find(app=>app.id===appId);
  if(appId!==null&&!app)throw new ApiError(400,"invalid_application","Choose a Craft tool in this Studio.");
  if(app&&!existing&&!isEmployeeReady(app))throw new ApiError(409,"integration_pending","This application is still being verified. Your draft is preserved.");
  if(!existing||grantId){const capacity=await paidCapacity(db,employee);if(!capacity.availableMicros)throw new ApiError(409,capacity.code??"employee_budget_required",`${capacity.reason} Manage budget in Studio settings; your draft is preserved.`);}
  const assignment = await assignmentRpc<Assignment>(db, grantId ? "create_studio_mcp_job" : "create_robyn_assignment", { p_workspace: workspaceId, p_user: userId, ...(grantId ? { p_grant: grantId } : {}), p_project: projectId, p_employee: employee.id, p_request: requestId, p_brief: brief, p_inputs: inputs, p_app:appId,p_allowed_apps:existing?.allowed_app_ids??studioApps.filter(isEmployeeReady).map(app=>app.id),p_mode:startMode });
  await launchAssignment(db, { workspaceId, userId, assignmentId: assignment.id }, assignment);
  return { assignmentId: assignment.id, state: assignment.state };
}
