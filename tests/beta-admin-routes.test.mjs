import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { betaDatabase, betaRoutes, adminPost } from './helpers/beta-admin.mjs';
import { hashBetaPassword } from '../src/lib/beta-password.ts';

const password = 'a-private-fixture-password';
const actionPath = id => `/api/admin/beta-requests/${id}`;
const hash = value => createHash('sha256').update(value).digest('hex');

test('only the separate admin account can read or mutate beta requests, with expiring revocable sessions', async () => {
  const fixture = await betaDatabase(), routes = await betaRoutes(fixture.db);
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY; process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-server-only-key';
  try {
    const record = await fixture.seedRequest();
    const list = () => routes.list.GET(new Request('https://beta-admin.test/api/admin/beta-requests'));
    const post = (input, origin) => routes.action.POST(adminPost(actionPath(record.id), input, origin), { params: Promise.resolve({ id: record.id }) });
    for (const creatorCookie of [null, 'creator-workspace-admin']) {
      if (creatorCookie) routes.cookies.set('sb-creator-auth-token', creatorCookie);
      assert.equal((await list()).status, 401);
      assert.equal((await post({ action: 'invite', operationId: randomUUID() })).status, 401);
    }
    const passwordHash = await hashBetaPassword(password);
    await fixture.db.rpc('configure_beta_admin', { p_username: 'operator', p_password_hash: passwordHash });
    const login = (username = 'operator', secret = password, origin) => routes.session.POST(adminPost('/api/admin/session', { username, password: secret }, origin));
    assert.equal((await login('operator', password, 'https://other.test')).status, 403);
    assert.equal((await login('creator', password)).status, 401);
    assert.equal((await login('operator', 'wrong')).status, 401);
    assert.equal((await login()).status, 200);
    const cookie = routes.writes.at(-1);
    assert.equal(cookie.options.httpOnly, true); assert.equal(cookie.options.sameSite, 'strict'); assert.equal(cookie.options.maxAge, 8 * 3600);
    const saved = (await fixture.sql.query('select * from studio_beta_admin_sessions')).rows[0];
    assert.equal(saved.token_hash, hash(cookie.value)); assert.notEqual(saved.token_hash, cookie.value);
    assert.equal((await list()).status, 200);
    assert.match((await list()).headers.get('cache-control'), /no-store/);
    assert.equal((await post({ action: 'decline' }, 'https://other.test')).status, 403);
    const crossSiteLogout = new Request('https://beta-admin.test/api/admin/session', { method: 'DELETE', headers: { origin: 'https://other.test', 'content-type': 'application/json' }, body: '{}' });
    assert.equal((await routes.session.DELETE(crossSiteLogout)).status, 403);
    assert.equal((await list()).status, 200);
    await fixture.sql.exec("update studio_beta_admin_sessions set expires_at = now() - interval '1 minute'");
    assert.equal((await list()).status, 401);
    assert.equal((await login()).status, 200);
    const logout = new Request('https://beta-admin.test/api/admin/session', { method: 'DELETE', headers: { origin: 'https://beta-admin.test', 'content-type': 'application/json' }, body: '{}' });
    assert.equal((await routes.session.DELETE(logout)).status, 200);
    routes.cookies.set(cookie.name, cookie.value); assert.equal((await list()).status, 401);
    assert.equal((await login()).status, 200);
    await fixture.db.rpc('configure_beta_admin', { p_username: 'replacement', p_password_hash: await hashBetaPassword('replacement-password') });
    assert.equal((await list()).status, 401);
    const stale = await fixture.db.rpc('start_beta_admin_session', { p_password_hash: passwordHash, p_token_hash: 'f'.repeat(64) });
    assert.equal(stale.data, false);
    const credentials = await login('replacement', 'replacement-password');
    assert.equal(credentials.status, 200);
    const json = JSON.stringify(await (await list()).json()); assert.equal(json.includes('password'), false); assert.equal(json.includes(cookie.value), false);
    for (let i = 0; i < 10; i++) await login('incorrect', 'incorrect');
    const limited = await login(); assert.equal(limited.status, 429); assert.match(limited.headers.get('cache-control'), /no-store/);
  } finally {
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
    routes.cleanup(); await fixture.sql.close();
  }
});

test('invitation identities prevent duplicate emails, retain uncertainty, and joined users are tracked through Auth', async () => {
  const fixture = await betaDatabase(), routes = await betaRoutes(fixture.db);
  const token = 'a'.repeat(43); routes.cookies.set('robyn_beta_admin', token);
  try {
    await fixture.db.rpc('configure_beta_admin', { p_username: 'operator', p_password_hash: await hashBetaPassword(password) });
    await fixture.sql.query("insert into studio_beta_admin_sessions(token_hash,expires_at) values($1,now()+interval '1 hour')", [hash(token)]);
    const record = await fixture.seedRequest('creator@example.test'), provider = [];
    fixture.db.auth.admin.inviteUserByEmail = async (email, options) => {
      provider.push({ email, options });
      await fixture.sql.query('insert into auth.users(id,email,invited_at,confirmation_sent_at) values($1,$2,clock_timestamp(),clock_timestamp()) on conflict (id) do nothing', [randomUUID(), email]);
      return { data: {}, error: null };
    };
    const post = (id, action, operationId = randomUUID(), origin) => routes.action.POST(adminPost(actionPath(id), { action, operationId }, origin), { params: Promise.resolve({ id }) });
    const operation = randomUUID();
    const responses = await Promise.all([post(record.id, 'invite', operation), post(record.id, 'invite', operation)]);
    assert.equal(responses.filter(response => response.status === 200).length, 1);
    assert.equal(provider.length, 1); assert.equal(provider[0].email, record.email); assert.match(provider[0].options.redirectTo, /\/dashboard$/);
    assert.equal((await post(record.id, 'invite', operation)).status, 200); assert.equal(provider.length, 1);
    let row = (await fixture.sql.query('select * from studio_access_requests where id=$1', [record.id])).rows[0];
    assert.equal(row.status, 'invited'); assert.equal(row.invite_count, 1); assert.equal(row.joined_at, null);
    assert.equal((await post(record.id, 'resend')).status, 409); assert.equal(provider.length, 1);
    await fixture.sql.query("update studio_access_requests set last_invited_at=now()-interval '2 minutes' where id=$1", [record.id]);
    assert.equal((await post(record.id, 'resend')).status, 200); assert.equal(provider.length, 2);
    await fixture.sql.query('update auth.users set email_confirmed_at=now(),last_sign_in_at=now() where email=$1', [record.email]);
    row = (await fixture.sql.query('select * from studio_access_requests where id=$1', [record.id])).rows[0];
    assert.equal(row.status, 'joined'); assert.ok(row.joined_at); assert.equal(row.invite_count, 2);
    assert.equal((await post(record.id, 'resend')).status, 409); assert.equal(provider.length, 2);
    const joinedAt = row.joined_at;
    await fixture.sql.query("update auth.users set last_sign_in_at=now()+interval '1 hour' where email=$1", [record.email]);
    assert.deepEqual((await fixture.sql.query('select joined_at from studio_access_requests where id=$1', [record.id])).rows[0].joined_at, joinedAt);
    const uncertain = await fixture.seedRequest('uncertain@example.test');
    fixture.db.auth.admin.inviteUserByEmail = async email => { provider.push({ email }); throw Error('Lost provider reply'); };
    assert.equal((await post(uncertain.id, 'invite')).status, 503);
    assert.equal((await post(uncertain.id, 'invite')).status, 409);
    assert.equal((await post(uncertain.id, 'decline')).status, 409);
    assert.equal((await post(uncertain.id, 'check')).status, 200); assert.equal(provider.length, 3);
    await fixture.sql.query('insert into auth.users(id,email,invited_at) values($1,$2,clock_timestamp())', [randomUUID(), uncertain.email]);
    const checked = await post(uncertain.id, 'check'); assert.equal(checked.status, 200); assert.equal((await checked.json()).request.status, 'invited');
    assert.equal(provider.length, 3);
    const failed = await fixture.seedRequest('failed@example.test');
    fixture.db.auth.admin.inviteUserByEmail = async email => { provider.push({ email }); return { error: { status: 429, code: 'over_email_send_rate_limit' } }; };
    assert.equal((await post(failed.id, 'invite')).status, 429);
    assert.equal((await post(failed.id, 'decline')).status, 200);
    assert.equal((await post(failed.id, 'reopen')).status, 200);
    const existing = await fixture.seedRequest('confirmed@example.test');
    fixture.db.auth.admin.inviteUserByEmail = async () => ({ error: { status: 422, code: 'email_exists' } });
    fixture.db.auth.signInWithOtp = async input => { provider.push(input); return { error: null }; };
    assert.equal((await post(existing.id, 'invite')).status, 200); assert.equal(provider.at(-1).options.shouldCreateUser, false);
    const list = await routes.list.GET(new Request('https://beta-admin.test/api/admin/beta-requests?status=joined&q=creator'));
    const result = await list.json(); assert.equal(result.total, 1); assert.equal(result.requests[0].id, record.id); assert.equal(result.counts.joined, 1);
    assert.equal((await routes.list.GET(new Request('https://beta-admin.test/api/admin/beta-requests?page=-1'))).status, 400);
    assert.equal((await routes.list.GET(new Request('https://beta-admin.test/api/admin/beta-requests?q=%25'))).status, 200);
    for (let i = 0; i < 51; i++) await fixture.seedRequest(`page-${String(i).padStart(2, '0')}@example.test`);
    const second = await (await routes.list.GET(new Request('https://beta-admin.test/api/admin/beta-requests?q=page-&page=1'))).json();
    assert.equal(second.total, 51); assert.equal(second.requests.length, 1);
  } finally { routes.cleanup(); await fixture.sql.close(); }
});
