import { PGlite } from "@electric-sql/pglite";

export async function studioDatabase() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,last_sign_in_at timestamptz,invited_at timestamptz,confirmation_sent_at timestamptz,recovery_sent_at timestamptz);
    create function auth.uid() returns uuid language sql stable as 'select null::uuid';
    grant usage on schema auth to service_role; grant select on auth.users to service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated,service_role;
    grant all on storage.objects to anon,authenticated,service_role;`);
  return db;
}
