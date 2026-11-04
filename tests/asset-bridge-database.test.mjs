import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

test('file collections are private, atomically created, resumable and immutable',async()=>{
  const db=new PGlite();
  const scalar=async(sql,values=[])=>(await db.query(sql,values)).rows[0]?.result;
  try{
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,last_sign_in_at timestamptz,invited_at timestamptz,confirmation_sent_at timestamptz,recovery_sent_at timestamptz);
      create function auth.uid() returns uuid language sql stable as 'select null::uuid';
      grant usage on schema auth to service_role; grant select on auth.users to service_role;
      alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
      alter table storage.objects enable row level security; grant usage on schema storage to anon,authenticated,service_role;
      grant all on storage.objects to anon,authenticated,service_role;`);
    const migrations=new URL('../supabase/migrations/',import.meta.url);
    for(const name of (await readdir(migrations)).filter(name=>name.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,migrations),'utf8'));
    const user=randomUUID(),foreignUser=randomUUID();await db.query('insert into auth.users(id) values($1),($2)',[user,foreignUser]);
    await db.exec('set role service_role');
    const profiles=JSON.stringify([{key:'robyn',kind:'director',appId:null,role:'Robyn',version:'1',instructions:'Use exact saved inputs.'}]);
    const workspace=await scalar('select initialize_studio($1,$2) as result',[user,profiles]),foreignWorkspace=await scalar('select initialize_studio($1,$2) as result',[foreignUser,profiles]);
    const project=await scalar("insert into studio_projects(workspace_id,created_by,name) values($1,$2,'Files') returning id as result",[workspace,user]);
    const foreignProject=await scalar("insert into studio_projects(workspace_id,created_by,name) values($1,$2,'Foreign') returning id as result",[foreignWorkspace,foreignUser]);
    const creation=randomUUID(),pkg={files:[{path:'Folder/compute.m',role:'master',mimeType:'application/octet-stream',bytes:32,sha256:'a'.repeat(64)},{path:'Folder/empty.txt',role:'dependency',mimeType:'application/octet-stream',bytes:0,sha256:'b'.repeat(64)}],dependencies:[],message:'Uploaded with Asset Bridge'};
    const begin=(asset=creation,p=project,owner=user,body=pkg,name='Folder')=>scalar('select begin_asset_bridge_import($1,$2,$3,$4,$5,$6) as result',[workspace,owner,p,asset,name,JSON.stringify(body)]);
    const revision=await begin();assert.equal(await begin(),revision);
    assert.deepEqual((await db.query('select app_id,asset_kind,current_revision_id from studio_assets where id=$1',[creation])).rows[0],{app_id:null,asset_kind:'file',current_revision_id:null});
    assert.equal(await scalar('select count(*)::int as result from studio_revisions where asset_id=$1',[creation]),1);
    await assert.rejects(begin(creation,project,user,{...pkg,files:pkg.files.map(file=>({...file,sha256:'c'.repeat(64)}))}),/identity reused/);
    await assert.rejects(begin(creation,project,user,{...pkg,message:'Different intent'}),/identity reused/);
    await assert.rejects(begin(creation,project,user,pkg,'Another name'),/identity reused/);
    await assert.rejects(begin(randomUUID(),foreignProject),/not found/);
    await assert.rejects(begin(randomUUID(),project,foreignUser),/not found/);
    const files=(await db.query('select id,bytes from studio_package_files where revision_id=$1 order by path',[revision])).rows;
    await assert.rejects(scalar('select commit_studio_revision($1,$2,$3,$4) as result',[workspace,user,revision,JSON.stringify(files.slice(0,1))]),/incomplete upload/);
    assert.equal((await scalar('select commit_studio_revision($1,$2,$3,$4) as result',[workspace,user,revision,JSON.stringify(files)])).status,'committed');
    assert.equal(await begin(),revision,'a lost commit response reuses its saved collection');
    await db.query("update studio_assets set name='Renamed collection' where id=$1",[creation]);
    assert.equal(await begin(),revision,'renaming a saved asset does not destroy the original retry identity');
    await assert.rejects(db.query("update studio_package_files set bytes=1 where revision_id=$1 and bytes=0",[revision]),/immutable/);
    await db.query("update studio_projects set status='archived' where id=$1",[project]);
    await assert.rejects(begin(randomUUID()),/not found/);
    for(const role of ['anon','authenticated']){
      await db.exec(`reset role; set role ${role}`);
      await assert.rejects(begin(),/permission denied/);
      for(const table of ['studio_assets','studio_revisions','studio_package_files'])await assert.rejects(db.query(`select * from ${table}`),/permission denied/);
    }
  }finally{await db.close();}
});
