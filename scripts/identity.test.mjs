import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAgentProfile } from '../src/lib/agent-profile-input.ts';
import { SOUL_MAX_BYTES, validateSoulWrite } from '../src/lib/soul-input.ts';
import { hermesSoulCommand } from '../src/lib/hermes-soul-command.ts';
import { agentTabPath, parseAgentTab } from '../src/lib/dashboard-tabs.ts';

test('display identity accepts only a bounded name and known icon; ownership fields are not writable', () => {
  assert.deepEqual(validateAgentProfile({ name: ' Robyn ', icon: 'rocket', workspace_id: 'other', created_by: 'attacker' }), { name: 'Robyn', icon: 'rocket' });
  assert.deepEqual(validateAgentProfile({ icon: null }), { icon: null });
  for (const input of [null, [], {}, { name: {} }, { name: ' ' }, { name: 'x'.repeat(61) }, { icon: 'https://evil.example/icon.svg' }, { icon: '<script>' }, { workspace_id: 'other' }]) assert.throws(() => validateAgentProfile(input));
});

test('SOUL preserves Markdown, accepts an empty reset, and bounds UTF-8 bytes with a required revision', () => {
  const revision = 'a'.repeat(64);
  const content = '# Identity\nBe direct.\n\n';
  assert.deepEqual(validateSoulWrite({ content, revision, path: '/etc/passwd' }), { content, revision });
  assert.deepEqual(validateSoulWrite({ content: '', revision }), { content: '', revision });
  for (const input of [{ content, revision: '' }, { content, revision: '..' }, { content: '\0', revision }, { content: '🦊'.repeat(SOUL_MAX_BYTES / 4 + 1), revision }]) assert.throws(() => validateSoulWrite(input));
});

test('SOUL text is encoded as data and cannot become shell commands or terminate the heredoc', () => {
  const content = "quotes ' \" and $(touch /tmp/pwned)\nROBYN_SOUL_PY\n" + String.fromCharCode(96) + 'id' + String.fromCharCode(96);
  const body = { content, revision: 'b'.repeat(64) };
  const command = hermesSoulCommand(body);
  assert.ok(command.startsWith('timeout 30 python3'));
  assert.ok(!command.includes(content));
  const encoded = command.match(/python3 - '([^']+)'/)[1];
  assert.deepEqual(JSON.parse(Buffer.from(encoded, 'base64').toString()), body);
});

test('Identity routes are independent of Inkbox Messaging and reject extra segments', () => {
  assert.equal(parseAgentTab(['identity']), 'identity');
  assert.equal(parseAgentTab(['messaging']), 'messaging');
  assert.equal(agentTabPath('agent123', 'identity'), '/dashboard/agents/agent123/identity');
  assert.equal(parseAgentTab(['identity', 'extra']), null);
});
