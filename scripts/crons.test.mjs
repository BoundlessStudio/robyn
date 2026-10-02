import assert from 'node:assert/strict';
import test from 'node:test';
import { cronChanges, validCronId, validateCronInput } from '../src/lib/cron-input.ts';
import { agentTabPath, parseAgentTab } from '../src/lib/dashboard-tabs.ts';

const input = { prompt: 'Review the agenda.', schedule: '0 9 * * 1-5', timezone: 'America/Toronto', enabled: true };

test('cron input rejects malformed fields and preserves paused jobs', () => {
  assert.deepEqual(validateCronInput({ ...input, enabled: false, name: ' Briefing ', agent: 'unknown' }), { ...input, enabled: false, name: 'Briefing' });
  for (const body of [null, [], 'cron', {}, { ...input, prompt: ' ' }, { ...input, prompt: 'x'.repeat(8001) }, { ...input, name: 'x'.repeat(81) }, { ...input, enabled: 'false' }]) {
    assert.throws(() => validateCronInput(body));
  }
});

test('cron validation requires five fields and leaves grammar to Agent37', () => {
  for (const schedule of ['', '0 9 * *', '0 0 9 * * *']) assert.throws(() => validateCronInput({ ...input, schedule }));
  assert.equal(validateCronInput({ ...input, schedule: '  */15  9-17 * JAN,MAR MON-FRI  ' }).schedule, '*/15 9-17 * JAN,MAR MON-FRI');
});

test('timezone must be an IANA name, and a PATCH can change just one field', () => {
  for (const timezone of ['', 'Mars/Olympus', '+04:00', 5]) assert.throws(() => validateCronInput({ ...input, timezone }));
  assert.equal(validateCronInput({ ...input, timezone: 'UTC' }).timezone, 'UTC');
  assert.deepEqual(validateCronInput({ enabled: false }, true), { enabled: false });
  assert.deepEqual(validateCronInput({ prompt: ' New instructions ' }, true), { prompt: 'New instructions' });
  assert.throws(() => validateCronInput({}, true));
  assert.throws(() => validateCronInput({ ignored: true }, true));
});

test('instruction and name edits do not send fields that move the next firing', () => {
  const original = { ...input, id: '9903c325ee3c', name: null, agent: 'hermes', next_run: 1790154000, last_run: null, created: 1790067720 };
  assert.deepEqual(cronChanges(original, { ...input, name: '', prompt: 'Updated instructions' }), { prompt: 'Updated instructions' });
  assert.deepEqual(cronChanges(original, { ...input, name: 'Morning' }), { name: 'Morning' });
  assert.deepEqual(cronChanges(original, { ...input, name: '' }), {});
  assert.deepEqual(cronChanges(original, { ...input, enabled: false }), { enabled: false });
  assert.deepEqual(cronChanges(original, { ...input, timezone: 'UTC' }), { timezone: 'UTC' });
});

test('cron ids cannot escape the instance cron path', () => {
  assert.ok(validCronId('9903c325ee3c'));
  for (const value of ['..', '../..', '%2e%2e', '9903c325ee3c/../..', 'abc', '9903c325ee3z']) assert.ok(!validCronId(value));
});

test('Schedule deep links survive refresh and reject additional segments', () => {
  assert.equal(parseAgentTab(['schedule']), 'schedule');
  assert.equal(agentTabPath('agent123', 'schedule'), '/dashboard/agents/agent123/schedule');
  assert.equal(parseAgentTab(['schedule', 'extra']), null);
});
