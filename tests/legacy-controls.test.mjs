import test from "node:test";
import assert from "node:assert/strict";
import {loadModule,httpMock} from "./helpers/module.mjs";

test("legacy lifecycle routes refuse Studio employees and unavailable authorization before touching upstream",async()=>{
  const key="legacyRouteFixture";
  let employee=true,dbError=null,calls=0;
  const filters=[];
  const chain={select(){return this;},eq(k,v){filters.push([k,v]);return this;},async maybeSingle(){return{data:employee?{id:"employee"}:null,error:dbError};},update(){return this;},delete(){return this;},then(resolve){return Promise.resolve({error:null}).then(resolve);}};
  globalThis[key]={db:{from:()=>chain},call:async()=>{calls++;return{status:"running",resources:{cpu:1,memory:2,disk:6}}}};
  const mocks={"@/lib/http":httpMock,"@/lib/auth":`export const requireAgentAccess=async()=>({db:globalThis.${key}.db,row:{workspace_id:'workspace'}});`,
    "@/lib/agent37":`export class Agent37Error extends Error{};const call=(...args)=>globalThis.${key}.call(...args);export const agent37={start:call,stop:call,restart:call,update:call,deleteAgent:call,resize:call};`};
  try {
    for(const [file,method,actions] of [["[action]/route.ts","POST",["start","stop","restart","update"]],["route.ts","DELETE",[null]],["resize/route.ts","POST",[null]]]){
      const route=await loadModule(`../../src/app/api/agents/[id]/${file}`,mocks);
      for(const action of actions){
        const invoke=()=>route[method](new Request("https://robyn.test/",{method:"POST",body:JSON.stringify({disk:20})}),{params:Promise.resolve({id:"instance",action})});
        assert.equal((await invoke()).status,409);
        dbError={message:"unavailable"};assert.equal((await invoke()).status,503);dbError=null;
        assert.equal(calls,0);
      }
    }
    assert.ok(filters.some(([key,value])=>key==="workspace_id"&&value==="workspace"));
    assert.ok(filters.some(([key,value])=>key==="instance_id"&&value==="instance"));
    employee=false;
    const route=await loadModule("../../src/app/api/agents/[id]/[action]/route.ts",mocks);
    assert.equal((await route.POST(new Request("https://robyn.test/"),{params:Promise.resolve({id:"instance",action:"start"})})).status,200);
    assert.equal(calls,1,"legacy non-Studio agents keep their intended controls");
  }finally{delete globalThis[key];}
});
