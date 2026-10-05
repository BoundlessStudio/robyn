import { readHostTenants } from "@/lib/host";
import { handleError, json } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const response = json(await readHostTenants(new URL(request.url).searchParams));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) { return handleError(error); }
}
