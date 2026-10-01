import assert from 'node:assert/strict';
import test from 'node:test';
import { bootstrapConfigured, inkboxInstallCommand, normalizeInkboxPhone, shellQuote } from '../src/lib/inkbox-setup.ts';
import { parseAgentTab, agentTabPath } from '../src/lib/dashboard-tabs.ts';

test('phone permissions accept formatted E.164 and permit closing access', () => {
  assert.equal(normalizeInkboxPhone(' +1 (416) 555-0123 '), '+14165550123');
  assert.equal(normalizeInkboxPhone(''), null);
  for (const value of ['4165550123', '+0123456789', '+1x234567890', '+1; echo bad']) {
    assert.throws(() => normalizeInkboxPhone(value));
  }
});

test('bootstrap must report configured, even if exec exits successfully', () => {
  const result = (stdout, exit_code = 0, truncated = false) => ({ stdout, exit_code, truncated });
  assert.ok(bootstrapConfigured(result('Installing…\n{"status":"configured"}')));
  assert.ok(!bootstrapConfigured(result('{"status":"requires_human","human_actions":["verify"]}')));
  assert.ok(!bootstrapConfigured(result('{"status":"error"}')));
  assert.ok(!bootstrapConfigured(result('{"status":"configured"}', 1)));
  assert.ok(!bootstrapConfigured(result('{"status":"configured"}', 0, true)));
  assert.ok(!bootstrapConfigured(result('no JSON')));
});

test('remote installer is bounded, pins plugin, and passes the scoped credential on stdin', () => {
  const command = inkboxInstallCommand('robyn-012345678901234567890123', 'https://abc123.agent37.app', 'scoped-test-key');
  assert.ok(command.startsWith('timeout 150 sh -c '));
  assert.ok(command.includes('--api-key-stdin'));
  assert.ok(command.includes('--voice-ai'));
  assert.ok(command.includes('--ref 753a623bee16f0f56299a6465ddf4fd902b6c38b'));
  assert.ok(command.includes('post-restart.sh'));
  assert.ok(!command.includes('INKBOX_ADMIN_KEY'));
  assert.throws(() => inkboxInstallCommand('invalid;touch /tmp/pwned', 'https://abc.agent37.app', 'key'));
  assert.throws(() => inkboxInstallCommand('robyn-012345678901234567890123', 'https://attacker.example', 'key'));
  assert.equal(shellQuote("a'b"), "'a'\"'\"'b'");
});

test('Messaging deep links survive refresh while extra path segments remain invalid', () => {
  assert.equal(parseAgentTab(['messaging']), 'messaging');
  assert.equal(agentTabPath('agent123', 'messaging'), '/dashboard/agents/agent123/messaging');
  assert.equal(parseAgentTab(['messaging', 'extra']), null);
});
