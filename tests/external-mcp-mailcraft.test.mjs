import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { studioDatabase } from "./helpers/database.mjs";
import { applyStudioMigrations } from "./helpers/robyn-database.mjs";
import { loadModule } from "./helpers/module.mjs";

test("External MCP uses only exact active mailboxes approved for that connection", async () => {
  const db = await studioDatabase();
  const issuer = "https://robyn.example";
  const resource = issuer + "/mcp";
  const before = { NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL, ROBYN_MCP_RUNTIME_SECRET: process.env.ROBYN_MCP_RUNTIME_SECRET };
  process.env.NEXT_PUBLIC_SITE_URL = issuer;
  process.env.ROBYN_MCP_RUNTIME_SECRET = "a".repeat(43);
  const sha = bytes => createHash("sha256").update(bytes).digest("hex");
  const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.value;
  const [owner, otherOwner] = [randomUUID(), randomUUID()];
  const work = "ca_work1234", second = "ca_work5678", personal = "ca_home1234", pending = "ca_pending";
  const clients = [];
  try {
    await db.exec("alter table auth.users add column banned_until timestamptz");
    await applyStudioMigrations(db, "0035_connected_mail.sql");
    await db.query("insert into auth.users(id,email_confirmed_at) values ($1,now()),($2,now())", [owner, otherOwner]);
    const workspace = await scalar("select initialize_studio($1,'[]') as value", [owner]);
    const otherWorkspace = await scalar("select initialize_studio($1,'[]') as value", [otherOwner]);
    const employee = await scalar("select id as value from studio_employees where workspace_id=$1", [workspace]);
    const clientId = await scalar("insert into studio_mcp_clients(name,redirect_uris,auth_method) values('QA','{https://fixture.test/callback}','none') returning id as value");
    const tokens = ["x", "y", "z"].map(value => "rbm_" + value.repeat(43));
    const makeGrant = (user, space, token) => scalar(
      "insert into studio_mcp_grants(client_id,user_id,workspace_id,resource,access_hash,refresh_hash) values($1,$2,$3,$4,$5,$6) returning id as value",
      [clientId, user, space, resource, sha(token), randomUUID()],
    );
    const grant = await makeGrant(owner, workspace, tokens[0]);
    const secondGrant = await makeGrant(owner, workspace, tokens[1]);
    const foreignGrant = await makeGrant(otherOwner, otherWorkspace, tokens[2]);
    await applyStudioMigrations(db);
    for (const role of ["anon", "authenticated"]) {
      assert.equal(await scalar("select has_table_privilege($1,'studio_mcp_mailboxes','SELECT') as value", [role]), false);
      assert.equal(await scalar("select has_function_privilege($1,'set_studio_mcp_mailbox(uuid,uuid,uuid,text,text,text)','EXECUTE') as value", [role]), false);
    }

    let instanceId = "mailcraft-qa";
    const bind = async instance => {
      await db.query("insert into agents(workspace_id,agent37_id,template) values($1,$2,'robyn-studio-0-9-0@1')", [workspace, instance]);
      await db.query("update studio_employees set instance_id=$2,provision_state='ready' where id=$1", [employee, instance]);
    };
    await bind(instanceId);
    const providerAccounts = [
      { id: work, toolkitSlug: "gmail", status: "ACTIVE" },
      { id: second, toolkitSlug: "gmail", status: "ACTIVE" },
      { id: personal, toolkitSlug: "outlook", status: "ACTIVE" },
      { id: pending, toolkitSlug: "gmail", status: "PENDING" },
    ];
    const providerCalls = [];
    const reads = [];
    const helperPin = JSON.parse(await readFile(new URL("../src/studio/mailcraft-helper.json", import.meta.url), "utf8"));
    let duringRead;
    const api = {
      async rpc(name, args) {
        const values = Object.values(args).map(value => Array.isArray(value) ? JSON.stringify(value) : value);
        const signature = `${name}(${values.map((_, i) => "$" + (i + 1)).join(",")})`;
        if (name === "list_studio_mcp_mailboxes") return { data: (await db.query("select * from " + signature, values)).rows, error: null };
        return { data: await scalar("select " + signature + " as value", values), error: null };
      },
      from(table) {
        const predicates = [], values = [];
        let projection = "r.*";
        let suffix = "";
        const rows = async () => (await db.query(`select ${projection} from ${table} r where ${predicates.join(" and ")} ${suffix}`, values)).rows;
        const query = {
          select(selection) {
            if (table === "studio_mcp_grants" && selection.includes("mailboxAccess")) {
              projection = `r.id,r.created_at,
                (select jsonb_build_object('name',name) from studio_mcp_clients where id=r.client_id) as client,
                (select coalesce(jsonb_agg(m),'[]') from studio_mcp_mailboxes m where m.grant_id=r.id) as "mailboxAccess"`;
            }
            return query;
          },
          eq(key, value) { predicates.push(`r.${key}=$${values.push(value)}`); return query; },
          is(key, value) { assert.equal(value, null); predicates.push(`r.${key} is null`); return query; },
          gt(key, value) { predicates.push(`r.${key}>$${values.push(value)}`); return query; },
          order(key) { assert.equal(key, "created_at"); return query; },
          limit(count) { suffix = "limit " + count; return query; },
          async maybeSingle() { return { data: (await rows())[0] ?? null, error: null }; },
          single() { return query.maybeSingle(); },
          then(resolve, reject) { return rows().then(data => ({ data, error: null })).then(resolve, reject); },
        };
        return query;
      },
    };
    globalThis.__mcpMailcraft = { api, owner, provider: {
      async getAgent(id) {
        providerCalls.push("instance");
        assert.equal(id, instanceId);
        return { id, status: "sleeping", metadata: { app_workspace: workspace, studio_employee: employee } };
      },
      async listIntegrationConnections(id) {
        providerCalls.push("connections");
        assert.equal(id, instanceId);
        return { connections: providerAccounts };
      },
      async readMailcraft(id, helper, { mailbox, request }) {
        assert.equal(id, instanceId);
        assert.equal(helper.length, helperPin.bytes);
        assert.equal(sha(helper), helperPin.sha256);
        reads.push(mailbox);
        if (duringRead) await duringRead();
        if (request.kind === "tasks") return { error: "The existing grant does not allow this read." };
        return { result: { kind: request.kind, messages: [{ id: "message1", subject: "Synthetic mailbox " + mailbox.connectionId }] } };
      },
    } };
    const mocks = {
      "server-only": "",
      "@/lib/supabase/admin": "export const createAdminClient=()=>globalThis.__mcpMailcraft.api;",
      "@/lib/auth": "export const requireUser=async()=>({db:globalThis.__mcpMailcraft.api,user:{id:globalThis.__mcpMailcraft.owner}});",
      "@/lib/agent37": "export const agent37=globalThis.__mcpMailcraft.provider;export class Agent37Error extends Error {}",
      "workflow/api": "export const getRun=()=>{throw Error('Unexpected workflow');};export const start=getRun;",
    };
    const [mcp, management] = await Promise.all([
      loadModule("../../src/app/api/studio/external-mcp/route.ts", mocks),
      loadModule("../../src/app/api/studio/mcp-oauth/[action]/route.ts", mocks),
    ]);
    for (const token of tokens.slice(0, 2)) {
      const client = new Client({ name: "mailcraft-mcp-fixture", version: "1.0.0" });
      await client.connect(new StreamableHTTPClientTransport(new URL(resource), {
        requestInit: { headers: { Authorization: "Bearer " + token } },
        fetch: (url, init) => init?.method === "POST" ? mcp.POST(new Request(url, init)) : mcp.GET(new Request(url, init)),
      }));
      clients.push(client);
    }
    const [client, otherClient] = clients;
    const invoke = (name, args, actor = client) => actor.callTool({ name, arguments: args });
    const discover = async actor => (await invoke("list_mailcraft_accounts", {}, actor)).structuredContent.mailboxes;
    const read = (mailConnectionId, kind = "mail") => invoke("read_mailcraft", { mailConnectionId, view: { kind } });
    const code = result => JSON.parse(result.content[0].text).error.code;
    const change = (connection, mailConnectionId, decision, origin = issuer) => management.POST(new Request(issuer + "/api/studio/mcp-oauth/mailbox", {
      method: "POST", headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ connection, mailConnectionId, decision }),
    }), { params: Promise.resolve({ action: "mailbox" }) });
    const settings = async () => {
      const response = await management.GET(new Request(issuer + "/api/studio/mcp-oauth/connections"), { params: Promise.resolve({ action: "connections" }) });
      assert.equal(response.status, 200);
      return response.json();
    };

    const { tools } = await client.listTools();
    const descriptor = tools.find(tool => tool.name === "read_mailcraft");
    assert.equal(descriptor.annotations.readOnlyHint, true);
    assert.deepEqual([...descriptor.inputSchema.required].sort(), ["mailConnectionId", "view"]);
    assert.deepEqual(await discover(), []);
    assert.equal(code(await read(work)), "mcp_mailbox_access_denied");
    assert.deepEqual(providerCalls, []);
    assert.equal((await change(foreignGrant, work, "allow")).status, 404);
    assert.equal((await change(grant, work, "allow", "https://wrong.example")).status, 403);
    assert.deepEqual(providerCalls, []);
    assert.equal((await change(grant, pending, "allow")).status, 409);

    assert.equal((await change(grant, work, "allow")).status, 303);
    assert.equal((await change(grant, work, "allow")).status, 303);
    assert.deepEqual(await discover(), [{ mailConnectionId: work, provider: "gmail", label: "Gmail · work1234" }]);
    assert.deepEqual(await discover(otherClient), []);
    assert.equal(code(await invoke("read_mailcraft", { view: { kind: "mail" } })), "invalid_arguments");
    assert.equal(code(await read(work, "send")), "invalid_arguments");
    assert.equal(code(await read(personal)), "mcp_mailbox_access_denied");
    assert.deepEqual(reads, []);
    assert.equal((await read(work)).structuredContent.result.messages[0].subject, "Synthetic mailbox " + work);

    assert.equal((await change(grant, second, "allow")).status, 303);
    assert.equal((await change(secondGrant, personal, "allow")).status, 303);
    assert.deepEqual((await discover()).map(row => row.mailConnectionId), [work, second]);
    assert.equal((await read(second)).structuredContent.mailConnectionId, second);
    assert.deepEqual(await discover(otherClient), [{ mailConnectionId: personal, provider: "outlook", label: "Microsoft 365 · home1234" }]);
    assert.equal(code(await invoke("read_mailcraft", { mailConnectionId: personal, view: { kind: "tasks" } }, otherClient)), "mailcraft_read_unavailable");
    const state = await settings();
    assert.deepEqual(state.mailboxes.map(row => row.mailConnectionId), [work, second, personal]);
    assert.equal(state.connections.length, 2);
    assert.equal(state.connections.find(row => row.id === grant).mailboxes.every(mailbox => mailbox.active), true);
    assert.equal(JSON.stringify(state).includes(instanceId), false);

    duringRead = async () => { assert.equal((await change(grant, work, "remove")).status, 303); };
    const revokedDuringRead = await read(work);
    assert.equal(code(revokedDuringRead), "mcp_mailbox_access_denied");
    assert.equal(JSON.stringify(revokedDuringRead).includes("Synthetic mailbox"), false);
    duringRead = undefined;
    providerAccounts[1].isDisabled = true;
    assert.deepEqual(await discover(), []);
    assert.equal(code(await read(second)), "mail_connection_inactive");
    providerAccounts[1].isDisabled = false;
    const previousReads = reads.length;
    instanceId = "replacement-workstation";
    await bind(instanceId);
    assert.deepEqual(await discover(), []);
    assert.equal(code(await read(second)), "mailcraft_read_unconfirmed");
    assert.equal(reads.length, previousReads);
    assert.equal((await change(grant, second, "remove")).status, 303);
  } finally {
    for (const client of clients) await client.close();
    delete globalThis.__mcpMailcraft;
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await db.close();
  }
});
