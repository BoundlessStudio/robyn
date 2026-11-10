import { json, handleError } from "@/lib/http";
import { requireMailcraftAccess } from "@/studio/connected-mail-server";
import { ownedAsset, requireStudio } from "@/studio/server";
import { readSavedPackage } from "@/studio/package-store";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, workspaceId } = await requireStudio(); const { id } = await context.params;
    return json(await readSavedPackage(db, workspaceId, id, async assetId => {
      const asset = await ownedAsset(db, workspaceId, assetId);
      await requireMailcraftAccess(db, workspaceId, asset.app_id);
    }));
  } catch (error) { return handleError(error); }
}
