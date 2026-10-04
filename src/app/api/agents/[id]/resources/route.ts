import { agent37 } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { resourceProfile } from "@/lib/resource-input";
import { handleError, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await requireAgentAccess(id, "member");
    return json(resourceProfile(await agent37.getAgent(id)));
  } catch (error) { return handleError(error); }
}
