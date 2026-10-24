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
