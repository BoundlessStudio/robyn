import { json, handleError } from "@/lib/http";
import { requireStudio, readStudioBody, ownedRevision, revisionFiles, verifyStoredFiles, dbFailure } from "@/studio/server";

export const maxDuration = 60;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, user, workspaceId } = await requireStudio(); const { id } = await context.params;
    await readStudioBody(request); // The client cannot supply file verification.
    const revision = await ownedRevision(db, workspaceId, id);
    if (revision.state === "committed" || revision.state === "conflict") return json({ assetId: revision.asset_id, revisionId: id, status: revision.state }, revision.state === "conflict" ? 409 : 200);
    const verified = await verifyStoredFiles(db, await revisionFiles(db, workspaceId, id));
    const { data, error } = await db.rpc("commit_studio_revision", { p_workspace: workspaceId, p_user: user.id, p_revision: id, p_verified_files: verified });
    dbFailure(error); return json(data, data?.status === "conflict" ? 409 : 200);
  } catch (error) { return handleError(error); }
}
