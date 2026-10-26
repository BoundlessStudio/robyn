import { requireUuid } from "./assets";
import { ApiError } from "@/lib/api-error";

export function readPage(url: string, size = 100) {
  const params = new URL(url).searchParams;
  const search = (params.get("q") ?? "").trim().slice(0, 160);
  let after: { time: string; id: string } | null = null;
  const raw = params.get("cursor");
  if (raw) {
    if (raw.length > 400) throw new ApiError(400, "invalid_cursor", "Invalid page cursor.");
    try {
      const parsed = JSON.parse(Buffer.from(raw, "base64url").toString());
      if (typeof parsed.time !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(parsed.time) || !Number.isFinite(Date.parse(parsed.time))) throw Error();
      after = { time: parsed.time, id: requireUuid(parsed.id) };
    } catch { throw new ApiError(400, "invalid_cursor", "Invalid page cursor."); }
  }
  return { size, search, after };
}
export function pageFilter(after: {time:string;id:string}, column: "created_at" | "updated_at" = "created_at") {
  return `${column}.lt.${after.time},and(${column}.eq.${after.time},id.lt.${after.id})`;
}
export function finishPage<T extends { id: string }>(rows: T[], size: number, column: "created_at" | "updated_at" = "created_at") {
  const items = rows.slice(0, size);
  const last = items.at(-1) as (T & Record<string, unknown>) | undefined;
  return { items, nextCursor: rows.length > size && last ? Buffer.from(JSON.stringify({time:last[column],id:last.id})).toString("base64url") : null };
}
export const literalSearch = (value: string) => `%${value.replace(/[\\%_]/g, "\\$&")}%`;
