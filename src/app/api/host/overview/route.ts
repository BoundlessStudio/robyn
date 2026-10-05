import { readHostOverview } from "@/lib/host";
import { handleError, json } from "@/lib/http";

export async function GET() {
  try {
    const response = json(await readHostOverview());
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) { return handleError(error); }
}
