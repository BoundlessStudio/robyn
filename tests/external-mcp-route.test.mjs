import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { loadModule } from "./helpers/module.mjs";

const workstationImage = JSON.parse(await readFile(new URL("../src/studio/workstation-image.json", import.meta.url), "utf8"));
const [workstationTemplate, workstationRevision] = workstationImage.template.split("@");

test("a Streamable HTTP client discovers Studio and Craft tools within the owner and zero-allowance boundaries", async () => {
  const issuer = "https://robyn.example";
  const resource = issuer + "/mcp";
  const env = { NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL, ROBYN_MCP_RUNTIME_SECRET: process.env.ROBYN_MCP_RUNTIME_SECRET };
  process.env.NEXT_PUBLIC_SITE_URL = issuer;
  process.env.ROBYN_MCP_RUNTIME_SECRET = "s".repeat(43);
  const token = "rbm_" + "t".repeat(43);
  const userId = randomUUID(), workspaceId = randomUUID(), grantId = randomUUID(), projectId = randomUUID();
  const employeeId = randomUUID(), foreignProject = randomUUID(), assetId = randomUUID(), revisionId = randomUUID();
  const archivedProject = randomUUID(), otherWorkspace = randomUUID(), newProject = randomUUID(), assignmentId = randomUUID();
  const timestamp = "2026-11-05T16:00:00.123456+00:00";
  const editedTimestamp = "2026-11-05T16:00:00.123457+00:00";
  const sheet = { asset_kind: "native", app_id: "gridcraft", created_at: timestamp };
  const archiveSheets = Array.from({ length: 50 }, (_, index) => ({ ...sheet, id: randomUUID(), workspace_id: workspaceId,
    project_id: archivedProject, name: index === 0 ? "Worksheet %_*[1]" : `Worksheet ${index}`, current_revision_id: randomUUID() }));
  const worksheet = archiveSheets[0];
  const unfinishedSheet = { ...worksheet, id: randomUUID(), current_revision_id: randomUUID() };
  const foreignSheet = { ...worksheet, id: randomUUID(), workspace_id: otherWorkspace, project_id: foreignProject, current_revision_id: randomUUID() };
  const runningJob = { id: assignmentId, workspace_id: workspaceId, project_id: projectId, app_id: "gridcraft",
    execution_model: "robyn", state: "running", brief: "Make a worksheet. ".repeat(20), created_at: timestamp,
    started_at: timestamp, finished_at: null, workflow_id: "worksheet-job", result_text: null, error_code: null };
  const oldOperation = { id: randomUUID(), request_key: randomUUID(), workspace_id: workspaceId, project_id: projectId,
    grant_id: grantId, app_id: "wordcraft", created_at: timestamp, dispatched_at: timestamp, finished_at: timestamp,
    result: { outcome: "completed", commands: [{ stdout: "Native output" }] } };
  const otherGrantOperation = { ...oldOperation, id: randomUUID(), request_key: randomUUID(), grant_id: randomUUID() };
  const records = {
    studio_projects: [{ id: projectId, workspace_id: workspaceId, name: "Studio fixture", brief: "A working brief", status: "active",
      created_at: timestamp, updated_at: timestamp },
      { id: archivedProject, workspace_id: workspaceId, name: "Archived fixture", status: "archived" },
      { id: foreignProject, workspace_id: otherWorkspace, name: "Foreign project", status: "active" }],
    studio_employees: [{ id: employeeId, workspace_id: workspaceId, kind: "director", app_id: null, employee_key: "robyn",
      retired_at: null, monthly_cap_micros: 0, instance_id: "owned-studio", provision_state: "ready" }],
    studio_managed_budgets: [{ workspace_id: workspaceId, monthly_limit_micros: 0, allocations: { [employeeId]: 0 }, sync_state: "synced", cap_sync: null }],
    studio_assets: [{ ...sheet, id: assetId, workspace_id: workspaceId, project_id: projectId, name: "Sample worksheet",
      current_revision_id: revisionId }, ...archiveSheets, unfinishedSheet, foreignSheet],
    studio_revisions: [{ id: revisionId, workspace_id: workspaceId, asset_id: assetId, state: "committed", revision_number: 1 },
      ...[...archiveSheets, unfinishedSheet, foreignSheet].map(asset => ({ id: asset.current_revision_id,
        workspace_id: asset.workspace_id, asset_id: asset.id, state: asset === unfinishedSheet ? "uploading" : "committed" }))],
    studio_package_files: [{ revision_id: revisionId, workspace_id: workspaceId, path: "Sheet.xlsx", role: "master",
      mime_type: "application/octet-stream", bytes: 50, sha256: "b".repeat(64), storage_key: "fixture-private-key" }],
    studio_revision_dependencies: [],
    studio_assignments: [runningJob, { ...runningJob, id: randomUUID(), execution_model: "legacy" },
      { ...runningJob, id: randomUUID(), project_id: foreignProject, workspace_id: otherWorkspace },
      { ...runningJob, id: randomUUID(), project_id: archivedProject, state: "completed", finished_at: timestamp }],
    studio_assignment_deliverables: [{ workspace_id: workspaceId, assignment_id: assignmentId, asset_id: assetId, revision_id: revisionId }],
    studio_mcp_operations: [oldOperation, otherGrantOperation],
    agents: [{ agent37_id: "owned-studio", workspace_id: workspaceId, template: workstationImage.template }],
  };
  const rpcCalls = [];
  globalThis.__externalMcpDb = {
    async rpc(name, input) {
      rpcCalls.push(name);
      if (name === "studio_mcp_identity") {
        assert.equal(input.p_resource, resource);
        return { data: input.p_access_hash === createHash("sha256").update(token).digest("hex") ? { userId, workspaceId, grantId } : null, error: null };
      }
      if (["create_studio_mcp_project", "update_studio_mcp_project", "cancel_studio_mcp_job"].includes(name)) {
        assert.equal(input.p_workspace, workspaceId);
        assert.equal(input.p_user, userId);
        assert.equal(input.p_grant, grantId);
      }
      if (name === "create_studio_mcp_project") {
        assert.equal(input.p_creation, newProject);
        const row = { id: input.p_creation, workspace_id: workspaceId, name: input.p_name, brief: input.p_brief,
          status: "active", created_at: timestamp, updated_at: timestamp };
        records.studio_projects.push(row);
        return { data: row, error: null };
      }
      if (name === "update_studio_mcp_project") {
        assert.equal(input.p_project, projectId);
        const row = records.studio_projects[0];
        if (input.p_expected_updated_at !== row.updated_at) return { data: null, error: { message: "project changed" } };
        assert.equal(input.p_name, null);
        row.brief = input.p_brief;
        row.updated_at = editedTimestamp;
        return { data: row, error: null };
      }
      if (name === "cancel_studio_mcp_job") {
        assert.equal(input.p_project, projectId);
        assert.equal(input.p_assignment, assignmentId);
        runningJob.state = "cancelling";
        return { data: runningJob, error: null };
      }
      if (name === "reserve_studio_mcp_operation") {
        assert.equal(input.p_workspace, workspaceId);
        assert.equal(input.p_project, projectId);
        assert.equal(input.p_grant, grantId);
        const op = { id: randomUUID(), workspace_id: workspaceId, project_id: projectId, grant_id: grantId, request_key: input.p_request,
          instance_id: input.p_instance, app_id: input.p_app, request_hash: input.p_request_hash,
          created_at: timestamp, dispatched_at: null, finished_at: null };
        records.studio_mcp_operations.push(op);
        return { data: op, error: null };
      }
      if (name === "dispatch_studio_mcp_operation") {
        records.studio_mcp_operations.find(op => op.id === input.p_operation).dispatched_at = new Date().toISOString();
        return { data: true, error: null };
      }
      assert.fail("Unexpected RPC " + name);
    },
    from(table) {
      let rows = [...records[table]];
      const order = [];
      const query = {
        select(fields) {
          if (fields.includes("project:studio_projects")) rows = rows.map(row => ({ ...row,
            project: records.studio_projects.find(project => project.id === row.project_id),
            revision: records.studio_revisions.find(revision => revision.id === row.current_revision_id) }));
          if (fields.includes("outcome:result->>outcome")) rows = rows.map(row => ({ ...row, outcome: row.result?.outcome }));
          return query;
        },
        order(key, options) { order.push({ key, ascending: options?.ascending ?? true }); return query; },
        limit(count) {
          rows.sort((left, right) => {
            for (const { key, ascending } of order) {
              const difference = String(left[key]).localeCompare(String(right[key]));
              if (difference) return ascending ? difference : -difference;
            }
            return 0;
          });
          rows = rows.slice(0, count);
          return query;
        },
        overrideTypes: () => query,
        eq(key, value) {
          const [column, nested] = key.split(".");
          rows = rows.filter(row => (nested ? row[column]?.[nested] : row[column]) === value);
          return query;
        },
        filter(key, operator, pattern) {
          assert.equal(operator, "imatch");
          const match = new RegExp(pattern, "i");
          rows = rows.filter(row => match.test(row[key]));
          return query;
        },
        or(clause) {
          const [, key, time, id] = /^(\w+)\.lt\.(.+),and\(\1\.eq\.\2,id\.lt\.([0-9a-f-]+)\)$/.exec(clause);
          rows = rows.filter(row => row[key] < time || row[key] === time && row.id < id);
          return query;
        },
        is(key, value) { return query.eq(key, value); },
        in(key, values) { rows = rows.filter(row => values.includes(row[key])); return query; },
        not(key, operator, value) { assert.equal(operator, "is"); rows = rows.filter(row => row[key] !== value); return query; },
        async maybeSingle() { return { data: rows[0] ?? null, error: null }; },
        async single() { return query.maybeSingle(); },
        then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
      };
      return query;
    },
  };
  const workflowWakes = [];
  globalThis.__externalMcpGetRun = id => {
    assert.equal(id, runningJob.workflow_id);
    return { exists: true, status: "running", async wakeUp() { workflowWakes.push(id); } };
  };
  const providerCalls = [];
  globalThis.__externalMcpProvider = {
    async getAgent(id) {
      providerCalls.push("getAgent");
      assert.equal(id, "owned-studio");
      return { id, status: "running", metadata: { app_workspace: workspaceId, studio_employee: employeeId },
        template: workstationTemplate, template_revision: Number(workstationRevision), image_digest: workstationImage.release };
    },
    async exec(id, command) {
      assert.equal(id, "owned-studio");
      providerCalls.push("exec");
      assert.ok(!command.includes("rbw_"));
      return { exit_code: 0, stdout: "ready" };
    },
    async writeWorkstationFile(id, path, bytes) {
      assert.equal(id, "owned-studio");
      assert.match(path, /\/config-[\da-f-]+\.json$/);
      const config = JSON.parse(bytes);
      assert.match(config.token, /^rbw_/);
      assert.equal(config.kind, "direct");
      assert.equal(config.endpoint.split("?")[0], issuer + "/api/studio/mcp-runtime");
      providerCalls.push("writeWorkstationFile");
    },
  };
  const originalStorage = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://storage-fixture.supabase.co";
  try {
    const { POST, GET } = await loadModule("../../src/app/api/studio/external-mcp/route.ts", {
      "server-only": "",
      "@/lib/supabase/admin": "export const createAdminClient=()=>globalThis.__externalMcpDb;",
      "@/lib/agent37": "export const agent37=globalThis.__externalMcpProvider;export class Agent37Error extends Error {}",
      "workflow/api": "export const getRun=(id)=>globalThis.__externalMcpGetRun(id);export const start=()=>{throw Error('No new workflow expected');};",
    });
    const first = await GET(new Request(resource));
    assert.equal(first.status, 401);
    assert.match(first.headers.get("www-authenticate"), /oauth-protected-resource\/mcp/);
    assert.equal((await GET(new Request(resource, { headers: { origin: "https://wrong.example" } }))).status, 403);
    assert.equal((await GET(new Request(resource, { headers: { authorization: "Bearer rbs_" + "e".repeat(43) } }))).status, 401);
    const transport = new StreamableHTTPClientTransport(new URL(resource), {
      requestInit: { headers: { Authorization: "Bearer " + token } },
      fetch: (url, init) => init?.method === "POST" ? POST(new Request(url, init)) : GET(new Request(url, init)),
    });
    const client = new Client({ name: "robyn-mcp-test", version: "1.0.0" });
    try {
      await client.connect(transport);
      assert.equal(client.getServerVersion().name, "robyn");
      const { tools } = await client.listTools();
      const pin = JSON.parse(await readFile(new URL("../src/studio/mcp/runtime-release.json", import.meta.url), "utf8"));
      assert.equal(tools.length, 19 + pin.applications.length);
      for (const name of ["get_project", "create_project", "update_project", "search_library", "list_robyn_jobs", "list_craft_operations", "cancel_robyn_job"]) {
        assert.ok(tools.some(tool => tool.name === name), `${name} appears in tool discovery`);
      }
      assert.deepEqual(tools.filter(tool => tool.name.startsWith("run_")).map(tool => tool.name.slice(4)).sort(), pin.applications);
      const importer = tools.find(tool => tool.name === "import_assets");
      assert.deepEqual(importer._meta["openai/fileParams"], ["files"]);
      const attachment = importer.inputSchema.properties.files.items;
      assert.deepEqual(Object.keys(attachment.properties).sort(), ["download_url", "file_id", "file_name", "mime_type"]);
      assert.deepEqual(attachment.required.sort(), ["download_url", "file_id"]);
      assert.equal(tools.find(tool => tool.name === "download_asset").annotations.readOnlyHint, true);
      assert.equal(tools.find(tool => tool.name === "rename_asset").annotations.readOnlyHint, false);
      assert.equal(Object.hasOwn(tools.find(tool => tool.name === "run_dashcraft").inputSchema.properties, "save"), false);
      assert.equal(tools.find(tool => tool.name === "list_assets").annotations.readOnlyHint, true);
      assert.equal(tools.find(tool => tool.name === "cancel_robyn_job").annotations.destructiveHint, true);
      const invoke = (name, args) => client.callTool({ name, arguments: args });
      const { crafts } = (await invoke("list_crafts", {})).structuredContent;
      for (const [appId, name, formats] of [
        ["scriptcraft", "ScriptCraft", [".fdx", ".fountain"]],
        ["flarecraft", "AniCraft", [".flare"]],
        ["pcbcraft", "PCBCraft", [".pc.zip"]],
        ["pixelcraft", "PixelCraft", [".oxypix"]],
      ]) {
        const command = "run_" + appId;
        const craft = crafts.find(entry => entry.appId === appId);
        assert.equal(craft?.name, name);
        assert.equal(craft.tool, command);
        assert.deepEqual([...craft.nativeFormats].sort(), formats);
        assert.equal(tools.find(entry => entry.name === command)?.title, "Run " + name + " commands");
      }
      const expectError = async (name, args, code) => {
        const result = await invoke(name, args);
        assert.equal(result.isError, true);
        assert.equal(JSON.parse(result.content[0].text).error.code, code);
      };
      const project = (await invoke("get_project", { projectId })).structuredContent;
      assert.deepEqual(project, { projectId, name: "Studio fixture", brief: "A working brief", status: "active",
        createdAt: timestamp, updatedAt: timestamp });
      await expectError("get_project", { projectId: foreignProject }, "not_found");
      const list = await invoke("list_assets", { projectId });
      assert.deepEqual(list.structuredContent.assets[0].ref, { assetId, revisionId });
      assert.equal((await invoke("list_assets", { projectId: foreignProject })).isError, true);
      const exact = await invoke("open_asset_revision", { projectId, assetId, revisionId });
      assert.equal(exact.structuredContent.files[0].path, "Sheet.xlsx");
      assert.equal(exact.structuredContent.files[0].storage_key, undefined);
      assert.equal((await invoke("open_asset_revision", { projectId, assetId, revisionId: randomUUID() })).isError, true);
      const literal = (await invoke("search_library", { query: "WORKSHEET %_*[1]", kind: "native", appId: "gridcraft" })).structuredContent;
      assert.deepEqual(literal, { assets: [{ name: worksheet.name, appId: "gridcraft", kind: "native",
        ref: { assetId: worksheet.id, revisionId: worksheet.current_revision_id }, projectId: archivedProject,
        projectName: "Archived fixture", projectStatus: "archived" }], nextCursor: null });
      const page = (await invoke("search_library", { query: "worksheet" })).structuredContent;
      assert.equal(page.assets.length, 50);
      assert.ok(page.nextCursor);
      const next = (await invoke("search_library", { query: "worksheet", cursor: page.nextCursor })).structuredContent;
      assert.equal(next.assets.length, 1);
      assert.equal(next.nextCursor, null);
      assert.deepEqual([...page.assets, ...next.assets].map(asset => asset.ref.assetId),
        [assetId, ...archiveSheets.map(asset => asset.id)].sort().reverse());
      await expectError("search_library", { query: "worksheet", cursor: "bad-cursor" }, "invalid_cursor");
      const jobs = (await invoke("list_robyn_jobs", { state: "running" })).structuredContent;
      assert.deepEqual(jobs, { jobs: [{ assignmentId, projectId, appId: "gridcraft", state: "running",
        briefExcerpt: runningJob.brief.slice(0, 240), createdAt: timestamp, startedAt: timestamp, finishedAt: null }], nextCursor: null });
      const archivedJobs = (await invoke("list_robyn_jobs", { projectId: archivedProject })).structuredContent;
      assert.equal(archivedJobs.jobs.length, 1);
      assert.equal(archivedJobs.jobs[0].state, "completed");
      await expectError("list_robyn_jobs", { projectId: foreignProject }, "not_found");
      const operations = (await invoke("list_craft_operations", { projectId, appId: "wordcraft" })).structuredContent;
      assert.deepEqual(operations, { operations: [{ operationId: oldOperation.request_key, projectId, appId: "wordcraft",
        state: "completed", createdAt: timestamp, finishedAt: timestamp }], nextCursor: null });
      await expectError("get_craft_operation", { operationId: otherGrantOperation.request_key }, "not_found");
      await expectError("list_craft_operations", { projectId: foreignProject }, "not_found");
      const allowance = await invoke("get_robyn_allowance", {});
      assert.equal(allowance.structuredContent.monthlyLimitMicros, 0);
      assert.equal(allowance.structuredContent.jobsEnabled, false);
      const job = await invoke("start_robyn_job", { projectId, requestId: randomUUID(), brief: "Make a workbook" });
      assert.equal(job.isError, true);
      assert.match(job.content[0].text, /ai_helper_disabled/);
      assert.ok(rpcCalls.every(name => name === "studio_mcp_identity"));

      const created = (await invoke("create_project", { creationId: newProject, name: "  A new project  " })).structuredContent;
      assert.deepEqual(created, { projectId: newProject, name: "A new project", brief: "", status: "active",
        createdAt: timestamp, updatedAt: timestamp });
      await expectError("update_project", { projectId, expectedUpdatedAt: timestamp }, "invalid_arguments");
      await expectError("update_project", { projectId, expectedUpdatedAt: timestamp, status: "archived" }, "invalid_arguments");
      await expectError("update_project", { projectId: foreignProject, expectedUpdatedAt: timestamp, brief: "" }, "not_found");
      const edit = (await invoke("update_project", { projectId, expectedUpdatedAt: project.updatedAt, brief: "" })).structuredContent;
      assert.deepEqual(edit, { ...project, updatedAt: editedTimestamp, brief: "" });
      await expectError("update_project", { projectId, expectedUpdatedAt: timestamp, brief: "Stale edit" }, "project_changed");
      await expectError("cancel_robyn_job", { projectId: archivedProject, assignmentId }, "not_found");
      assert.deepEqual(workflowWakes, []);
      const stopped = (await invoke("cancel_robyn_job", { projectId, assignmentId })).structuredContent;
      assert.deepEqual(stopped, { assignmentId, state: "cancelling" });
      assert.deepEqual(workflowWakes, [runningJob.workflow_id]);
      const polled = (await invoke("get_robyn_job", { projectId, assignmentId })).structuredContent;
      assert.equal(polled.state, "cancelling");
      assert.deepEqual(polled.deliverables, [{ assetId, revisionId, status: "committed" }]);
      assert.deepEqual(providerCalls, []);
      const operationId = randomUUID();
      const direct = await invoke("run_gridcraft", { projectId, operationId, commands: [{ argv: ["--help"] }], inputs: [{ assetId, revisionId }] });
      assert.equal(direct.structuredContent.state, "running");
      assert.equal((await invoke("get_craft_operation", { operationId })).structuredContent.state, "running");
      const directHistory = (await invoke("list_craft_operations", { appId: "gridcraft" })).structuredContent;
      assert.deepEqual(directHistory.operations.map(operation => operation.operationId), [operationId]);
      assert.deepEqual(providerCalls, ["getAgent", "exec", "writeWorkstationFile", "exec"]);
    } finally { await client.close(); }
  } finally {
    delete globalThis.__externalMcpDb;
    delete globalThis.__externalMcpProvider;
    delete globalThis.__externalMcpGetRun;
    if (originalStorage === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalStorage;
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
