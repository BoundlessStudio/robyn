import test from "node:test";
import assert from "node:assert/strict";
import { finishedAssignmentHistory, readTurnStream } from "../src/studio/assignment-protocol";
import type { SessionDetail } from "../src/lib/types";

test("durable turn parsing survives split UTF-8/CRLF and never returns private tool data", async () => {
  const created = 'event: response.created\r\ndata: {"id":"response-one","session_id":"session-one"}\r\n\r\n';
  const source = created + ':keepalive\r\n\r\nevent: response.tool_call.started\r\ndata: {"arguments":{"private":"must not escape"}}\r\n\r\n'
    + 'event: response.completed\r\ndata: {"output_text":"Création complete."}\r\n\r\n';
  const bytes = new TextEncoder().encode(source);
  const stream = () => new Response(new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } }));
  assert.deepEqual(await readTurnStream(stream(), true, { sessionId: "session-one" }), { kind: "created", responseId: "response-one", sessionId: "session-one" });
  assert.deepEqual(await readTurnStream(stream(), false, { sessionId: "session-one", responseId: "response-one" }), { kind: "completed", text: "Création complete." });
  await assert.rejects(readTurnStream(stream(), false, { sessionId: "wrong-session" }), /identity changed/);
  await assert.rejects(readTurnStream(stream(), false, { sessionId: "session-one", responseId: "another-response" }), /identity changed/);
  assert.equal(await readTurnStream(new Response(created), false), null, "a dropped stream is not completion");
  assert.equal(await readTurnStream(new Response("expired", { status: 404 }), false), null);
  await assert.rejects(readTurnStream(new Response('event: response.completed\ndata: {"output_text":"wrong"}\n\n'), false), /no identity/);
});

test("a new profiled turn requires the exact response.created profile on dispatch and replay",async()=>{
  const profile="robyn-job-7",sessionId="session-one",responseId="response-one";
  const stream=(echo:Record<string,unknown>)=>new Response(`event: response.created\ndata: ${JSON.stringify({id:responseId,session_id:sessionId,...echo})}\n\nevent: response.completed\ndata: {"output_text":"Saved work is ready."}\n\n`);
  const expected={sessionId,responseId,profile};
  assert.deepEqual(await readTurnStream(stream({profile}),true,expected),{kind:"created",responseId,sessionId});
  assert.deepEqual(await readTurnStream(stream({profile}),false,expected),{kind:"completed",text:"Saved work is ready."});
  for(const echo of [{},{profile:null},{profile:"robyn-other-job"}]){
    await assert.rejects(readTurnStream(stream(echo),true,expected),/profile changed/);
    await assert.rejects(readTurnStream(stream(echo),false,expected),/profile changed/);
  }
  assert.deepEqual(await readTurnStream(stream({}),true,{sessionId}),{kind:"created",responseId,sessionId},"historical unprofiled requests retain their original contract");
});

test("finished transcript recovery requires an idle exact session and the one assignment marker", () => {
  const session: SessionDetail = { id: "session", agent: "hermes", active_response_id: null, history: [] };
  const recover = () => finishedAssignmentHistory(session, "assignment", "session");
  assert.equal(recover(), null, "unknown session must never authorize a fresh dispatch");
  session.history = [
    { id: "u", session_id: "session", role: "user", content: "[Robyn assignment assignment]\nMake editable work.", created_at: 1 },
    { id: "a", session_id: "session", role: "assistant", content: "A confirmed revision is ready.", created_at: 2 },
  ];
  assert.equal(recover(), "A confirmed revision is ready.");
  session.active_response_id = "still-running";
  assert.equal(recover(), null);
  session.active_response_id = null;
  assert.equal(finishedAssignmentHistory(session, "other", "session"), null);
  assert.equal(finishedAssignmentHistory(session, "assignment", "different"), null);
  session.history.push({ id: "u2", session_id: "session", role: "user", content: "Another turn", created_at: 3 });
  assert.equal(recover(), null, "an unexpected second turn needs attention, not automatic acceptance");
});

test("profile-routed session recovery accepts an omitted echo and rejects every conflicting echo",()=>{
  const session:SessionDetail={id:"session",agent:"hermes",active_response_id:null,history:[
    {id:"u",session_id:"session",role:"user",content:"[Robyn assignment assignment]\nMake editable work.",created_at:1},
    {id:"a",session_id:"session",role:"assistant",content:"The exact saved revision is ready.",created_at:2},
  ]};
  const recover=()=>finishedAssignmentHistory(session,"assignment","session","robyn-job-7");
  assert.equal(recover(),"The exact saved revision is ready.","documented session bodies need not echo the profile query");
  session.profile="robyn-job-7";assert.equal(recover(),"The exact saved revision is ready.");
  for(const profile of [null,"default","robyn-other-job"]){session.profile=profile;assert.equal(recover(),null);}
  delete session.profile;session.active_response_id="response-running";assert.equal(recover(),null,"profile routing cannot bypass the idle-session check");
});
