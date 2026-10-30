import type { SessionDetail } from "@/lib/types";
import { assignmentMarker } from "./assignments";

export type TurnObservation =
  | { kind: "created"; responseId: string; sessionId: string }
  | { kind: "completed"; text: string }
  | { kind: "failed"; code: string };

/** Ignore tool arguments/reasoning, which can contain private transfer URLs.
 * Return only the identity or terminal result needed by the durable worker. */
export async function readTurnStream(response: Response, stopAfterCreated: boolean, expected?: { sessionId: string; responseId?: string; profile?: string | null }): Promise<TurnObservation | null> {
  if (!response.ok || !response.body) { await response.body?.cancel(); return null; }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let created = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return null;
      buffer += decoder.decode(value, { stream: true });
      // A single enormous frame must not hold a serverless worker indefinitely.
      if (buffer.length > 2_000_000) throw new Error("Agent response frame too large");
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const lines = frame.split(/\r?\n/);
        const event = lines.find(line => line.startsWith("event:"))?.slice(6).trim();
        if (!["response.created", "response.completed", "response.failed"].includes(event ?? "")) continue;
        const data = JSON.parse(lines.filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n"));
        if (event === "response.created") {
          if (typeof data.id !== "string" || typeof data.session_id !== "string" || data.id.length > 200 || data.session_id.length > 200) throw new Error("Invalid response identity");
          if (expected && (data.session_id !== expected.sessionId || (expected.responseId && data.id !== expected.responseId))) throw new Error("Agent response identity changed");
          if (expected?.profile && data.profile !== expected.profile) throw new Error("Agent response profile changed");
          created = true;
          if (stopAfterCreated) return { kind: "created", responseId: data.id, sessionId: data.session_id };
        } else {
          if (!created) throw new Error("Response terminal event has no identity");
          if (event === "response.completed") return { kind: "completed", text: typeof data.output_text === "string" ? data.output_text.slice(0, 65536) : "" };
          return { kind: "failed", code: typeof data.error?.code === "string" && /^[a-z0-9_]{1,100}$/.test(data.error.code) ? data.error.code : "employee_response_failed" };
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** A dedicated session contains exactly one submitted assignment. Unknown or
 * still-running sessions are not evidence that the work can be resubmitted. */
export function finishedAssignmentHistory(session: SessionDetail, assignmentId: string, sessionId: string, profile?: string | null): string | null {
  if (session.id !== sessionId || session.active_response_id !== null) return null;
  // Session reads are routed with ?profile=. Unlike response.created, the
  // documented session body need not echo it; reject a conflicting echo.
  if (profile && session.profile !== undefined && session.profile !== profile) return null;
  const users = session.history.filter(message => message.role === "user");
  if (users.length !== 1 || !users[0].content.startsWith(assignmentMarker(assignmentId) + "\n")) return null;
  const start = session.history.indexOf(users[0]);
  const tail = session.history.slice(start + 1);
  const last = tail.at(-1);
  return last?.role === "assistant" && last.content.trim() ? last.content.slice(0, 65536) : null;
}
