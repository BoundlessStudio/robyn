import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as config from '../src/config/agents.ts';
import { agentCosts, monthWindow } from '../src/lib/agent-costs.ts';

const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/lib/resource-input.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, require: (name) => { assert.equal(name, '@/config/agents'); return config; } });
const { resourceBaseline, readResourceChange, validateResourceResize } = exports;
const current = { cpu: 2, memory: 4, disk: 6 };
const plain = (value) => JSON.parse(JSON.stringify(value));

test('always-on baselines price reserved resources and leave Performance disk rates unchanged', () => {
  assert.deepEqual(plain(resourceBaseline(current)), { cpu_micros: 1_600_000, memory_micros: 2_800_000, disk_micros: 540_000, total_micros: 4_940_000 });
  assert.deepEqual(plain(resourceBaseline(current, 'performance')), { cpu_micros: 6_400_000, memory_micros: 11_200_000, disk_micros: 540_000, total_micros: 18_140_000 });
  assert.equal(resourceBaseline({ cpu: 4, memory: 8, disk: 6 }).total_micros, 9_340_000);
  assert.equal(resourceBaseline({ cpu: 16, memory: 32, disk: 80 }).total_micros, 42_400_000);
});

test('resize validation preserves omitted dimensions and blocks shrink, invalid shapes and out-of-range disks', () => {
  assert.deepEqual(plain(validateResourceResize(readResourceChange({ cpu: 4, memory: 8 }), current)), { cpu: 4, memory: 8 });
  assert.deepEqual(plain(validateResourceResize(readResourceChange({ disk: 12, metadata: 'ignored' }), current)), { disk: 12 });
  for (const body of [{ cpu: 1, memory: 3 }, { cpu: 4 }, { disk: 5 }, { disk: 13 }, { cpu: 2, memory: 4, disk: 6 }]) {
    assert.throws(() => validateResourceResize(readResourceChange(body), current));
  }
  for (const shape of config.SHAPE_PRESETS) {
    assert.ok(validateResourceResize({ cpu: shape.cpu, memory: shape.memory, disk: shape.diskMax }, current));
  }
  for (const body of [null, [], {}, { disk: 0 }, { disk: '8' }, { cpu: 2.5 }, { memory: NaN }, { disk: Infinity }]) assert.throws(() => readResourceChange(body));
});

test('cost windows use UTC calendar months, including month boundaries and leap days', () => {
  assert.deepEqual(monthWindow(new Date('2026-10-01T00:30:00Z')), { period: '2026-10', from: '2026-10-01', to: '2026-10-01' });
  assert.deepEqual(monthWindow(new Date('2024-02-29T23:59:59Z')), { period: '2024-02', from: '2024-02-01', to: '2024-02-29' });
});

test('per-agent costs use billed compute, include paid tools, and never expose other instances or workspace totals', () => {
  const usage = { from: '2026-10-01', to: '2026-10-04', total_micros: 900_000_000, instances: [
    { id: 'mine', total_micros: 8_000_000, compute_micros: 2_000_000, llm_micros: 5_000_000, brave_micros: 100_000, composio_micros: 100_000, perflo_micros: 800_000, secret: 'hidden' },
    { id: 'other', total_micros: 892_000_000, compute_micros: 890_000_000 },
  ] };
  const costs = agentCosts('mine', usage, '2026-10');
  assert.equal(costs.spend.total_micros, 8_000_000);
  assert.equal(costs.spend.compute_micros, 2_000_000);
  assert.equal(costs.spend.perflo_micros, 800_000);
  assert.equal('secret' in costs.spend, false);
  assert.equal(JSON.stringify(costs).includes('other'), false);
  assert.equal(agentCosts('no-spend', usage, '2026-10').spend.total_micros, 0);
});
