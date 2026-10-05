import { agent37 } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { handleError, json } from "@/lib/http";
import type { AgentVersionStatus } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await requireAgentAccess(id);
    const agent = await agent37.getAgent(id);
    const result: AgentVersionStatus = {
      status: agent.status,
      gateway: null,
      healthy: null,
      version_error: null,
      health_error: null,
    };

    // Requests to the instance URL wake sleepers. Inspect control-plane status first,
    // and never probe a stopped, sleeping, or transitioning instance just to show Settings.
    if (agent.status === "running") {
      const [version, health] = await Promise.allSettled([
        agent37.getVersion(id),
        agent37.getHealth(id),
      ]);
      if (version.status === "fulfilled") {
        result.gateway = { name: version.value.name, version: version.value.version };
      } else {
        result.version_error = "Could not read the gateway version. Try checking again.";
      }
      if (health.status === "fulfilled") {
        result.healthy = health.value.healthy;
      } else {
        result.health_error = "Could not check agent readiness. Try checking again.";
      }
    }

    const response = json(result);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (e) {
    return handleError(e);
  }
}
