import { requireAdmin, requireUser } from "@/lib/auth";
import { ApiError, handleError, json } from "@/lib/http";
import { readUsageWindow } from "@/lib/usage-report";
import { readWorkspaceUsage } from "@/lib/workspace-usage";

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 300;

export async function GET(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { db, user } = await requireUser();
    await requireAdmin(db, id, user.id);
    const query = new URL(request.url).searchParams;
    let window;
    try { window = readUsageWindow(query.get("from"), query.get("to")); }
    catch (error) { throw new ApiError(400, "invalid_usage_window", (error as Error).message); }
    const response = json(await readWorkspaceUsage(db, id, window));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) { return handleError(error); }
}
