import test from "node:test";
import assert from "node:assert/strict";
import { loadModule } from "./helpers/module.mjs";

test("Agent37 image migration sends only the explicit template and keeps legacy no-body updates", async () => {
  const previousFetch = globalThis.fetch; const previousKey = process.env.AGENT37_API_KEY;
  process.env.AGENT37_API_KEY = "fixture-control-plane-key";
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return Response.json({ id: "persistent", status: "running", template: "robyn-cadcraft-new@2",
      image_ref: null, image_digest: `sha256:${"b".repeat(64)}`, template_revision: 2 });
  };
  try {
    const { agent37 } = await loadModule("../../src/lib/agent37.ts", { "server-only": "" });
    const result = await agent37.update("persistent", "robyn-cadcraft-new@2");
    assert.equal(result.id, "persistent"); assert.equal(result.template_revision, 2);
    assert.equal(requests[0].url, "https://api.agent37.com/v1/instances/persistent/update");
    assert.equal(requests[0].options.method, "POST");
    assert.deepEqual(JSON.parse(requests[0].options.body), { template: "robyn-cadcraft-new@2" });
    assert.equal(requests[0].options.headers.Authorization, "Bearer fixture-control-plane-key");
    assert.equal(requests[0].options.headers["X-Agent37-Key"], undefined);
    await agent37.update("persistent");
    assert.equal(Object.hasOwn(requests[1].options, "body"), false);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.AGENT37_API_KEY; else process.env.AGENT37_API_KEY = previousKey;
  }
});

test("task profiles stay on instance responses and session reads with data-plane authentication",async()=>{
  const previousFetch=globalThis.fetch,previousKey=process.env.AGENT37_API_KEY;
  process.env.AGENT37_API_KEY="fixture-control-plane-key";
  const requests=[];
  globalThis.fetch=async(url,options)=>{
    requests.push({url,options});
    if(new URL(url).pathname.startsWith("/v1/sessions/"))return Response.json({id:"session /owned",agent:"hermes",active_response_id:null,history:[]});
    return new Response('event: response.created\ndata: {"id":"response-one","session_id":"session-one","profile":"robyn-job_7"}\n\n',{headers:{"content-type":"text/event-stream"}});
  };
  try{
    const {agent37}=await loadModule("../../src/lib/agent37.ts",{"server-only":""});
    const signal=new AbortController().signal,profile="robyn-job_7";
    const response=await agent37.submitAssignmentTurn("persistent","Use the exact saved inputs.","session /owned",signal,profile);await response.body.cancel();
    assert.equal(requests[0].url,"https://persistent.agent37.app/v1/responses");
    assert.equal(requests[0].options.method,"POST");assert.equal(requests[0].options.signal,signal);
    assert.deepEqual(JSON.parse(requests[0].options.body),{input:"Use the exact saved inputs.",session_id:"session /owned",stream:true,agent:"hermes",model:"default",provider:"custom:Agent37",profile});
    const session=await agent37.assignmentSession("persistent","session /owned",profile);
    assert.equal(requests[1].url,"https://persistent.agent37.app/v1/sessions/session%20%2Fowned?agent=hermes&profile=robyn-job_7");
    assert.equal(session.profile,undefined,"the documented session body may omit its routed profile");
    const replay=await agent37.assignmentResponseStream("persistent","response /owned",signal);await replay.body.cancel();
    assert.equal(requests[2].url,"https://persistent.agent37.app/v1/responses/response%20%2Fowned/stream");
    for(const {url,options} of requests){
      assert.equal(new URL(url).hostname,"persistent.agent37.app");
      assert.equal(options.headers["X-Agent37-Key"],"fixture-control-plane-key");
      assert.equal(options.headers.Authorization,undefined);assert.equal(options.cache,"no-store");
    }
    const legacy=await agent37.submitAssignmentTurn("persistent","Original unprofiled request.","old-session",signal);await legacy.body.cancel();
    assert.equal(Object.hasOwn(JSON.parse(requests[3].options.body),"profile"),false);
    await agent37.assignmentSession("persistent","old-session",null);
    assert.equal(requests[4].url,"https://persistent.agent37.app/v1/sessions/old-session?agent=hermes");
  }finally{
    globalThis.fetch=previousFetch;
    if(previousKey===undefined)delete process.env.AGENT37_API_KEY;else process.env.AGENT37_API_KEY=previousKey;
  }
});

test("invalid task profiles stop before any data-plane request",async()=>{
  const previousFetch=globalThis.fetch;let requests=0;
  globalThis.fetch=async()=>{requests++;throw Error("Unexpected transport request");};
  try{
    const {agent37}=await loadModule("../../src/lib/agent37.ts",{"server-only":""});
    const signal=new AbortController().signal;
    for(const profile of ["../other-task","profile&agent=codex","WrongCase","a".repeat(101)]){
      assert.throws(()=>agent37.submitAssignmentTurn("persistent","A task.","session",signal,profile),/Invalid workstation profile/);
      assert.throws(()=>agent37.assignmentSession("persistent","session",profile),/Invalid workstation profile/);
    }
    assert.equal(requests,0);
  }finally{globalThis.fetch=previousFetch;}
});
