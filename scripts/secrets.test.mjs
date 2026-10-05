import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assertNoEnvFiles, runtimeEnvironment, selectConfig, settings } from './secrets.mjs';

test('config selection is independent of the checkout path and requires an explicit production selection', () => {
  assert.equal(selectConfig([], {}).config, 'dev');
  assert.deepEqual(selectConfig(['--config', 'prd', '--no-create'], {}), {
    project: 'robyn', config: 'prd', operations: 'ops_prd', forwarded: ['--no-create'],
  });
  assert.equal(selectConfig(['--config', 'dev_personal'], {}).operations, 'ops_dev');
  assert.throws(() => selectConfig(['--config'], {}));
  assert.throws(() => selectConfig(['--config', 'ops_prd'], {}));
});

test('runtime processes cannot inherit management credentials or production values from a parent shell', () => {
  const env = runtimeEnvironment({ PATH: 'keep', SUPABASE_ACCESS_TOKEN: 'private', STRIPE_WEBHOOK_ENDPOINT_ID: 'private', DOPPLER_TOKEN: 'private', ROBYN_SECRET_OPERATIONS: 'ops_prd', STRIPE_SECRET_KEY: 'sk_live_parent', AGENT37_API_KEY: 'parent' }, { STRIPE_SECRET_KEY: 'sk_test_child' }, 'dev');
  assert.equal(env.PATH, 'keep');
  assert.equal(env.STRIPE_SECRET_KEY, 'sk_test_child');
  assert.equal(env.AGENT37_API_KEY, '');
  for (const name of [...settings.operationsKeys, 'DOPPLER_TOKEN', 'ROBYN_SECRET_OPERATIONS']) assert.equal(env[name], undefined);
  assert.throws(() => runtimeEnvironment({}, { STRIPE_SECRET_KEY: 'rk_live_invalid' }, 'stg'));
});

test('stale Next environment files are rejected in any checkout', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'robyn-secrets-'));
  try {
    assertNoEnvFiles(directory);
    writeFileSync(path.join(directory, '.env.example'), 'KEY=');
    assertNoEnvFiles(directory);
    writeFileSync(path.join(directory, '.env.local'), 'KEY=stale');
    assert.throws(() => assertNoEnvFiles(directory));
  } finally { rmSync(directory, { recursive: true }); }
});

test('the committed example contains exactly the supported names and no values', () => {
  const entries = readFileSync(new URL('../.env.example', import.meta.url), 'utf8').split(/\r?\n/).filter(line => /^[A-Z0-9_]+=/.test(line));
  assert.deepEqual(entries.map(line => line.split('=')[0]).sort(), [...settings.runtimeKeys, ...settings.operationsKeys].sort());
  assert.ok(entries.every(line => line.endsWith('=')));
});
