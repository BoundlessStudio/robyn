import test from "node:test";
import assert from "node:assert/strict";
import {httpMock,loadModule} from "./helpers/module.mjs";

test("opaque library files download even when inline is requested",async()=>{
  const tickets=[];
  const files=new Map([
    ["render.exr",{storage_key:"workspace/raw",path:"render.exr",mime_type:"application/octet-stream"}],
    ["loop.gif",{storage_key:"workspace/gif",path:"loop.gif",mime_type:"image/gif"}],
  ]);
  globalThis.__savedFileFixture={
    from(table){
      assert.equal(table,"studio_package_files");
      const filters={};
      return {
        select(){return this;},
        eq(key,value){filters[key]=value;return this;},
        async maybeSingle(){
          assert.equal(filters.workspace_id,"workspace");
          assert.equal(filters.revision_id,"revision");
          return {data:files.get(filters.path),error:null};
        },
      };
    },
    storage:{from(bucket){
      assert.equal(bucket,"private");
      return {async createSignedUrl(key,seconds,options){
        tickets.push({key,seconds,options});
        return {data:{signedUrl:"https://storage.example/saved"},error:null};
      }};
    }},
  };
  const server=`
    export const STUDIO_BUCKET="private";
    export const requireStudio=async()=>({db:globalThis.__savedFileFixture,workspaceId:"workspace"});
    export const ownedRevision=async()=>({state:"committed"});
    export const dbFailure=error=>{if(error)throw error;};
    export const revisionFiles=()=>[],mapInBatches=()=>[],verifyStoredFiles=()=>[];
  `;
  try{
    const {GET}=await loadModule("../../src/app/api/studio/revisions/[id]/file/route.ts",{
      "server-only":"","@/lib/http":httpMock,"@/studio/server":server,"./server":server,
    });
    const open=(path,inline)=>GET(new Request(`https://studio.example/file?${new URLSearchParams({path,inline})}`),{params:Promise.resolve({id:"revision"})});
    assert.equal((await open("render.exr","1")).status,307);
    assert.equal((await open("loop.gif","1")).status,307);
    assert.equal((await open("loop.gif","0")).status,307);
    assert.deepEqual(tickets.map(ticket=>ticket.options),[{download:"render.exr"},undefined,{download:"loop.gif"}]);
  }finally{delete globalThis.__savedFileFixture;}
});
