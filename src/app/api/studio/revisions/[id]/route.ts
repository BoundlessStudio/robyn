import { json, handleError } from "@/lib/http";
import { requireStudio } from "@/studio/server";
import { readSavedPackage } from "@/studio/package-store";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, workspaceId } = await requireStudio(); const { id } = await context.params;
    return json(await readSavedPackage(db, workspaceId, id));
  } catch (error) { return handleError(error); }
}
