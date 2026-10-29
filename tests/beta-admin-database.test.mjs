import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { betaDatabase } from './helpers/beta-admin.mjs';

test('beta tables and operations are private and existing confirmed sign-ins are reconciled without granting access', async () => {
  const joined = randomUUID(), waiting = randomUUID(), request = randomUUID();
  const { sql, db, seedRequest } = await betaDatabase({ beforeBetaMigration: async sql => {
    await sql.query("insert into auth.users(id,email,email_confirmed_at,last_sign_in_at) values($1,'joined@example.test',now()-interval '2 days',now()-interval '1 day')", [joined]);
    await sql.query("insert into auth.users(id,email,invited_at) values($1,'waiting@example.test',now())", [waiting]);
    await sql.query("insert into studio_access_requests(id,email,craft,consent_version) values($1,'joined@example.test','Painting','invitation-v1')", [request]);
  } });
  try {
    const row = (await sql.query('select * from studio_access_requests where id=$1', [request])).rows[0];
    assert.equal(row.status, 'joined'); assert.equal(row.joined_user_id, joined); assert.ok(row.joined_at);
    assert.equal(row.craft, 'Painting'); assert.equal(row.consent_version, 'invitation-v1');
    const waitingRequest = await seedRequest('waiting@example.test'); assert.equal(waitingRequest.status, 'requested');
    await sql.query("update auth.users set email_confirmed_at=now() where id=$1", [waiting]);
    assert.equal((await sql.query('select status from studio_access_requests where id=$1', [waitingRequest.id])).rows[0].status, 'requested');
    await sql.query("update auth.users set last_sign_in_at=now() where id=$1", [waiting]);
    assert.equal((await sql.query('select status from studio_access_requests where id=$1', [waitingRequest.id])).rows[0].status, 'joined');
    const known = randomUUID();
    await sql.query("insert into auth.users(id,email,email_confirmed_at,last_sign_in_at) values($1,'existing@example.test',now(),now())", [known]);
    assert.equal((await seedRequest('existing@example.test')).status, 'joined');
    for (const role of ['anon', 'authenticated']) {
      await sql.exec(`set role ${role}`);
      for (const table of ['studio_beta_admin', 'studio_beta_admin_sessions', 'studio_beta_admin_limits', 'studio_access_requests']) {
        await assert.rejects(sql.query(`select * from ${table}`), /permission denied/);
        await assert.rejects(sql.query(`delete from ${table}`), /permission denied/);
      }
      for (const fn of ["configure_beta_admin('operator','invalid')", "claim_beta_admin_login('invalid')", "start_beta_admin_session('invalid','invalid')", 'beta_request_counts()', 'track_beta_join()', 'track_existing_beta_join()', `claim_beta_invitation('${request}','${randomUUID()}','invite')`, `finish_beta_invitation('${request}','${randomUUID()}','sent')`, `reconcile_beta_invitation('${request}')`, `set_beta_request_status('${request}','declined')`]) await assert.rejects(sql.query(`select ${fn}`), /permission denied/);
      await sql.exec('reset role');
    }
    const fakeHash = `scrypt$${'a'.repeat(32)}$${'b'.repeat(128)}`;
    await sql.exec('set role service_role');
    assert.equal((await db.rpc('configure_beta_admin', { p_username: 'operator', p_password_hash: fakeHash })).error, null);
    await assert.rejects(sql.query('insert into studio_beta_admin(singleton,username,password_hash) values(false,$1,$2)', ['another', fakeHash]), /check constraint/);
    const limits = await Promise.all(Array.from({ length: 16 }, () => db.rpc('claim_beta_admin_login', { p_rate_key: 'a'.repeat(64) })));
    assert.equal(limits.filter(result => result.data === true).length, 10);
    assert.equal((await db.rpc('beta_request_counts')).data.joined, 3);
  } finally { await sql.close(); }
});
