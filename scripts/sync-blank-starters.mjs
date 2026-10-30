// Vendor immutable native starters prepared by the companion runtime. The web
// build is self-contained; no sibling checkout or native CLI is needed to run it.
import {readFile,writeFile,mkdir,copyFile,readdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const source=resolve(process.argv[2]??'../robyn-artcraft-runtime/starters/1');
const catalog=JSON.parse(await readFile(join(source,'manifest.json'),'utf8'));
const registry='src/studio/generated/blank-starters.json';
let old=[];try{old=JSON.parse(await readFile(registry,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const appIds=(await readdir('src/studio/apps')).filter(name=>name.endsWith('.json')).map(name=>name.slice(0,-5));
const available=new Set([...catalog,...old].map(row=>row.appId));
if(!catalog.length||new Set(catalog.map(row=>row.id)).size!==catalog.length||catalog.some(row=>!appIds.includes(row.appId))||appIds.some(id=>!available.has(id)))throw Error('An intact starter for every registered Craft is required.');
for(const starter of catalog)for(const file of starter.files){
  const bytes=await readFile(join(source,starter.appId,file.path));
  if(bytes.length!==file.bytes||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error(`Invalid starter: ${starter.id}`);
  if(!/^\/studio\/starters\/[1-9][0-9]*\/[a-z]+craft\/[^/]+$/.test(file.url)||file.path.includes('/')||file.path.includes('\\'))throw Error('Invalid starter path.');
  const destination=resolve('public'+decodeURIComponent(file.url));
  let previous;try{previous=await readFile(destination);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(previous&&!previous.equals(bytes))throw Error(`Refusing to change immutable starter ${file.url}. Prepare a new version.`);
  await mkdir(dirname(destination),{recursive:true});if(!previous)await copyFile(join(source,starter.appId,file.path),destination);
}
// Retain older template IDs so interrupted starts can recover after an upgrade.
for(const row of old){const next=catalog.find(item=>item.id===row.id);if(next&&JSON.stringify(next)!==JSON.stringify(row))throw Error(`Starter ID changed: ${row.id}`);}
await writeFile(registry,JSON.stringify([...catalog,...old.filter(row=>!catalog.some(next=>next.id===row.id))],null,2)+'\n');
console.log(`Verified and synced ${catalog.length} native starters.`);
