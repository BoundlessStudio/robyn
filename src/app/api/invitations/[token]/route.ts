import { requireUser } from "@/lib/auth";
import { ApiError, handleError, json } from "@/lib/http";

type Ctx = { params: Promise<{ token: string }> };

export async function POST() {
  try {
    await requireUser();
    throw new ApiError(410, "pilot_operation_unavailable", "This pilot uses private studios and dedicated employees. Open a project to continue.");
  } catch (error) { return handleError(error); }
}
