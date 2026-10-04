import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { budgetUsdToMicros, microsToBudgetUsd, validateMonthlyBudget, validateBudgetTopUp } from '../src/lib/budget-input.ts';

test('USD input converts exactly to micros, including sub-cent amounts and the safe integer limit', () => {
  for (const [usd, micros] of [['0', 0], [' 20.123456 ', 20_123_456], ['.5', 500_000], ['1.', 1_000_000], ['0.000001', 1], ['9007199254.740991', Number.MAX_SAFE_INTEGER], [1.25, 1_250_000]]) {
    assert.equal(budgetUsdToMicros(usd), micros);
    assert.equal(budgetUsdToMicros(microsToBudgetUsd(micros)), micros);
  }
  assert.deepEqual(validateMonthlyBudget({ monthly_cap_usd: '0' }), { monthly_cap_micros: 0 });
});

test('invalid amounts fail instead of rounding, coercing or overflowing', () => {
  for (const value of ['', ' ', '-1', -1, null, undefined, true, [], {}, NaN, Infinity, '1e2', '0x10', '$5', '1,000', '0.0000001', 0.0000001, '9007199254.740992']) {
    assert.throws(() => budgetUsdToMicros(value), `Accepted ${String(value)}`);
  }
  assert.throws(() => budgetUsdToMicros('0', true));
  for (const body of [null, [], {}, 'budget']) assert.throws(() => validateMonthlyBudget(body));
});

test('top-ups require positive headroom and a bounded retry key', () => {
  assert.deepEqual(validateBudgetTopUp({ amount_usd: '1.000001', idempotency_key: 'burst_2026-10' }), { amount_micros: 1_000_001, idempotency_key: 'burst_2026-10' });
  assert.ok(validateBudgetTopUp({ amount_usd: 1, idempotency_key: 'a'.repeat(64) }));
  for (const key of [undefined, '', 12, 'a'.repeat(65), 'burst key', '../burst']) {
    assert.throws(() => validateBudgetTopUp({ amount_usd: '5', idempotency_key: key }));
  }
});

test('the Agent37 client sends budget writes only to the control plane and preserves retry keys', async () => {
  const source = fs.readFileSync(new URL('../src/lib/agent37.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const requests = [];
  const budget = { monthly_cap_micros: 20_000_000, credit_remaining_micros: 1_000_000 };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, Response, AbortSignal,
    process: { env: { AGENT37_API_KEY: 'test-only' } },
    require: (name) => { assert.ok(['server-only', '@/lib/cron-input'].includes(name)); return {}; },
    fetch: async (url, init) => { requests.push({ url, init }); return Response.json(budget); },
  });
  const updated = await exports.agent37.setBudget('mine', { monthly_cap_micros: 20_000_000 });
  assert.deepEqual(JSON.parse(JSON.stringify(updated)), budget);
  await exports.agent37.topUpBudget('mine', { amount_micros: 1_000_000, idempotency_key: 'burst-1' });
  await exports.agent37.topUpBudget('mine', { amount_micros: 1_000_000, idempotency_key: 'burst-1' });
  assert.deepEqual(requests.map(({ url }) => url), [
    'https://api.agent37.com/v1/instances/mine/budget',
    'https://api.agent37.com/v1/instances/mine/budget/top-up',
    'https://api.agent37.com/v1/instances/mine/budget/top-up',
  ]);
  assert.deepEqual(requests.map(({ init }) => init.method), ['PATCH', 'POST', 'POST']);
  for (const { init } of requests) {
    assert.equal(init.headers.Authorization, 'Bearer test-only');
    assert.equal(init.headers['X-Agent37-Key'], undefined);
    assert.equal(init.cache, 'no-store');
  }
  assert.deepEqual(JSON.parse(requests[1].init.body), { amount_micros: 1_000_000, idempotency_key: 'burst-1' });
  assert.equal(requests[1].init.body, requests[2].init.body);
});
