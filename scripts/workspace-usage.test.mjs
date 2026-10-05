import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as jsxRuntime from 'react/jsx-runtime';
import * as usageHelpers from '../src/lib/usage-report.ts';

const { buildUsageReport, emptyUsageMetrics, readUsageWindow, usagePresetWindow, usageWindowDays, usageMoney } = usageHelpers;
const now = new Date('2026-10-05T00:30:00Z');
const window = { from: '2026-10-01', to: '2026-10-03' };
const ownership = [{ id: 'mine', name: 'My agent', deleted: false }, { id: 'gone', name: null, deleted: true }, { id: 'idle', name: 'Idle agent', deleted: false }];
const metrics = (compute = 0, llm = 0) => ({ ...emptyUsageMetrics(), total_micros: compute + llm, compute_micros: compute, llm_micros: llm,
  llm_calls: llm ? 2 : 0, input_tokens: llm ? 200 : 0, output_tokens: llm ? 20 : 0 });
const model = (cost = 300) => ({ model: 'test/model', cost_micros: cost, calls: 2, input_tokens: 200, output_tokens: 20 });
const daily = (date, foreign = true) => ({ date, usage: {
  from: date, to: date, total_micros: foreign ? 999999999 : 1350, private: 'shared-key-secret',
  days: [{ date, ...metrics(999999999) }],
  instances: [{ id: 'mine', ...metrics(1000, 300), private: 'hidden' }, { id: 'gone', ...metrics(50) },
    ...(foreign ? [{ id: 'foreign-agent', ...metrics(500000, 500000), name: 'Other workspace' }] : [])],
  by_model: [model(), ...(foreign ? [{ ...model(500000), model: 'foreign/model' }] : [])],
} });
const sources = () => usageWindowDays(window).map((date) => daily(date));
const plain = (value) => JSON.parse(JSON.stringify(value));

function load(file, dependencies, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, { exports, console, AbortSignal, ...globals,
    require: (name) => { assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name]; },
  });
  return exports;
}

test('usage windows are inclusive UTC days, with 7/30/90-day and calendar month presets', () => {
  assert.deepEqual(usagePresetWindow('30', now), { from: '2026-09-06', to: '2026-10-05' });
  assert.equal(usageWindowDays(usagePresetWindow('90', now)).length, 90);
  assert.equal(usageWindowDays(usagePresetWindow('7', now)).length, 7);
  assert.deepEqual(usagePresetWindow('month', now), { from: '2026-10-01', to: '2026-10-05' });
  assert.deepEqual(readUsageWindow(null, null, now), usagePresetWindow('30', now));
  assert.deepEqual(readUsageWindow('2026-10-05', '2026-10-05', now), { from: '2026-10-05', to: '2026-10-05' });
  for (const [from, to] of [['2026-02-30', '2026-10-05'], ['2026-10-06', '2026-10-05'], ['2026-10-05', '2026-10-06'],
    ['2026-07-01', '2026-10-05'], ['', '2026-10-05'], ['2026-10-01', 'invalid']]) assert.throws(() => readUsageWindow(from, to, now));
  assert.deepEqual(usageWindowDays({ from: '2024-02-28', to: '2024-03-01' }), ['2024-02-28', '2024-02-29', '2024-03-01']);
  assert.equal(usageMoney(4), '$0.000004');
  assert.equal(usageMoney(0), '$0.00');
});

test('cards, daily series and agent totals reconcile using only persisted tenant-owned IDs', () => {
  const report = buildUsageReport(window, ownership, sources(), now);
  assert.equal(report.totals.total_micros, 4050);
  assert.equal(report.totals.compute_micros, 3150);
  assert.equal(report.totals.llm_micros, 900);
  assert.equal(report.totals.llm_calls, 6);
  assert.equal(report.totals.input_tokens, 600);
  assert.equal(report.totals.output_tokens, 60);
  assert.equal(report.days.reduce((sum, row) => sum + row.total_micros, 0), report.totals.total_micros);
  assert.equal(report.agents.reduce((sum, row) => sum + row.total_micros, 0), report.totals.total_micros);
  assert.deepEqual(report.agents.map((row) => row.id), ['mine', 'gone', 'idle']);
  assert.equal(report.agents[1].deleted, true);
  assert.equal(report.agents[2].total_micros, 0);
  assert.equal(report.models, null);
  assert.doesNotMatch(JSON.stringify(report), /foreign|Other workspace|shared-key-secret|hidden|999999999/);
});

test('model breakdowns are included only for attributable and reconciled model usage', () => {
  const safeSources = usageWindowDays(window).map((date) => daily(date, false));
  const report = buildUsageReport(window, ownership, safeSources, now);
  assert.deepEqual(report.models, [{ model: 'test/model', cost_micros: 900, calls: 6, input_tokens: 600, output_tokens: 60 }]);
  for (const models of [undefined, [{ ...model(), cost_micros: 301 }], [{ ...model(), calls: 3 }], [{ ...model(), model: null }], [model(), model()]]) {
    const invalid = structuredClone(safeSources); invalid[1].usage.by_model = models;
    assert.equal(buildUsageReport(window, ownership, invalid).models, null);
  }
  const incompleteAttribution = structuredClone(safeSources); incompleteAttribution[0].usage.total_micros++;
  assert.equal(buildUsageReport(window, ownership, incompleteAttribution).models, null);
});

test('usage BFFs return JSON auth failures while the page keeps normal session protection', async () => {
  const paths = [];
  const proxy = load('src/proxy.ts', {
    'next/server': { NextResponse: { next: () => ({ handledByBff: true }) } },
    '@/lib/supabase/middleware': { updateSession: async (request) => { paths.push(request.nextUrl.pathname); return { handledByProxy: true }; } },
  });
  assert.equal((await proxy.proxy({ nextUrl: { pathname: '/api/workspaces/workspace-a/usage' } })).handledByBff, true);
  assert.equal((await proxy.proxy({ nextUrl: { pathname: '/dashboard/usage' } })).handledByProxy, true);
  assert.deepEqual(paths, ['/dashboard/usage']);
});

test('zero days remain present and missing or malformed owned usage fails instead of inventing zeros', () => {
  const zeroSources = usageWindowDays(window).map((date) => ({ date, usage: { from: date, to: date, instances: [] } }));
  const empty = buildUsageReport(window, ownership, zeroSources);
  assert.equal(empty.days.length, 3);
  assert.deepEqual(empty.totals, emptyUsageMetrics());
  assert.deepEqual(empty.models, []);
  assert.deepEqual(empty.agents.map((row) => row.id), ['idle', 'mine']);
  for (const field of ['total_micros', 'compute_micros', 'input_tokens']) for (const value of [-1, 1.5, NaN, '100', undefined, Number.MAX_SAFE_INTEGER + 1]) {
    const invalid = sources(); invalid[0].usage.instances[0][field] = value;
    assert.throws(() => buildUsageReport(window, ownership, invalid));
  }
  assert.throws(() => buildUsageReport(window, ownership, sources().slice(1)));
  const wrongDay = sources(); wrongDay[0].usage.to = '2026-10-02';
  assert.throws(() => buildUsageReport(window, ownership, wrongDay));
  const duplicate = sources(); duplicate[0].usage.instances.push({ ...duplicate[0].usage.instances[0] });
  assert.throws(() => buildUsageReport(window, ownership, duplicate));
  const mismatch = sources(); mismatch[0].usage.instances[0].total_micros++;
  assert.throws(() => buildUsageReport(window, ownership, mismatch));
});

class ApiError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
function dalFixture({ tracked = ['mine', 'gone'], current = [{ agent37_id: 'mine', name: 'My agent' }], failDb = false, failDate = null, delay = 0 } = {}) {
  const calls = [], queries = [];
  let active = 0, maxActive = 0;
  const db = { from(table) {
    const filters = {};
    const query = { select: () => query, eq: (key, value) => { filters[key] = value; return query; }, order: () => query,
      range: async (from, to) => {
        queries.push({ table, filters, from, to });
        return { data: (table === 'agents' ? current : tracked.map((agent37_id) => ({ agent37_id }))).slice(from, to + 1), error: failDb ? {} : null };
      } };
    return query;
  } };
  const dal = load('src/lib/workspace-usage.ts', {
    'server-only': {}, '@/lib/http': { ApiError }, '@/lib/usage-report': usageHelpers,
    '@/lib/agent37': { agent37: { getWorkspaceUsage: async (from, to, signal) => {
      calls.push({ from, to, signal }); maxActive = Math.max(maxActive, ++active);
      try {
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        if (from === failDate) throw new Error('Upstream unavailable');
        return daily(from).usage;
      } finally { active--; }
    } } },
  });
  return { db, dal, calls, queries, maxActive: () => maxActive };
}

test('the DAL paginates historical ownership, includes deleted spend, and bounds daily API concurrency', async () => {
  const tracked = Array.from({ length: 1001 }, (_, index) => `deleted-${index}`).concat('mine', 'gone');
  const f = dalFixture({ tracked, delay: 2 });
  const report = await f.dal.readWorkspaceUsage(f.db, 'workspace-a', { from: '2026-09-22', to: '2026-10-03' });
  assert.equal(report.days.length, 12);
  assert.equal(report.totals.total_micros, 16200);
  assert.equal(report.agents.find((row) => row.id === 'gone').deleted, true);
  assert.deepEqual(f.queries.filter((q) => q.table === 'billing_agents').map((q) => q.from), [0, 1000]);
  assert.ok(f.queries.every((q) => q.filters.workspace_id === 'workspace-a'));
  assert.equal(f.calls.length, 12);
  assert.ok(f.calls.every((call) => call.from === call.to && call.signal instanceof AbortSignal));
  assert.ok(f.maxActive() <= 6 && f.maxActive() > 1);
});

test('shared daily caches reapply current ownership and never cache permissions or tenant results', async () => {
  const f = dalFixture();
  const first = await f.dal.readWorkspaceUsage(f.db, 'workspace-a', window);
  assert.equal(first.totals.total_micros, 4050);
  const other = dalFixture({ tracked: ['foreign-agent'], current: [] });
  const second = await f.dal.readWorkspaceUsage(other.db, 'workspace-b', window);
  assert.equal(second.totals.total_micros, 3000000);
  assert.doesNotMatch(JSON.stringify(second), /My agent|"mine"|"gone"/);
  assert.equal(f.calls.length, 3);
  const none = dalFixture({ tracked: [], current: [] });
  const empty = await f.dal.readWorkspaceUsage(none.db, 'workspace-c', window);
  assert.equal(empty.totals.total_micros, 0); assert.equal(f.calls.length, 3);
});

test('ownership failures and incomplete upstream reads fail closed without partial reports', async () => {
  const failedDb = dalFixture({ failDb: true });
  await assert.rejects(failedDb.dal.readWorkspaceUsage(failedDb.db, 'workspace-a', window), (e) => e.status === 503);
  assert.equal(failedDb.calls.length, 0);
  const partial = dalFixture({ failDate: '2026-10-02' });
  await assert.rejects(partial.dal.readWorkspaceUsage(partial.db, 'workspace-a', window), /Upstream unavailable/);
});

test('the dashboard renders chart titles, accurate tiny costs, active links and deleted rows without foreign model data', () => {
  const { WorkspaceUsageDashboard } = load('src/components/WorkspaceUsageDashboard.tsx', {
    'react/jsx-runtime': jsxRuntime, '@/lib/usage-report': usageHelpers,
    'next/link': { __esModule: true, default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children) },
  });
  const report = buildUsageReport(window, ownership, sources(), now);
  const html = renderToStaticMarkup(React.createElement(WorkspaceUsageDashboard, { report }));
  assert.match(html, /Compute by day/); assert.match(html, /Models, search and tools by day/);
  assert.match(html, /\$0\.00405/); assert.match(html, /Deleted/);
  assert.match(html, /href="\/dashboard\/agents\/mine\/settings"/);
  assert.doesNotMatch(html, /href="\/dashboard\/agents\/gone/);
  assert.match(html, /does not provide a model breakdown scoped/);
  assert.match(html, /UTC.*Models: \$0\.0003/);
  assert.doesNotMatch(html, /foreign\/model|Other workspace/);
});

test('Usage navigation and content are visible only to workspace admins', () => {
  let role = 'admin';
  const widget = () => null;
  const { DashboardShell } = load('src/components/DashboardShell.tsx', {
    react: React, 'react/jsx-runtime': jsxRuntime,
    'next/navigation': { usePathname: () => '/dashboard/usage', useRouter: () => ({ replace: () => {} }) },
    'next/link': { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) },
    'lucide-react': Object.fromEntries(['ChartNoAxesCombined', 'CreditCard', 'LayoutGrid', 'Settings', 'Users'].map((name) => [name, widget])),
    '@/config/branding': { branding: { appName: 'Robyn' } },
    '@/components/AccountMenu': { AccountMenu: widget },
    '@/components/MemberAgentSelection': { MemberAgentSelection: () => 'Assigned agent chooser' },
    '@/components/WorkspaceProvider': { useWorkspace: () => ({ current: { id: 'workspace-a', role }, ready: true }) },
    '@/lib/utils': { cn: (...values) => values.join(' ') },
  });
  const render = () => renderToStaticMarkup(React.createElement(DashboardShell, null, 'Private usage report'));
  assert.match(render(), /href="\/dashboard\/usage" class="[^"]*bg-secondary/);
  assert.match(render(), /Private usage report/);
  role = 'member';
  assert.doesNotMatch(render(), /href="\/dashboard\/usage"|Private usage report/);
  assert.match(render(), /Assigned agent chooser/);
});
