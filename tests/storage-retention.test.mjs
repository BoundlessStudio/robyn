import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {studioDatabase} from './helpers/database.mjs';
import {readMigrations,migrationQuery} from '../scripts/migrations.mjs';
import {retireAbandonedObjects} from '../scripts/storage-retention.mjs';
import {loadModule,httpMock} from './helpers/module.mjs';

test('explicit upload retirement preserves saved/shared/recovery data, fences retries, and waits for old transfer expiry',async()=>{
  const db=await studioDatabase();
  const scalar=async(sql,args=[]) => (await db.query(sql,args)).rows[0]?.value;
  try{
    await db.exec(migrationQuery(await readMigrations(fileURLToPath(new URL('../supabase/migrations',import.meta.url)))));
    const owner=randomUUID(),other=randomUUID();await db.query('insert into auth.users(id) values($1),($2)',[owner,other]);
    const workspace=await scalar("select initialize_studio($1,'[]') as value",[owner]);
    const project=await scalar("insert into studio_projects(workspace_id,created_by,name) values($1,$2,'Retain') returning id as value",[workspace,owner]);
    const asset=await scalar("insert into studio_assets(workspace_id,project_id,created_by,app_id,name) values($1,$2,$3,'photocraft','Saved') returning id as value",[workspace,project,owner]);
    const pkg={files:[{path:'native.bin',role:'master',mimeType:'application/octet-stream',bytes:42,sha256:'a'.repeat(64)}]};
    const begin=()=>scalar('select begin_studio_revision($1,$2,$3,null,$4) as value',[workspace,owner,asset,pkg]);
    const commit=async revision=>{const files=(await db.query('select id,bytes from studio_package_files where revision_id=$1',[revision])).rows;return scalar('select commit_studio_revision($1,$2,$3,$4) as value',[workspace,owner,revision,files]);};
    const abandon=(revision,user=owner)=>scalar('select abandon_studio_upload($1,$2,$3) as value',[workspace,user,revision]);
    const claim=()=>scalar('select claim_studio_storage_retirement($1,$2) as value',[workspace,owner]);
    const saved=await begin();await commit(saved);
    const savedKey=await scalar('select storage_key as value from studio_package_files where revision_id=$1',[saved]);
    const restored=await scalar('select restore_studio_revision($1,$2,$3,$4,$4) as value',[workspace,owner,asset,saved]);
    const fork=await scalar("select fork_studio_revision($1,$2,$3,'Fork') as value",[workspace,owner,saved]);
    const sharedDraft=await begin();
    await db.query('update studio_package_files set storage_key=$2 where revision_id=$1',[sharedDraft,savedKey]);
    const discarded=await begin(),stillUploading=await begin();
    await assert.rejects(abandon(discarded,other),/not found/);
    await assert.rejects(abandon(saved),/cannot be abandoned/);
    assert.equal((await abandon(sharedDraft)).sharedFilesRetained,1);
    assert.equal((await abandon(discarded)).quarantinedFiles,1);
    assert.equal((await abandon(discarded)).alreadyAbandoned,true);
    await assert.rejects(commit(discarded),/not open/);
    await assert.rejects(db.query("update studio_revisions set state='uploading' where id=$1",[discarded]),/immutable/);
    await assert.rejects(scalar('select assert_studio_upload_open($1,$2) as value',[workspace,discarded]),/not open/);
    assert.equal(await scalar('select assert_studio_upload_open($1,$2) as value',[workspace,stillUploading]),true);
    assert.deepEqual(await claim(),[],'seven-day quarantine must outlast existing signed and resumable transfers');
    const originalFile=(await db.query('select * from studio_package_files where revision_id=$1',[discarded])).rows[0];
    await assert.rejects(db.query('update studio_package_files set storage_key=$2 where revision_id=$1',[stillUploading,originalFile.storage_key]),/retired/);
    // Deliberately corrupt fixture-only recovery references after quarantine;
    // the claim must recheck them rather than trusting the earlier inventory.
    const held=await begin();await abandon(held);
    await db.query("insert into studio_media_jobs(workspace_id,project_id,created_by,operation_id,operation,provider,kind,name,request,state,reserved_micros,asset_id,revision_id) values($1,$2,$3,$4,'generate','perflo','image','Unknown','{}','uncertain',420000,$5,$6)",[workspace,project,owner,randomUUID(),asset,held]);
    await db.exec("update studio_storage_retirements set not_before=now()-interval '1 second'");
    const candidates=await claim();assert.equal(candidates.length,1);assert.equal(candidates[0].storageKey,originalFile.storage_key);
    assert.deepEqual(await claim(),[],'another worker cannot claim the same active lease');
    await db.exec("update studio_storage_retirements set lease_until=now()-interval '1 second' where state='deleting'");
    const retry=(await claim())[0];assert.notEqual(retry.claimToken,candidates[0].claimToken);
    const finish=token=>scalar('select finish_studio_storage_retirement($1,$2,$3,$4) as value',[workspace,owner,retry.storageKey,token]);
    assert.equal(await finish(candidates[0].claimToken),false);assert.equal(await finish(retry.claimToken),true);assert.equal(await finish(retry.claimToken),true);
    assert.deepEqual(await claim(),[]);
    assert.equal(await scalar('select count(*)::int as value from studio_package_files where storage_key=$1',[savedKey]),4,'saved, restored, forked and shared abandoned references all survive');
    for(const ref of [saved,restored.revisionId,fork.revisionId])assert.equal(await scalar('select state as value from studio_revisions where id=$1',[ref]),'committed');
    assert.equal(await scalar('select reserved_micros::int as value from studio_media_jobs where revision_id=$1',[held]),420000);
    const inventory=await scalar('select read_studio_storage_retention($1,$2) as value',[workspace,owner]);
    assert.equal(inventory.deletedManifestBytes,42);assert.equal(inventory.openCreatorUploads,1);
    await db.exec('set role authenticated');
    await assert.rejects(abandon(stillUploading),/permission denied/);await assert.rejects(claim(),/permission denied/);
    await assert.rejects(db.query('select * from studio_storage_retirements'),/permission denied/);
    await db.exec('reset role');
  }finally{await db.close();}
});

test('Storage cleanup defaults to inventory and retains uncertain deletions for the same fenced retry',async()=>{
  const workspace=randomUUID(),owner=randomUUID(),claim=randomUUID(),key=`${workspace}/${randomUUID()}`;
  let removed=0,finished=0,claimed=0,failDelete=true;
  const db={rpc:async(name)=>{
    if(name==='read_studio_storage_retention')return {data:{readyFiles:1}};
    if(name==='claim_studio_storage_retirement'){claimed++;return {data:[{storageKey:key,claimToken:claim,bytes:42}]};}
    if(name==='finish_studio_storage_retirement'){finished++;return {data:true};}
    throw Error('Unexpected RPC');
  },storage:{from:bucket=>{assert.equal(bucket,'studio-assets');return {remove:async keys=>{assert.deepEqual(keys,[key]);removed++;return {error:failDelete?{}:null};}};}}};
  assert.equal((await retireAbandonedObjects(db,workspace,owner)).mode,'dry-run');assert.equal(claimed,0);assert.equal(removed,0);
  await assert.rejects(retireAbandonedObjects(db,workspace,owner,{apply:true}),/not confirmed/);assert.equal(finished,0);
  failDelete=false;assert.equal((await retireAbandonedObjects(db,workspace,owner,{apply:true})).deletedFiles,1);assert.equal(finished,1);
  const bad={...db,rpc:async name=>name==='claim_studio_storage_retirement'?{data:[{storageKey:`${workspace}/../foreign`,claimToken:claim}]}:db.rpc(name)};
  await assert.rejects(retireAbandonedObjects(bad,workspace,owner,{apply:true}),/escaped/);assert.equal(removed,2);
});

test('an upload abandoned while Storage signs tickets never receives fresh credentials',async()=>{
  let abandoned=true,signatures=0,checks=0;const prior=process.env.NEXT_PUBLIC_SUPABASE_URL;process.env.NEXT_PUBLIC_SUPABASE_URL='https://private.example';
  try{
    const {preparePackageTransfers}=await loadModule('../../src/studio/package-store.ts',{
      'server-only':'','@/lib/http':httpMock,
      './server':`export const ownedRevision=async()=>({state:'uploading'});export const revisionFiles=async()=>[{id:'file',path:'native.bin',storage_key:'key',bytes:42,mime_type:'application/octet-stream',sha256:'a'.repeat(64)}];export const mapInBatches=(rows,fn)=>Promise.all(rows.map(fn));export const verifyStoredFiles=()=>{};export const dbFailure=e=>{if(e)throw Error(e.message)};export const STUDIO_BUCKET='studio-assets';`
    });
    const db={storage:{from:()=>({info:async()=>({data:null}),createSignedUploadUrl:async()=>{signatures++;return {data:{token:'private-fixture-token',signedUrl:'https://private.example/upload'}};}})},rpc:async(name,args)=>{checks++;assert.equal(name,'assert_studio_upload_open');assert.deepEqual(args,{p_workspace:'workspace',p_revision:'revision'});return {error:abandoned?{message:'revision is not open'}:null};}};
    await assert.rejects(preparePackageTransfers(db,'workspace','revision'),/not open/);
    abandoned=false;assert.equal((await preparePackageTransfers(db,'workspace','revision')).transfers.length,1);
    assert.equal(signatures,2);assert.equal(checks,2);
  }finally{if(prior===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=prior;}
});
