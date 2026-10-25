import {createAdminClient} from "@/lib/supabase/admin";
import type {WorkflowKind} from "@/studio/workflow-health";

export async function recordWorkflowHealth(identity:{workspaceId:string;userId:string},kind:WorkflowKind,jobId:string,workflowId:string,error:string|null=null,delay=0) {
  "use step";
  const {error:failure}=await createAdminClient().rpc("record_studio_workflow_health",{p_workspace:identity.workspaceId,p_user:identity.userId,p_kind:kind,p_job:jobId,p_workflow:workflowId,p_error:error,p_delay:delay});
  if(failure)throw Error("workflow_diagnostic_unavailable");
}
