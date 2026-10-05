import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createHash, randomBytes } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import * as capacityInput from '../src/lib/agent-capacity-input.ts';
import * as billingInput from '../src/lib/billing-input.ts';

const HOST = '00000000-0000-4000-8000-000000000001';
const OWNER = '00000000-0000-4000-8000-000000000002';
const W1 = '00000000-0000-4000-8000-000000000003';
const W2 = '00000000-0000-4000-8000-000000000004';
class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
class Agent37Error extends ApiError {}
const http = {
  ApiError,
  json: (data, status = 200) => Response.json(data, { status }),
  readJson: (request) => request.json().catch(() => ({})),
  handleError: (error) => Response.json({ error: { message: error.message } }, { status: error.status || 500 }),
};

function load(path, dependencies) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, {
    exports, Request, Response, URL, URLSearchParams, console,
    require(name) { assert.ok(name in dependencies, `Unexpected import: ${name}`); return dependencies[name]; },
  });
  return exports;
}

test('PostgreSQL limits reserve capacity atomically and coupon credit is tenant-scoped and single-use', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql as 'select null::uuid';
      insert into auth.users(id,email) values ('${HOST}','host@example.test'), ('${OWNER}','owner@example.test');`);
    for (const migration of ['0001_init.sql','0004_member_assignments.sql','0006_workspace_billing.sql','0007_host_console.sql']) {
      await db.exec(fs.readFileSync(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8'));
    }
    // Existing workspaces get the same default as newly created ones.
    await db.exec(`insert into workspaces(id,name,owner_id) values ('${W1}','First','${OWNER}')`);
    const controls = fs.readFileSync(new URL('../supabase/migrations/0008_host_workspace_controls.sql', import.meta.url), 'utf8');
    await db.exec(controls); await db.exec(controls);
    await db.exec(`insert into workspaces(id,name,owner_id) values ('${W2}','Second','${OWNER}');
      insert into host_admins(user_id) values ('${HOST}');`);
    const capacity = async (id = W1) => (await db.query('select workspace_agent_capacity($1) as result', [id])).rows[0].result;
    assert.equal((await capacity()).agent_limit, 1);
    assert.equal((await capacity(W2)).agent_limit, 1);
    await assert.rejects(db.query('select reserve_agent_creation($1,$2,$3)', [W1, OWNER, OWNER]), /workspace_balance_empty/);
    await db.exec(`update workspace_billing set balance_micros = -1 where workspace_id='${W1}'`);
    await assert.rejects(db.query('select reserve_agent_creation($1,$2,$3)', [W1, OWNER, OWNER]), /workspace_balance_empty/);

    const codeHash = createHash('sha256').update('CREDIT-CONTROL-TEST').digest('hex');
    await assert.rejects(db.query('select host_issue_coupon($1,$2,$3,$4)', [OWNER,W1,codeHash,5000000]), /host_required/);
    await db.query('select host_issue_coupon($1,$2,$3,$4)', [HOST,W1,codeHash,5000000]);
    assert.equal((await capacity()).balance_micros, -1); // issuance grants nothing
    await assert.rejects(db.query('select billing_redeem_coupon($1,$2,$3)', [W2,OWNER,codeHash]));
    const redeemed = await Promise.allSettled(Array.from({length:4}, () => db.query('select billing_redeem_coupon($1,$2,$3)', [W1,OWNER,codeHash])));
    assert.equal(redeemed.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal((await capacity()).balance_micros, 4999999);
    assert.equal((await db.query('select count(*) as n from billing_ledger where workspace_id=$1', [W1])).rows[0].n, 1);
    const issued = (await db.query('select created_by,expires_at from billing_coupons where code_hash=$1', [codeHash])).rows[0];
    assert.equal(issued.created_by, HOST);
    assert.ok(Date.parse(issued.expires_at) > Date.now() + 29 * 86400000);

    const reservations = await Promise.allSettled(Array.from({length:4}, () => db.query('select reserve_agent_creation($1,$2,$3) as id', [W1,OWNER,OWNER])));
    assert.equal(reservations.filter((r) => r.status === 'fulfilled').length, 1);
    assert.ok(reservations.filter((r) => r.status === 'rejected').every((r) => /agent_limit_reached/.test(r.reason.message)));
    const reservation = reservations.find((r) => r.status === 'fulfilled').value.rows[0].id;
    assert.equal((await capacity()).pending_count, 1);
    const hostDetail = (await db.query('select host_tenant($1) as result', [W1])).rows[0].result;
    assert.equal(hostDetail.tenant.pending_agent_count, 1);
    // A lower limit preserves in-progress work and existing agents.
    await db.query('select host_set_agent_limit($1,$2,$3)', [HOST,W1,0]);
    await db.query('select complete_agent_creation($1,$2::jsonb)', [reservation,JSON.stringify({id:'agent-one',name:'Agent one',status:'stopped',template:'hermes',resources:{cpu:2,memory:4,disk:6}})]);
    assert.equal((await capacity()).agent_count, 1); assert.equal((await capacity()).pending_count, 0);
    await assert.rejects(db.query('select reserve_agent_creation($1,$2,$3)', [W1,OWNER,OWNER]), /agent_limit_reached/);
    await assert.rejects(db.query('select host_set_agent_limit($1,$2,$3)', [HOST,W1,-1]), /invalid_limit/);
    await assert.rejects(db.query('select host_set_agent_limit($1,$2,$3)', [OWNER,W1,10]), /host_required/);
    await db.query('select host_set_agent_limit($1,$2,$3)', [HOST,W1,2]);
    await db.query('select reserve_agent_creation($1,$2,$3)', [W1,OWNER,OWNER]);
    assert.equal((await capacity()).pending_count, 1);
    await assert.rejects(db.query('select reserve_agent_creation($1,$2,$3)', [W2,HOST,OWNER]), /admin_required/);
    await db.exec(`delete from workspace_billing where workspace_id='${W2}'`);
    assert.equal((await capacity(W2)).balance_micros, null);
    await assert.rejects(db.query('select reserve_agent_creation($1,$2,$3)', [W2,OWNER,OWNER]), /wallet_unavailable/);
    await db.exec(`delete from host_admins where user_id='${HOST}'`);
    await assert.rejects(db.query('select host_set_agent_limit($1,$2,$3)', [HOST,W1,3]), /host_required/);
    const grants = (await db.query(`select
      has_table_privilege('authenticated','agent_creation_reservations','SELECT') as reservations,
      has_function_privilege('authenticated','reserve_agent_creation(uuid,uuid,uuid)','EXECUTE') as reserve,
      has_function_privilege('anon','host_issue_coupon(uuid,uuid,text,bigint)','EXECUTE') as coupons`)).rows[0];
    assert.deepEqual(grants, {reservations:false,reserve:false,coupons:false});
  } finally { await db.close(); }
});

test('Host coupon issuance and limit writes verify permission, validate input, and never grant credit directly', async () => {
  let authorized = false; let revoked = false; const calls = [];
  const db = { rpc: async (name,args) => {
    calls.push({name,args});
    return { data: name === 'host_issue_coupon' ? '2026-12-01T00:00:00Z' : {}, error: revoked ? {message:'host_required'} : null };
  } };
  const actions = load('src/lib/host-workspace-actions.ts', {
    'server-only': {}, 'node:crypto': { createHash, randomBytes }, '@/lib/agent-capacity-input': capacityInput,
    '@/lib/billing-input': billingInput, '@/lib/http': http,
    '@/lib/host-auth': { requireHostAdmin: async () => {
      if (!authorized) throw new ApiError(403,'host_forbidden','Host required');
      return {db,user:{id:HOST}};
    } },
  });
  await assert.rejects(actions.issueHostCoupon(W1,'25.00'), (e) => e.status === 403);
  await assert.rejects(actions.setHostAgentLimit(W1,5), (e) => e.status === 403);
  assert.equal(calls.length, 0); authorized = true;
  for (const value of [null,{},'1',1.5,-1,1001]) await assert.rejects(actions.setHostAgentLimit(W1,value), (e) => e.status === 400);
  for (const value of [null,{},25,'0','10000.01','1.001','1e3']) await assert.rejects(actions.issueHostCoupon(W1,value), (e) => e.status === 400);
  assert.equal(calls.length, 0);
  assert.equal((await actions.setHostAgentLimit(W1,5)).agent_limit, 5);
  const coupon = await actions.issueHostCoupon(W1,'25.10');
  assert.equal(coupon.amount_micros, 25100000); assert.equal(coupon.workspace_id, W1);
  assert.match(coupon.code, /^CREDIT-[A-F0-9]{32}$/);
  assert.equal(calls.at(-1).args.p_hash, createHash('sha256').update(coupon.code).digest('hex'));
  assert.ok(!JSON.stringify(coupon).includes(calls.at(-1).args.p_hash));
  assert.ok(calls.every((call) => ['host_issue_coupon','host_set_agent_limit'].includes(call.name)));
  revoked = true; await assert.rejects(actions.setHostAgentLimit(W1,2), (e) => e.status === 403);
  assert.throws(() => actions.requireHostWriteOrigin(new Request('https://robyn.test/api', {headers:{origin:'https://other.test'}})), (e) => e.status === 403);
});

test('Host control endpoints enforce the correct write method, scope, and response caching', async () => {
  for (const [path,method,action,body] of [
    ['coupons','POST','issueHostCoupon',{amount_usd:'10.00'}],
    ['agent-limit','PATCH','setHostAgentLimit',{agent_limit:2}],
  ]) {
    let deny = false; let scope;
    const route = load(`src/app/api/host/tenants/[id]/${path}/route.ts`, {
      '@/lib/http': http, '@/lib/host-workspace-actions': {
        requireHostWriteOrigin: () => {}, [action]: async (id,value) => {
          if (deny) throw new ApiError(403,'host_forbidden','Host required'); scope = {id,value}; return {safe:true};
        },
      },
    });
    assert.deepEqual(Object.keys(route), [method]);
    const request = () => new Request('https://robyn.test/api',{method,body:JSON.stringify(body)});
    const response = await route[method](request(), {params:Promise.resolve({id:W1})});
    assert.equal(scope.id, W1); assert.equal(scope.value, Object.values(body)[0]);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.status, method === 'POST' ? 201 : 200);
    deny = true; assert.equal((await route[method](request(),{params:Promise.resolve({id:W1})})).status,403);
  }
});

function creationFixture() {
  let pending = 0; let agentCount = 0; let balance = 1000000;
  let creationError; let completionError = false; let completionCommitted = false; let deleteFails = false; let completionUncertain = false;
  let finishCreate; const calls = []; const created = { id:'created', name:'Example', status:'running', template:'hermes', resources:{cpu:2,memory:4,disk:6} };
  const db = {
    rpc: async (name) => {
      if (name === 'reserve_agent_creation') {
        if (balance <= 0) return {data:null,error:{message:'workspace_balance_empty'}};
        if (pending + agentCount >= 1) return {data:null,error:{message:'agent_limit_reached'}};
        pending++; return {data:HOST,error:null};
      }
      if (name === 'complete_agent_creation') {
        if (!completionError || completionCommitted) { pending--; agentCount++; }
        return {data:null,error:completionError?{code:completionUncertain||completionCommitted?'':'P0001',message:'private-database-error'}:null};
      }
      throw new Error('Unexpected RPC');
    },
    from(table) {
      const q = { delete: () => q, select: () => q, eq: () => q,
        maybeSingle: async () => ({data:agentCount ? {workspace_id:W1} : null,error:null}),
        then: (resolve) => { assert.equal(table,'agent_creation_reservations'); pending--; return Promise.resolve({error:null}).then(resolve); },
      }; return q;
    },
  };
  const capacity = load('src/lib/agent-capacity.ts', {'server-only':{},'@/lib/http':http});
  const route = load('src/app/api/agents/route.ts', {
    '@/lib/agent-capacity': capacity, '@/lib/http':http,
    '@/lib/auth': {requireUser:async()=>({db,user:{id:OWNER}}),requireAdmin:async()=>{},requireAssignee:async()=>{}},
    '@/lib/assignment-input': {validateAssignedUserId:(value)=>value},
    '@/lib/billing': {requireWorkspaceBalance:async()=>{}},
    '@/config/agents': {AGENT_TEMPLATES:['hermes'],DEFAULT_AGENT:{template:'hermes',cpu:2,memory:4,disk:6,monthlyCapUsd:5}},
    '@/lib/format': {usdToMicros:(value)=>value*1000000},
    '@/lib/agent37': {Agent37Error,agent37:{createAgent:async(input)=>{
      calls.push(input);
      if (creationError) throw creationError;
      if (finishCreate) await new Promise((resolve)=>{ finishCreate.resolve=resolve; });
      return created;
    },deleteAgent:async()=>{calls.push('delete');if(deleteFails)throw new Error('uncertain delete');}}},
  });
  return {
    route,calls, pending:()=>pending, agentCount:()=>agentCount,
    setBalance:(value)=>{balance=value;}, failCreate:(error)=>{creationError=error;},
    failCompletion:(committed=false,uncertain=false)=>{completionError=true;completionCommitted=committed;completionUncertain=uncertain;},
    failDelete:()=>{deleteFails=true;}, pauseCreate:()=>{finishCreate={};}, resumeCreate:()=>finishCreate.resolve(),
  };
}
const createRequest = () => new Request('https://robyn.test/api/agents',{method:'POST',body:JSON.stringify({workspace_id:W1,assigned_user_id:OWNER,template:'hermes'})});

test('concurrent agent requests reserve one slot before provisioning, and insufficient balances never provision', async () => {
  const f = creationFixture(); f.pauseCreate();
  const first = f.route.POST(createRequest());
  while (!f.calls.length) await new Promise((resolve)=>setTimeout(resolve,0));
  assert.equal((await f.route.POST(createRequest())).status,409);
  assert.equal(f.calls.length,1); f.resumeCreate(); assert.equal((await first).status,201);
  assert.equal(f.pending(),0); assert.equal(f.agentCount(),1);
  assert.equal(f.calls[0].metadata.app_creation,HOST);
  for (const amount of [0,-1]) {
    const empty = creationFixture(); empty.setBalance(amount);
    assert.equal((await empty.route.POST(createRequest())).status,402); assert.equal(empty.calls.length,0);
  }
});

test('confirmed create failures free capacity; uncertain outcomes hold it and commit retries do not delete saved agents', async () => {
  const known = creationFixture(); known.failCreate(new Agent37Error(503,'no_capacity','No capacity'));
  assert.equal((await known.route.POST(createRequest())).status,503); assert.equal(known.pending(),0);
  const uncertain = creationFixture(); uncertain.failCreate(new Error('network failure'));
  assert.equal((await uncertain.route.POST(createRequest())).status,503); assert.equal(uncertain.pending(),1);
  assert.equal((await uncertain.route.POST(createRequest())).status,409); assert.equal(uncertain.calls.length,1);
  const rollback = creationFixture(); rollback.failCompletion();
  const rollbackResponse = await rollback.route.POST(createRequest());
  assert.equal(rollbackResponse.status,503); assert.equal(rollback.pending(),0); assert.ok(rollback.calls.includes('delete'));
  assert.ok(!JSON.stringify(await rollbackResponse.json()).includes('private-database'));
  const unresolved = creationFixture(); unresolved.failCompletion(); unresolved.failDelete();
  assert.equal((await unresolved.route.POST(createRequest())).status,503); assert.equal(unresolved.pending(),1);
  const committed = creationFixture(); committed.failCompletion(true);
  assert.equal((await committed.route.POST(createRequest())).status,201); assert.ok(!committed.calls.includes('delete'));
  const databaseUncertain = creationFixture(); databaseUncertain.failCompletion(false,true);
  assert.equal((await databaseUncertain.route.POST(createRequest())).status,503);
  assert.equal(databaseUncertain.pending(),1); assert.ok(!databaseUncertain.calls.includes('delete'));
});

test('creation UI disables both buttons for limits, nonpositive wallets, and unavailable data', () => {
  const capacity = {agent_limit:1,agent_count:0,pending_count:0,balance_micros:1};
  assert.equal(capacityInput.creationDisabledReason(capacity),null);
  for (const blocked of [null,{...capacity,balance_micros:null},{...capacity,balance_micros:0},{...capacity,balance_micros:-1},
    {...capacity,agent_count:1},{...capacity,pending_count:1},{...capacity,agent_limit:0}]) {
    const reason = capacityInput.creationDisabledReason(blocked); assert.equal(typeof reason,'string');
    const components = load('src/components/CreateAgentButton.tsx', {
      'react/jsx-runtime':jsxRuntime,react:React,'lucide-react':{Plus:'i'},sonner:{toast:{}},'@/lib/api':{},
      '@/config/agents':{AGENT_TYPES:[{template:'hermes'}]},'@/components/ui/button':{Button:'button'},
      '@/components/WorkspaceUserSelect':{useWorkspaceMembers:()=>({members:[],loading:false,error:null}),WorkspaceUserSelect:()=>null},
      '@/components/ui/dialog':Object.fromEntries(['Dialog','DialogContent','DialogFooter','DialogHeader','DialogTitle'].map((key)=>[key,({children})=>React.createElement('div',null,children)])),
    });
    const html = renderToStaticMarkup(React.createElement(components.CreateAgentButton,{workspaceId:W1,onCreated:()=>{},disabledReason:reason}));
    assert.match(html, /<button[^>]*disabled=""[^>]*>.*?Create agent/s);
    assert.equal((html.match(/disabled=""/g)||[]).length,2);
  }
});
