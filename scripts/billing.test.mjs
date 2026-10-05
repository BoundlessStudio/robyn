import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash, timingSafeEqual } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import ts from 'typescript';
import Stripe from 'stripe';
import { autoTopUpInput, billingRetryKey, billingUsdToCents } from '../src/lib/billing-input.ts';

const W1 = '00000000-0000-4000-8000-000000000001';
const W2 = '00000000-0000-4000-8000-000000000002';
const USER = '00000000-0000-4000-8000-000000000003';
const day = new Date().toISOString().slice(0, 10);

test('card amounts are exact cents, bounded, and reject coercion or sub-cent charges', () => {
  assert.equal(billingUsdToCents('5'), 500);
  assert.equal(billingUsdToCents('25.01'), 2501);
  assert.equal(billingUsdToCents('10000.00'), 1000000);
  for (const amount of ['0', '4.99', '10000.01', '1e2', '-25', 'NaN', '5.001', {}, null, 25]) assert.throws(() => billingUsdToCents(amount));
  assert.equal(billingRetryKey('pay_123'), 'pay_123');
  assert.throws(() => billingRetryKey('../key'));
  assert.deepEqual(autoTopUpInput({ enabled: false, amount_usd: 'bad' }), { auto_top_up_enabled: false });
  assert.deepEqual(autoTopUpInput({ enabled: true, amount_usd: '25', threshold_usd: '12.50' }), { auto_top_up_enabled: true, auto_top_up_amount_micros: 25000000, auto_top_up_threshold_micros: 12500000 });
  for (const value of [{ enabled: 'true' }, { enabled: true, amount_usd: '5', threshold_usd: '5' }, { enabled: true, amount_usd: '10', threshold_usd: '2' }]) assert.throws(() => autoTopUpInput(value));
});

async function database() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create table public.workspaces(id uuid primary key);
    create table public.agents(agent37_id text primary key, workspace_id uuid references workspaces(id));
    create table public.host_admins(user_id uuid primary key references auth.users(id));
    insert into auth.users values ('${USER}');
    insert into workspaces values ('${W1}'), ('${W2}');
    insert into agents values ('existing', '${W1}');
  `);
  const migration = fs.readFileSync(new URL('../supabase/migrations/0006_workspace_billing.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration); // setup can rerun all migrations
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/0009_host_workspace_credit.sql', import.meta.url), 'utf8'));
  return db;
}

test('real PostgreSQL wallet transactions start at zero and isolate credits and replayed debits', async () => {
  const db = await database();
  try {
    const balance = async (workspace = W1) => Number((await db.query('select balance_micros from workspace_billing where workspace_id = $1', [workspace])).rows[0].balance_micros);
    assert.equal(await balance(), 0);
    await db.query('select billing_credit($1, $2, $3, $4)', [W1, 25000000, 'payment', 'stripe:pi_one']);
    await Promise.all(Array.from({ length: 4 }, () => db.query('select billing_credit($1, $2, $3, $4)', [W1, 25000000, 'payment', 'stripe:pi_one'])));
    assert.equal(await balance(), 25000000);
    assert.equal(await balance(W2), 0);
    await assert.rejects(db.query('select billing_credit($1, $2, $3, $4)', [W2, 25000000, 'payment', 'stripe:pi_one']));
    await assert.rejects(db.query('select billing_credit($1, $2, $3, $4)', [W1, 1, 'usage', 'bad']));
    await db.query('select billing_credit($1,$2,$3,$4)', [W1,5000000,'payment','stripe:pi_two']);
    assert.equal(await balance(), 30000000);
    await db.query('insert into agents values ($1,$2),($3,$4)', ['newagent', W1, 'foreign', W2]);
    const settle = (totals) => db.query('select billing_settle_usage($1,$2,$3::jsonb)', [W1, day, JSON.stringify(totals)]);
    await settle({ existing: 9999999, newagent: 1000000, foreign: 500000000, unknown: 800000000 });
    assert.equal(await balance(), 29000000); // existing baseline is free; foreign IDs ignored
    await Promise.all(Array.from({ length: 4 }, () => settle({ existing: 10000999, newagent: 1000000 })));
    assert.equal(await balance(), 28999000);
    await settle({ existing: 9000000, newagent: 100 }); // stale snapshot never rewinds
    assert.equal(await balance(), 28999000);
    await db.query('delete from agents where agent37_id=$1', ['newagent']);
    await settle({ existing: 10000999, newagent: 2000000 });
    assert.equal(await balance(), 27999000); // final deleted-agent debit stays attributed
    assert.equal(await balance(W2), 0);
    const { rows: grants } = await db.query("select has_table_privilege('authenticated','workspace_billing','SELECT') as table_allowed, has_function_privilege('authenticated','billing_credit(uuid,bigint,text,text)','EXECUTE') as credit_allowed, has_function_privilege('service_role','billing_credit(uuid,bigint,text,text)','EXECUTE') as service_allowed");
    assert.deepEqual(grants[0], { table_allowed: false, credit_allowed: false, service_allowed: true });
    await db.query('select billing_settle_refund($1,$2)', ['stripe:pi_one', 5000000]);
    await db.query('select billing_settle_refund($1,$2)', ['stripe:pi_one', 5000000]);
    await db.query('select billing_settle_refund($1,$2)', ['stripe:pi_one', 2000000]);
    assert.equal(await balance(), 22999000);
    await assert.rejects(db.query('select billing_settle_refund($1,$2)', ['stripe:pi_one', 26000000]));
    await db.exec(`insert into workspaces values ('00000000-0000-4000-8000-000000000004')`);
    assert.equal(Number((await db.query("select balance_micros from workspace_billing where workspace_id='00000000-0000-4000-8000-000000000004'")).rows[0].balance_micros), 0);
  } finally { await db.close(); }
});

test('automatic refill claims persist one attempt across concurrent workers and settings changes', async () => {
  const db = await database();
  try {
    assert.equal((await db.query('select * from billing_claim_auto_topup($1)', [W1])).rows.length, 0);
    await db.query("update workspace_billing set stripe_customer_id='cus_one',payment_method_id='pm_one',auto_top_up_enabled=true where workspace_id=$1", [W1]);
    const results = await Promise.all(Array.from({ length: 3 }, () => db.query('select * from billing_claim_auto_topup($1)', [W1])));
    assert.equal(new Set(results.map((result) => result.rows[0].id)).size, 1);
    await db.query('update workspace_billing set auto_top_up_enabled=false where workspace_id=$1', [W1]);
    assert.equal((await db.query('select * from billing_claim_auto_topup($1)', [W1])).rows[0].id, results[0].rows[0].id);
  } finally { await db.close(); }
});

function load(relativePath, dependencies, env = {}) {
  const exports = {};
  const source = fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, process: { env }, Request, Response, URL, console,
    require: (name) => {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return exports;
}

test('billing BFF authenticates every method before any payment or wallet operation', async () => {
  let authorized = false;
  let called = 0;
  const summary = { balance_micros: 0 };
  const route = load('src/app/api/workspaces/[id]/billing/route.ts', {
    '@/lib/auth': { requireUser: async () => ({ db: {}, user: { id: USER } }), requireAdmin: async () => { if (!authorized) throw new Error('Admin role required'); } },
    '@/lib/http': { ApiError: Error, handleError: (error) => Response.json({ error: error.message }, { status: 403 }), json: Response.json, readJson: (request) => request.json() },
    '@/lib/billing-input': { autoTopUpInput },
    '@/lib/billing': { billingSummary: async () => { called++; return summary; }, createBillingCheckout: async () => { called++; return {}; } },
  });
  const ctx = { params: Promise.resolve({ id: W1 }) };
  for (const method of ['GET','PATCH','POST']) {
    const request = new Request('http://localhost/billing', { method, ...(method === 'GET' ? {} : { body: JSON.stringify({ action: 'checkout' }) }) });
    assert.equal((await route[method](request, ctx)).status, 403);
  }
  assert.equal(called, 0);
  authorized = true;
  assert.deepEqual(await (await route.GET(new Request('http://localhost/billing'), ctx)).json(), summary);
});

test('workspace admins cannot redeem coupons or grant credit through the billing endpoint', async () => {
  class ApiError extends Error { constructor(status, code, message) { super(message); this.status = status; } }
  let operations = 0;
  const route = load('src/app/api/workspaces/[id]/billing/route.ts', {
    '@/lib/auth': { requireUser: async () => ({ db: { rpc: () => { operations++; } }, user: { id: USER } }), requireAdmin: async () => {} },
    '@/lib/http': { ApiError, handleError: (error) => Response.json({ error: error.message }, { status: error.status || 500 }), json: Response.json, readJson: (request) => request.json() },
    '@/lib/billing-input': { autoTopUpInput },
    '@/lib/billing': { billingSummary: async () => { operations++; }, createBillingCheckout: async () => { operations++; } },
  });
  for (const action of ['coupon','credit']) {
    const response = await route.POST(new Request('http://localhost/billing', { method: 'POST', body: JSON.stringify({ action, amount_usd: '25', code: 'OLD-COUPON' }) }), { params: Promise.resolve({ id: W1 }) });
    assert.equal(response.status, 400);
  }
  assert.equal(operations, 0);
});

function paymentFixture() {
  const wallet = { workspace_id: W1, balance_micros: 0, stripe_customer_id: 'cus_mine', payment_method_id: null, payment_method_details: null, auto_top_up_enabled: false, auto_top_up_amount_micros: 25000000, auto_top_up_threshold_micros: 12500000, auto_top_up_error: null };
  const calls = [];
  const credited = new Set();
  const db = {
    from(table) {
      const filters = []; let patch = null;
      const query = {
        select: () => query, update: (value) => { patch = value; return query; },
        eq: (key,value) => { filters.push((row) => row[key] === value); return query; },
        lte: (key,value) => { filters.push((row) => (row[key] ?? 0) <= value); return query; },
        single: async () => ({ data: filters.every((filter) => filter(wallet)) ? { ...wallet } : null, error: null }),
        then(resolve) {
          if (table === 'workspace_billing' && patch && filters.every((filter) => filter(wallet))) Object.assign(wallet, patch);
          resolve({ data: null, error: null });
        },
      };
      return query;
    },
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'billing_credit' && !credited.has(args.p_source)) { credited.add(args.p_source); wallet.balance_micros += args.p_amount; }
      return { error: null };
    },
  };
  let session = { id: 'cs_test_one', status: 'complete', metadata: { app: 'workspace-billing', workspace_id: W2 }, customer: 'cus_foreign', payment_intent: 'pi_one' };
  const stripe = {
    checkout: { sessions: { create: async (params, options) => { calls.push({ checkout: params, options }); return { url: 'https://checkout.stripe.com/test' }; }, retrieve: async () => session } },
    paymentMethods: { retrieve: async () => ({ customer: 'cus_mine', type: 'card', card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2028, private_card_field: 'never expose' } }) },
  };
  const billing = load('src/lib/billing.ts', {
    'server-only': {}, 'stripe': { default: class { constructor() { return stripe; } } },
    '@/lib/http': { ApiError: class extends Error { constructor(status,code,message) { super(message); this.status=status; this.code=code; } } },
    '@/lib/site-url': { normalizeOrigin: (value) => value || null },
    '@/lib/billing-input': { billingRetryKey, billingUsdToCents },
  }, { STRIPE_SECRET_KEY: 'test-only', STRIPE_WEBHOOK_SECRET: 'test-only', NEXT_PUBLIC_SITE_URL: 'https://app.example' });
  return { billing, db, wallet, calls, stripe, setSession: (value) => { session = value; } };
}

test('Stripe checkout uses the authorized customer, exact USD amount, card-only methods, and a stable retry key', async () => {
  const f = paymentFixture();
  await f.billing.createBillingCheckout(f.db, W1, 'admin@example.test', new Request('https://untrusted.example/api'), { amount_usd: '25.01', idempotency_key: 'retry_one' });
  const call = f.calls[0];
  assert.equal(call.checkout.customer, 'cus_mine');
  assert.equal(call.checkout.line_items[0].price_data.unit_amount, 2501);
  assert.equal(call.checkout.line_items[0].price_data.currency, 'usd');
  assert.equal(call.checkout.metadata.workspace_id, W1);
  assert.equal(call.checkout.payment_intent_data.setup_future_usage, 'off_session');
  assert.equal(call.checkout.allowed_payment_method_types[0], 'card');
  assert.match(call.checkout.success_url, /^https:\/\/app\.example\/dashboard\/billing/);
  assert.match(call.options.idempotencyKey, /retry_one$/);
  await assert.rejects(f.billing.confirmBillingCheckout(f.db, W1, 'cs_test_one'), { status: 404 });
  assert.equal(f.wallet.balance_micros, 0);
  await f.billing.createBillingCheckout(f.db, W1, 'admin@example.test', new Request('https://app.example/api'), { idempotency_key: 'setup_one' }, true);
  assert.equal(f.calls[1].checkout.mode, 'setup');
  assert.equal(f.calls[1].checkout.line_items, undefined);
});

test('only successful USD payments for this customer credit the wallet; card setup never adds free credit', async () => {
  const f = paymentFixture();
  const payment = { id: 'pi_one', customer: 'cus_mine', status: 'succeeded', currency: 'usd', amount_received: 2500, metadata: { app: 'workspace-billing', kind: 'top_up', workspace_id: W1 }, payment_method: 'pm_mine', created: 100 };
  for (const invalid of [{ ...payment, status: 'processing' }, { ...payment, customer: 'cus_foreign' }, { ...payment, currency: 'eur' }, { ...payment, amount_received: 1 }]) await assert.rejects(f.billing.fulfillPayment(f.db, invalid));
  assert.equal(f.calls.length, 0);
  await f.billing.fulfillCardSetup(f.db, { customer: 'cus_mine', status: 'succeeded', payment_method: 'pm_mine', created: 101, metadata: { app: 'workspace-billing', kind: 'card_setup', workspace_id: W1 } });
  assert.equal(f.wallet.balance_micros, 0);
  await assert.rejects(f.billing.requireWorkspaceBalance(f.db, W1), { status: 402 });
  await f.billing.fulfillPayment(f.db, payment);
  await f.billing.fulfillPayment(f.db, payment);
  assert.equal(f.wallet.balance_micros, 25000000);
  await f.billing.requireWorkspaceBalance(f.db, W1);
  assert.equal(f.calls[0].args.p_source, 'stripe:pi_one');
  const summary = await f.billing.billingSummary(f.db, W1);
  assert.deepEqual(Object.keys(summary).sort(), ['automatic_top_up','balance_micros','currency','payment_method','payments_available']);
  assert.equal(JSON.stringify(summary).includes('cus_mine'), false);
  assert.equal(JSON.stringify(summary).includes('private_card_field'), false);
});

test('webhooks verify the raw body signature before invoking the service-role updater', async () => {
  const stripe = new Stripe('sk_test_fixture');
  const secret = 'whsec_fixture';
  let calls = 0;
  const route = load('src/app/api/billing/webhook/route.ts', {
    '@/lib/supabase/admin': { createAdminClient: () => ({}) },
    '@/lib/billing': { stripeClient: () => stripe, fulfillPayment: async () => { calls++; } },
    '@/lib/http': { ApiError: class extends Error { constructor(status,code,message) { super(message); this.status=status; } }, handleError: (error) => Response.json({ error: error.message }, { status: error.status || 500 }), json: Response.json },
  }, { STRIPE_WEBHOOK_SECRET: secret });
  const payload = JSON.stringify({ id: 'evt_test', type: 'payment_intent.succeeded', data: { object: { id: 'pi_one' } } });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
  const request = (body, header) => new Request('http://localhost/webhook', { method: 'POST', body, headers: header ? { 'stripe-signature': header } : {} });
  assert.equal((await route.POST(request(payload))).status, 400);
  assert.equal((await route.POST(request(payload + ' ', signature))).status, 400);
  assert.equal(calls, 0);
  assert.equal((await route.POST(request(payload, signature))).status, 200);
  assert.equal(calls, 1);
});

test('automatic top-up retries uncertain charges with one persisted key and disables on a declined card', async () => {
  const attempt = { id: 'attempt_one', workspace_id: W1, amount_micros: 25000000, customer_id: 'cus_mine', payment_method_id: 'pm_mine', created_at: new Date().toISOString() };
  const keys = []; const updates = [];
  let outcome = 'network';
  const db = {
    rpc: async () => ({ data: [attempt], error: null }),
    from(table) {
      const query = { update: (patch) => { updates.push({ table, patch }); return query; }, eq: () => query, then: (resolve) => resolve({ error: null }) };
      return query;
    },
  };
  const sync = load('src/lib/billing-sync.ts', {
    'server-only': {}, '@/lib/agent37': {}, '@/lib/http': { ApiError: class extends Error {} },
    '@/lib/billing': { paymentsAvailable: () => true, billingDbError: () => {}, stripeClient: () => ({ paymentIntents: { create: async (_params, options) => { keys.push(options.idempotencyKey); throw { type: outcome === 'network' ? 'StripeConnectionError' : 'StripeCardError' }; } } }) },
  });
  await assert.rejects(sync.refillWorkspace(db, W1));
  await assert.rejects(sync.refillWorkspace(db, W1));
  assert.deepEqual(keys, ['auto-topup:attempt_one','auto-topup:attempt_one']);
  assert.equal(updates.length, 0);
  outcome = 'decline';
  await sync.refillWorkspace(db, W1);
  assert.equal(updates[0].patch.auto_top_up_enabled, false);
  assert.equal(updates[1].patch.finished, true);
});

test('the reconciliation endpoint rejects missing or incorrect operator credentials before accessing wallets', async () => {
  let reads = 0;
  const route = load('src/app/api/billing/sync/route.ts', {
    'node:crypto': { createHash, timingSafeEqual },
    '@/lib/supabase/admin': { createAdminClient: () => { reads++; return {}; } },
    '@/lib/agent37': {}, '@/lib/billing': {}, '@/lib/billing-sync': {},
    '@/lib/http': { ApiError: class extends Error { constructor(status,code,message) { super(message); this.status=status; } }, handleError: (error) => Response.json({ error: error.message }, { status: error.status || 500 }), json: Response.json },
  }, { BILLING_CRON_SECRET: 'operator-only' });
  for (const header of ['', 'Bearer wrong', 'operator-only']) {
    assert.equal((await route.POST(new Request('http://localhost/sync', { method: 'POST', headers: { authorization: header } }))).status, 401);
  }
  assert.equal(reads, 0);
});
