import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as jsxRuntime from 'react/jsx-runtime';
import { isTransitional } from '../src/lib/format.ts';

function load(relativePath, dependencies, globals = {}) {
  const exports = {};
  const source = fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  vm.runInNewContext(compiled, { exports, console, AbortController, AbortSignal, ...globals,
    require: (name) => { assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name]; },
  });
  return exports;
}

test('version and health use instance authentication; upgrades use the control plane without changing template pins', async () => {
  const requests = [];
  const client = load('src/lib/agent37.ts', { 'server-only': {}, '@/lib/cron-input': {} }, {
    ReadableStream, Response, process: { env: { AGENT37_API_KEY: 'test-only' } },
    fetch: async (url, init) => {
      requests.push({ url, init });
      return Response.json(url.endsWith('/version') ? { name: 'agent37-gateway', version: '1.2.3' }
        : url.endsWith('/health') ? { ok: true, healthy: false } : { id: 'mine', status: 'running' });
    },
  });
  assert.equal((await client.agent37.getVersion('mine')).version, '1.2.3');
  assert.equal((await client.agent37.getHealth('mine')).healthy, false);
  await client.agent37.update('mine');
  assert.deepEqual(requests.map(({ url }) => url), [
    'https://mine.agent37.app/v1/version', 'https://mine.agent37.app/v1/health',
    'https://api.agent37.com/v1/instances/mine/update',
  ]);
  for (const { init } of requests.slice(0, 2)) {
    assert.equal(init.headers['X-Agent37-Key'], 'test-only');
    assert.equal(init.headers.Authorization, undefined);
    assert.equal(init.cache, 'no-store');
    assert.ok(init.signal instanceof AbortSignal);
  }
  assert.equal(requests[2].init.headers.Authorization, 'Bearer test-only');
  assert.equal(requests[2].init.method, 'POST');
  assert.equal(requests[2].init.body, undefined);
});

const ready = { status: 'running', gateway: { name: 'agent37-gateway', version: '1.2.3' },
  healthy: true, version_error: null, health_error: null };

// Drive the real component's hooks and poll callbacks without live agents or real timers.
function panelFixture(overrides = {}) {
  const hooks = [], effects = [], timers = new Map(), messages = [], requests = [];
  let index = 0, now = 1000, timerId = 0, buttons = [], confirm;
  const f = { info: ready, updateStatus: 'running', updateError: null, busy: false, changes: 0 };
  const props = { agentId: 'mine', liveStatus: 'running', updateAvailable: true, canManage: true,
    busy: false, onBusyChange: (value) => { f.busy = value; props.busy = value; },
    onChanged: () => f.changes++, ...overrides };
  const react = {
    useState(initial) {
      const at = index++;
      hooks[at] ??= { value: initial };
      return [hooks[at].value, (value) => { hooks[at].value = typeof value === 'function' ? value(hooks[at].value) : value; }];
    },
    useRef(initial) { const at = index++; hooks[at] ??= { current: initial }; return hooks[at]; },
    useEffect(effect, deps) {
      const at = index++, previous = hooks[at];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
        effects.push(() => { previous?.cleanup?.(); hooks[at] = { deps, cleanup: effect() }; });
      }
    },
  };
  const { AgentVersionSection } = load('src/components/AgentVersionSection.tsx', {
    react, 'react/jsx-runtime': jsxRuntime,
    'lucide-react': { ArrowDownToLine: () => null, Loader2: () => null, RotateCw: () => null },
    sonner: { toast: { success: (message) => messages.push(message) } },
    '@/lib/api': { apiFetch: async (url, init) => {
      requests.push({ url, init });
      if (init.method === 'POST') { if (f.updateError) throw f.updateError; return { status: f.updateStatus }; }
      return f.info;
    } },
    '@/lib/format': { isTransitional },
    '@/components/ui/button': { Button: ({ children, variant, size, ...attributes }) => {
      buttons.push({ children, ...attributes }); return React.createElement('button', attributes, children);
    } },
    '@/components/ui/badge': { Badge: ({ children }) => React.createElement('span', null, children) },
    '@/components/ConfirmDialog': { ConfirmDialog: (value) => { confirm = value; return null; } },
  }, {
    Date: class extends Date { static now() { return now; } },
    setTimeout: (fn) => { timers.set(++timerId, fn); return timerId; }, clearTimeout: (id) => timers.delete(id),
  });
  return Object.defineProperties(Object.assign(f, { props, messages, requests,
    render() {
      index = 0; buttons = [];
      const markup = renderToStaticMarkup(AgentVersionSection(props));
      effects.splice(0).forEach((effect) => effect());
      return markup;
    },
    async settle() { await new Promise((resolve) => setImmediate(resolve)); },
    async poll() { const [id, fn] = timers.entries().next().value; timers.delete(id); await fn(); },
    expire() { now += 121_000; },
    cleanup() { hooks.forEach((hook) => hook?.cleanup?.()); },
  }), { buttons: { get: () => buttons }, confirm: { get: () => confirm } });
}

test('Settings shows the gateway version and a labeled member upgrade button when an image is available', async () => {
  const f = panelFixture();
  f.render(); await f.settle();
  assert.match(f.render(), /1\.2\.3.*Ready/);
  assert.match(f.render(), /Upgrade agent/);
  assert.match(f.confirm.description, /restart.*interrupting active work/);
  assert.match(f.confirm.description, /outside those folders are reset/);
  f.props.updateAvailable = false;
  assert.doesNotMatch(f.render(), /Upgrade agent/);
  f.props.updateAvailable = true;
  for (const status of ['updating', 'waking', 'stopping']) {
    f.props.liveStatus = status;
    assert.match(f.render(), /disabled=""[^>]*>Upgrade agent/);
  }
  f.cleanup();
});

test('an upgrade waits for healthy:true and a refreshed version before reporting success', async () => {
  const f = panelFixture();
  f.render(); await f.settle();
  await f.confirm.onConfirm();
  assert.equal(f.busy, true); assert.deepEqual(f.messages, []);
  f.info = { ...ready, gateway: { ...ready.gateway, version: '1.2.4' }, healthy: false };
  f.props.updateAvailable = false;
  assert.match(f.render(), /Waiting for agent/);
  await f.settle();
  assert.equal(f.busy, true); assert.deepEqual(f.messages, []);
  f.info = { ...f.info, healthy: true };
  await f.poll();
  assert.equal(f.busy, false); assert.deepEqual(f.messages, ['Agent upgraded and ready']);
  assert.match(f.render(), /1\.2\.4/);
  assert.equal(f.requests.filter(({ init }) => init.method === 'POST').length, 1);
  f.cleanup();
});

test('stopped upgrades stay stopped; failed readiness and timeouts do not report success', async () => {
  for (const outcome of ['stopped', 'failed', 'timeout']) {
    const f = panelFixture();
    f.render(); await f.settle();
    if (outcome === 'stopped') f.updateStatus = 'stopped';
    await f.confirm.onConfirm();
    f.info = { ...ready, healthy: false, status: outcome === 'failed' ? 'failed' : outcome === 'stopped' ? 'stopped' : 'running' };
    if (outcome === 'timeout') f.expire();
    f.render(); await f.settle();
    assert.equal(f.busy, false);
    if (outcome === 'stopped') assert.deepEqual(f.messages, ['Upgrade installed; agent remains stopped']);
    else assert.deepEqual(f.messages, []);
    assert.match(f.render(), outcome === 'timeout' ? /could not be confirmed/ : outcome === 'failed' ? /Agent is failed/ : /next time it starts/);
    f.cleanup();
  }
});

test('an upstream upgrade error releases the busy state and can be retried', async () => {
  const f = panelFixture();
  f.render(); await f.settle();
  f.updateError = new Error('Please retry');
  await assert.rejects(f.confirm.onConfirm(), /Please retry/);
  assert.equal(f.busy, false); assert.deepEqual(f.messages, []);
  f.updateError = null;
  await f.confirm.onConfirm();
  assert.equal(f.busy, true);
  f.render(); await f.settle();
  assert.equal(f.busy, false);
  f.cleanup();
});
