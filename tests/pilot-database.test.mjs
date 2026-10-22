import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("pilot database enforces private table access and atomic invitation limits", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as 'select null::uuid';
      grant usage on schema auth to service_role;
      grant select on auth.users to service_role;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    `);
    for (const file of ["0001_init.sql", "0002_pilot_access.sql"]) await db.exec(await fs.readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      for (const table of ["workspaces", "memberships", "agents", "invitations", "studio_access_requests", "studio_request_limits"]) {
        await assert.rejects(db.query(`select * from public.${table}`), /permission denied/);
      }
      await assert.rejects(db.query("select public.submit_studio_access_request($1, $2, $3)", ["private@example.com", "", "f".repeat(64)]), /permission denied/);
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    const submit = async (email, key) => (await db.query("select public.submit_studio_access_request($1, $2, $3) as result", [email, "Illustration", key])).rows[0].result;
    assert.equal(await submit("creator@example.com", "a".repeat(64)), "saved");
    assert.equal(await submit("creator@example.com", "b".repeat(64)), "saved");
    assert.equal((await db.query("select count(*)::int as count from public.studio_access_requests")).rows[0].count, 1);
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => submit(`creator-${i}@example.com`, "c".repeat(64))));
    assert.equal(results.filter(value => value === "saved").length, 10);
    assert.equal(results.filter(value => value === "rate_limited").length, 10);
    assert.equal((await db.query("select count(*)::int as count from public.studio_access_requests")).rows[0].count, 11);
    await db.exec("reset role");
    // Re-running setup must not discard existing pilot requests.
    await db.exec(await fs.readFile(new URL("../supabase/migrations/0002_pilot_access.sql", import.meta.url), "utf8"));
    assert.equal((await db.query("select count(*)::int as count from public.studio_access_requests")).rows[0].count, 11);
  } finally { await db.close(); }
});
