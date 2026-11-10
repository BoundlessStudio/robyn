import { json, handleError } from "@/lib/http";
import { requireStudio, readStudioBody, ownedProject, dbFailure, id } from "@/studio/server";
import { submitRobynAssignment } from "@/studio/assignment-submit";
import type { Assignment, AssignmentSummary } from "@/studio/assignments";
import { isMailProvider } from "@/studio/connected-mail";

export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    const { db, workspaceId } = await requireStudio();
    const projectId = id(new URL(request.url).searchParams.get("projectId"), "project ID");
    await ownedProject(db, workspaceId, projectId);
    const [jobs, employees, campaigns] = await Promise.all([
      db.from("studio_assignments").select("*").eq("workspace_id", workspaceId).eq("project_id", projectId).order("created_at", { ascending: false }).limit(100),
      db.from("studio_employees").select("id,employee_key,role,app_id,kind,retired_at").eq("workspace_id", workspaceId),
      db.from("studio_campaigns").select("id,root_assignment_id,state").eq("workspace_id", workspaceId).eq("project_id", projectId),
    ]);
    for (const result of [jobs, employees, campaigns]) dbFailure(result.error);
    const jobIds = jobs.data?.map(job => job.id) ?? [];
    const [reviews, revisions, shared, steps, mailboxes, drafts] = await Promise.all([
      jobIds.length ? db.from("studio_assignment_reviews").select("assignment_id,decision").eq("workspace_id", workspaceId).in("assignment_id", jobIds) : { data: [], error: null },
      jobIds.length ? db.from("studio_revisions").select("id,asset_id,assignment_id,state").eq("workspace_id", workspaceId).in("assignment_id", jobIds).in("state", ["committed", "conflict"]) : { data: [], error: null },
      jobIds.length ? db.from("studio_assignment_deliverables").select("assignment_id,asset_id,revision_id").eq("workspace_id", workspaceId).in("assignment_id", jobIds) : { data: [], error: null },
      campaigns.data?.length ? db.from("studio_campaign_steps").select("campaign_id,output_refs").eq("workspace_id", workspaceId).in("campaign_id", campaigns.data.map(campaign => campaign.id)) : { data: [], error: null },
      jobIds.length ? db.from("studio_assignment_mail").select("assignment_id,provider").eq("workspace_id", workspaceId).in("assignment_id", jobIds) : { data: [], error: null },
      jobIds.length ? db.from("studio_mail_draft_operations").select("assignment_id,state").eq("workspace_id", workspaceId).in("assignment_id", jobIds).in("state", ["saved", "dispatching"]) : { data: [], error: null },
    ]);
    for (const result of [reviews, revisions, shared, steps, mailboxes, drafts]) dbFailure(result.error);
    const outputs = [...(revisions.data ?? []), ...(shared.data ?? []).map(ref => ({ id: ref.revision_id, asset_id: ref.asset_id, assignment_id: ref.assignment_id, state: "committed" }))];
    const assetIds = [...new Set(outputs.map(ref => ref.asset_id))];
    const assets = assetIds.length ? await db.from("studio_assets").select("id,name").eq("workspace_id", workspaceId).eq("project_id", projectId).in("id", assetIds) : { data: [], error: null };
    dbFailure(assets.error);
    const assignments: AssignmentSummary[] = (jobs.data as Assignment[] ?? []).map(job => {
      const employee = employees.data?.find(employee => employee.id === job.employee_id);
      const campaign = campaigns.data?.find(campaign => campaign.root_assignment_id === job.id);
      const campaignSteps = steps.data?.filter(step => step.campaign_id === campaign?.id) ?? [];
      const deliverables = [...new Map(outputs.filter(ref => ref.assignment_id === job.id).map(ref => [ref.id, ref])).values()];
      const provider = mailboxes.data?.find(mailbox => mailbox.assignment_id === job.id)?.provider;
      const mailOperations = drafts.data?.filter(operation => operation.assignment_id === job.id) ?? [];
      return { id: job.id, employeeId: job.employee_id, role: employee?.retired_at ? "Saved job" : employee?.role ?? "Robyn", appId: job.app_id ?? employee?.app_id ?? null,
        brief: job.brief, state: job.state, result: job.result_text, errorCode: job.error_code, createdAt: job.created_at, finishedAt: job.finished_at,
        browserPaused: job.browser_paused,
        mailDrafts: isMailProvider(provider) && mailOperations.length
          ? { provider, saved: mailOperations.filter(operation => operation.state === "saved").length, unconfirmed: mailOperations.some(operation => operation.state === "dispatching") }
          : null,
        recovering: ["dispatching", "uncertain"].includes(job.dispatch_state) || job.error_code === "workstation_recovering",
        reviewDecision: reviews.data?.find(review => review.assignment_id === job.id)?.decision ?? null,
        purpose: job.purpose, startMode: job.start_mode,
        campaign: campaign ? { id: campaign.id, state: campaign.state, steps: campaignSteps.length, finishedSteps: campaignSteps.filter(step => step.output_refs !== null).length } : null,
        deliverables: deliverables.filter(revision => assets.data?.some(asset => asset.id === revision.asset_id)).map(revision => ({ assetId: revision.asset_id, revisionId: revision.id, name: assets.data?.find(asset => asset.id === revision.asset_id)?.name ?? "Saved work", state: revision.state as "committed" | "conflict" })),
      };
    });
    return json({ assignments, employees: (employees.data ?? []).filter(employee => employee.employee_key === "robyn" && !employee.retired_at).map(employee => ({ id: employee.id, role: "Robyn", appId: null, ready: true })) });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request) {
  try {
    const { db, user, workspaceId } = await requireStudio();
    const input = await readStudioBody(request);
    return json(await submitRobynAssignment({ db, userId: user.id, workspaceId }, input), 202);
  } catch (error) { return handleError(error); }
}
