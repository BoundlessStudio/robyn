import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { loadModule } from "./helpers/module.mjs";

test("a Streamable HTTP client discovers all Crafts and uses the owner and zero-allowance boundaries", async () => {
  const issuer = "https://robyn.example";
  const resource = issuer + "/mcp";
  const env = { NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL, ROBYN_MCP_RUNTIME_SECRET: process.env.ROBYN_MCP_RUNTIME_SECRET };
  process.env.NEXT_PUBLIC_SITE_URL = issuer;
  process.env.ROBYN_MCP_RUNTIME_SECRET = "s".repeat(43);
  const token = "rbm_" + "t".repeat(43);
  const userId = randomUUID(), workspaceId = randomUUID(), grantId = randomUUID(), projectId = randomUUID();
  const employeeId = randomUUID(), foreignProject = randomUUID(), assetId = randomUUID(), revisionId = randomUUID();
  const records = {
    studio_projects: [{ id: projectId, workspace_id: workspaceId, name: "Studio fixture", status: "active" },
      { id: foreignProject, workspace_id: randomUUID(), name: "Foreign project", status: "active" }],
    studio_employees: [{ id: employeeId, workspace_id: workspaceId, kind: "director", app_id: null, employee_key: "robyn",
      retired_at: null, monthly_cap_micros: 0, instance_id: "owned-studio", provision_state: "ready" }],
    studio_managed_budgets: [{ workspace_id: workspaceId, monthly_limit_micros: 0, allocations: { [employeeId]: 0 }, sync_state: "synced", cap_sync: null }],
    studio_assets: [{ id: assetId, workspace_id: workspaceId, project_id: projectId, name: "Sample worksheet",
      asset_kind: "native", app_id: "gridcraft", current_revision_id: revisionId }],
    studio_revisions: [{ id: revisionId, workspace_id: workspaceId, asset_id: assetId, state: "committed", revision_number: 1 }],
    studio_package_files: [{ revision_id: revisionId, workspace_id: workspaceId, path: "Sheet.xlsx", role: "master",
      mime_type: "application/octet-stream", bytes: 50, sha256: "b".repeat(64), storage_key: "fixture-private-key" }],
    studio_revision_dependencies: [],
    studio_assignments: [],
    studio_mcp_operations: [],
    agents: [{ agent37_id: "owned-studio", workspace_id: workspaceId, template: "robyn-studio-0-6-0@1" }],
  };
  const rpcCalls = [];
  globalThis.__externalMcpDb = {
    async rpc(name, input) {
      rpcCalls.push(name);
      if (name === "studio_mcp_identity") {
        assert.equal(input.p_resource, resource);
        return { data: input.p_access_hash === createHash("sha256").update(token).digest("hex") ? { userId, workspaceId, grantId } : null, error: null };
      }
      if (name === "reserve_studio_mcp_operation") {
        assert.equal(input.p_workspace, workspaceId);
        assert.equal(input.p_project, projectId);
        assert.equal(input.p_grant, grantId);
        const op = { id: randomUUID(), workspace_id: workspaceId, project_id: projectId, grant_id: grantId, request_key: input.p_request,
          instance_id: input.p_instance, app_id: input.p_app, request_hash: input.p_request_hash, dispatched_at: null };
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
      const query = {
        select: () => query, order: () => query, limit: () => query,
        eq(key, value) { rows = rows.filter(row => row[key] === value); return query; },
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
  const providerCalls = [];
  globalThis.__externalMcpProvider = {
    async getAgent(id) {
      providerCalls.push("getAgent");
      assert.equal(id, "owned-studio");
      return { id, status: "running", metadata: { app_workspace: workspaceId, studio_employee: employeeId },
        template: "robyn-studio-0-6-0", template_revision: 1, image_digest: "sha256:5f5ad12a65d1d7ceb8c605405f9b6ba63712531a83f38538ae1fdfbf052ee08c" };
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
      "workflow/api": "export const getRun=()=>{throw Error('No workflow expected');};export const start=getRun;",
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
      assert.deepEqual(tools.filter(tool => tool.name.startsWith("run_")).map(tool => tool.name.slice(4)).sort(), pin.applications);
      assert.equal(Object.hasOwn(tools.find(tool => tool.name === "run_dashcraft").inputSchema.properties, "save"), false);
      assert.equal(tools.find(tool => tool.name === "list_assets").annotations.readOnlyHint, true);
      const invoke = (name, args) => client.callTool({ name, arguments: args });
      const list = await invoke("list_assets", { projectId });
      assert.deepEqual(list.structuredContent.assets[0].ref, { assetId, revisionId });
      assert.equal((await invoke("list_assets", { projectId: foreignProject })).isError, true);
      const exact = await invoke("open_asset_revision", { projectId, assetId, revisionId });
      assert.equal(exact.structuredContent.files[0].path, "Sheet.xlsx");
      assert.equal(exact.structuredContent.files[0].storage_key, undefined);
      assert.equal((await invoke("open_asset_revision", { projectId, assetId, revisionId: randomUUID() })).isError, true);
      const allowance = await invoke("get_robyn_allowance", {});
      assert.equal(allowance.structuredContent.monthlyLimitMicros, 0);
      assert.equal(allowance.structuredContent.jobsEnabled, false);
      const job = await invoke("start_robyn_job", { projectId, requestId: randomUUID(), brief: "Make a workbook" });
      assert.equal(job.isError, true);
      assert.match(job.content[0].text, /ai_helper_disabled/);
      assert.ok(rpcCalls.every(name => name === "studio_mcp_identity"));
      assert.deepEqual(providerCalls, []);
      const operationId = randomUUID();
      const direct = await invoke("run_gridcraft", { projectId, operationId, commands: [{ argv: ["--help"] }], inputs: [{ assetId, revisionId }] });
      assert.equal(direct.structuredContent.state, "running");
      assert.equal((await invoke("get_craft_operation", { operationId })).structuredContent.state, "running");
      assert.deepEqual(providerCalls, ["getAgent", "exec", "writeWorkstationFile", "exec"]);
    } finally { await client.close(); }
  } finally {
    delete globalThis.__externalMcpDb;
    delete globalThis.__externalMcpProvider;
    if (originalStorage === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalStorage;
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
