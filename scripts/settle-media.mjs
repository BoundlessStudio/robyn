import {readFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";
import {createClient} from "@supabase/supabase-js";

export function settlementEvidence(input) {
  if(!input||input.chargeIsFinal!==true||input.charged?.currency!=="USD"||typeof input.charged.amount!=="string"||!/^\d{1,7}(\.\d{1,6})?$/.test(input.charged.amount))throw Error("A final USD charge with at most six decimal places is required.");
  if(typeof input.caseReference!=="string"||input.caseReference.length<6||input.caseReference.length>200)throw Error("A provider case or receipt reference is required.");
  const [whole,fraction=""]=input.charged.amount.split('.'),micros=Number(whole)*1000000+Number(fraction.padEnd(6,'0'));
  if(!Number.isSafeInteger(micros)||micros>1000000000000)throw Error("Invalid final charge.");
  return {micros,receipt:{chargeIsFinal:true,charged:{amount:input.charged.amount,currency:"USD"},caseReference:input.caseReference,
    ...(typeof input.runId==="string"&&/^[\w-]{1,200}$/.test(input.runId)?{runId:input.runId}:{}),
    ...(typeof input.transactionId==="string"&&/^[\w-]{1,200}$/.test(input.transactionId)?{transactionId:input.transactionId}:{}),operatorReconciliation:true}};
}
async function main() {
  const [workspace,owner,jobId,evidenceFile,mode]=process.argv.slice(2);
  if(![workspace,owner,jobId].every(value=>/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value??""))||!evidenceFile||mode&&!['--apply','--dry-run'].includes(mode))throw Error("Usage: node scripts/settle-media.mjs <workspace UUID> <owner UUID> <job UUID> <private final-receipt.json> [--apply]");
  const evidence=settlementEvidence(JSON.parse(await readFile(evidenceFile,'utf8')));
  try{process.loadEnvFile('.env.local');}catch(error){if(error.code!=='ENOENT')throw error;}
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const{data:job,error}=await db.from('studio_media_jobs').select('id,state,workflow_id,billing_settled,actual_micros').eq('workspace_id',workspace).eq('created_by',owner).eq('id',jobId).single();
  if(error||!job)throw Error('The scoped media job could not be read.');
  if(!['cancelled','failed','completed','uncertain'].includes(job.state))throw Error('Stop active processing and reconcile its state before using operator settlement.');
  if(job.billing_settled&&Number(job.actual_micros)!==evidence.micros)throw Error('A different final charge is already recorded.');
  console.log(JSON.stringify({jobId,state:job.state,finalMicros:evidence.micros,mode:mode==='--apply'?'apply':'dry-run'}));
  if(mode!=='--apply')return;
  const result=await db.rpc('settle_media_charge',{p_workspace:workspace,p_user:owner,p_job:jobId,p_workflow:job.workflow_id,p_actual:evidence.micros,p_receipt:evidence.receipt});
  if(result.error)throw Error('Settlement was not accepted. Keep the evidence and inspect the current job; do not release its hold manually.');
  console.log('Final charge recorded. Publication state and payment dispatch remain unchanged.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
