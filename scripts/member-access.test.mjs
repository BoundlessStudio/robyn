import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as jsxRuntime from 'react/jsx-runtime';
import * as assignmentInput from '../src/lib/assignment-input.ts';
import * as profileInput from '../src/lib/agent-profile-input.ts';
import * as budgetInput from '../src/lib/budget-input.ts';
import * as agentConfig from '../src/config/agents.ts';
import * as costHelpers from '../src/lib/agent-costs.ts';
import * as userProfile from '../src/lib/user-profile.ts';

// Execute the real handlers/helpers with fake external services, so these tests cannot
// provision billed instances or require a live Supabase project.
function loadSource(relativePath, dependencies) {
  const source = fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, Request, Response, URL, console, process, setInterval, clearInterval,
    require(name) {
      assert.ok(name in dependencies, `Unexpected dependency ${name} in ${relativePath}`);
      return dependencies[name];
    },
  }, { filename: relativePath });
  return exports;
}

const resourceInput = loadSource('src/lib/resource-input.ts', { '@/config/agents': agentConfig });
const budgetRequestInput = loadSource('src/lib/budget-request-input.ts', { './budget-input': budgetInput });

class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const http = {
  ApiError,
  json: (data, status = 200) => Response.json(data, { status }),
  handleError: (error) => Response.json({ error: { message: error.message } }, { status: error.status || 500 }),
  readJson: (request) => request.json().catch(() => ({})),
};
const ADMIN = '00000000-0000-4000-8000-000000000001';
const MEMBER = '00000000-0000-4000-8000-000000000002';
const OTHER = '00000000-0000-4000-8000-000000000003';
const WORKSPACE = '00000000-0000-4000-8000-000000000004';

function fixture(userId = MEMBER, sharedTables) {
  const tables = sharedTables ?? {
    memberships: [
      { workspace_id: WORKSPACE, user_id: ADMIN, role: 'admin' },
      { workspace_id: WORKSPACE, user_id: MEMBER, role: 'member' },
      { workspace_id: WORKSPACE, user_id: OTHER, role: 'member' },
    ],
    agents: [
      { agent37_id: 'mine', workspace_id: WORKSPACE, assigned_user_id: MEMBER, created_by: ADMIN, name: 'My agent', status: 'running' },
      { agent37_id: 'other', workspace_id: WORKSPACE, assigned_user_id: OTHER, created_by: MEMBER, name: 'Other agent', status: 'running' },
      { agent37_id: 'unassigned', workspace_id: WORKSPACE, assigned_user_id: null, created_by: MEMBER, status: 'stopped' },
      { agent37_id: 'foreign', workspace_id: 'another-workspace', assigned_user_id: MEMBER, status: 'running' },
    ],
    invitations: [],
    agent_budget_requests: [],
  };
  const calls = [];
  const authUsers = new Map([ADMIN, MEMBER, OTHER].map((id) => [id, {
    id, email: `${id}@example.com`, phone: '+14165550000',
    user_metadata: { full_name: id === MEMBER ? 'Member name' : 'Other name', phone_number: '+14165550123', unrelated: 'keep me' },
    app_metadata: { role: 'authenticated' },
  }]));
  const db = {
    auth: { admin: {
      async getUserById(id) { calls.push({ profileRead: id }); return { data: { user: authUsers.get(id) ?? null }, error: null }; },
      async updateUserById(id, attributes) {
        calls.push({ profileWrite: id, attributes });
        const target = authUsers.get(id);
        if (!target) return { data: { user: null }, error: { message: 'private provider details' } };
        Object.assign(target.user_metadata, attributes.user_metadata);
        return { data: { user: target }, error: null };
      },
    } },
    from(table) {
      const filters = [];
      let insert, update, remove = false, selected = '*', maxRows = Infinity;
      const project = (row) => table !== 'agent_budget_requests' || selected === '*' ? row :
        Object.fromEntries(selected.split(',').map((key) => [key, row[key]]));
      const evaluate = () => {
        if (insert) {
          if (table === 'agent_budget_requests' && tables[table].some((row) =>
            ['agent37_id', 'requester_id', 'idempotency_key'].every((key) => row[key] === insert[key]))) {
            return { data: null, error: { code: '23505' } };
          }
          tables[table].push({ token: 'invite-token', id: `request-${tables[table].length}`, created_at: new Date().toISOString(), ...insert });
          return { data: project(tables[table].at(-1)), error: null };
        }
        const data = tables[table].filter((row) => filters.every(([key, value]) => row[key] === value)).slice(0, maxRows);
        if (update) data.forEach((row) => Object.assign(row, update));
        if (remove) tables[table] = tables[table].filter((row) => !data.includes(row));
        return { data: data.map(project), error: null };
      };
      const query = {
        select: (fields = '*') => { selected = fields; return query; },
        eq: (key, value) => { filters.push([key, value]); return query; },
        order: () => query,
        limit: (value) => { maxRows = value; return query; },
        insert: (value) => { insert = value; return query; },
        update: (value) => { update = value; return query; },
        delete: () => { remove = true; return query; },
        maybeSingle: async () => { const result = evaluate(); return { ...result, data: result.data[0] ?? null }; },
        single: async () => evaluate(),
        then: (resolve, reject) => Promise.resolve(evaluate()).then(resolve, reject),
      };
      return query;
    },
    async rpc(name) {
      calls.push(name);
      return { data: tables.memberships.map((member) => ({ ...member, email: `${member.user_id}@example.com`, name: member.user_id === MEMBER ? 'Jamie' : null })), error: null };
    },
  };
  const auth = loadSource('src/lib/auth.ts', {
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: userId ? { id: userId, email: 'verified@example.com', user_metadata: { full_name: 'Verified member' } } : null } }) } }) },
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/http': http,
  });
  const upstream = {
    getAgent: async (id) => { calls.push({ resourceRead: id }); return { id, status: 'running', resources: { cpu: 2, memory: 4, disk: 6 }, type: 'default', auto_sleep: false, env: { hidden: 'server-only' }, metadata: { hidden: 'server-only' } }; },
    resize: async (id, input) => { calls.push({ resize: id, ...input }); return { id, status: 'updating', resources: { cpu: 2, memory: 4, disk: 6, ...input } }; },
    getWorkspaceUsage: async (from, to) => {
      calls.push({ workspaceUsage: { from, to } });
      return { from, to, total_micros: 99_000_000, instances: [
        { id: 'mine', compute_micros: 2_000_000, llm_micros: 3_000_000, brave_micros: 10_000, composio_micros: 2_000, perflo_micros: 4_000, total_micros: 5_016_000, private: 'hidden' },
        { id: 'foreign', compute_micros: 90_000_000, total_micros: 90_000_000 },
      ] };
    },
    getBudget: async (id) => { calls.push({ budgetRead: id }); return { monthly_cap_micros: 5_000_000 }; },
    setBudget: async (id, input) => { calls.push({ budgetWrite: id, ...input }); return { ...input }; },
    topUpBudget: async (id, input) => { calls.push({ budgetTopUp: id, ...input }); return { credit_remaining_micros: input.amount_micros }; },
    listAgents: async () => ({ data: [] }),
    listTemplates: async () => ({ data: [] }),
    createAgent: async (input) => { calls.push(input); return { id: 'new', status: 'provisioning', template: 'agent37-hermes', resources: input.resources }; },
    deleteAgent: async (id) => calls.push({ deleted: id }),
    renameAgent: async (id, name) => calls.push({ renamed: id, name }),
    restart: async (id) => { calls.push({ restart: id }); return { status: 'restarting' }; },
  };
  const dependencies = {
    '@/lib/auth': auth, '@/lib/http': http, '@/lib/assignment-input': assignmentInput, '@/lib/budget-input': budgetInput,
    '@/lib/billing': { requireWorkspaceBalance: async () => {} }, // these access tests use funded wallets
    '@/lib/resource-input': resourceInput, '@/lib/agent-costs': costHelpers,
    '@/lib/budget-request-input': budgetRequestInput, '@/lib/user-profile': userProfile,
    '@/lib/agent37': { agent37: upstream },
    '@/config/agents': { AGENT_TEMPLATES: ['agent37-hermes'], DEFAULT_AGENT: { template: 'agent37-hermes', cpu: 1, memory: 2, disk: 10, monthlyCapUsd: 20 }, templateAppPorts: () => [] },
    '@/lib/format': { usdToMicros: (usd) => usd * 1e6 },
  };
  return { tables, calls, auth, dependencies, upstream, db, authUsers };
}
const request = (body) => new Request('https://app.example/api', { method: 'POST', body: JSON.stringify(body) });
const params = (value) => ({ params: Promise.resolve(value) });

test('members can read and manage assigned agents; creators, other members and outsiders cannot', async () => {
  const { auth, tables } = fixture();
  assert.equal((await auth.requireAgentAccess('mine')).role, 'member');
  await auth.requireAgentAccess('mine', 'manage');
  await assert.rejects(auth.requireAgentAccess('mine', 'admin'), { status: 403 });
  for (const id of ['other', 'unassigned', 'foreign', 'missing']) await assert.rejects(auth.requireAgentAccess(id), { status: 404 });
  tables.memberships = tables.memberships.filter((member) => member.user_id !== MEMBER);
  await assert.rejects(auth.requireAgentAccess('mine', 'manage'), { status: 404 });
  await assert.rejects(fixture(null).auth.requireAgentAccess('mine'), { status: 401 });
});

test('admins can access every agent in their workspace, but not another workspace', async () => {
  const { auth } = fixture(ADMIN);
  for (const id of ['mine', 'other', 'unassigned']) await auth.requireAgentAccess(id, 'admin');
  await assert.rejects(auth.requireAgentAccess('foreign'), { status: 404 });
});

test('the agent list filters members before serialization and labels all admin agents with assignees', async () => {
  for (const user of [MEMBER, ADMIN]) {
    const fixtureData = fixture(user);
    const route = loadSource('src/app/api/agents/route.ts', fixtureData.dependencies);
    const response = await route.GET(new Request(`https://app.example/api/agents?workspace=${WORKSPACE}`));
    assert.equal(response.status, 200);
    const { agents } = await response.json();
    assert.deepEqual(agents.map((agent) => agent.agent37_id), user === MEMBER ? ['mine'] : ['mine', 'other', 'unassigned']);
    assert.equal(agents[0].assigned_user_name, user === ADMIN ? 'Jamie' : null);
    assert.equal(fixtureData.calls.includes('get_workspace_members_with_names'), user === ADMIN);
  }
});

test('create requires an admin and a valid assignee from the same workspace before provisioning', async () => {
  for (const [user, assignee, status] of [[MEMBER, MEMBER, 403], [ADMIN, undefined, 400], [ADMIN, 'bad', 400], [ADMIN, '00000000-0000-4000-8000-000000000099', 400], [ADMIN, MEMBER, 201]]) {
    const f = fixture(user);
    const route = loadSource('src/app/api/agents/route.ts', f.dependencies);
    const response = await route.POST(request({ workspace_id: WORKSPACE, assigned_user_id: assignee }));
    assert.equal(response.status, status);
    if (status === 201) {
      assert.equal(f.calls[0].user, MEMBER);
      assert.equal(f.tables.agents.at(-1).assigned_user_id, MEMBER);
      assert.equal(f.tables.agents.at(-1).created_by, ADMIN);
    } else assert.equal(f.calls.length, 0);
  }
});

test('invites default to member, accept admin, reject invalid roles and hide the roster from members', async () => {
  for (const role of [undefined, 'member', 'admin', 'owner']) {
    const f = fixture(ADMIN);
    const route = loadSource('src/app/api/workspaces/[id]/members/route.ts', f.dependencies);
    const response = await route.POST(request({ role }), params({ id: WORKSPACE }));
    assert.equal(response.status, role === 'owner' ? 400 : 201);
    if (role !== 'owner') assert.equal(f.tables.invitations[0].role, role ?? 'member');
  }
  const f = fixture(MEMBER);
  const route = loadSource('src/app/api/workspaces/[id]/members/route.ts', f.dependencies);
  assert.equal((await route.GET(request({}), params({ id: WORKSPACE }))).status, 403);
  assert.equal((await route.POST(request({ role: 'admin' }), params({ id: WORKSPACE }))).status, 403);
  assert.equal(f.calls.length, 0);
});

test('only admins may reassign; reassignment immediately revokes the previous member access', async () => {
  const f = fixture(ADMIN);
  const route = loadSource('src/app/api/agents/[id]/assignment/route.ts', f.dependencies);
  assert.equal((await route.PATCH(request({ assigned_user_id: OTHER }), params({ id: 'mine' }))).status, 200);
  assert.equal(f.tables.agents[0].assigned_user_id, OTHER);
  // Reuse the changed mirror with the member's verified session.
  const member = fixture(MEMBER, f.tables);
  await assert.rejects(member.auth.requireAgentAccess('mine', 'manage'), { status: 404 });
  const memberRoute = loadSource('src/app/api/agents/[id]/assignment/route.ts', fixture().dependencies);
  assert.equal((await memberRoute.PATCH(request({ assigned_user_id: OTHER }), params({ id: 'mine' }))).status, 403);
  assert.equal((await route.PATCH(request({ assigned_user_id: '00000000-0000-4000-8000-000000000099' }), params({ id: 'mine' }))).status, 400);
});

test('assigned members can rename and restart their agent; attempts on another agent never reach upstream', async () => {
  const f = fixture();
  const profile = loadSource('src/app/api/agents/[id]/route.ts', {
    ...f.dependencies, '@/lib/agent-profile-input': profileInput, '@/lib/inkbox-provisioning': {},
  });
  assert.equal((await profile.PATCH(request({ name: 'Renamed', assigned_user_id: OTHER }), params({ id: 'mine' }))).status, 200);
  assert.equal(f.tables.agents[0].assigned_user_id, MEMBER);
  assert.equal((await profile.PATCH(request({ name: 'Not allowed' }), params({ id: 'other' }))).status, 404);
  const lifecycle = loadSource('src/app/api/agents/[id]/[action]/route.ts', f.dependencies);
  assert.equal((await lifecycle.POST(request({}), params({ id: 'mine', action: 'restart' }))).status, 200);
  assert.equal((await lifecycle.POST(request({}), params({ id: 'other', action: 'restart' }))).status, 404);
  assert.equal(f.calls.length, 2);
});

test('empty workspace balances prevent billed creation and lifecycle mutations after authorization', async () => {
  const f = fixture(ADMIN);
  f.dependencies['@/lib/billing'] = { requireWorkspaceBalance: async () => { throw new ApiError(402, 'workspace_balance_empty', 'Add funds in Billing.'); } };
  const creation = loadSource('src/app/api/agents/route.ts', f.dependencies);
  assert.equal((await creation.POST(request({ workspace_id: WORKSPACE, assigned_user_id: MEMBER }))).status, 402);
  const lifecycle = loadSource('src/app/api/agents/[id]/[action]/route.ts', f.dependencies);
  assert.equal((await lifecycle.POST(request({}), params({ id: 'mine', action: 'restart' }))).status, 402);
  const resize = loadSource('src/app/api/agents/[id]/resize/route.ts', f.dependencies);
  assert.equal((await resize.POST(request({ disk: 8 }), params({ id: 'mine' }))).status, 402);
  assert.equal(f.calls.length, 0);
});

test('member profile reads and edits require an admin and a target membership in that workspace', async () => {
  for (const [actor, workspace, target, status] of [
    [ADMIN, WORKSPACE, MEMBER, 200], [ADMIN, WORKSPACE, ADMIN, 200],
    [MEMBER, WORKSPACE, MEMBER, 403], [MEMBER, WORKSPACE, OTHER, 403],
    [ADMIN, 'another-workspace', MEMBER, 403],
    [ADMIN, WORKSPACE, '00000000-0000-4000-8000-000000000099', 404], [null, WORKSPACE, MEMBER, 401],
  ]) {
    const f = fixture(actor);
    const route = loadSource('src/app/api/workspaces/[id]/members/[userId]/profile/route.ts', f.dependencies);
    const context = params({ id: workspace, userId: target });
    assert.equal((await route.GET(request({}), context)).status, status);
    assert.equal((await route.PATCH(request({ display_name: 'Updated member' }), context)).status, status);
    if (status !== 200) assert.equal(f.calls.length, 0);
    else {
      assert.deepEqual(f.calls.map((call) => call.profileRead ?? call.profileWrite), [target, target]);
      assert.equal(f.authUsers.get(target).user_metadata.full_name, 'Updated member');
      assert.equal(f.tables.memberships.find((m) => m.user_id === target).role, target === ADMIN ? 'admin' : 'member');
    }
  }
});

test('admin profile edits whitelist contact fields, preserve other auth data, and return only the public profile', async () => {
  const f = fixture(ADMIN);
  const route = loadSource('src/app/api/workspaces/[id]/members/[userId]/profile/route.ts', f.dependencies);
  const context = params({ id: WORKSPACE, userId: MEMBER });
  const read = await (await route.GET(request({}), context)).json();
  assert.deepEqual(Object.keys(read.profile).sort(), ['display_name', 'email', 'phone_number']);
  for (const body of [{ display_name: 'Changed', email: 'bad@example.com' }, { role: 'admin' },
    { display_name: 'Changed', user_id: OTHER }, { phone: '+15555555555' }, { user_metadata: { full_name: 'bad' } },
    { app_metadata: { role: 'admin' } }, { display_name: '' }, { phone_number: 'invalid' }]) {
    assert.equal((await route.PATCH(request(body), context)).status, 400);
  }
  assert.equal(f.calls.length, 1);
  const response = await route.PATCH(request({ display_name: ' New name ' }), context);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { profile: { email: `${MEMBER}@example.com`, display_name: 'New name', phone_number: '+14165550123' } });
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[1].attributes)), { user_metadata: { full_name: 'New name' } });
  assert.equal(f.authUsers.get(MEMBER).user_metadata.unrelated, 'keep me');
  assert.equal(f.authUsers.get(MEMBER).phone, '+14165550000');
  assert.deepEqual(f.authUsers.get(MEMBER).app_metadata, { role: 'authenticated' });
  const cleared = await route.PATCH(request({ phone_number: '' }), context);
  assert.equal((await cleared.json()).profile.phone_number, null);
  assert.equal(f.authUsers.get(MEMBER).user_metadata.full_name, 'New name');
});

test('removed members and provider failures cannot expose or mutate profiles', async () => {
  const f = fixture(ADMIN);
  const route = loadSource('src/app/api/workspaces/[id]/members/[userId]/profile/route.ts', f.dependencies);
  const context = params({ id: WORKSPACE, userId: MEMBER });
  f.db.auth.admin.getUserById = async () => ({ data: { user: null }, error: { message: 'private provider details' } });
  f.db.auth.admin.updateUserById = async () => ({ data: { user: null }, error: { message: 'private provider details' } });
  for (const response of [await route.GET(request({}), context), await route.PATCH(request({ display_name: 'Updated' }), context)]) {
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.match(body.error.message, /Please try again/);
    assert.doesNotMatch(JSON.stringify(body), /private provider details/);
  }
  f.tables.memberships = f.tables.memberships.filter((m) => m.user_id !== MEMBER);
  assert.equal((await route.GET(request({}), context)).status, 404);
  assert.equal((await route.PATCH(request({ display_name: 'Updated' }), context)).status, 404);
  assert.equal(f.authUsers.get(MEMBER).user_metadata.full_name, 'Member name');
});

test('budgets stay readable by assigned members but writes require a workspace admin', async () => {
  for (const [user, id, readStatus, writeStatus] of [
    [ADMIN, 'mine', 200, 200], [ADMIN, 'unassigned', 200, 200],
    [MEMBER, 'mine', 200, 403], [MEMBER, 'other', 404, 404],
    [ADMIN, 'foreign', 404, 404], [MEMBER, 'foreign', 404, 404],
    [null, 'mine', 401, 401],
  ]) {
    const f = fixture(user);
    const route = loadSource('src/app/api/agents/[id]/budget/route.ts', f.dependencies);
    const topUp = loadSource('src/app/api/agents/[id]/budget/top-up/route.ts', f.dependencies);
    assert.equal((await route.GET(request({}), params({ id }))).status, readStatus);
    assert.equal((await route.PATCH(request({ monthly_cap_usd: '20.123456' }), params({ id }))).status, writeStatus);
    assert.equal((await topUp.POST(request({ amount_usd: '1.25', idempotency_key: 'burst-1' }), params({ id }))).status, writeStatus);
    assert.equal(f.calls.length, (readStatus === 200 ? 1 : 0) + (writeStatus === 200 ? 2 : 0));
    if (writeStatus === 200) {
      assert.deepEqual(f.calls[1], { budgetWrite: id, monthly_cap_micros: 20_123_456 });
      assert.deepEqual(f.calls[2], { budgetTopUp: id, amount_micros: 1_250_000, idempotency_key: 'burst-1' });
    }
  }
});

test('invalid budget requests never reach Agent37 and zero caps remain supported', async () => {
  const f = fixture(ADMIN);
  const route = loadSource('src/app/api/agents/[id]/budget/route.ts', f.dependencies);
  const topUp = loadSource('src/app/api/agents/[id]/budget/top-up/route.ts', f.dependencies);
  for (const body of [null, [], {}, { monthly_cap_usd: -1 }, { monthly_cap_usd: '0.0000001' }, { monthly_cap_usd: '9007199254.740992' }]) {
    assert.equal((await route.PATCH(request(body), params({ id: 'mine' }))).status, 400);
  }
  assert.equal((await route.PATCH(new Request('https://app.example/api', { method: 'PATCH', body: '{' }), params({ id: 'mine' }))).status, 400);
  for (const body of [null, [], {}, { amount_usd: 0, idempotency_key: 'burst-1' }, { amount_usd: 5 }, { amount_usd: 5, idempotency_key: '../invalid' }]) {
    assert.equal((await topUp.POST(request(body), params({ id: 'mine' }))).status, 400);
  }
  assert.equal(f.calls.length, 0);
  assert.equal((await route.PATCH(request({ monthly_cap_usd: 0 }), params({ id: 'mine' }))).status, 200);
  assert.deepEqual(f.calls, [{ budgetWrite: 'mine', monthly_cap_micros: 0 }]);
});

test('extra budget requests require a verified assigned member and never change the upstream allowance', async () => {
  for (const [user, id, status] of [[MEMBER, 'mine', 201], [ADMIN, 'mine', 403],
    [MEMBER, 'other', 404], [MEMBER, 'unassigned', 404], [MEMBER, 'foreign', 404], [null, 'mine', 401]]) {
    const f = fixture(user);
    const route = loadSource('src/app/api/agents/[id]/budget/requests/route.ts', f.dependencies);
    const response = await route.POST(request({ amount_usd: '12.345678', note: ' More research ', idempotency_key: 'request-1',
      workspace_id: 'foreign', requester_id: ADMIN, requester_name: 'Forged admin', agent37_id: 'other', status: 'approved' }), params({ id }));
    assert.equal(response.status, status);
    assert.equal(f.calls.length, 0);
    assert.equal(f.tables.agent_budget_requests.length, status === 201 ? 1 : 0);
    if (status === 201) {
      const row = f.tables.agent_budget_requests[0];
      assert.equal(row.workspace_id, WORKSPACE);
      assert.equal(row.agent37_id, 'mine');
      assert.equal(row.requester_id, MEMBER);
      assert.equal(row.requester_name, 'Verified member');
      assert.equal(row.amount_micros, 12_345_678);
      assert.equal(row.note, 'More research');
      assert.equal(row.status, undefined);
      assert.deepEqual(Object.keys(await response.json()).sort(), ['amount_micros', 'created_at', 'id', 'note', 'requester_name']);
    }
  }
});

test('request reads hide other members and agents while admins can review the agent request history', async () => {
  const f = fixture();
  f.tables.agent_budget_requests.push(
    { id: 'own', agent37_id: 'mine', workspace_id: WORKSPACE, requester_id: MEMBER, requester_name: 'Member', amount_micros: 5_000_000, note: '', created_at: new Date().toISOString() },
    { id: 'previous-assignee', agent37_id: 'mine', workspace_id: WORKSPACE, requester_id: OTHER, requester_name: 'Previous member', amount_micros: 9_000_000, note: 'Private note', created_at: new Date().toISOString() },
    { id: 'other-agent', agent37_id: 'other', workspace_id: WORKSPACE, requester_id: MEMBER },
    { id: 'foreign', agent37_id: 'mine', workspace_id: 'another-workspace', requester_id: MEMBER },
  );
  for (const [user, expected] of [[MEMBER, ['own']], [ADMIN, ['own', 'previous-assignee']]]) {
    const route = loadSource('src/app/api/agents/[id]/budget/requests/route.ts', fixture(user, f.tables).dependencies);
    const response = await route.GET(request({}), params({ id: 'mine' }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.requests.map((row) => row.id), expected);
    assert.equal(JSON.stringify(body).includes('requester_id'), false);
    assert.equal(JSON.stringify(body).includes('workspace_id'), false);
  }
  f.tables.agents[0].assigned_user_id = OTHER;
  const route = loadSource('src/app/api/agents/[id]/budget/requests/route.ts', f.dependencies);
  assert.equal((await route.GET(request({}), params({ id: 'mine' }))).status, 404);
  assert.equal((await route.POST(request({ amount_usd: 5, idempotency_key: 'request-2' }), params({ id: 'mine' }))).status, 404);
});

test('concurrent request retries insert once, reject changed payloads, and scope retry keys to the requester', async () => {
  const f = fixture();
  const route = loadSource('src/app/api/agents/[id]/budget/requests/route.ts', f.dependencies);
  const body = { amount_usd: '5', note: 'Research', idempotency_key: 'same-retry-key' };
  const responses = await Promise.all(Array.from({ length: 3 }, () => route.POST(request(body), params({ id: 'mine' }))));
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 200, 201]);
  assert.equal(f.tables.agent_budget_requests.length, 1);
  assert.equal(new Set(await Promise.all(responses.map(async (response) => (await response.json()).id))).size, 1);
  assert.equal((await route.POST(request({ ...body, amount_usd: 6 }), params({ id: 'mine' }))).status, 409);
  assert.equal((await route.POST(request({ ...body, note: 'Changed note' }), params({ id: 'mine' }))).status, 409);
  f.tables.agents[0].assigned_user_id = OTHER;
  const other = loadSource('src/app/api/agents/[id]/budget/requests/route.ts', fixture(OTHER, f.tables).dependencies);
  assert.equal((await other.POST(request(body), params({ id: 'mine' }))).status, 201);
  assert.equal(f.tables.agent_budget_requests.length, 2);
  assert.equal(f.calls.length, 0);
});

test('invalid extra budget amounts and notes are rejected without storing requests', async () => {
  const f = fixture();
  const route = loadSource('src/app/api/agents/[id]/budget/requests/route.ts', f.dependencies);
  const valid = { amount_usd: '5', idempotency_key: 'request-1' };
  for (const body of [null, [], {}, { ...valid, amount_usd: 0 }, { ...valid, amount_usd: '-1' },
    { ...valid, amount_usd: '0.0000001' }, { ...valid, amount_usd: '9007199254.740992' },
    { ...valid, idempotency_key: '../bad' }, { ...valid, note: 3 }, { ...valid, note: 'x'.repeat(1001) }, { ...valid, note: '\u0000' }]) {
    assert.equal((await route.POST(request(body), params({ id: 'mine' }))).status, 400);
  }
  assert.equal((await route.POST(new Request('https://app.example/api', { method: 'POST', body: '{' }), params({ id: 'mine' }))).status, 400);
  assert.equal(f.tables.agent_budget_requests.length, 0);
  assert.equal(f.calls.length, 0);
});

test('request storage failures return retryable messages without leaking database details', async () => {
  const f = fixture();
  const failingQuery = {
    select: () => failingQuery, eq: () => failingQuery, order: () => failingQuery, limit: () => failingQuery, insert: () => failingQuery,
    single: async () => ({ data: null, error: { code: 'XX000', message: 'private database details' } }),
    then: (resolve, reject) => Promise.resolve({ data: null, error: { message: 'private database details' } }).then(resolve, reject),
  };
  const route = loadSource('src/app/api/agents/[id]/budget/requests/route.ts', {
    ...f.dependencies, '@/lib/auth': { requireAgentAccess: async (id) => ({ ...await f.auth.requireAgentAccess(id), db: { from: () => failingQuery } }) },
  });
  for (const response of [await route.GET(request({}), params({ id: 'mine' })),
    await route.POST(request({ amount_usd: 5, idempotency_key: 'request-1' }), params({ id: 'mine' }))]) {
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.match(body.error.message, /Please retry/);
    assert.doesNotMatch(JSON.stringify(body), /private database details/);
  }
  assert.equal(f.calls.length, 0);
});

test('budget page deep links require an admin and expose only the authorized agent identity', async () => {
  for (const [user, id, allowed] of [
    [ADMIN, 'mine', true], [ADMIN, 'unassigned', true],
    [MEMBER, 'mine', false], [MEMBER, 'other', false],
    [ADMIN, 'foreign', false], [ADMIN, 'missing', false], [null, 'mine', false],
  ]) {
    const f = fixture(user);
    const { default: page } = loadSource('src/app/dashboard/budgets/[agentId]/page.tsx', {
      '@/lib/auth': f.auth,
      'react/jsx-runtime': jsxRuntime,
      'next/navigation': { notFound: () => { throw new ApiError(404, 'not_found', 'Page not found'); } },
      '@/components/AgentBudgetPage': { AgentBudgetPage: () => null },
    });
    if (!allowed) await assert.rejects(page(params({ agentId: id })), { status: 404 });
    else {
      const result = await page(params({ agentId: id }));
      assert.deepEqual(Object.keys(result.props).sort(), ['agentId', 'name', 'workspaceId']);
      assert.equal(result.props.agentId, id);
      assert.equal(result.props.workspaceId, WORKSPACE);
      assert.equal(result.props.name, id === 'mine' ? 'My agent' : 'Unnamed agent');
    }
    assert.equal(f.calls.length, 0);
  }
});

test('member dashboard renders only the chooser and redirects restricted fleet paths', () => {
  const replacements = [];
  const effects = [];
  const widget = ({ children }) => React.createElement('div', null, children);
  const dependencies = {
    react: { ...React, useEffect: (effect) => effects.push(effect) }, 'react/jsx-runtime': jsxRuntime,
    'next/link': { __esModule: true, default: ({ children, href }) => React.createElement('a', { href }, children) },
    'next/navigation': { usePathname: () => '/dashboard/members', useRouter: () => ({ replace: (path) => replacements.push(path) }) },
    'lucide-react': { LayoutGrid: widget, Settings: widget, Users: widget },
    '@/config/branding': { branding: { appName: 'Test' } },
    '@/components/AccountMenu': { AccountMenu: () => null },
    '@/lib/utils': { cn: (...values) => values.join(' ') },
    '@/components/WorkspaceProvider': { useWorkspace: () => ({ current: { id: WORKSPACE, role: 'member' }, ready: true }) },
    '@/components/MemberAgentSelection': { MemberAgentSelection: () => React.createElement('div', null, 'Assigned agent chooser') },
  };
  const { DashboardShell } = loadSource('src/components/DashboardShell.tsx', dependencies);
  const markup = renderToStaticMarkup(React.createElement(DashboardShell, null, 'Admin-only fleet content'));
  assert.match(markup, /Assigned agent chooser/);
  assert.doesNotMatch(markup, /Admin-only fleet content|href="\/dashboard\/members"|href="\/dashboard\/settings"/);
  effects.forEach((effect) => effect());
  assert.deepEqual(replacements, ['/dashboard']);
});

test('the member landing opens a sole assignment and leaves zero or multiple assignments in the chooser', async () => {
  for (const count of [0, 1, 2]) {
    const replacements = [];
    const effects = [];
    const { MemberAgentSelection } = loadSource('src/components/MemberAgentSelection.tsx', {
      react: { ...React, useEffect: (effect) => effects.push(effect) }, 'react/jsx-runtime': jsxRuntime,
      'next/link': { __esModule: true, default: ({ children }) => React.createElement('div', null, children) },
      'next/navigation': { useRouter: () => ({ replace: (path) => replacements.push(path) }) },
      '@/lib/api': { apiFetch: async () => ({ agents: Array.from({ length: count }, (_, index) => ({ agent37_id: `assigned${index}` })) }) },
      '@/lib/dashboard-tabs': { agentTabPath: (id, tab) => `/dashboard/agents/${id}/${tab}` },
      '@/components/AgentIcon': { AgentIcon: () => null },
      '@/components/ui/badge': { Badge: () => null },
      '@/lib/format': { statusVariant: () => 'muted' },
    });
    renderToStaticMarkup(React.createElement(MemberAgentSelection, { workspaceId: WORKSPACE }));
    const cleanups = effects.map((effect) => effect());
    await new Promise((resolve) => setImmediate(resolve));
    cleanups.forEach((cleanup) => cleanup());
    assert.deepEqual(replacements, count === 1 ? ['/dashboard/agents/assigned0/chat'] : []);
  }
});

test('the agent switcher includes assignee names only in the admin view', () => {
  const widget = ({ children }) => React.createElement('div', null, children);
  const { ActiveAgentSwitcher } = loadSource('src/components/ActiveAgentSwitcher.tsx', {
    'react/jsx-runtime': jsxRuntime,
    'next/navigation': { useRouter: () => ({ push: () => {} }) },
    'lucide-react': { Check: widget, ChevronsUpDown: widget },
    '@/lib/dashboard-tabs': { agentTabPath: (id, tab) => `/dashboard/agents/${id}/${tab}` },
    '@/lib/format': { statusVariant: () => 'muted' },
    '@/components/ui/button': { Button: widget },
    '@/components/ui/dropdown-menu': Object.fromEntries(['DropdownMenu', 'DropdownMenuContent', 'DropdownMenuItem', 'DropdownMenuLabel', 'DropdownMenuTrigger'].map((name) => [name, widget])),
    '@/lib/utils': { cn: (...values) => values.join(' ') },
    '@/components/AgentIcon': { AgentIcon: () => null },
  });
  const agent = { agent37_id: 'mine', name: 'My agent', assigned_user_name: 'Jamie' };
  for (const role of ['admin', 'member']) {
    const markup = renderToStaticMarkup(React.createElement(ActiveAgentSwitcher, { agents: [agent], activeAgentId: 'mine', currentTab: 'chat', role }));
    assert.match(markup, /My agent/);
    if (role === 'admin') assert.match(markup, /My agent · Jamie/);
    else assert.doesNotMatch(markup, /Jamie/);
  }
});

test('cost and resource reads are assignment-scoped and never serialize workspace-wide spend or secrets', async () => {
  for (const [user, id, status] of [[ADMIN, 'mine', 200], [ADMIN, 'unassigned', 200], [MEMBER, 'mine', 200], [MEMBER, 'other', 404], [ADMIN, 'foreign', 404], [null, 'mine', 401]]) {
    const f = fixture(user);
    const costs = loadSource('src/app/api/agents/[id]/costs/route.ts', f.dependencies);
    const resources = loadSource('src/app/api/agents/[id]/resources/route.ts', f.dependencies);
    const costResponse = await costs.GET(request({}), params({ id }));
    const resourceResponse = await resources.GET(request({}), params({ id }));
    assert.equal(costResponse.status, status);
    assert.equal(resourceResponse.status, status);
    if (status === 200) {
      const costData = await costResponse.json();
      const profile = await resourceResponse.json();
      assert.equal(costData.spend.id, id);
      assert.equal(costData.spend.total_micros, id === 'mine' ? 5_016_000 : 0);
      assert.equal(JSON.stringify(costData).includes('foreign'), false);
      assert.equal(JSON.stringify(costData).includes('hidden'), false);
      assert.deepEqual(Object.keys(profile).sort(), ['auto_sleep', 'id', 'resources', 'status', 'type']);
      assert.equal(profile.resources.disk, 6);
    } else assert.equal(f.calls.length, 0);
  }
});

test('only admins can resize, with live grow-only validation before any billed mutation', async () => {
  for (const [user, id, status] of [[MEMBER, 'mine', 403], [MEMBER, 'other', 404], [ADMIN, 'foreign', 404], [null, 'mine', 401]]) {
    const f = fixture(user);
    const route = loadSource('src/app/api/agents/[id]/resize/route.ts', f.dependencies);
    assert.equal((await route.POST(request({ cpu: 4, memory: 8 }), params({ id }))).status, status);
    assert.equal(f.calls.length, 0);
  }
  const f = fixture(ADMIN);
  const route = loadSource('src/app/api/agents/[id]/resize/route.ts', f.dependencies);
  for (const body of [null, {}, { disk: 0 }, { disk: '8' }]) {
    assert.equal((await route.POST(request(body), params({ id: 'mine' }))).status, 400);
  }
  assert.equal(f.calls.length, 0);
  f.upstream.getAgent = async (id) => ({ id, status: 'running', resources: { cpu: 4, memory: 8, disk: 10 }, type: 'performance' });
  for (const body of [{ disk: 8 }, { cpu: 2, memory: 4 }, { disk: 21 }, { cpu: 8, memory: 8 }]) {
    assert.equal((await route.POST(request(body), params({ id: 'mine' }))).status, 400);
  }
  assert.equal(f.calls.length, 0);
  f.upstream.getAgent = async (id) => ({ id, status: 'sleeping', resources: { cpu: 2, memory: 4, disk: 6 } });
  assert.equal((await route.POST(request({ disk: 8 }), params({ id: 'mine' }))).status, 409);
  assert.equal(f.calls.length, 0);
});

test('resize sends only changed resources, refreshes the tenant mirror and retains asynchronous updating status', async () => {
  const f = fixture(ADMIN);
  const route = loadSource('src/app/api/agents/[id]/resize/route.ts', f.dependencies);
  const response = await route.POST(request({ cpu: 4, memory: 8, disk: 6, metadata: { workspace: 'foreign' }, type: 'performance' }), params({ id: 'mine' }));
  assert.equal(response.status, 200);
  const profile = await response.json();
  assert.equal(profile.status, 'updating');
  assert.equal(profile.type, 'default');
  assert.deepEqual(profile.resources, { cpu: 4, memory: 8, disk: 6 });
  assert.deepEqual(f.calls[1], { resize: 'mine', cpu: 4, memory: 8 });
  assert.equal(f.tables.agents[0].status, 'updating');
  assert.equal(f.tables.agents[0].cpu, 4);
  assert.equal(f.tables.agents[0].assigned_user_id, MEMBER);
  assert.equal(f.tables.agents[1].status, 'running');
});
