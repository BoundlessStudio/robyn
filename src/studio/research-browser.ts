import "server-only";
import {agent37} from "@/lib/agent37";
import {ApiError} from "@/lib/http";
import {requireStudio,ownedProject,id,dbFailure} from "./server";
import {assignmentRpc,assignmentFenceArgs,ownedAssignment} from "./assignment-server";
import {finishedAssignmentHistory} from "./assignment-protocol";
import {launchAssignment} from "./assignment-launch";
import type {StudioEmployee} from "./assignments";
import {ownedWorkstationMirror} from "./workstation-upgrades";

export async function researchBrowserOwner(projectId:unknown){
  const studio=await requireStudio();
  await ownedProject(studio.db,studio.workspaceId,id(projectId,"project ID"));
  const {data,error}=await studio.db.from("studio_employees").select("*").eq("workspace_id",studio.workspaceId).eq("employee_key","robyn").is("retired_at",null).maybeSingle();dbFailure(error);
  const employee=data as StudioEmployee|null;
  if(!employee?.instance_id||employee.provision_state!=="ready")throw new ApiError(409,"workstation_not_started","Give Robyn a brief first. The private browser opens once the workstation is ready.");
  const instance=await agent37.getAgent(employee.instance_id);
  const {data:mirror,error:mirrorError}=await studio.db.from("agents").select("agent37_id,workspace_id,template").eq("workspace_id",studio.workspaceId).eq("agent37_id",instance.id).maybeSingle();dbFailure(mirrorError);
  ownedWorkstationMirror(instance,{workspaceId:studio.workspaceId},employee,mirror);
  return {...studio,employee,instance};
}

export async function changeResearchControl(owner:Awaited<ReturnType<typeof researchBrowserOwner>>,controlId:string,action:"take"|"return"){
  const {db,workspaceId,user,instance}=owner;
  const args={p_workspace:workspaceId,p_user:user.id,p_employee:owner.employee.id,p_control:controlId};
  const control=async(action:string)=>{
    const {data,error}=await db.rpc("control_studio_research",{...args,p_action:action});
    if(error?.message.includes("browser already controlled")||error?.message.includes("browser control changed"))throw new ApiError(409,"browser_control_changed","Browser control changed. Reconnect to see its current state.");
    dbFailure(error);return data as StudioEmployee;
  };
  let employee=await control(action==="take"?"request":"return");
  if(action==="return"){
    const {data,error}=await db.from("studio_assignments").select("*").eq("workspace_id",workspaceId).eq("employee_id",employee.id).in("state",["queued","running","cancelling"]).order("created_at").limit(1);dbFailure(error);
    if(data?.[0])await launchAssignment(db,{workspaceId,userId:user.id,assignmentId:data[0].id},data[0]);
    return employee;
  }
  if(employee.browser_control==="human")return employee;
  if(employee.browser_assignment_id){
    const job=await ownedAssignment(db,workspaceId,employee.browser_assignment_id);
    if(job.dispatch_state!=="idle"&&job.dispatch_state!=="finished"){
      if(!job.session_id)return employee;
      // Never guess an uncertain dispatch stopped: wait for its actual session.
      const session=await agent37.assignmentSession(instance.id,job.session_id,job.workstation_profile);
      if(session.id!==job.session_id||job.workstation_profile&&session.profile!==undefined&&session.profile!==job.workstation_profile
        ||job.response_id&&session.active_response_id&&session.active_response_id!==job.response_id)throw new ApiError(409,"browser_turn_changed","The current job's browser turn could not be confirmed. Reconnect to try again.");
      if(session.active_response_id){
        if(!job.response_id&&job.workflow_id&&job.run_attempt)await assignmentRpc(db,"record_studio_assignment_response",{...assignmentFenceArgs({workspaceId,userId:user.id,assignmentId:job.id,workflowId:job.workflow_id,attemptId:job.run_attempt}),p_session:job.session_id,p_response:session.active_response_id});
        await agent37.cancelResponse(instance.id,session.active_response_id);
        return employee;
      }
      if(!job.response_id&&finishedAssignmentHistory(session,job.id,job.session_id,job.workstation_profile)===null)return employee;
    }
  }
  employee=await control("confirm");return employee;
}
