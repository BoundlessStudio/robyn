import test from "node:test";
import assert from "node:assert/strict";
import {loadModule,httpMock} from "./helpers/module.mjs";

test("saved-file downloads renew the exact authorized file on each request without streaming bytes through the BFF",async()=>{
  let allowed=true,state="committed",tickets=0;const filters=[];
  const chain={select(){return this;},eq(k,v){filters.push([k,v]);return this;},async maybeSingle(){return{data:filters.some(([k,v])=>k==="path"&&v==="original/source.wav")?{path:"original/source.wav",storage_key:"private/exact-key"}:null,error:null};}};
  globalThis.savedFileFixture={db:{from:()=>chain,storage:{from:()=>({createSignedUrl:async(key,seconds)=>{assert.equal(key,"private/exact-key");assert.equal(seconds,300);return{data:{signedUrl:`https://storage.test/fresh-${++tickets}`},error:null};}})}},owned:async()=>{if(!allowed)throw Object.assign(Error(),{status:404});return{state};}};
  try{
    const route=await loadModule("../../src/app/api/studio/revisions/[id]/file/route.ts",{"@/lib/http":httpMock,"@/studio/server":`export const requireStudio=async()=>({db:globalThis.savedFileFixture.db,workspaceId:'owned'});export const ownedRevision=(...args)=>globalThis.savedFileFixture.owned(...args);export const dbFailure=error=>{if(error)throw Error()};export const STUDIO_BUCKET='studio';`});
    const invoke=path=>{filters.length=0;return route.GET(new Request(`https://robyn.test/api/file?path=${encodeURIComponent(path)}`),{params:Promise.resolve({id:"revision"})});};
    const first=await invoke("original/source.wav"),second=await invoke("original/source.wav");
    assert.equal(first.status,307);assert.notEqual(first.headers.get("location"),second.headers.get("location"));
    assert.equal(second.headers.get("cache-control"),"private, no-store");
    assert.ok(filters.some(([k,v])=>k==="workspace_id"&&v==="owned"));
    assert.ok(filters.some(([k,v])=>k==="revision_id"&&v==="revision"));
    assert.equal((await invoke("../private.wav")).status,400);
    assert.equal((await invoke("unknown.wav")).status,404);
    state="uploading";assert.equal((await invoke("original/source.wav")).status,409);
    allowed=false;assert.equal((await invoke("original/source.wav")).status,404);
    assert.equal(tickets,2);
  }finally{delete globalThis.savedFileFixture;}
});
