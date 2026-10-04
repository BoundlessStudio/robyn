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
  };
  const calls = [];
  const db = {
    from(table) {
      const filters = [];
      let insert, update, remove = false;
      const evaluate = () => {
        if (insert) { tables[table].push({ token: 'invite-token', ...insert }); return { data: tables[table].at(-1), error: null }; }
        const data = tables[table].filter((row) => filters.every(([key, value]) => row[key] === value));
        if (update) data.forEach((row) => Object.assign(row, update));
        if (remove) tables[table] = tables[table].filter((row) => !data.includes(row));
        return { data, error: null };
      };
      const query = {
        select: () => query,
        eq: (key, value) => { filters.push([key, value]); return query; },
        order: () => query,
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
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) } }) },
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/http': http,
  });
  const upstream = {
    listAgents: async () => ({ data: [] }),
    listTemplates: async () => ({ data: [] }),
    createAgent: async (input) => { calls.push(input); return { id: 'new', status: 'provisioning', template: 'agent37-hermes', resources: input.resources }; },
    deleteAgent: async (id) => calls.push({ deleted: id }),
    renameAgent: async (id, name) => calls.push({ renamed: id, name }),
    restart: async (id) => { calls.push({ restart: id }); return { status: 'restarting' }; },
  };
  const dependencies = {
    '@/lib/auth': auth, '@/lib/http': http, '@/lib/assignment-input': assignmentInput,
    '@/lib/agent37': { agent37: upstream },
    '@/config/agents': { AGENT_TEMPLATES: ['agent37-hermes'], DEFAULT_AGENT: { template: 'agent37-hermes', cpu: 1, memory: 2, disk: 10, monthlyCapUsd: 20 }, templateAppPorts: () => [] },
    '@/lib/format': { usdToMicros: (usd) => usd * 1e6 },
  };
  return { tables, calls, auth, dependencies };
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
