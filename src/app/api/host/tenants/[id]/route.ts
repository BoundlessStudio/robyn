import { readHostTenant } from "@/lib/host";
import { handleError, json } from "@/lib/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const response = json(await readHostTenant(id, new URL(request.url).searchParams));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) { return handleError(error); }
}
