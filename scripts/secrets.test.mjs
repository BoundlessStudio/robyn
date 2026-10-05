import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { parseEnv } from 'node:util';
import path from 'node:path';
import { assertEnvFiles, readSecretsFile, runtimeEnvironment, saveSecrets, selectConfig, serializeSecrets, settings } from './secrets.mjs';

test('local file selection defaults to development and requires explicit production selection', () => {
  assert.equal(selectConfig([], {}).runtimeFile, '.env.local');
  assert.deepEqual(selectConfig(['--config', 'prd', '--no-create'], {}), {
    config: 'prd', runtimeFile: '.env.production.local', operationsFile: '.env.ops.production.local', forwarded: ['--no-create'],
  });
  assert.equal(selectConfig([], { ROBYN_ENVIRONMENT: 'stg' }).runtimeFile, '.env.preview.local');
  assert.throws(() => selectConfig(['--config'], {}));
  assert.throws(() => selectConfig(['--config', '../prd'], {}));
});

test('runtime processes discard inherited setup credentials and ignore operational keys in supplied values', () => {
  const parent = Object.fromEntries(settings.operationsKeys.map(name => [name, 'private']));
  const env = runtimeEnvironment({ ...parent, PATH: 'keep', DOPPLER_TOKEN: 'private', ROBYN_SECRET_OPERATIONS_FILE: 'private', STRIPE_SECRET_KEY: 'sk_live_parent', AGENT37_API_KEY: 'parent' }, { STRIPE_SECRET_KEY: 'sk_test_child', RESEND_API_KEY: 're_wrong_file' }, 'dev');
  assert.equal(env.PATH, 'keep');
  assert.equal(env.STRIPE_SECRET_KEY, 'sk_test_child');
  assert.equal(env.AGENT37_API_KEY, '');
  for (const name of [...settings.operationsKeys, 'DOPPLER_TOKEN', 'ROBYN_SECRET_OPERATIONS_FILE']) assert.equal(env[name], undefined);
  assert.throws(() => runtimeEnvironment({}, { STRIPE_SECRET_KEY: 'rk_live_invalid' }, 'stg'));
  assert.equal(runtimeEnvironment({}, { STRIPE_SECRET_KEY: 'sk_live_valid' }, 'prd').STRIPE_SECRET_KEY, 'sk_live_valid');
});

test('local runtime files are accepted, but setup credentials and ambiguous legacy files are refused', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'robyn-secrets-'));
  try {
    writeFileSync(path.join(directory, '.env.local'), 'AGENT37_API_KEY=test');
    writeFileSync(path.join(directory, '.env.ops.local'), 'RESEND_API_KEY=re_test');
    assertEnvFiles(directory);
    writeFileSync(path.join(directory, '.env.local'), 'RESEND_API_KEY=re_private');
    assert.throws(() => assertEnvFiles(directory), /Runtime and operations/);
    writeFileSync(path.join(directory, '.env.local'), '');
    writeFileSync(path.join(directory, '.env'), 'KEY=stale');
    assert.throws(() => assertEnvFiles(directory), /legacy/);
  } finally { rmSync(directory, { recursive: true }); }
});

test('environment serialization preserves literal dollars, hashes, quotes, backslashes, and multiline values', () => {
  const values = { EMPTY: '', VALUE: 'a#b$foo', DOUBLE: "a'b", BOTH: 'a\'"b', WINDOWS: 'C:\\path', MULTILINE: 'a\nb' };
  assert.deepEqual(parseEnv(serializeSecrets(values)), values);
  assert.throws(() => serializeSecrets({ BAD: '\0' }));
});

test('generated credentials persist to the correct local files and preserve existing values', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'robyn-save-secrets-'));
  const runtimeFile = path.join(directory, '.env.local');
  const operationsFile = path.join(directory, '.env.ops.local');
  const names = ['STRIPE_WEBHOOK_SECRET', 'STRIPE_WEBHOOK_ENDPOINT_ID'];
  const inherited = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    writeFileSync(runtimeFile, 'NEXT_PUBLIC_SITE_URL=https://example.com\n');
    saveSecrets({ STRIPE_WEBHOOK_SECRET: 'whsec_test', STRIPE_WEBHOOK_ENDPOINT_ID: 'we_test' }, { runtimeFile, operationsFile });
    assert.equal(readSecretsFile(runtimeFile, settings.runtimeKeys).NEXT_PUBLIC_SITE_URL, 'https://example.com');
    assert.equal(readSecretsFile(runtimeFile, settings.runtimeKeys).STRIPE_WEBHOOK_SECRET, 'whsec_test');
    assert.equal(readSecretsFile(operationsFile, settings.operationsKeys).STRIPE_WEBHOOK_ENDPOINT_ID, 'we_test');
    assert.throws(() => saveSecrets({ UNKNOWN: 'value' }, { runtimeFile, operationsFile }), /Unknown/);
    assert.throws(() => saveSecrets({ RESEND_API_KEY: 're_test' }, { runtimeFile, operationsFile: '' }), /operations environment/);
  } finally {
    for (const name of names) { if (inherited[name] === undefined) delete process.env[name]; else process.env[name] = inherited[name]; }
    rmSync(directory, { recursive: true });
  }
});

test('the committed example contains exactly the supported names and no values', () => {
  const entries = readFileSync(new URL('../.env.example', import.meta.url), 'utf8').split(/\r?\n/).filter(line => /^[A-Z0-9_]+=/.test(line));
  assert.deepEqual(entries.map(line => line.split('=')[0]).sort(), [...settings.runtimeKeys, ...settings.operationsKeys].sort());
  assert.ok(entries.every(line => line.endsWith('=')));
});

test('worktree include covers exactly the ignored runtime and operations files', () => {
  const included = readFileSync(new URL('../.worktreeinclude', import.meta.url), 'utf8').split(/\r?\n/).filter(line => line && !line.startsWith('#'));
  assert.deepEqual(included.sort(), [...Object.values(settings.environmentFiles), ...Object.values(settings.operationsFiles)].sort());
  assert.equal(included.includes('.env.example'), false);
});
