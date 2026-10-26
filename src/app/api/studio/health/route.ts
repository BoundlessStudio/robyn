import {json,handleError} from "@/lib/http";
import {requireStudio,dbFailure} from "@/studio/server";
import {workflowNeedsAttention} from "@/studio/workflow-health";
import {mediaStatusMessage} from "@/studio/media-status";
export async function GET() {
  try{
    const{db,workspaceId}=await requireStudio();
    const{data,error}=await db.from("studio_workflow_health").select("*").eq("workspace_id",workspaceId).order("last_checked_at",{ascending:false}).limit(201);dbFailure(error);
    const rows=(data??[]).slice(0,200).map(row=>({kind:row.kind,jobId:row.job_id,projectId:row.project_id,state:row.last_state,lastSuccessAt:row.last_success_at,lastProgressAt:row.last_progress_at,lastCheckedAt:row.last_checked_at,errorCode:row.last_error_code,detail:row.kind==="media"&&row.fingerprint?.error?mediaStatusMessage(row.fingerprint.error):null,retryAt:row.next_retry_at,failures:row.consecutive_failures,needsAttention:workflowNeedsAttention(row)}));
    return json({jobs:rows,truncated:(data??[]).length>200});
  }catch(error){return handleError(error);}
}
