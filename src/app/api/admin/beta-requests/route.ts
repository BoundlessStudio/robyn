import { ApiError } from "@/lib/api-error";
import { adminError, adminJson, requireBetaAdmin } from "@/lib/beta-admin";
import { betaStatuses, type BetaStatus } from "@/lib/beta-requests";

export async function GET(request: Request) {
  try {
    const { db } = await requireBetaAdmin();
    const params = new URL(request.url).searchParams;
    const status = params.get("status") ?? "all";
    const search = (params.get("q") ?? "").trim();
    const page = Number(params.get("page") ?? 0);
    if ((status !== "all" && !betaStatuses.includes(status as BetaStatus)) || !Number.isSafeInteger(page) || page < 0 || page > 100000 || search.length > 254) throw new ApiError(400, "invalid_query", "Choose a valid filter and page.");
    let query = db.from("studio_access_requests").select("id,email,craft,consent_version,status,created_at,updated_at,invited_at,last_invited_at,invite_count,joined_at,send_state", { count: "exact" });
    if (status !== "all") query = query.eq("status", status);
    if (search) query = query.ilike("email", `%${search.replace(/[\\%_]/g, "\\$&")}%`);
    const [{ data, error, count }, counts] = await Promise.all([
      query.order("created_at", { ascending: false }).order("id", { ascending: false }).range(page * 50, page * 50 + 49),
      db.rpc("beta_request_counts"),
    ]);
    if (error || counts.error) throw new Error();
    return adminJson({ requests: data, total: count ?? 0, counts: counts.data });
  } catch (error) { return adminError(error); }
}
