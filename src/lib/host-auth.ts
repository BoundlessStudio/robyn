import "server-only";
import { redirect } from "next/navigation";
import { getSession, requireUser, type DB } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError } from "@/lib/http";

export async function isHostAdmin(db: DB, userId: string): Promise<boolean> {
  const { data, error } = await db.from("host_admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) throw new ApiError(503, "host_unavailable", "Host permissions are unavailable. Please retry.");
  return Boolean(data);
}

// Always re-read the permission. Revoking a row takes effect on the next request.
export async function requireHostAdmin() {
  const { db, user } = await requireUser();
  if (!(await isHostAdmin(db, user.id))) throw new ApiError(403, "host_forbidden", "Host access is required.");
  return { db, user };
}

export async function hostPageAccess(): Promise<{ email: string } | null> {
  const { user } = await getSession();
  if (!user) redirect("/login?next=/host");
  if (!(await isHostAdmin(createAdminClient(), user.id))) return null;
  return { email: user.email ?? "Host administrator" };
}
