import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { studioDatabase } from './database.mjs';
import { loadModule } from './module.mjs';

export async function betaDatabase({ beforeBetaMigration } = {}) {
  const sql = await studioDatabase();
  for (const file of ['0001_init.sql', '0002_pilot_access.sql']) await sql.exec(await readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'));
  if (beforeBetaMigration) await beforeBetaMigration(sql);
  await sql.exec(await readFile(new URL('../../supabase/migrations/0025_beta_administration.sql', import.meta.url), 'utf8'));
  await sql.exec(await readFile(new URL('../../supabase/migrations/0026_beta_admin_session_reset.sql', import.meta.url), 'utf8'));
  const calls = [];
  const db = {
    async rpc(name, fields = {}) {
      calls.push({ name, fields });
      try {
        const entries = Object.entries(fields);
        const result = await sql.query(`select public.${name}(${entries.map(([key], i) => `${key} => $${i + 1}`).join(',')}) as result`, entries.map(([, value]) => value));
        return { data: result.rows[0].result, error: null };
      } catch { return { data: null, error: { code: 'database_error' } }; }
    },
    from(table) {
      const where = [], values = [], ordering = []; let columns = '*', counted = false, start = 0, end = null, remove = false;
      const query = {
        select(value = '*', options) { columns = value; counted = Boolean(options?.count); return query; },
        eq(key, value) { values.push(value); where.push(`${key} = $${values.length}`); return query; },
        gt(key, value) { values.push(value); where.push(`${key} > $${values.length}`); return query; },
        ilike(key, value) { values.push(value); where.push(`${key} ilike $${values.length}`); return query; },
        order(key, { ascending }) { ordering.push(`${key} ${ascending ? 'asc' : 'desc'}`); return query; },
        range(first, last) { start = first; end = last; return query; },
        delete() { remove = true; return query; },
        async maybeSingle() { const result = await query; return { ...result, data: result.data?.[0] ?? null }; },
        async then(resolve, reject) {
          try {
            const filter = where.length ? ` where ${where.join(' and ')}` : '';
            const count = counted ? Number((await sql.query(`select count(*)::int as total from ${table}${filter}`, values)).rows[0].total) : null;
            const result = await sql.query(`${remove ? 'delete from' : `select ${columns} from`} ${table}${filter}${ordering.length ? ` order by ${ordering.join(',')}` : ''}${end === null ? '' : ` limit ${end - start + 1} offset ${start}`}`, values);
            resolve({ data: result.rows, error: null, count });
          } catch (error) { if (reject) reject(error); else throw error; }
        },
      };
      return query;
    },
    auth: { admin: {}, async signInWithOtp() { throw Error('Unexpected OTP send'); } },
  };
  const seedRequest = async (email = `${randomUUID()}@example.test`, craft = 'Illustration') => (await sql.query('insert into studio_access_requests(email,craft) values($1,$2) returning *', [email, craft])).rows[0];
  return { sql, db, calls, seedRequest };
}

export async function betaRoutes(db) {
  const cookies = new Map(), writes = [];
  const state = { db, cookies, writes };
  globalThis.__betaAdminFixture = state;
  const mocks = {
    'server-only': '',
    '@/lib/supabase/admin': 'export const createAdminClient=()=>globalThis.__betaAdminFixture.db;',
    'next/headers': 'export const cookies=async()=>({get:name=>{const value=globalThis.__betaAdminFixture.cookies.get(name);return value?{value}:undefined},set:(name,value,options)=>{globalThis.__betaAdminFixture.writes.push({name,value,options});globalThis.__betaAdminFixture.cookies.set(name,value)}});',
  };
  return {
    ...state,
    session: await loadModule('../../src/app/api/admin/session/route.ts', mocks),
    list: await loadModule('../../src/app/api/admin/beta-requests/route.ts', mocks),
    action: await loadModule('../../src/app/api/admin/beta-requests/[id]/route.ts', mocks),
    admin: await loadModule('../../src/lib/beta-admin.ts', mocks),
    cleanup() { delete globalThis.__betaAdminFixture; },
  };
}

export function adminPost(path, input, origin = 'https://beta-admin.test') {
  return new Request(`https://beta-admin.test${path}`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(input) });
}
