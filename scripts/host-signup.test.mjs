import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const FIRST = '00000000-0000-4000-8000-000000000001';
const SECOND = '00000000-0000-4000-8000-000000000002';
const THIRD = '00000000-0000-4000-8000-000000000003';
const migration = fs.readFileSync(new URL('../supabase/migrations/0010_first_signup_host.sql', import.meta.url), 'utf8');

async function fixture() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create role supabase_auth_admin;
    create schema auth;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}',
      created_at timestamptz not null default now(), invited_at timestamptz, is_anonymous boolean default false);
    create function auth.uid() returns uuid language sql as 'select null::uuid';
    grant usage on schema auth to supabase_auth_admin;
    grant insert on auth.users to supabase_auth_admin;`);
  for (const file of ['0001_init.sql', '0006_workspace_billing.sql', '0007_host_console.sql']) {
    await db.exec(fs.readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
  }
  return db;
}
const hosts = async (db) => (await db.query('select user_id from public.host_admins order by user_id')).rows.map(r => r.user_id);
const signup = (db, id, email = 'person@example.test') => db.query('insert into auth.users(id,email) values ($1,$2)', [id, email]);

test('the first email signup becomes Host atomically under the Auth database role; later signups stay tenants', async () => {
  const db = await fixture();
  try {
    await db.exec(migration);
    await db.exec('set role supabase_auth_admin');
    await signup(db, FIRST, 'any-address@example.test');
    await signup(db, SECOND, 'master@example.test');
    await db.exec('reset role');
    assert.deepEqual(await hosts(db), [FIRST]);
    assert.equal((await db.query('select count(*)::int as count from public.workspaces')).rows[0].count, 0);
    assert.equal((await db.query('select user_id from public.host_signup_claim')).rows[0].user_id, FIRST);
    const grants = (await db.query(`select
      has_table_privilege('anon','public.host_signup_claim','SELECT') as anon_read,
      has_table_privilege('authenticated','public.host_signup_claim','INSERT') as user_claim,
      has_table_privilege('service_role','public.host_signup_claim','UPDATE') as service_update,
      has_table_privilege('service_role','public.host_signup_claim','SELECT') as service_read,
      has_function_privilege('authenticated','public.assign_first_signup_host()','EXECUTE') as user_execute`)).rows[0];
    assert.deepEqual(grants, { anon_read: false, user_claim: false, service_update: false, service_read: true, user_execute: false });
  } finally { await db.close(); }
});

test('invited and anonymous users cannot claim Host or spoof the assignment through metadata', async () => {
  const db = await fixture();
  try {
    await db.exec(migration);
    await db.query("insert into auth.users(id,email,invited_at,raw_user_meta_data) values ($1,'invite@example.test',now(),'{\"is_host_admin\":true}')", [FIRST]);
    await db.query("insert into auth.users(id,email,is_anonymous) values ($1,'anonymous@example.test',true)", [SECOND]);
    assert.deepEqual(await hosts(db), []);
    await signup(db, THIRD);
    assert.deepEqual(await hosts(db), [THIRD]);
  } finally { await db.close(); }
});

test('a rolled-back signup does not consume the first Host assignment', async () => {
  const db = await fixture();
  try {
    await db.exec(migration);
    await db.exec('begin');
    await signup(db, FIRST);
    assert.deepEqual(await hosts(db), [FIRST]);
    await db.exec('rollback');
    await signup(db, SECOND);
    assert.deepEqual(await hosts(db), [SECOND]);
  } finally { await db.close(); }
});

test('revocation, deletion, and replaying setup never reopen Host assignment', async () => {
  const db = await fixture();
  try {
    await db.exec(migration);
    await signup(db, FIRST);
    await db.exec('delete from public.host_admins');
    await db.exec(migration);
    await signup(db, SECOND);
    assert.deepEqual(await hosts(db), []);
    await db.query('delete from auth.users where id=$1', [FIRST]);
    await db.exec(migration);
    await signup(db, THIRD);
    assert.deepEqual(await hosts(db), []);
    assert.equal((await db.query('select user_id from public.host_signup_claim')).rows[0].user_id, null);
  } finally { await db.close(); }
});

test('upgrades preserve existing Host grants and do not regrant access after revocation', async () => {
  const db = await fixture();
  try {
    await signup(db, FIRST);
    await signup(db, SECOND);
    await db.query('insert into public.host_admins(user_id) values ($1)', [SECOND]);
    await db.exec(migration);
    assert.deepEqual(await hosts(db), [SECOND]);
    assert.equal((await db.query('select user_id from public.host_signup_claim')).rows[0].user_id, SECOND);
    await db.exec('delete from public.host_admins');
    await db.exec(migration);
    assert.deepEqual(await hosts(db), []);
  } finally { await db.close(); }
});

test('an installation with users but no Host assigns the earliest normal signup deterministically', async () => {
  const db = await fixture();
  try {
    await db.query("insert into auth.users(id,email,created_at,invited_at) values ($1,'invite@example.test','2020-01-01',now())", [FIRST]);
    await db.query("insert into auth.users(id,email,created_at) values ($1,'later@example.test','2022-01-01'),($2,'earlier@example.test','2021-01-01')", [SECOND, THIRD]);
    await db.exec(migration);
    assert.deepEqual(await hosts(db), [THIRD]);
    await db.exec(migration);
    assert.deepEqual(await hosts(db), [THIRD]);
  } finally { await db.close(); }
});

test('parallel signup requests produce one Host grant', async () => {
  const db = await fixture();
  try {
    await db.exec(migration);
    await Promise.all([signup(db, FIRST), signup(db, SECOND)]);
    const assigned = await hosts(db);
    assert.equal(assigned.length, 1);
    assert.ok([FIRST, SECOND].includes(assigned[0]));
    assert.equal((await db.query('select count(*)::int as count from public.host_signup_claim')).rows[0].count, 1);
  } finally { await db.close(); }
});
