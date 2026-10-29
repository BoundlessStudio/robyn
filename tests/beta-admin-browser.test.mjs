import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, firefox, webkit } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const root = fileURLToPath(new URL('../', import.meta.url)), origin = 'https://beta-admin-ui.test';
const row = (email, status = 'requested') => ({ id: randomUUID(), email, status, craft: 'Illustration, short films and a small collection of strange ideas.', consent_version: 'invitation-v1', created_at: '2026-10-29T12:00:00Z', updated_at: '2026-10-29T12:00:00Z', invited_at: status === 'invited' ? '2026-10-29T13:00:00Z' : null, last_invited_at: status === 'invited' ? '2026-10-29T13:00:00Z' : null, invite_count: status === 'invited' ? 1 : 0, joined_at: null, send_state: status === 'invited' ? 'sent' : 'idle' });
let bundlePromise;
async function bundle() {
  bundlePromise ??= build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{BetaRequests}from'./src/components/admin/BetaRequests';import{BetaAdminLogin}from'./src/components/admin/BetaAdminLogin';createRoot(document.getElementById('root')).render(location.pathname==='/admin/login'?<BetaAdminLogin/>:<BetaRequests/>);`, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"test"' }, plugins: [{ name: 'next-link', setup(b) {
    b.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'import React from "react";export default function Link(props){return React.createElement("a",props)}', loader: 'js', resolveDir: root }));
  } }] });
  return (await bundlePromise).outputFiles[0].text;
}

async function fixture(browser) {
  const script = await bundle();
  const css = await readFile(root + 'node_modules/tailwindcss/preflight.css', 'utf8') + '\n' + await readFile(root + 'src/app/brand.css', 'utf8') + '\n' + await readFile(root + 'src/app/admin/admin.css', 'utf8') + '\n@font-face{font-family:"Space Grotesk Variable";font-style:normal;font-weight:300 700;src:url(/space.woff2)}@font-face{font-family:"Instrument Serif";font-style:italic;font-weight:400;src:url(/serif.woff2)}';
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } }), page = await context.newPage();
  const target = row('alex@example.test'), waiting = row('river@example.test', 'invited'), declined = row('sam@example.test', 'declined');
  const rows = new Map([target, waiting, declined, ...Array.from({ length: 49 }, (_, i) => row(`studio-${i}@example.test`))].map(item => [item.id, item]));
  const requests = [], errors = [], state = { rows, target, waiting, declined, requests, errors, uncertain: false };
  page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (url.origin !== origin) return route.fulfill({ status: 404, body: 'No external fixture requests' });
    if (url.pathname === '/fixture.js') return route.fulfill({ contentType: 'text/javascript', body: script });
    if (url.pathname === '/admin.css') return route.fulfill({ contentType: 'text/css', body: css });
    if (url.pathname === '/space.woff2') return route.fulfill({ contentType: 'font/woff2', body: await readFile(root + 'node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2') });
    if (url.pathname === '/serif.woff2') return route.fulfill({ contentType: 'font/woff2', body: await readFile(root + 'node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2') });
    const authenticated = (await context.cookies(origin)).some(cookie => cookie.name === 'fixture_admin' && cookie.value === 'enabled');
    if (url.pathname === '/api/admin/session') {
      if (method === 'POST') {
        const input = request.postDataJSON(); requests.push({ path: url.pathname, method, username: input.username });
        if (input.username !== 'operator' || input.password !== 'fixture-password') return route.fulfill({ status: 401, json: { error: { message: 'Incorrect username or password.' } } });
        await context.addCookies([{ name: 'fixture_admin', value: 'enabled', url: origin, httpOnly: true, secure: true, sameSite: 'Strict' }]);
        return route.fulfill({ json: { signedIn: true }, headers: { 'set-cookie': 'fixture_admin=enabled; Path=/; HttpOnly; Secure; SameSite=Strict' } });
      }
      await context.clearCookies({ name: 'fixture_admin' });
      return route.fulfill({ json: { signedOut: true }, headers: { 'set-cookie': 'fixture_admin=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict' } });
    }
    if (url.pathname.startsWith('/api/admin/beta-requests')) {
      if (!authenticated) return route.fulfill({ status: 401, json: { error: { message: 'Sign in required.' } } });
      if (method === 'GET') {
        const status = url.searchParams.get('status'), search = url.searchParams.get('q'), page = Number(url.searchParams.get('page'));
        const filtered = [...rows.values()].filter(item => (status === 'all' || item.status === status) && item.email.includes(search));
        const counts = Object.fromEntries(['requested', 'invited', 'joined', 'declined'].map(status => [status, [...rows.values()].filter(item => item.status === status).length]));
        requests.push({ path: url.pathname, method, status, search, page });
        return route.fulfill({ json: { requests: filtered.slice(page * 50, page * 50 + 50), total: filtered.length, counts } });
      }
      const id = url.pathname.split('/').at(-1), input = request.postDataJSON(), item = rows.get(id);
      requests.push({ path: url.pathname, method, input });
      if (input.action === 'invite' || input.action === 'resend') {
        if (state.uncertain) { item.send_state = 'uncertain'; return route.fulfill({ status: 503, json: { error: { message: 'The email outcome is uncertain. Check its status before sending again.' } } }); }
        item.status = 'invited'; item.send_state = 'sent'; item.invite_count++; item.last_invited_at = new Date().toISOString();
      } else if (input.action === 'decline') item.status = 'declined';
      else if (input.action === 'reopen') item.status = 'requested';
      else if (input.action === 'check') { item.send_state = 'sent'; item.status = 'invited'; item.invite_count++; item.last_invited_at = new Date().toISOString(); }
      return route.fulfill({ json: { request: item } });
    }
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Robyn beta administration</title><link rel="stylesheet" href="/admin.css"></head><body><div class="beta-admin"><div id="root"></div></div><script src="/fixture.js"></script></body></html>' });
  });
  await page.goto(origin + '/admin/login');
  return { page, context, state };
}

test('beta administration supports private login, filtering, invitations, joined updates and recovery in every browser engine', async t => {
  for (const browserType of [chromium, firefox, webkit]) await t.test(browserType.name(), async () => {
    const browser = await browserType.launch({ headless: true });
    try {
      const { page, context, state } = await fixture(browser);
      await page.getByRole('heading', { name: /A little room/ }).waitFor();
      await page.getByLabel('Username', { exact: true }).fill('operator');
      await page.getByLabel('Password', { exact: true }).fill('incorrect');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'Incorrect username or password.' }).waitFor();
      await page.getByLabel('Password', { exact: true }).fill('fixture-password');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.getByRole('heading', { name: 'Beta requests.' }).waitFor();
      await page.getByRole('button', { name: 'Invite alex@example.test', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Invitation email sent to alex@example.test.' }).waitFor();
      await page.getByRole('button', { name: 'Resend invitation to alex@example.test', exact: true }).click();
      await page.getByText('2 emails sent', { exact: true }).waitFor();
      const sent = state.requests.filter(request => request.method === 'POST' && request.path.endsWith(state.target.id));
      assert.deepEqual(sent.map(request => request.input.action), ['invite', 'resend']);
      assert.notEqual(sent[0].input.operationId, sent[1].input.operationId);
      state.target.status = 'joined'; state.target.joined_at = new Date().toISOString();
      await page.getByRole('button', { name: 'Refresh', exact: true }).click();
      await page.getByText('In the studio', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Resend invitation to alex@example.test', exact: true }).count(), 0);
      await page.getByLabel('Status', { exact: true }).selectOption('joined');
      await page.getByText('1–1 of 1', { exact: true }).waitFor();
      assert.equal(await page.getByText('river@example.test', { exact: true }).count(), 0);
      await page.getByLabel('Status', { exact: true }).selectOption('all');
      await page.getByLabel('Search email', { exact: true }).fill('sam@');
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      await page.getByRole('button', { name: 'Reopen sam@example.test', exact: true }).click();
      await page.getByRole('button', { name: 'Decline sam@example.test', exact: true }).click();
      await page.getByRole('button', { name: 'Reopen sam@example.test', exact: true }).waitFor();
      await page.getByLabel('Search email', { exact: true }).fill('river@');
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      state.uncertain = true;
      await page.getByRole('button', { name: 'Resend invitation to river@example.test', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'The email outcome is uncertain.' }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Resend invitation to river@example.test', exact: true }).count(), 0);
      await page.getByRole('button', { name: 'Check status for river@example.test', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Invitation status checked.' }).waitFor();
      await page.getByLabel('Search email', { exact: true }).fill('nobody@');
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      await page.getByText('No requests match these filters.', { exact: true }).waitFor();
      await page.getByLabel('Search email', { exact: true }).fill('');
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      await page.getByText('1–50 of 52', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.getByText('51–52 of 52', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Previous', exact: true }).click();
      await page.getByText('1–50 of 52', { exact: true }).waitFor();
      const scan = await new AxeBuilder({ page }).include('.beta-console').analyze();
      assert.deepEqual(scan.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })), []);
      if (browserType.name() === 'chromium') {
        await mkdir(root + 'artifacts/qa/beta-admin', { recursive: true });
        await page.screenshot({ path: root + 'artifacts/qa/beta-admin/desktop.png' });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({ path: root + 'artifacts/qa/beta-admin/compact.png' });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await page.getByRole('heading', { name: /A little room/ }).waitFor();
      assert.equal((await context.cookies()).some(cookie => cookie.name === 'fixture_admin'), false);
      assert.deepEqual(state.errors, []);
    } finally { await browser.close(); }
  });
});
