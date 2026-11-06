import "server-only";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult, type Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ApiError } from "@/lib/api-error";
import { studioApps } from "@/studio/apps/registry";
import { ownedAssignment } from "@/studio/assignment-server";
import { submitRobynAssignment } from "@/studio/assignment-submit";
import { isEmployeeReady } from "@/studio/manifest";
import { dbFailure, ownedProject } from "@/studio/server";
import { scope } from "./config";
import { listAssets, listProjects, listRevisions, openAsset } from "./library";
import type { McpIdentity } from "./oauth";
import { currentRobyn, getCraftOperation, runCraft } from "./operations";
import runtime from "./runtime-release.json";
import { assetRef, craftRequest, pageFields, uuid } from "./schemas";

type Result = Record<string, unknown>;
type Definition = { descriptor: Tool; call: (identity: McpIdentity, input: unknown) => Promise<Result> | Result };

function tool<S extends z.ZodType>(
  name: string, title: string, description: string, input: S, readOnly: boolean,
  call: (identity: McpIdentity, args: z.output<S>) => Promise<Result> | Result,
  openWorld = false,
): Definition {
  return {
    descriptor: {
      name, title, description,
      inputSchema: z.toJSONSchema(input, { target: "draft-07", io: "input" }) as Tool["inputSchema"],
      outputSchema: { type: "object" },
      annotations: { readOnlyHint: readOnly, destructiveHint: !readOnly, idempotentHint: true, openWorldHint: openWorld },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: [scope] }] },
    },
    call(identity, raw) {
      const parsed = input.safeParse(raw ?? {});
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new ApiError(400, "invalid_arguments", `${issue.path.map(String).join(".") || "arguments"}: ${issue.message}`);
      }
      return call(identity, parsed.data);
    },
  };
}

const crafts = studioApps.filter(app => isEmployeeReady(app) && runtime.applications.includes(app.id));
const project = { projectId: uuid.describe("The project ID from list_projects.") };
const catalog = [
  tool("list_crafts", "List Crafts", "Find the installed Crafts, native file formats and direct command tool names.", z.strictObject({}), true,
    () => ({ crafts: crafts.map(app => ({ appId: app.id, name: app.name, tool: "run_" + app.id, capabilities: app.capabilities,
      nativeFormats: app.formats.native, readOnly: app.editor.mode === "readOnly" })) })),
  tool("list_projects", "List Studio projects", "Find owned Studio projects by name or status. Use projectId to scope file and job requests.",
    z.strictObject({ ...pageFields, status: z.enum(["active", "archived"]).optional() }), true, listProjects),
  tool("list_assets", "List library assets", "Find saved native files, Notes, media and file collections in the project. Use the exact assetId and revisionId when opening a file.",
    z.strictObject({ ...project, ...pageFields, appId: z.string().max(80).optional(), kind: z.enum(["native", "image", "audio", "video", "file"]).optional() }), true, listAssets),
  tool("list_asset_revisions", "List asset revisions", "Find confirmed revisions and preserved conflicts for one asset. Use this to choose an exact version.",
    z.strictObject({ ...project, assetId: uuid, cursor: pageFields.cursor }), true, listRevisions),
  tool("open_asset_revision", "Open an exact asset revision", "Read the exact package manifest and dependencies. Set includeDownloads when the user wants short-lived private download links.",
    z.strictObject({ ...project, ...assetRef.shape, includeDownloads: z.boolean().default(false) }), true, openAsset),
  tool("get_robyn_allowance", "Read the Studio AI allowance", "Check the Studio's configured monthly AI allowance. A zero allowance blocks Robyn jobs. Direct Craft commands and library access use no AI allowance.",
    z.strictObject({}), true, async ({ db, workspaceId }) => {
      const [employee, policy] = await Promise.all([
        currentRobyn(db, workspaceId),
        db.from("studio_managed_budgets").select("monthly_limit_micros,sync_state,cap_sync").eq("workspace_id", workspaceId).maybeSingle(),
      ]);
      dbFailure(policy.error);
      const monthlyLimitMicros = Number(policy.data?.monthly_limit_micros ?? employee.monthly_cap_micros ?? 0);
      return { monthlyLimitMicros, jobsEnabled: monthlyLimitMicros > 0 && (!policy.data || policy.data.sync_state === "synced" && !policy.data.cap_sync),
        directCraftsEnabled: true, currency: "USD" };
    }),
  tool("start_robyn_job", "Start a Robyn AI job",
    "Delegate a task to Robyn using the Studio AI allowance. Use direct Craft tools for explicit application commands. Poll get_robyn_job. Retry the same requestId and arguments if the response is interrupted.",
    z.strictObject({ ...project, requestId: uuid, brief: z.string().trim().min(1).max(20000), appId: z.string().max(80).optional(),
      startMode: z.enum(["work", "draft", "plan"]).default("work"), inputs: z.array(assetRef).max(100).default([]) }),
    false, submitRobynAssignment, true),
  tool("get_robyn_job", "Read a Robyn job", "Read the saved status, result and confirmed output revisions for an existing job.",
    z.strictObject({ ...project, assignmentId: uuid }), true, async ({ db, workspaceId }, input) => {
      await ownedProject(db, workspaceId, input.projectId);
      const job = await ownedAssignment(db, workspaceId, input.assignmentId);
      if (job.project_id !== input.projectId) throw new ApiError(404, "not_found", "Job not found in this project.");
      const [revisions, shared] = await Promise.all([
        db.from("studio_revisions").select("id,asset_id,state").eq("workspace_id", workspaceId).eq("assignment_id", job.id).in("state", ["committed", "conflict"]),
        db.from("studio_assignment_deliverables").select("asset_id,revision_id").eq("workspace_id", workspaceId).eq("assignment_id", job.id),
      ]);
      dbFailure(revisions.error); dbFailure(shared.error);
      const deliverables = [...(revisions.data ?? []).map(row => ({ assetId: row.asset_id, revisionId: row.id, status: row.state })),
        ...(shared.data ?? []).map(row => ({ assetId: row.asset_id, revisionId: row.revision_id, status: "committed" }))];
      return { assignmentId: job.id, projectId: job.project_id, state: job.state, result: job.result_text, errorCode: job.error_code,
        deliverables: [...new Map(deliverables.map(row => [row.revisionId, row])).values()] };
    }),
  tool("get_craft_operation", "Read a direct Craft operation", "Get native command output, small requested exports and any confirmed saved revision. Reuse the original operationId if the launch response was interrupted.",
    z.strictObject({ operationId: uuid }), true, (identity, input) => getCraftOperation(identity, input.operationId)),
  ...crafts.map(app => tool("run_" + app.id, "Run " + app.name + " commands",
    `Run the installed ${app.name} engine directly in an isolated project working copy. Supports ${app.capabilities.join(", ")}. Start with argv ["--help"]. Poll get_craft_operation for results.${app.editor.mode === "readOnly" ? " This Craft computes and exports results in its working copy with no library writes." : " Request a confirmed native save with save."} Runs independently of the Studio AI allowance.`,
    app.editor.mode === "readOnly" ? craftRequest.omit({ save: true }) : craftRequest, false,
    (identity, input) => runCraft(identity, app, input))),
];

function result(value: Result): CallToolResult {
  const operation = value.result as Record<string, unknown> | undefined;
  const preview = operation?.preview as { data: string; mimeType: string } | undefined;
  const exports = operation?.exports as { path: string; data: string }[] | undefined;
  let output = value;
  if (operation && (preview || exports)) {
    const { preview: _image, exports: _files, ...receipt } = operation;
    output = { ...value, result: { ...receipt, ...(exports ? { exports: exports.map(file => file.path) } : {}) } };
  }
  return { structuredContent: output, content: [{ type: "text", text: JSON.stringify(output) },
    ...(preview ? [{ type: "image" as const, data: preview.data, mimeType: preview.mimeType }] : []),
    ...(exports ?? []).map(file => ({ type: "resource" as const, resource: {
      uri: `robyn://craft-operations/${value.operationId}/exports/${encodeURIComponent(file.path)}`,
      mimeType: "application/octet-stream", blob: file.data,
    } }))] };
}

export function createMcpServer(identity: McpIdentity) {
  const server = new Server({ name: "robyn", title: "Robyn", version: "1.0.0" }, { capabilities: { tools: {} },
    instructions: "Use exact project, asset and revision IDs from the private Studio library. Direct Craft commands use the installed application without an AI turn. Start a Robyn job only when the creator wants delegation and the Studio allowance permits it." });
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: catalog.map(entry => entry.descriptor) }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    try {
      const entry = catalog.find(tool => tool.descriptor.name === params.name);
      if (!entry) throw new ApiError(404, "unknown_tool", "Choose a tool listed by Robyn.");
      return result(await entry.call(identity, params.arguments));
    } catch (error) {
      if (!(error instanceof ApiError)) console.error("[external-mcp] tool failed", params.name);
      const details = error instanceof ApiError ? { code: error.code, message: error.message }
        : { code: "studio_unavailable", message: "Robyn could not complete this request." };
      return { content: [{ type: "text", text: JSON.stringify({ error: details }) }], isError: true };
    }
  });
  return server;
}
