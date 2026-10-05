import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { PGlite } from '@electric-sql/pglite';
import { safeNextPath } from '../src/lib/site-url.ts';
import { invitationTokens } from '../src/lib/invite-session.ts';
import { branding } from '../src/config/branding.ts';
import * as agentConfig from '../src/config/agents.ts';

const USER = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const W1 = '00000000-0000-4000-8000-000000000003';
const W2 = '00000000-0000-4000-8000-000000000004';
class ApiError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
const http = { ApiError, json: Response.json, handleError: (error) => Response.json({ error: { code: error.code, message: error.message } }, { status: error.status ?? 500 }) };

function load(file, dependencies, env = {}) {
  const exports = {};
  const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText, {
    exports, Request, Response, URL, URLSearchParams, console, process: { env },
    require: (name) => { assert.ok(name in dependencies, `Unexpected import ${name}`); return dependencies[name]; },
  });
  return exports;
}

test('Host authorization uses the session ID, rejects metadata spoofing, and immediately honors revocation', async () => {
  let signedIn = true; let granted = true; let permissionError = false;
  const user = { id: USER, email: 'any-host@example.test', user_metadata: { role: 'host', is_host_admin: true } };
  const db = { from(table) {
    assert.equal(table, 'host_admins');
    const q = { select: () => q, eq: (key, value) => { assert.equal(key, 'user_id'); assert.equal(value, USER); return q; },
      maybeSingle: async () => ({ data: granted ? { user_id: USER } : null, error: permissionError ? {} : null }) }; return q;
  } };
  const auth = load('src/lib/host-auth.ts', {
    'server-only': {}, 'next/navigation': { redirect: (path) => { throw new Error(`redirect:${path}`); } },
    '@/lib/auth': { requireUser: async () => { if (!signedIn) throw new ApiError(401, 'unauthorized', 'Sign in required'); return { db, user }; }, getSession: async () => ({ user: signedIn ? user : null }) },
    '@/lib/supabase/admin': { createAdminClient: () => db }, '@/lib/http': http,
  });
  assert.equal((await auth.requireHostAdmin()).user.id, USER);
  granted = false;
  await assert.rejects(auth.requireHostAdmin(), (e) => e.status === 403);
  assert.equal(await auth.hostPageAccess(), null);
  permissionError = true;
  await assert.rejects(auth.requireHostAdmin(), (e) => e.status === 503);
  signedIn = false;
  await assert.rejects(auth.requireHostAdmin(), (e) => e.status === 401);
  await assert.rejects(auth.hostPageAccess(), /redirect:\/login\?next=\/host/);
});

test('PostgreSQL Host projections paginate beyond 1000 rows and preserve missing and negative wallets', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql as 'select null::uuid';
      insert into auth.users(id,email) values ('${USER}','owner@example.test'), ('${OTHER}','other@example.test');`);
    for (const migration of ['0001_init.sql', '0004_member_assignments.sql', '0006_workspace_billing.sql', '0007_host_console.sql', '0008_host_workspace_controls.sql'])
      await db.exec(fs.readFileSync(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8'));
    await db.exec(fs.readFileSync(new URL('../supabase/migrations/0007_host_console.sql', import.meta.url), 'utf8'));
    await db.exec(fs.readFileSync(new URL('../supabase/migrations/0008_host_workspace_controls.sql', import.meta.url), 'utf8'));
    const overview = async () => (await db.query('select host_overview() as result')).rows[0].result;
    assert.equal((await overview()).tenant_count, 0);
    assert.equal((await overview()).balance_micros, '0');
    await db.exec(`insert into workspaces(id,name,owner_id) values ('${W1}','First','${USER}'), ('${W2}','Second','${OTHER}');
      insert into workspaces(id,name,owner_id) select md5('workspace-'||n)::uuid, 'Tenant '||n, '${USER}' from generate_series(1,1005) n;
      insert into auth.users(id,email) select md5('user-'||n)::uuid, 'member'||n||'@example.test' from generate_series(1,1005) n;
      insert into memberships(workspace_id,user_id,role) select '${W1}', md5('user-'||n)::uuid, 'member' from generate_series(1,1005) n;
      insert into agents(agent37_id,workspace_id,name,status) select 'agent-'||n, '${W1}', 'Agent '||n, 'running' from generate_series(1,1005) n;
      insert into agents(agent37_id,workspace_id,name) values ('foreign','${W2}','Foreign');
      update workspace_billing set balance_micros=-1500000, auto_top_up_error='Controlled error' where workspace_id='${W1}';
      update workspace_billing set balance_micros=2200000, usage_synced_through=(now() at time zone 'UTC')::date where workspace_id='${W2}';
      delete from workspace_billing where workspace_id=md5('workspace-1005')::uuid;
      insert into billing_auto_topups(workspace_id,amount_micros,customer_id,payment_method_id,created_at)
        values ('${W1}',25000000,'secret-customer','secret-method',now()-interval '24 hours');
      insert into billing_auto_topups(workspace_id,amount_micros,customer_id,payment_method_id,created_at)
        values ('${W2}',25000000,'secret-customer','secret-method',now()-interval '22 hours');
      insert into billing_ledger(workspace_id,amount_micros,kind,source_key)
        select '${W1}',1000000,'payment','secret-source-'||n from generate_series(1,61) n;`);
    const summary = await overview();
    assert.equal(summary.tenant_count, 1007); assert.equal(summary.agent_count, 1006);
    assert.equal(summary.balance_micros, '700000'); assert.equal(summary.wallet_missing_count, 1);
    assert.equal(summary.billing_flags.payment_review, 1); assert.equal(summary.billing_flags.auto_top_up_error, 1);
    const directory = async (q = '', p = 1) => (await db.query('select host_tenants($1,$2) as result', [q,p])).rows[0].result;
    assert.equal((await directory()).items.length, 50);
    assert.equal((await directory('',21)).items.length, 7);
    assert.equal((await directory('',21)).total, 1007);
    assert.equal((await directory('owner@example.test')).total, 1006);
    assert.equal((await directory(W1)).items[0].balance_micros, -1500000);
    assert.equal((await directory(W1)).items[0].agent_limit, 1);
    assert.equal((await directory('%')).total, 0);
    const missing = (await directory('Tenant 1005')).items[0];
    assert.equal(missing.balance_micros, null); assert.deepEqual(missing.billing_flags, ['wallet_missing']);
    const detail = (await db.query('select host_tenant($1,21,21,2) as result', [W1])).rows[0].result;
    assert.equal(detail.members.total, 1006); assert.equal(detail.members.items.length, 6);
    assert.equal(detail.agents.total, 1005); assert.equal(detail.agents.items.length, 5);
    assert.equal(detail.ledger.total, 61); assert.equal(detail.ledger.items.length, 11);
    assert.equal(detail.pending_payments[0].needs_review, true);
    const recentPayment = (await db.query('select host_tenant($1) as result', [W2])).rows[0].result;
    assert.equal(recentPayment.pending_payments[0].needs_review, false);
    assert.ok(detail.agents.items.every((a) => a.id !== 'foreign'));
    assert.ok(!JSON.stringify(detail).includes('secret-'));
    assert.equal((await db.query('select host_tenant($1) as result',[missing.id])).rows[0].result.wallet, null);
    assert.equal((await db.query('select host_tenant($1) as result',['ffffffff-ffff-4fff-8fff-ffffffffffff'])).rows[0].result, null);
    await assert.rejects(db.query('select host_tenants($1,$2)', ['',0]));
    const grants = (await db.query(`select has_table_privilege('authenticated','host_admins','SELECT') as table_allowed,
      has_function_privilege('anon','host_overview()','EXECUTE') as overview_allowed,
      has_function_privilege('authenticated','host_tenant(uuid,integer,integer,integer)','EXECUTE') as detail_allowed,
      has_function_privilege('service_role','host_tenants(text,integer)','EXECUTE') as service_allowed`)).rows[0];
    assert.deepEqual(grants,{table_allowed:false,overview_allowed:false,detail_allowed:false,service_allowed:true});
    await db.exec('delete from workspace_billing');
    const unavailable = await overview();
    assert.equal(unavailable.balance_micros, null);
    assert.equal(unavailable.wallet_missing_count, 1007);
  } finally { await db.close(); }
});

test('Host permission does not grant workspace roles or agent content access', async () => {
  const calls = [];
  const db = {
    from(table) {
      calls.push(table);
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data: table === 'agents' ? { agent37_id: 'tenant-agent', workspace_id: W1, assigned_user_id: OTHER } : null,
          error: null,
        }),
      };
      return query;
    },
  };
  const auth = load('src/lib/auth.ts', {
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: USER } } }) } }) },
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/http': http,
  });
  assert.equal(await auth.getRole(db, W1, USER), null);
  await assert.rejects(auth.requireMember(db, W1, USER), (error) => error.status === 404);
  await assert.rejects(auth.requireAdmin(db, W1, USER), (error) => error.status === 403);
  await assert.rejects(auth.requireAgentAccess('tenant-agent'), (error) => error.status === 404);
  assert.ok(!calls.includes('host_admins'));
});

test('an unavailable Host permission store fails closed with a retry state', async () => {
  let unavailable = true;
  const layout = load('src/app/host/layout.tsx', {
    'react/jsx-runtime': jsxRuntime,
    '@/lib/host-auth': { hostPageAccess: async () => {
      if (unavailable) throw new ApiError(503, 'host_unavailable', 'private database details');
      throw new Error('redirect:/login?next=/host');
    } },
    '@/lib/http': http,
    '@/components/host/HostShell': { HostUnavailable: () => React.createElement('p', null, 'Host is unavailable') },
  });
  const rendered = renderToStaticMarkup(await layout.default({ children: 'private tenant data' }));
  assert.match(rendered, /Host is unavailable/);
  assert.ok(!rendered.includes('private'));
  unavailable = false;
  await assert.rejects(layout.default({ children: null }), /redirect:\/login/);
});

test('all Host reads authorize before querying, remain read-only, and sanitize nested response fields', async () => {
  let authorized = false; let result; let readError; const calls = [];
  const host = load('src/lib/host.ts', {
    'server-only': {}, '@/config/branding': { branding }, '@/config/agents': agentConfig,
    '@/lib/host-auth': { requireHostAdmin: async () => { calls.push('authorize'); if (!authorized) throw new ApiError(403,'host_forbidden','Host access required');
      return {db:{rpc:async(name,args)=>{calls.push({name,args}); return {data:result,error:readError};}}}; } }, '@/lib/http':http,
  }, {AGENT37_API_KEY:'secret-upstream',STRIPE_SECRET_KEY:'secret-stripe',BILLING_CRON_SECRET:'secret-cron'});
  for (const call of [()=>host.readHostOverview(),()=>host.readHostTenants(new URLSearchParams()),()=>host.readHostTenant(W1,new URLSearchParams()),()=>host.readHostConfiguration()])
    await assert.rejects(call(),(e)=>e.status===403);
  assert.equal(calls.length,4); authorized=true;
  assert.ok(!JSON.stringify(await host.readHostConfiguration()).includes('secret-'));
  const tenant={id:W1,name:'Tenant',created_at:'2026-01-01',owner:{user_id:USER,email:'owner@example.test',display_name:'Owner',private:'secret-owner'},member_count:1,agent_count:1,balance_micros:-1,billing_flags:[],private:'secret-tenant'};
  const p=(items)=>({items,page:1,page_size:50,total:items.length,private:'secret-page'});
  result={tenant,generated_at:'2026-01-01',wallet:{balance_micros:-1,has_payment_method:true,auto_top_up_enabled:false,auto_top_up_amount_micros:25000000,auto_top_up_threshold_micros:12500000,auto_top_up_error:null,usage_synced_through:null,stripe_customer_id:'secret-customer'},
    members:p([{user_id:USER,email:'member@example.test',display_name:'Member',role:'member',created_at:'2026-01-01',phone:'secret-phone'}]),
    agents:p([{id:'agent',name:'Agent',status:null,template:'hermes',cpu:2,memory:4,disk:6,assigned_user_id:USER,created_at:'2026-01-01',content:'secret-content'}]),
    ledger:p([{id:OTHER,amount_micros:1,kind:'payment',created_at:'2026-01-01',source_key:'secret-source'}]),
    pending_payments:[{amount_micros:1,created_at:'2026-01-01',needs_review:true,payment_method_id:'secret-method'}],private:'secret-detail'};
  const response=await host.readHostTenant(W1,new URLSearchParams('member_page=2&agent_page=3&ledger_page=4'));
  assert.ok(!JSON.stringify(response).includes('secret-')); assert.equal(response.wallet.balance_micros,-1);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1).args)),{p_workspace:W1,p_member_page:2,p_agent_page:3,p_ledger_page:4});
  result=p([tenant]); assert.ok(!JSON.stringify(await host.readHostTenants(new URLSearchParams())).includes('secret-'));
  result=null; await assert.rejects(host.readHostTenant(W1,new URLSearchParams()),(e)=>e.status===404);
  readError={message:'secret-database-error'}; await assert.rejects(host.readHostOverview(),(e)=>e.status===503&&!e.message.includes('secret-'));
  for(const raw of ['0','-1','1.5','1e2','1000001','']) assert.throws(()=>host.hostPageNumber(new URLSearchParams(`page=${raw}`)),(e)=>e.status===400);
});

test('Host BFFs expose GET only and prevent browser caching',async()=>{
  for(const [path,method] of [['overview','readHostOverview'],['tenants','readHostTenants'],['configuration','readHostConfiguration'],['tenants/[id]','readHostTenant']]){
    let deny=false;
    const route=load(`src/app/api/host/${path}/route.ts`,{'@/lib/host':{[method]:async()=>{if(deny)throw new ApiError(403,'host_forbidden','Host access required');return {safe:true};}},'@/lib/http':http});
    assert.deepEqual(Object.keys(route),['GET']);
    const response=await route.GET(new Request(`http://localhost/api/host/${path}`),{params:Promise.resolve({id:W1})});
    assert.equal(response.headers.get('cache-control'),'private, no-store');assert.deepEqual(await response.json(),{safe:true});
    deny=true;assert.equal((await route.GET(new Request('http://localhost/api/host'),{params:Promise.resolve({id:W1})})).status,403);
  }
});

test('invitation callbacks verify their token before opening password setup',async()=>{
  const link=new URL('https://robyn.example.test/auth/callback?next=/reset-password&token_hash=test-hash&type=invite');
  const callback=load('src/app/auth/callback/route.ts',{'next/server':{NextResponse:{redirect:(url)=>new Response(null,{status:307,headers:{location:url.toString()}})}},'@/lib/site-url':{safeNextPath},'@/lib/supabase/server':{createClient:async()=>({auth:{verifyOtp:async(input)=>{assert.equal(input.type,'invite');assert.equal(input.token_hash,'test-hash');return {error:null};}}})}});
  assert.equal((await callback.GET(new Request(link))).headers.get('location'),'https://robyn.example.test/reset-password');
});

test('standard invitation sessions clear the fragment before establishing verified cookies',()=>{
  assert.deepEqual(invitationTokens('#type=invite&access_token=test-access&refresh_token=test-refresh'),{access_token:'test-access',refresh_token:'test-refresh'});
  for(const hash of ['','#error=expired','#type=recovery&access_token=test&refresh_token=test','#type=invite&access_token=test'])assert.equal(invitationTokens(hash),null);
  const source=fs.readFileSync(new URL('../src/app/auth/invite/page.tsx',import.meta.url),'utf8');
  assert.ok(source.indexOf('window.history.replaceState')<source.indexOf('const supabase = createClient()'));
  assert.ok(source.includes('supabase.auth.getUser()'));
});

test('Host BFFs reach their verified-session checks instead of receiving proxy HTML redirects',async()=>{
  let sessionChecks=0;
  const proxy=load('src/proxy.ts',{'next/server':{NextResponse:{next:()=>({direct:true})}},'@/lib/supabase/middleware':{updateSession:async()=>{sessionChecks++;return {session:true};}}});
  assert.equal((await proxy.proxy({nextUrl:{pathname:'/api/host/overview'}})).direct,true);
  assert.equal(sessionChecks,0);
  assert.equal((await proxy.proxy({nextUrl:{pathname:'/host'}})).session,true);
  assert.equal(sessionChecks,1);
});

test('default landing chooses Host without creating tenants; tenant users retain their dashboard',async()=>{
  const redirect=(path)=>{throw new Error(`redirect:${path}`);};let granted=true;
  const db={from(){throw new Error('Host must not touch tenant tables');}};
  const auth={getSession:async()=>({user:{id:USER,user_metadata:{}}})};const hostAuth={isHostAdmin:async(_,id)=>{assert.equal(id,USER);return granted;}};
  const home=load('src/app/page.tsx',{'next/navigation':{redirect},'@/lib/auth':auth,'@/lib/host-auth':hostAuth,'@/lib/supabase/admin':{createAdminClient:()=>db}});
  await assert.rejects(home.default(),/redirect:\/host/);
  const workspace=load('src/components/WorkspaceLayout.tsx',{'react/jsx-runtime':jsxRuntime,'next/navigation':{redirect},'@/lib/auth':auth,'@/lib/host-auth':hostAuth,'@/lib/supabase/admin':{createAdminClient:()=>db},'@/components/WorkspaceProvider':{},'@/lib/user-profile':{}});
  await assert.rejects(workspace.WorkspaceLayout({children:null}),/redirect:\/host/);
  granted=false;await assert.rejects(home.default(),/redirect:\/dashboard/);
  assert.equal(safeNextPath(),'/');assert.equal(safeNextPath('/dashboard/agents/test/chat'),'/dashboard/agents/test/chat');
  for(const path of ['//evil.test','/\\evil.test','/\nevil.test','https://evil.test'])assert.equal(safeNextPath(path),'/');
});

test('Host amounts preserve large aggregate micros and missing wallets display as unavailable',()=>{
  const views=load('src/components/host/HostViews.tsx',{'react/jsx-runtime':jsxRuntime,react:React,'next/link':{__esModule:true,default:'a'},'lucide-react':{RefreshCw:'i',Search:'i'},'@/components/ui/button':{Button:'button'},'@/components/ui/input':{Input:'input'},'@/components/ui/label':{Label:'label'},'@/components/host/HostWorkspaceControls':{}});
  assert.equal(views.hostMoney(null),'Unavailable');assert.equal(views.hostMoney(-1500000),'-$1.50');assert.equal(views.hostMoney('9007199254740991000'),'$9,007,199,254,740.99');
  const denied=load('src/components/host/HostShell.tsx',{'react/jsx-runtime':jsxRuntime,'next/link':{__esModule:true,default:'a'},'next/navigation':{},'lucide-react':{},'@/config/branding':{branding},'@/lib/supabase/client':{},'@/lib/utils':{},'@/components/ui/button':{Button:({children})=>React.createElement('div',null,children)}});
  assert.match(renderToStaticMarkup(React.createElement(denied.HostAccessDenied)),/Host access required/);
});
