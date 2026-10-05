import { addHostCredit, requireHostWriteOrigin } from "@/lib/host-workspace-actions";
import { handleError, json, readJson } from "@/lib/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireHostWriteOrigin(request);
    const { id } = await params;
    const body = await readJson<{ amount_usd?: unknown; idempotency_key?: unknown }>(request);
    const response = json(await addHostCredit(id, body?.amount_usd, body?.idempotency_key), 201);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) { return handleError(error); }
}
