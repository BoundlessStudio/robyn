import { ApiError, json } from "@/lib/http";
import { workerCall } from "@/studio/mcp/worker";

export const maxDuration = 60;

export async function POST(request: Request) {
  try { return json(await workerCall(request)); }
  catch (error) {
    if (error instanceof ApiError) return json({ error: { code: error.code, message: error.message } }, error.status);
    console.error("[direct-craft] workstation callback failed");
    return json({ error: { code: "worker_unavailable", message: "The Craft operation could not be completed." } }, 500);
  }
}
