import { issueHostCoupon, requireHostWriteOrigin } from "@/lib/host-workspace-actions";
import { handleError, json, readJson } from "@/lib/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireHostWriteOrigin(request);
    const { id } = await params;
    const body = await readJson<{ amount_usd?: unknown }>(request);
    const response = json(await issueHostCoupon(id, body?.amount_usd), 201);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) { return handleError(error); }
}
