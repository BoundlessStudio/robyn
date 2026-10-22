import { json, handleError } from "@/lib/http";
import { requireStudio, readStudioBody } from "@/studio/server";
import { preparePackageTransfers } from "@/studio/package-store";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, workspaceId } = await requireStudio(); const { id } = await context.params;
    await readStudioBody(request);
    return json(await preparePackageTransfers(db, workspaceId, id));
  } catch (error) { return handleError(error); }
}
