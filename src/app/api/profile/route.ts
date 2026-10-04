import { requireUser } from "@/lib/auth";
import { ApiError, handleError, json, readJson } from "@/lib/http";
import { userProfileFromUser, validateUserProfilePatch } from "@/lib/user-profile";

export async function GET() {
  try {
    const { user } = await requireUser();
    return json({ profile: userProfileFromUser(user) });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { db, user } = await requireUser();
    let patch;
    try {
      patch = validateUserProfilePatch(await readJson<unknown>(request));
    } catch (error) {
      throw new ApiError(400, "invalid_profile", (error as Error).message);
    }

    // The target always comes from the verified session. Only these metadata fields
    // are writable; email, login phone, roles and unrelated metadata stay intact.
    const metadata: Record<string, string | null> = {};
    if (patch.display_name !== undefined) metadata.full_name = patch.display_name;
    if (patch.phone_number !== undefined) metadata.phone_number = patch.phone_number;
    const { data, error } = await db.auth.admin.updateUserById(user.id, { user_metadata: metadata });
    if (error || !data.user) {
      throw new ApiError(500, "profile_update_failed", "Couldn't save your profile. Please try again.");
    }
    return json({ profile: userProfileFromUser(data.user) });
  } catch (error) {
    return handleError(error);
  }
}
