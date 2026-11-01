import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash,randomUUID} from "node:crypto";
import {blankStarters,blankRequestKey,readBlankRequest} from "../src/studio/blank-starters";
import {studioApps} from "../src/studio/apps/registry";
import {isAppReady} from "../src/studio/manifest";
import {checkNativeImport} from "../src/studio/native-import";

test("each ready editing Craft has an intact native starter; read-only viewers open existing reports",async()=>{
  assert.deepEqual(new Set(blankStarters.map(item=>item.appId)),new Set(studioApps.filter(app=>isAppReady(app)&&app.editor.mode!=="readOnly").map(app=>app.id)));
  assert.equal(blankStarters.some(item=>item.appId==="dashcraft"),false);
  for(const starter of blankStarters){
    const entries=[];
    for(const file of starter.files){
      const bytes=await readFile(new URL('../public'+decodeURIComponent(file.url),import.meta.url));
      assert.equal(bytes.length,file.bytes,starter.id);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,starter.id);
      entries.push({path:file.path,role:file.role,file:new Blob([bytes],{type:file.mimeType})});
    }
    assert.equal((await checkNativeImport(starter.appId,entries)).length,starter.files.length,starter.id);
  }
});
test("blank recovery is scoped to the project and an immutable known template",()=>{
  const project=randomUUID(),request={version:1,projectId:project,assetId:randomUUID(),templateId:blankStarters[0].id};
  const store=new Map([[blankRequestKey(project),JSON.stringify(request)]]),storage={getItem:(key:string)=>store.get(key)??null};
  assert.deepEqual(readBlankRequest(storage,project),request);assert.equal(readBlankRequest(storage,randomUUID()),null);
  store.set(blankRequestKey(project),JSON.stringify({...request,templateId:'unknown'}));assert.throws(()=>readBlankRequest(storage,project));
});
