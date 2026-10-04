import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as jsxRuntime from 'react/jsx-runtime';
import * as profileInput from '../src/lib/user-profile.ts';

function loadSource(relativePath, dependencies) {
  const source = fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, console,
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
const request = (body) => new Request('https://app.example/api/profile', { method: 'PATCH', body: JSON.stringify(body) });
const email = 'member@example.com';
const defaultProfile = { email, display_name: email, phone_number: null };

function fixture({ signedIn = true, failSave = false } = {}) {
  const calls = [];
  const user = { id: 'session-user', email, phone: '+14165550000', user_metadata: { unrelated: 'keep me' }, app_metadata: { role: 'member' } };
  const db = { auth: { admin: { async updateUserById(id, attributes) {
    calls.push({ id, attributes });
    if (failSave) return { data: { user: null }, error: new Error('upstream details') };
    Object.assign(user.user_metadata, attributes.user_metadata);
    return { data: { user }, error: null };
  } } } };
  const route = loadSource('src/app/api/profile/route.ts', {
    '@/lib/auth': { async requireUser() {
      if (!signedIn) throw new ApiError(401, 'unauthorized', 'Sign in required');
      return { user, db };
    } },
    '@/lib/http': http, '@/lib/user-profile': profileInput,
  });
  return { route, user, calls };
}

test('profiles default to email and preserve existing member display names', () => {
  assert.deepEqual(profileInput.userProfileFromUser({ email, user_metadata: {} }), defaultProfile);
  assert.equal(profileInput.userProfileFromUser({ email, user_metadata: { full_name: ' Jamie ', name: 'Old' } }).display_name, 'Jamie');
  assert.equal(profileInput.userProfileFromUser({ email, user_metadata: { full_name: ' ', name: 'Legacy' } }).display_name, 'Legacy');
  assert.deepEqual(profileInput.userProfileFromUser({ email, user_metadata: { full_name: {}, name: false, phone_number: 123 } }), defaultProfile);
});

test('unauthenticated reads and writes never reach the privileged updater', async () => {
  const f = fixture({ signedIn: false });
  assert.equal((await f.route.GET()).status, 401);
  assert.equal((await f.route.PATCH(request({ display_name: 'Jamie' }))).status, 401);
  assert.equal(f.calls.length, 0);
});

test('members can update only their session profile, without exposing or changing auth data', async () => {
  const f = fixture();
  const response = await f.route.PATCH(request({ display_name: ' Jamie ', phone_number: ' +1 (416) 555-0123 ext. 4 ' }));
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.deepEqual(saved, { profile: { email, display_name: 'Jamie', phone_number: '+1 (416) 555-0123 ext. 4' } });
  assert.equal(f.calls[0].id, 'session-user');
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0].attributes)), { user_metadata: { full_name: 'Jamie', phone_number: '+1 (416) 555-0123 ext. 4' } });
  assert.equal(f.user.user_metadata.unrelated, 'keep me');
  assert.equal(f.user.phone, '+14165550000');
  assert.deepEqual(f.user.app_metadata, { role: 'member' });
  assert.deepEqual(await (await f.route.GET()).json(), saved);
});

test('partial updates preserve omitted fields and an empty contact number clears it', async () => {
  const f = fixture();
  await f.route.PATCH(request({ display_name: 'Jamie', phone_number: '+14165550123' }));
  await f.route.PATCH(request({ display_name: 'New name' }));
  assert.equal(f.user.user_metadata.phone_number, '+14165550123');
  const response = await f.route.PATCH(request({ phone_number: '   ' }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { profile: { email, display_name: 'New name', phone_number: null } });
});

test('malformed inputs and attempts to change identity or privileges fail before saving', async () => {
  const f = fixture();
  for (const body of [null, [], {}, { display_name: '' }, { display_name: 3 },
    { display_name: 'a'.repeat(profileInput.MAX_DISPLAY_NAME_LENGTH + 1) }, { display_name: 'bad\nname' },
    { phone_number: {} }, { phone_number: 'not a number' }, { phone_number: '+1\n555' },
    { phone_number: '1'.repeat(profileInput.MAX_PHONE_NUMBER_LENGTH + 1) },
    { display_name: 'Jamie', user_id: 'other-user' }, { display_name: 'Jamie', email: 'other@example.com' },
    { display_name: 'Jamie', app_metadata: { role: 'admin' } }]) {
    assert.equal((await f.route.PATCH(request(body))).status, 400, JSON.stringify(body));
  }
  const malformed = new Request('https://app.example/api/profile', { method: 'PATCH', body: '{' });
  assert.equal((await f.route.PATCH(malformed)).status, 400);
  assert.equal(f.calls.length, 0);
});

test('provider failures return an actionable error without claiming a save or leaking details', async () => {
  const f = fixture({ failSave: true });
  const response = await f.route.PATCH(request({ display_name: 'Jamie' }));
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: { message: "Couldn't save your profile. Please try again." } });
  assert.equal(f.user.user_metadata.full_name, undefined);
});

const widget = ({ children }) => React.createElement('div', null, children);
const link = { __esModule: true, default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children) };

test('the account name links to the profile for both admins and members', () => {
  for (const role of ['admin', 'member']) {
    const { AccountMenu } = loadSource('src/components/AccountMenu.tsx', {
      react: React, 'react/jsx-runtime': jsxRuntime, 'next/link': link,
      'next/navigation': { useRouter: () => ({ push() {} }) },
      'lucide-react': Object.fromEntries(['Check', 'ChevronsUpDown', 'LogOut', 'Plus'].map((name) => [name, widget])),
      sonner: { toast: {} }, '@/lib/api': {}, '@/lib/supabase/client': {},
      '@/components/WorkspaceProvider': { useWorkspace: () => ({ workspaces: [], current: { role }, profile: { ...defaultProfile, display_name: 'Jamie' } }) },
      '@/components/ui/button': { Button: widget }, '@/components/ui/input': { Input: widget }, '@/components/ui/label': { Label: widget },
      '@/components/ui/dropdown-menu': Object.fromEntries(['DropdownMenu', 'DropdownMenuContent', 'DropdownMenuItem', 'DropdownMenuLabel', 'DropdownMenuSeparator', 'DropdownMenuTrigger'].map((name) => [name, widget])),
      '@/components/ui/dialog': Object.fromEntries(['Dialog', 'DialogContent', 'DialogDescription', 'DialogFooter', 'DialogHeader', 'DialogTitle'].map((name) => [name, widget])),
    });
    const markup = renderToStaticMarkup(React.createElement(AccountMenu));
    assert.match(markup, /href="\/profile"/);
    assert.match(markup, /Edit profile for Jamie/);
  }
});

test('members can view their profile while restricted fleet pages still redirect', () => {
  for (const pathname of ['/profile', '/dashboard/members', '/dashboard/settings']) {
    const effects = [], replacements = [];
    const { DashboardShell } = loadSource('src/components/DashboardShell.tsx', {
      react: { ...React, useEffect: (effect) => effects.push(effect) }, 'react/jsx-runtime': jsxRuntime,
      'next/link': link, 'next/navigation': { usePathname: () => pathname, useRouter: () => ({ replace: (path) => replacements.push(path) }) },
      'lucide-react': { LayoutGrid: widget, Settings: widget, Users: widget },
      '@/config/branding': { branding: { appName: 'Test' } }, '@/components/AccountMenu': { AccountMenu: () => null },
      '@/lib/utils': { cn: (...values) => values.join(' ') },
      '@/components/WorkspaceProvider': { useWorkspace: () => ({ current: { id: 'workspace', role: 'member' }, ready: true }) },
      '@/components/MemberAgentSelection': { MemberAgentSelection: () => React.createElement('div', null, 'Agent chooser') },
    });
    const markup = renderToStaticMarkup(React.createElement(DashboardShell, null, 'Profile form'));
    effects.forEach((effect) => effect());
    if (pathname === '/profile') {
      assert.match(markup, /Profile form/);
      assert.doesNotMatch(markup, /Agent chooser/);
      assert.deepEqual(replacements, []);
    } else {
      assert.doesNotMatch(markup, /Profile form/);
      assert.deepEqual(replacements, ['/dashboard']);
    }
  }
});
