import { requireAdmin, requireUser } from "@/lib/auth";
import { ApiError, handleError, json, readJson } from "@/lib/http";
import { userProfileFromUser, validateUserProfilePatch } from "@/lib/user-profile";

type Ctx = { params: Promise<{ id: string; userId: string }> };

async function requireWorkspaceUser(id: string, userId: string) {
  const { db, user } = await requireUser();
  await requireAdmin(db, id, user.id);
  // Verify the target in this workspace before touching global auth profiles.
  const { data, error } = await db.from("memberships").select("user_id")
    .eq("workspace_id", id).eq("user_id", userId).maybeSingle();
  if (error) throw new ApiError(500, "profile_access_failed", "Couldn't check this member. Please try again.");
  if (!data) throw new ApiError(404, "not_found", "Member not found");
  return db;
}

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id, userId } = await params;
    const db = await requireWorkspaceUser(id, userId);
    const { data, error } = await db.auth.admin.getUserById(userId);
    if (error || !data.user) throw new ApiError(500, "profile_load_failed", "Couldn't load this profile. Please try again.");
    return json({ profile: userProfileFromUser(data.user) });
  } catch (error) { return handleError(error); }
}

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id, userId } = await params;
    const db = await requireWorkspaceUser(id, userId);
    let patch;
    try { patch = validateUserProfilePatch(await readJson<unknown>(request)); }
    catch (error) { throw new ApiError(400, "invalid_profile", (error as Error).message); }
    const metadata: Record<string, string | null> = {};
    if (patch.display_name !== undefined) metadata.full_name = patch.display_name;
    if (patch.phone_number !== undefined) metadata.phone_number = patch.phone_number;
    const { data, error } = await db.auth.admin.updateUserById(userId, { user_metadata: metadata });
    if (error || !data.user) throw new ApiError(500, "profile_update_failed", "Couldn't save this profile. Please try again.");
    return json({ profile: userProfileFromUser(data.user) });
  } catch (error) { return handleError(error); }
}
