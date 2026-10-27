import { json, handleError, ApiError } from "@/lib/http";
import { requireStudio, readStudioBody, ownedProject, dbFailure, id, textField } from "@/studio/server";
import { studioTools as studioApps } from "@/studio/tools";
import { isEmployeeReady } from "@/studio/manifest";
import { assignmentRpc } from "@/studio/assignment-server";
import { launchAssignment } from "@/studio/assignment-launch";
import type { Assignment, AssignmentSummary, StudioEmployee } from "@/studio/assignments";
import {paidCapacity} from "@/studio/paid-capacity";

export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    const { db, workspaceId } = await requireStudio();
    const projectId = id(new URL(request.url).searchParams.get("projectId"), "project ID");
    await ownedProject(db, workspaceId, projectId);
    const [jobs, employees, campaigns] = await Promise.all([
      db.from("studio_assignments").select("*").eq("workspace_id", workspaceId).eq("project_id", projectId).order("created_at", { ascending: false }).limit(100),
      db.from("studio_employees").select("id,role,app_id,kind").eq("workspace_id", workspaceId),
      db.from("studio_campaigns").select("id,root_assignment_id,state").eq("workspace_id", workspaceId).eq("project_id", projectId),
    ]);
    for (const result of [jobs, employees, campaigns]) dbFailure(result.error);
    const jobIds = jobs.data?.map(job => job.id) ?? [];
    const [reviews, revisions, shared, steps] = await Promise.all([
      jobIds.length ? db.from("studio_assignment_reviews").select("assignment_id,decision").eq("workspace_id", workspaceId).in("assignment_id", jobIds) : { data: [], error: null },
      jobIds.length ? db.from("studio_revisions").select("id,asset_id,assignment_id,state").eq("workspace_id", workspaceId).in("assignment_id", jobIds).in("state", ["committed", "conflict"]) : { data: [], error: null },
      jobIds.length ? db.from("studio_assignment_deliverables").select("assignment_id,asset_id,revision_id").eq("workspace_id", workspaceId).in("assignment_id", jobIds) : { data: [], error: null },
      campaigns.data?.length ? db.from("studio_campaign_steps").select("campaign_id,output_refs").eq("workspace_id", workspaceId).in("campaign_id", campaigns.data.map(campaign => campaign.id)) : { data: [], error: null },
    ]);
    for (const result of [reviews, revisions, shared, steps]) dbFailure(result.error);
    const outputs = [...(revisions.data ?? []), ...(shared.data ?? []).map(ref => ({ id: ref.revision_id, asset_id: ref.asset_id, assignment_id: ref.assignment_id, state: "committed" }))];
    const assetIds = [...new Set(outputs.map(ref => ref.asset_id))];
    const assets = assetIds.length ? await db.from("studio_assets").select("id,name").eq("workspace_id", workspaceId).eq("project_id", projectId).in("id", assetIds) : { data: [], error: null };
    dbFailure(assets.error);
    const assignments: AssignmentSummary[] = (jobs.data as Assignment[] ?? []).map(job => {
      const employee = employees.data?.find(employee => employee.id === job.employee_id);
      const campaign = campaigns.data?.find(campaign => campaign.root_assignment_id === job.id);
      const campaignSteps = steps.data?.filter(step => step.campaign_id === campaign?.id) ?? [];
      const deliverables = [...new Map(outputs.filter(ref => ref.assignment_id === job.id).map(ref => [ref.id, ref])).values()];
      return { id: job.id, employeeId: job.employee_id, role: employee?.role ?? "Creative employee", appId: employee?.app_id ?? null,
        brief: job.brief, state: job.state, result: job.result_text, errorCode: job.error_code, createdAt: job.created_at, finishedAt: job.finished_at,
        browserPaused: job.browser_paused,
        recovering: ["dispatching", "uncertain"].includes(job.dispatch_state) || job.error_code === "workstation_recovering",
        reviewDecision: reviews.data?.find(review => review.assignment_id === job.id)?.decision ?? null,
        purpose: job.purpose, startMode: job.start_mode,
        campaign: campaign ? { id: campaign.id, state: campaign.state, steps: campaignSteps.length, finishedSteps: campaignSteps.filter(step => step.output_refs !== null).length } : null,
        deliverables: deliverables.filter(revision => assets.data?.some(asset => asset.id === revision.asset_id)).map(revision => ({ assetId: revision.asset_id, revisionId: revision.id, name: assets.data?.find(asset => asset.id === revision.asset_id)?.name ?? "Saved work", state: revision.state as "committed" | "conflict" })),
      };
    });
    return json({ assignments, employees: (employees.data ?? []).map(employee => ({ id: employee.id, role: employee.role, appId: employee.app_id, ready: employee.kind === "director" || studioApps.some(app => app.id === employee.app_id && isEmployeeReady(app)) })) });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request) {
  try {
    const { db, user, workspaceId } = await requireStudio();
    const input = await readStudioBody(request);
    const projectId = id(input.projectId, "project ID");
    const project = await ownedProject(db, workspaceId, projectId);
    if (project.status !== "active") throw new ApiError(409, "project_archived", "Reactivate this project before assigning new work.");
    let query = db.from("studio_employees").select("*").eq("workspace_id", workspaceId);
    if (input.employeeId !== undefined) query = query.eq("id", id(input.employeeId, "employee ID"));
    else if (typeof input.appId === "string") query = query.eq("app_id", input.appId).eq("kind", "specialist");
    else throw new ApiError(400, "employee_required", "Choose a creative employee.");
    const { data, error } = await query.maybeSingle(); dbFailure(error);
    if (!data) throw new ApiError(404, "not_found", "Employee not found.");
    const employee = data as StudioEmployee;
    const startMode=input.startMode??"work";
    if(typeof startMode!=="string"||!["work","draft","plan"].includes(startMode))throw new ApiError(400,"invalid_start_mode","Choose how you want to begin.");
    if(startMode!=="work"&&employee.kind!=="director")throw new ApiError(400,"director_required","Start this idea with the Director.");
    if (employee.kind === "specialist" && !studioApps.some(app => app.id === employee.app_id && isEmployeeReady(app))) throw new ApiError(409, "integration_pending", "This employee's application is still being verified.");
    const brief = textField(input.brief, 20000, "Assignment brief");
    const requestId = id(input.requestId, "request ID");
    const {data:existing,error:existingError}=await db.from("studio_assignments").select("id").eq("workspace_id",workspaceId).eq("project_id",projectId).eq("request_key",requestId).maybeSingle();dbFailure(existingError);
    if(!existing){const capacity=await paidCapacity(db,employee);if(!capacity.availableMicros)throw new ApiError(409,capacity.code??"employee_budget_required",`${capacity.reason} Manage budget in Studio settings; your draft is preserved.`);}
    if (!Array.isArray(input.inputs) || input.inputs.length > 100) throw new ApiError(400, "invalid_inputs", "Supply up to 100 exact saved revisions.");
    const inputs = input.inputs.map(ref => {
      if (!ref || typeof ref !== "object" || Array.isArray(ref)) throw new ApiError(400, "invalid_inputs", "Choose an exact saved revision.");
      return { assetId: id(ref.assetId, "asset ID"), revisionId: id(ref.revisionId, "revision ID") };
    });
    if (new Set(inputs.map(ref => ref.revisionId)).size !== inputs.length) throw new ApiError(400, "invalid_inputs", "Each saved revision may appear once.");
    const assignment = await assignmentRpc<Assignment>(db, "create_studio_start_assignment", { p_workspace: workspaceId, p_user: user.id, p_project: projectId, p_employee: employee.id, p_request: requestId, p_brief: brief, p_inputs: inputs, p_mode:startMode });
    await launchAssignment(db, { workspaceId, userId: user.id, assignmentId: assignment.id }, assignment);
    return json({ assignmentId: assignment.id, state: assignment.state }, 202);
  } catch (error) { return handleError(error); }
}
