import { json, handleError } from "@/lib/http";
import { requireStudio, readStudioBody, saveStudioName } from "@/studio/server";

export async function PATCH(request: Request) {
  try {
    const { db, user, workspaceId } = await requireStudio();
    const { name } = await readStudioBody(request);
    const { workstationNameSynced } = await saveStudioName(db, workspaceId, user.id, name);
    return json({ saved: true, workstationNameSynced });
  } catch (error) {
    return handleError(error);
  }
}
