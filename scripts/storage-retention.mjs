import {pathToFileURL} from "node:url";
import {createClient} from "@supabase/supabase-js";

const uuid=value=>typeof value==="string"&&/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value);
async function rpc(db,name,args){
  const result=await db.rpc(name,args);
  if(result.error)throw Error(`Storage maintenance refused ${name}. Preserve the records and inspect their current state.`);
  return result.data;
}
export async function retireAbandonedObjects(db,workspace,owner,{apply=false,limit=50}={}){
  if(!uuid(workspace)||!uuid(owner)||!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid maintenance scope.');
  const scope={p_workspace:workspace,p_user:owner};
  const inventory=await rpc(db,'read_studio_storage_retention',scope);
  if(!apply)return {mode:'dry-run',inventory};
  const candidates=await rpc(db,'claim_studio_storage_retirement',{...scope,p_limit:limit});
  if(!Array.isArray(candidates)||candidates.length>limit)throw Error('Invalid cleanup claim.');
  // Validate the entire batch before touching any Storage object.
  for(const item of candidates){
    if(!uuid(item.claimToken)||typeof item.storageKey!=='string'||!item.storageKey.startsWith(workspace+'/')
      ||/[\\\0]/.test(item.storageKey)||item.storageKey.split('/').some(part=>!part||part==='.'||part==='..'))throw Error('Cleanup claim escaped its workspace.');
  }
  let deletedFiles=0;
  for(const item of candidates){
    const result=await db.storage.from('studio-assets').remove([item.storageKey]);
    if(result.error)throw Error('Storage deletion was not confirmed. The original claim is retained; retry after its 15-minute lease expires.');
    if(!await rpc(db,'finish_studio_storage_retirement',{...scope,p_key:item.storageKey,p_claim:item.claimToken}))throw Error('Cleanup acknowledgement changed. Preserve the tombstone and inspect the current claim.');
    deletedFiles++;
  }
  return {mode:'apply',deletedFiles,inventory:await rpc(db,'read_studio_storage_retention',scope)};
}
async function main(){
  const [workspace,owner,action,revisionOrFlag,flag]=process.argv.slice(2);
  if(!uuid(workspace)||!uuid(owner)||!['inventory','prune','abandon'].includes(action)
    ||(action==='abandon'?!uuid(revisionOrFlag)||flag&&!['--apply','--dry-run'].includes(flag):flag||revisionOrFlag&&!['--apply','--dry-run'].includes(revisionOrFlag)))
    throw Error('Usage: node scripts/storage-retention.mjs WORKSPACE_UUID OWNER_UUID inventory|prune [--apply], or ... abandon REVISION_UUID [--apply]');
  try{process.loadEnvFile('.env.local');}catch(error){if(error.code!=='ENOENT')throw error;}
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const scope={p_workspace:workspace,p_user:owner};
  const inventory=await rpc(db,'read_studio_storage_retention',scope);
  if(action==='abandon'){
    const {data,error}=await db.from('studio_revisions').select('id,state,assignment_id,author_employee_id').eq('workspace_id',workspace).eq('id',revisionOrFlag).single();
    if(error||!data)throw Error('The scoped upload could not be read.');
    if(flag!=='--apply'){console.log(JSON.stringify({mode:'dry-run',revision:data,inventory,notice:'Explicit abandonment permanently closes this upload; only unshared bytes become eligible after seven days.'}));return;}
    console.log(JSON.stringify(await rpc(db,'abandon_studio_upload',{...scope,p_revision:revisionOrFlag})));return;
  }
  console.log(JSON.stringify(await retireAbandonedObjects(db,workspace,owner,{apply:action==='prune'&&revisionOrFlag==='--apply'})));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
