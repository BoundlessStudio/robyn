import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configureResendEmail, resendSmtpSettings } from './supabase-email.mjs';

const input = {
  token: 'private-management-token', projectRef: 'abcdefghijklmnopqrst',
  apiKey: 're_test_key', fromEmail: 'noreply@example.com', senderName: 'Example',
};

function fixture({ current = {}, domains, failure, afterSave = {} } = {}) {
  const calls = [];
  let auth = { mailer_autoconfirm: true, uri_allow_list: 'https://example.com/**', rate_limit_email_sent: 2, ...current };
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (failure) return Response.json({ message: `${input.token} ${input.apiKey}` }, { status: failure });
    if (url.startsWith('https://api.resend.com/')) {
      assert.equal(options.headers.Authorization, `Bearer ${input.apiKey}`);
      return Response.json(domains || { data: [{ id: 'domain1', name: 'example.com', status: 'verified' }], has_more: false });
    }
    assert.equal(options.headers.Authorization, `Bearer ${input.token}`);
    if (options.method === 'PATCH') auth = { ...auth, ...JSON.parse(options.body), ...afterSave };
    return Response.json(auth);
  };
  return { calls, fetcher, getAuth: () => auth };
}

test('Resend configuration changes only SMTP and email rate limits, retaining signup policy and redirects', async () => {
  const f = fixture();
  const result = await configureResendEmail({ ...input, fetcher: f.fetcher });
  const patch = JSON.parse(f.calls.find(c => c.options.method === 'PATCH').options.body);
  assert.deepEqual(Object.keys(patch).sort(), ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_admin_email', 'smtp_sender_name', 'rate_limit_email_sent'].sort());
  assert.equal(patch.smtp_pass, input.apiKey);
  assert.equal(patch.smtp_host, 'smtp.resend.com');
  assert.equal(patch.smtp_port, '465');
  assert.equal(patch.smtp_user, 'resend');
  assert.equal(f.getAuth().mailer_autoconfirm, true);
  assert.equal(f.getAuth().uri_allow_list, 'https://example.com/**');
  assert.equal(result.hourlyLimit, 30);
  assert.equal(JSON.stringify(result).includes(input.apiKey), false);
  assert.equal(f.calls.at(-1).options.method, undefined);
});

test('existing higher email rate limits survive switching providers', async () => {
  const f = fixture({ current: { rate_limit_email_sent: 120 } });
  assert.equal((await configureResendEmail({ ...input, fetcher: f.fetcher })).hourlyLimit, 120);
});

test('missing credentials and invalid sender inputs fail before contacting providers', async () => {
  for (const invalid of [{ apiKey: '' }, { fromEmail: 'Sender <noreply@example.com>' }, { fromEmail: 'bad\r\n@example.com' }, { senderName: 'Name\nInjected' }, { token: '' }, { projectRef: '../other' }]) {
    const f = fixture();
    await assert.rejects(configureResendEmail({ ...input, ...invalid, fetcher: f.fetcher }));
    assert.equal(f.calls.length, 0);
  }
  assert.equal(resendSmtpSettings({ ...input, fromEmail: ' NOREPLY@EXAMPLE.COM ' }).smtp_admin_email, 'noreply@example.com');
});

test('unverified, absent, and receiving-only domains cannot change Supabase', async () => {
  for (const data of [[], [{ name: 'example.com', status: 'pending' }], [{ name: 'example.com', status: 'verified', capabilities: { sending: 'disabled' } }]]) {
    const f = fixture({ domains: { data } });
    await assert.rejects(configureResendEmail({ ...input, fetcher: f.fetcher }), /verified and enabled/);
    assert.equal(f.calls.some(c => c.options.method === 'PATCH'), false);
  }
});

test('an active email hook prevents claiming SMTP is the delivery path', async () => {
  const f = fixture({ current: { hook_send_email_enabled: true } });
  await assert.rejects(configureResendEmail({ ...input, fetcher: f.fetcher }), /hook overrides SMTP/);
  assert.equal(f.calls.length, 1);
});

test('provider errors and network errors never expose credentials', async () => {
  const f = fixture({ failure: 403 });
  await assert.rejects(configureResendEmail({ ...input, fetcher: f.fetcher }), error => {
    assert.match(error.message, /HTTP 403/);
    assert.ok(!error.message.includes(input.apiKey));
    assert.ok(!error.message.includes(input.token));
    return true;
  });
  await assert.rejects(configureResendEmail({ ...input, fetcher: async () => { throw new Error(input.apiKey); } }), /Check network access/);
});

test('readback detects settings that failed to persist and a newly enabled email hook', async () => {
  for (const afterSave of [{ smtp_host: 'wrong.example.com' }, { hook_send_email_enabled: true }]) {
    const f = fixture({ afterSave });
    await assert.rejects(configureResendEmail({ ...input, fetcher: f.fetcher }), /after saving|became active/);
  }
});

test('sender verification follows Resend domain pagination', async () => {
  const f = fixture();
  const fetcher = async (url, options) => {
    if (url.startsWith('https://api.resend.com/') && !url.includes('after=')) return Response.json({ data: [{ id: 'previous', name: 'other.com', status: 'verified' }], has_more: true });
    if (url.startsWith('https://api.resend.com/')) assert.match(url, /after=previous/);
    return f.fetcher(url, options);
  };
  await configureResendEmail({ ...input, fetcher });
});
