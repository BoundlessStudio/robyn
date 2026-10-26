import { readFile } from "node:fs/promises";
import path from "node:path";
import { agent37 } from "@/lib/agent37";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DB } from "@/lib/auth";
import { ApiError } from "@/lib/http";
import { ensureEmployeeInstance } from "@/studio/workstation";
import type { StudioEmployee } from "@/studio/assignments";
import { acquireStock, type StockRecord } from "@/studio/media-providers";
import { ownedMediaJob, mediaDbFailure } from "@/studio/media-server";
import { estimatedMediaCost, permittedMediaUrl, type MediaIdentity, type MediaJob } from "@/studio/media";
import {paidCapacity} from "@/studio/paid-capacity";
import {managedHeadroom,verifyBudgetInstance} from "@/studio/employee-budgets";
import { validateRevisionPackage, type PackageFile } from "@/studio/assets";
import { preparePackageTransfers, readSavedPackage } from "@/studio/package-store";
import { revisionFiles, verifyStoredFiles, dbFailure, ownedAsset } from "@/studio/server";
import { mediaNeedsSettlement, mediaTerminal as terminal, mediaCanCancelUnpaid } from "@/studio/media-recovery";

interface Observation { phase: string; needsRequest?: boolean; files?: PackageFile[]; actualMicros?: number; paymentSubmitted?: boolean; providerJobId?: string; providerModel?: string; receipt?: Record<string, unknown>; errorCode?: string; metadata?: Record<string, unknown> }
const allowedMediaHosts = ["commons.wikimedia.org", "upload.wikimedia.org", "thumb.wikimedia.org", "blockrun.ai", "storage.blockrun.ai", "cdn.blockrun.ai", "trezalabs.com", "www.trezalabs.com", "cdn.trezalabs.com", "storage.googleapis.com", "fal.media"];
const workerRoot = (job: MediaJob) => `/home/node/.robyn/media/${job.id}`;

async function updateJob(db: DB, identity: MediaIdentity, job: MediaJob, values: Record<string, unknown>) {
  let query = db.from("studio_media_jobs").update({ ...values, updated_at: new Date().toISOString() }).eq("id", job.id).eq("workspace_id", identity.workspaceId).eq("created_by", identity.userId).eq("workflow_id", job.workflow_id);
  if (!terminal(job)) query = query.not("state", "in", "(completed,failed,cancelled)");
  const { error } = await query;
  mediaDbFailure(error);
}

/** Bootstrap/observe a fenced persistent process. All file bytes, signed upload
 * tickets and provider credentials stay inside this step and its workstation. */
async function remoteJob(instanceId: string, job: MediaJob, workerRequest: Record<string, unknown> | null, transfers?: Record<string, unknown>, settleOnly = false, cleanupOnly = false): Promise<Observation> {
  const source = await readFile(path.join(process.cwd(), "src/studio/media-worker.py"), "utf8");
  const envelope = Buffer.from(JSON.stringify({ root: workerRoot(job), source, request: workerRequest, allowedHosts: allowedMediaHosts, settleOnly, cleanupOnly, committedRevisionId: cleanupOnly && job.billing_settled ? job.revision_id : null, reconcileOnly: workerRequest ? Boolean(workerRequest.reconcileOnly) : job.operation === "generate" && !["preparing", "queued"].includes(job.state), providerJobId: job.provider_job_id, transfers: transfers ?? null })).toString("base64");
  const bootstrap = `import base64,json,os,subprocess,sys,shutil
from pathlib import Path
os.umask(0o077)
x=json.loads(base64.b64decode('${envelope}'))
r=Path(x['root']);r.mkdir(parents=True,exist_ok=True)
def save(name,data):
 t=r/(name+'.tmp');t.write_text(json.dumps(data));os.replace(t,r/name)
if x['request'] and not (r/'request.json').exists():save('request.json',x['request'])
if x['transfers']:save('transfers.json',x['transfers'])
s=json.loads((r/'state.json').read_text()) if (r/'state.json').exists() else {'phase':'preparing'}
if not (r/'request.json').exists():
 print(json.dumps({'phase':'preparing','needsRequest':True}));raise SystemExit(0)
if x['cleanupOnly'] and x['committedRevisionId']:save('committed.json',{'revisionId':x['committedRevisionId'],'billingSettled':True})
mode='cleanup' if x['cleanupOnly'] else 'settle' if x['settleOnly'] else 'upload' if x['transfers'] else 'process'
if mode=='process' and s.get('phase')!='uploaded' and (not shutil.which('ffmpeg') or not shutil.which('ffprobe')):
 submitted=bool(s.get('paymentSubmitted') or (r/'submission.json').exists() or (r/'provider-receipt.json').exists() or x['reconcileOnly'] or x['providerJobId'])
 s.update(phase='failed',errorCode='media_tools_missing',paymentSubmitted=submitted);print(json.dumps(s));raise SystemExit(0)
alive=False
if (r/'worker.pid').exists():
 try:
  pid=int((r/'worker.pid').read_text());alive=str(r/'worker.py').encode() in Path('/proc/'+str(pid)+'/cmdline').read_bytes()
 except (OSError,ValueError):pass
if not alive and x['source']:
 t=r/'worker.py.tmp';t.write_text(x['source']);os.replace(t,r/'worker.py')
 config=json.loads((r/'request.json').read_text());config['allowedHosts']=list(set(config['allowedHosts']+x['allowedHosts']))
 if x['reconcileOnly']:config['reconcileOnly']=True
 if x['providerJobId']:config['providerJobId']=x['providerJobId']
 save('request.json',config)
unknown=s.get('phase')=='uncertain' and not (r/'provider-receipt.json').exists() and not x['providerJobId']
if not alive and not unknown and ((mode=='cleanup' and s.get('phase')!='cleaned') or (mode=='settle' and s.get('phase') not in ('settled','cleaned')) or (mode in ('process','upload') and s.get('phase') not in ('uploaded','cleaned') and (mode=='upload' or not s.get('files')))):
 subprocess.Popen([sys.executable,str(r/'worker.py'),str(r),mode],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
 s['phase']='uploading' if mode=='upload' else 'running'
print(json.dumps(s))
`;
  const result = await agent37.exec(instanceId, `python3 -c 'import base64;exec(base64.b64decode("${Buffer.from(bootstrap).toString("base64")}"))'`);
  if (result.exit_code || result.truncated) throw new ApiError(503, "media_workstation_recovering", "The media workstation is recovering.");
  return JSON.parse(result.stdout);
}

async function workerRequest(db: DB, identity: MediaIdentity, job: MediaJob) {
  const allowedHosts = [...allowedMediaHosts];
  const request: Record<string, unknown> = { jobId: job.id, kind: job.kind, operation: job.operation, allowedHosts };
  if (job.operation === "import") {
    let record = job.provider_metadata as StockRecord | undefined;
    if (!record) {
      const { data, error } = await db.from("studio_media_discoveries").select("metadata").eq("workspace_id", identity.workspaceId).eq("project_id", identity.projectId).eq("id", job.discovery_id).single(); mediaDbFailure(error);
      if (!data) throw new ApiError(404, "not_found", "Media discovery not found.");
      record = await acquireStock(data.metadata as StockRecord);
      await updateJob(db, identity, job, { provider_metadata: record });
      job.provider_metadata = { ...record };
    }
    request.sourceUrl = permittedMediaUrl(record.downloadUrl, "commons");
    request.sourceSha1 = record.sourceSha1;
    request.attribution = record.attribution;
  } else {
    request.generation = {...job.request,maxCostMicros:Number(job.reserved_micros)};
    request.reconcileOnly = !["preparing", "queued", "waiting_budget", "waiting_capacity"].includes(job.state);
    request.providerJobId = job.provider_job_id;
    const ref = job.request.inputs[0];
    if (ref) {
      const asset = await ownedAsset(db, identity.workspaceId, ref.assetId);
      if (asset.project_id !== identity.projectId || asset.asset_kind !== "image") throw new ApiError(400, "image_source_required", "Image editing requires an exact saved source-image revision.");
      const pkg = await readSavedPackage(db, identity.workspaceId, ref.revisionId);
      if (pkg.ref.assetId !== ref.assetId) throw new ApiError(404, "not_found", "Image revision not found.");
      const image = pkg.files.find(file => file.role === "master" && file.mimeType.startsWith("image/"));
      if (!image) throw new ApiError(409, "image_source_required", "This source revision does not contain an image.");
      request.inputUrl = permittedMediaUrl(image.downloadUrl, "storage", process.env.NEXT_PUBLIC_SUPABASE_URL);
      request.inputMime = image.mimeType;
      allowedHosts.push(new URL(image.downloadUrl).hostname);
    }
  }
  return request;
}

/** A terminal job may collect financial evidence, but never receives source
 * inputs, upload tickets or permission to publish an asset. */
async function settleJob(db: DB, identity: MediaIdentity, job: MediaJob): Promise<"wait" | "done"> {
  if (!mediaNeedsSettlement(job)) return "done";
  if (!job.instance_id) {
    await updateJob(db, identity, job, { error_code: "payment_workstation_missing" });
    return "done";
  }
  const instance = await agent37.getAgent(job.instance_id);
  if (instance.metadata?.app_workspace !== identity.workspaceId) throw new ApiError(409, "media_workstation_ownership", "The payment workstation is not owned by this studio.");
  if (["sleeping", "stopped"].includes(instance.status)) { await agent37.start(instance.id); return "wait"; }
  if (instance.status !== "running") return "wait";
  const observed = await remoteJob(instance.id, job, {
    jobId: job.id, operation: "generate", kind: job.kind, allowedHosts: allowedMediaHosts,
    reconcileOnly: true, providerJobId: job.provider_job_id,
  }, undefined, true);
  if (Number.isSafeInteger(observed.actualMicros) && Number(observed.actualMicros) >= 0) {
    const { error } = await db.rpc("settle_media_charge", { p_workspace: identity.workspaceId, p_user: identity.userId,
      p_job: job.id, p_workflow: job.workflow_id, p_actual: observed.actualMicros, p_receipt: observed.receipt ?? {} });
    mediaDbFailure(error);
    return job.state === "completed" ? "wait" : "done";
  }
  await updateJob(db, identity, job, {
    error_code: observed.errorCode ?? "payment_settlement_pending",
    ...(observed.providerJobId ? { provider_job_id: observed.providerJobId } : {}),
  });
  return observed.phase === "uncertain" ? "done" : "wait";
}

async function cleanupCompletedJob(job: MediaJob, workspaceId: string): Promise<"wait" | "done"> {
  if (job.state !== "completed" || !job.billing_settled || !job.instance_id || !job.revision_id) return "done";
  const instance = await agent37.getAgent(job.instance_id);
  if (instance.metadata?.app_workspace !== workspaceId) throw new ApiError(409,"media_workstation_ownership","The media workstation is not owned by this studio.");
  // Housekeeping does not wake a stopped workstation. It can run on reconnect.
  if (instance.status !== "running") return "done";
  const result = await remoteJob(instance.id,job,null,undefined,false,true);
  return result.phase === "cleaned" ? "done" : "wait";
}

export async function processMediaJob(identity: MediaIdentity, jobId: string, workflowId: string): Promise<"wait" | "done"> {
  "use step";
  const db = createAdminClient();
  const { data: workspace, error: ownerError } = await db.from("workspaces").select("id").eq("id", identity.workspaceId).eq("owner_id", identity.userId).maybeSingle(); dbFailure(ownerError);
  if (!workspace) return "done";
  let job = await ownedMediaJob(db, identity, jobId);
  if (terminal(job) && !mediaNeedsSettlement(job)) return cleanupCompletedJob(job, identity.workspaceId);
  const { data: claimed, error: claimError } = await db.rpc("claim_media_job", { p_workspace: identity.workspaceId, p_user: identity.userId, p_job: jobId, p_workflow: workflowId }); mediaDbFailure(claimError);
  if (!claimed) return "done";
  job = await ownedMediaJob(db, identity, jobId);
  if (terminal(job)) return settleJob(db, identity, job);
  // Revocation after external submission prevents late publication. A paid
  // outcome remains reserved until its charge is actually known.
  const { data: project,error:projectError } = await db.from("studio_projects").select("status").eq("workspace_id", identity.workspaceId).eq("id", identity.projectId).maybeSingle();dbFailure(projectError);
  const assignment = job.assignment_id ? await db.from("studio_assignments").select("state").eq("workspace_id", identity.workspaceId).eq("id", job.assignment_id).maybeSingle() : null;
  const scope = job.assignment_id ? await db.rpc("studio_employee_scope", { p_hash: job.employee_token_hash }) : null;
  dbFailure(assignment?.error??null);
  if(scope?.error&&!scope.error.message.includes("employee access denied"))dbFailure(scope.error);
  if (project?.status !== "active" || job.assignment_id && (assignment?.data?.state !== "running" || scope?.error || scope?.data?.projectId !== identity.projectId)) {
    await updateJob(db, identity, job, { state: "cancelled", error_code: "media_authorization_revoked", ...(job.operation === "import" || mediaCanCancelUnpaid(job) ? { actual_micros: 0, billing_settled: true } : {}) });
    return settleJob(db, identity, await ownedMediaJob(db, identity, jobId));
  }
  try {
    const initial=["preparing","queued","waiting_budget","waiting_capacity"].includes(job.state);
    // The Director buys generation for the whole team. The requesting employee
    // remains on the job for authorization and provenance.
    if(initial){
      const {data:director,error}=await db.from("studio_employees").select("*").eq("workspace_id",identity.workspaceId).eq("kind","director").single();dbFailure(error);
      const payer=director as StudioEmployee;
      if(job.operation==="generate"){
        const capacity=await paidCapacity(db,payer,job.id);
        if(capacity.availableMicros<estimatedMediaCost(job.request)){
          await updateJob(db,identity,job,{state:"waiting_budget",reserved_micros:0,error_code:capacity.code??"director_budget_required"});return "wait";
        }
      }
      if(!job.instance_id){
        const instance=await ensureEmployeeInstance(db,{workspaceId:identity.workspaceId,userId:identity.userId,assignmentId:job.id},payer);
        if(!instance)return "wait";
        await updateJob(db,identity,job,{instance_id:instance.id,budget_employee_id:payer.id});job.instance_id=instance.id;job.budget_employee_id=payer.id;
      }
      if(job.operation==="generate"){
        // Read gross headroom here; the serialized SQL reservation deducts all
        // other unsettled jobs, including holds from previous calendar months.
        const instance=await verifyBudgetInstance(payer);
        const {data:amount,error}=await db.rpc("reserve_media_charge",{p_workspace:identity.workspaceId,p_user:identity.userId,p_job:job.id,p_workflow:workflowId,p_available:managedHeadroom(await agent37.getBudget(instance!.id)),p_required:estimatedMediaCost(job.request)});mediaDbFailure(error);
        if(!amount)return "wait";
        job.reserved_micros=Number(amount);job.state="preparing";
      }
    }
    if (!job.instance_id) {
      const query = db.from("studio_employees").select("*").eq("workspace_id", identity.workspaceId);
      const { data: employee, error } = job.employee_id ? await query.eq("id", job.employee_id).single() : await query.eq("kind", "director").single(); dbFailure(error);
      const instance = await ensureEmployeeInstance(db, { workspaceId: identity.workspaceId, userId: identity.userId, assignmentId: job.id }, employee as StudioEmployee);
      if (!instance) return "wait";
      await updateJob(db, identity, job, { instance_id: instance.id }); job.instance_id = instance.id;
    }
    const instance = await agent37.getAgent(job.instance_id);
    if (instance.metadata?.app_workspace !== identity.workspaceId) throw new ApiError(409, "media_workstation_ownership", "The media workstation is not owned by this studio.");
    if (["sleeping", "stopped"].includes(instance.status)) { await agent37.start(instance.id); return "wait"; }
    if (instance.status !== "running") return "wait";
    const request = job.state === "preparing" || job.state === "queued" ? await workerRequest(db, identity, job) : null;
    if (request) {
      const { data: dispatched, error } = await db.rpc("begin_media_dispatch", { p_workspace: identity.workspaceId, p_user: identity.userId, p_job: job.id, p_workflow: workflowId });
      mediaDbFailure(error);
      if (!dispatched) return "wait";
      job.state = "running";
    }
    let observed = await remoteJob(job.instance_id, job, request);
    if (observed.phase === "preparing" && !request) observed = await remoteJob(job.instance_id, job, await workerRequest(db, identity, job));
    const knownCost = job.billing_settled && job.actual_micros !== null ? Number(job.actual_micros) : null;
    const cost = Number.isSafeInteger(observed.actualMicros) && Number(observed.actualMicros) >= 0 ? Number(observed.actualMicros) : knownCost;
    const billing = { ...(job.operation === "import" ? { actual_micros: 0, billing_settled: true } : cost === null ? {} : { actual_micros: cost, billing_settled: true }),
      ...(job.operation === "generate" && observed.receipt ? { provider_metadata: { receipt: observed.receipt, model: observed.providerModel ?? null } } : {}) };
    if (observed.phase === "failed" || observed.phase === "uncertain") {
      await updateJob(db, identity, job, { state: observed.phase, error_code: observed.errorCode ?? "media_processing_failed", ...billing, ...(observed.paymentSubmitted === false && !job.provider_job_id && job.actual_micros === null ? { actual_micros: 0, billing_settled: true } : {}), ...(observed.providerJobId ? { provider_job_id: observed.providerJobId } : {}) });
      return "done";
    }
    if (!observed.files) { await updateJob(db, identity, job, { state: ["submitting", "processing", "uploading"].includes(observed.phase) ? observed.phase : "running", error_code: null, ...billing, ...(observed.providerJobId ? { provider_job_id: observed.providerJobId } : {}) }); return "wait"; }
    if (!job.revision_id) {
      const pkg = validateRevisionPackage({ files: observed.files, dependencies: job.request.inputs, message: "Acquired source media" });
      const provenance = { ...(job.provider_metadata ?? {}), provider: job.provider, mediaJobId: job.id, acquiredAt: new Date().toISOString(), service: job.request.service ?? null,
        prompt: job.request.prompt ?? null, model: observed.providerModel ?? job.request.settings?.model ?? null, requestedModel: job.request.settings?.model ?? "provider default", settings: job.request.settings ?? {}, inputs: job.request.inputs, reservedMicros: Number(job.reserved_micros), actualMicros: job.operation === "import" ? 0 : cost,
        billingPending: job.operation === "generate" && cost === null, budgetEmployeeId:job.budget_employee_id??null, estimatedMicros:job.operation==="generate"?estimatedMediaCost(job.request):0, providerJobId: observed.providerJobId ?? null, receipt: observed.receipt ?? null, mediaMetadata: observed.metadata ?? {} };
      // Provider signed URLs and search thumbnails are not durable provenance.
      delete (provenance as Record<string, unknown>).downloadUrl;
      delete (provenance as Record<string, unknown>).previewUrl;
      await updateJob(db, identity, job, { state: "processing", error_code: null, ...billing, ...(observed.providerJobId ? { provider_job_id: observed.providerJobId } : {}) });
      const { error } = await db.rpc("prepare_media_package", { p_workspace: identity.workspaceId, p_user: identity.userId, p_job: job.id, p_package: pkg, p_provenance: provenance }); mediaDbFailure(error);
      job = await ownedMediaJob(db, identity, jobId);
    }
    if (observed.phase !== "uploaded") {
      const transfers = await preparePackageTransfers(db, identity.workspaceId, job.revision_id!);
      const endpoint = new URL(transfers.resumableEndpoint);
      const ticket = { ...transfers, publicApiKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, allowedStorageHosts: [endpoint.hostname] };
      observed = await remoteJob(job.instance_id!, job, null, ticket);
      if (observed.phase !== "uploaded") return "wait";
    }
    const verified = await verifyStoredFiles(db, await revisionFiles(db, identity.workspaceId, job.revision_id!));
    const { error } = await db.rpc("complete_media_job", { p_workspace: identity.workspaceId, p_user: identity.userId, p_job: job.id, p_verified: verified }); mediaDbFailure(error);
    return "wait";
  } catch (error) {
    if (error instanceof ApiError && [400, 403, 404, 409].includes(error.status)) {
      await updateJob(db, identity, job, { state: "failed", error_code: error.code,
        ...(job.operation === "import" || ["preparing", "queued"].includes(job.state) ? { actual_micros: 0, billing_settled: true } : {}) });
      return "done";
    }
    throw error;
  }
}
