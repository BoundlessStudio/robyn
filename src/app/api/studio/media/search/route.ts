import { json, handleError } from "@/lib/http";
import { requireStudio, readStudioBody, id } from "@/studio/server";
import { searchMedia } from "@/studio/media-server";

export async function POST(request: Request) {
  try {
    const { db, workspaceId, user } = await requireStudio();
    const input = await readStudioBody(request);
    return json(await searchMedia(db, { workspaceId, userId: user.id, projectId: id(input.projectId) }, input));
  } catch (error) { return handleError(error); }
}
