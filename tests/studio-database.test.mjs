import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

test("studio revisions isolate tenants, preserve conflicts, resume uploads, and restore immutable packages", async () => {
  const db = new PGlite();
  const userA = randomUUID(); const userB = randomUUID();
  const profile = { key: "director", kind: "director", role: "Creative Director", version: "1.0.0", instructions: "Coordinate the project." };
  const packageData = { files: [{ path: "master/Création — 東京.native", role: "master", mimeType: "application/octet-stream", bytes: 32, sha256: "a".repeat(64) }], dependencies: [], message: "Saved work" };
  const scalar = async (sql, values = []) => (await db.query(sql, values)).rows[0].result;
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as 'select null::uuid';
      grant usage on schema auth to service_role; grant select on auth.users to service_role;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      create schema storage;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint);
      create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text);
      alter table storage.objects enable row level security;
      grant usage on schema storage to anon, authenticated, service_role;
      grant all on storage.objects to anon, authenticated, service_role;
      create policy another_apps_broad_policy on storage.objects for all to anon, authenticated using(true) with check(true);
    `);
    const migrations = ["0001_init.sql", "0002_pilot_access.sql", "0003_studio_assets.sql", "0004_private_storage.sql", "0005_revision_forks.sql", "0007_storage_object_names.sql"];
    for (const file of migrations) await db.exec(await fs.readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
    await db.query("insert into auth.users(id,email) values($1,'a@example.test'),($2,'b@example.test')", [userA,userB]);
    const tables = ["studio_employees", "studio_projects", "studio_assets", "studio_revisions", "studio_package_files", "studio_revision_dependencies", "studio_activity"];
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      for (const table of tables) await assert.rejects(db.query(`select * from public.${table}`), /permission denied/);
      await assert.rejects(scalar("select initialize_studio($1,$2) as result",[userA,JSON.stringify([profile])]), /permission denied/);
      await assert.rejects(db.query("insert into storage.objects(bucket_id) values('studio-assets')"), /row-level security/);
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    const initialize = (user, profiles) => scalar("select initialize_studio($1,$2) as result", [user, JSON.stringify(profiles)]);
    const wsA = await initialize(userA,[profile]); const wsB = await initialize(userB,[profile]);
    assert.notEqual(wsA,wsB);
    assert.equal(await initialize(userA,[{...profile,version:"2.0.0",instructions:"Do not silently upgrade"},{...profile,key:"app:test",kind:"specialist",appId:"test",role:"Test specialist"}]),wsA);
    assert.equal(await scalar("select count(*)::int as result from studio_employees where workspace_id=$1",[wsA]),2);
    assert.equal(await scalar("select manifest_version as result from studio_employees where workspace_id=$1 and employee_key='director'",[wsA]),"1.0.0");
    await db.query("insert into agents(agent37_id,workspace_id) values('foreign-workstation',$1)",[wsB]);
    await assert.rejects(db.query("update studio_employees set instance_id='foreign-workstation' where workspace_id=$1 and employee_key='director'",[wsA]), /foreign key/);
    const project = await scalar("insert into studio_projects(workspace_id,created_by,name) values($1,$2,'Campaign') returning id as result",[wsA,userA]);
    const asset = await scalar("insert into studio_assets(workspace_id,project_id,created_by,app_id,name) values($1,$2,$3,'test','Native work') returning id as result",[wsA,project,userA]);
    await assert.rejects(db.query("insert into studio_assets(workspace_id,project_id,created_by,app_id,name) values($1,$2,$3,'test','Foreign')",[wsB,project,userB]),/foreign key/);
    const begin = (ws,user,id,base,pkg = packageData) => scalar("select begin_studio_revision($1,$2,$3,$4,$5) as result",[ws,user,id,base,JSON.stringify(pkg)]);
    const verified = id => scalar("select jsonb_agg(jsonb_build_object('id',id,'bytes',bytes)) as result from studio_package_files where revision_id=$1",[id]);
    const commit = (ws,user,id,files) => scalar("select commit_studio_revision($1,$2,$3,$4) as result",[ws,user,id,JSON.stringify(files)]);
    const head = () => scalar("select current_revision_id as result from studio_assets where id=$1",[asset]);
    await assert.rejects(begin(wsA,userB,asset,null),/not found/);
    await assert.rejects(begin(wsB,userB,asset,null),/not found/);
    await assert.rejects(begin(wsA,userA,asset,null,{...packageData,dependencies:[{assetId:randomUUID(),revisionId:randomUUID()}]}),/dependency unavailable/);
    const first = await begin(wsA,userA,asset,null);
    assert.equal(await scalar("select path as result from studio_package_files where revision_id=$1",[first]),packageData.files[0].path);
    assert.match(await scalar("select storage_key as result from studio_package_files where revision_id=$1",[first]),/^[0-9a-f/-]+$/);
    await db.query("update studio_package_files set storage_key=$1 where revision_id=$2",[`${wsA}/legacy/Création — 東京.native`,first]);
    await db.exec("reset role");await db.exec(await fs.readFile(new URL("../supabase/migrations/0007_storage_object_names.sql",import.meta.url),"utf8"));await db.exec("set role service_role");
    assert.match(await scalar("select storage_key as result from studio_package_files where revision_id=$1",[first]),/^[0-9a-f/-]+$/);
    await assert.rejects(commit(wsA,userA,first,[]),/incomplete upload/);
    const wrongSize = (await verified(first)).map(file => ({...file, bytes: 31}));
    await assert.rejects(commit(wsA,userA,first,wrongSize),/incomplete upload/);
    assert.equal(await head(),null);
    assert.equal(await scalar("select state as result from studio_revisions where id=$1",[first]),"uploading");
    assert.equal((await commit(wsA,userA,first,await verified(first))).status,"committed");
    assert.equal((await commit(wsA,userA,first,[])).status,"committed");
    assert.equal(await scalar("select count(*)::int as result from studio_activity where details->>'revisionId'=$1",[first]),1);
    await assert.rejects(commit(wsA,userB,first,[]),/not found/);
    await assert.rejects(db.query("update studio_revisions set message='Rewritten' where id=$1",[first]),/immutable/);
    await assert.rejects(db.query("update studio_package_files set bytes=33 where revision_id=$1",[first]),/immutable/);
    const competingA = await begin(wsA,userA,asset,first);
    const competingB = await begin(wsA,userA,asset,first);
    const results = await Promise.all([commit(wsA,userA,competingA,await verified(competingA)),commit(wsA,userA,competingB,await verified(competingB))]);
    assert.deepEqual(results.map(result=>result.status).sort(),["committed","conflict"]);
    const winner = results.find(result=>result.status === "committed").revisionId;
    const conflict = results.find(result=>result.status === "conflict").revisionId;
    assert.equal(await head(),winner);
    assert.equal((await commit(wsA,userA,conflict,[])).status,"conflict");
    assert.equal(await scalar("select count(*)::int as result from studio_package_files where revision_id=$1",[conflict]),1);
    await assert.rejects(scalar("select fork_studio_revision($1,$2,$3,$4) as result",[wsA,userB,conflict,"Foreign fork"]),/not found/);
    const fork=await scalar("select fork_studio_revision($1,$2,$3,$4) as result",[wsA,userA,conflict,"Another direction"]);
    assert.equal(fork.status,"committed");assert.notEqual(fork.assetId,asset);
    assert.equal(await scalar("select current_revision_id as result from studio_assets where id=$1",[fork.assetId]),fork.revisionId);
    assert.equal(await head(),winner);
    const restore = await scalar("select restore_studio_revision($1,$2,$3,$4,$5) as result",[wsA,userA,asset,first,winner]);
    assert.equal(restore.status,"committed"); assert.notEqual(restore.revisionId,first);
    assert.equal(await head(),restore.revisionId);
    assert.equal(await scalar("select revision_number as result from studio_revisions where id=$1",[restore.revisionId]),3);
    assert.equal(await scalar("select storage_key as result from studio_package_files where revision_id=$1",[restore.revisionId]),await scalar("select storage_key as result from studio_package_files where revision_id=$1",[first]));
    const staleRestore = await scalar("select restore_studio_revision($1,$2,$3,$4,$5) as result",[wsA,userA,asset,first,winner]);
    assert.equal(staleRestore.status,"conflict"); assert.equal(await head(),restore.revisionId);
    const linked = await begin(wsA,userA,asset,restore.revisionId,{...packageData,dependencies:[{assetId:asset,revisionId:first}]});
    assert.equal(await scalar("select dependency_revision_id as result from studio_revision_dependencies where revision_id=$1",[linked]),first);

    // A placed VectorCraft file must stay frozen in DeckCraft when the illustrator
    // saves a new source version, including after restoring the deck later.
    const sourceAsset = await scalar("insert into studio_assets(workspace_id,project_id,created_by,app_id,name) values($1,$2,$3,'vectorcraft','Shared illustration') returning id as result",[wsA,project,userA]);
    const targetAsset = await scalar("insert into studio_assets(workspace_id,project_id,created_by,app_id,name) values($1,$2,$3,'deckcraft','Presentation') returning id as result",[wsA,project,userA]);
    const sourceFirst = await begin(wsA,userA,sourceAsset,null);
    await commit(wsA,userA,sourceFirst,await verified(sourceFirst));
    const placed = {...packageData,dependencies:[{assetId:sourceAsset,revisionId:sourceFirst}]};
    const targetFirst = await begin(wsA,userA,targetAsset,null,placed);
    await commit(wsA,userA,targetFirst,await verified(targetFirst));
    const sourceNext = await begin(wsA,userA,sourceAsset,sourceFirst,{...packageData,files:packageData.files.map(file=>({...file,sha256:"b".repeat(64)}))});
    await commit(wsA,userA,sourceNext,await verified(sourceNext));
    assert.equal(await scalar("select current_revision_id as result from studio_assets where id=$1",[sourceAsset]),sourceNext);
    assert.equal(await scalar("select dependency_revision_id as result from studio_revision_dependencies where revision_id=$1",[targetFirst]),sourceFirst);
    assert.equal(await scalar("select sha256 as result from studio_package_files where revision_id=$1",[sourceFirst]),"a".repeat(64));
    const restoredDeck = await scalar("select restore_studio_revision($1,$2,$3,$4,$5) as result",[wsA,userA,targetAsset,targetFirst,targetFirst]);
    assert.equal(restoredDeck.status,"committed");
    assert.equal(await scalar("select dependency_revision_id as result from studio_revision_dependencies where revision_id=$1",[restoredDeck.revisionId]),sourceFirst);
    // An exact, valid source reference still cannot be shared into another tenant.
    const foreignProject = await scalar("insert into studio_projects(workspace_id,created_by,name) values($1,$2,'Another studio') returning id as result",[wsB,userB]);
    const foreignTarget = await scalar("insert into studio_assets(workspace_id,project_id,created_by,app_id,name) values($1,$2,$3,'deckcraft','Foreign deck') returning id as result",[wsB,foreignProject,userB]);
    await assert.rejects(begin(wsB,userB,foreignTarget,null,placed),/dependency unavailable/);
    // Setup can be rerun without resetting saved work or employee versions.
    await db.exec("reset role");
    for (const file of migrations) await db.exec(await fs.readFile(new URL(`../supabase/migrations/${file}`, import.meta.url),"utf8"));
    assert.equal(await head(),restore.revisionId);
    assert.equal(await scalar("select public as result from storage.buckets where id='studio-assets'"),false);
  } finally { await db.close(); }
});
